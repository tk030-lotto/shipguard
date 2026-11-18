import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startUiServer } from "../src/commands/ui.js";
import { getDashboardHtml } from "../src/commands/ui-html.js";
import * as scanner from "../src/core/scanner.js";

vi.mock("../src/utils/dialog.js", () => ({
  selectFolderDialog: vi.fn().mockResolvedValue("C:\\Mock\\Project"),
  selectFileDialog: vi.fn().mockResolvedValue("C:\\Mock\\Project\\index.ts"),
}));

describe("UI Server", { timeout: 15000 }, () => {
  let tmpDir: string;
  let serverInstance: http.Server | null = null;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "shipguard-ui-test-"));
    await fs.writeFile(path.join(tmpDir, "seed.ts"), "export const seed = 1;\n", "utf8");
  });

  afterEach(async () => {
    if (serverInstance) {
      serverInstance.closeAllConnections?.();
      await new Promise<void>((resolve) => serverInstance!.close(() => resolve()));
      serverInstance = null;
    }
    await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  function httpGet(
    url: string,
    headers: Record<string, string> = {}
  ): Promise<{ status: number; text: string; json?: any }> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const req = http.request(
        {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port,
          path: parsedUrl.pathname + parsedUrl.search,
          method: "GET",
          headers,
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            let json;
            try {
              json = JSON.parse(data);
            } catch {
              // ignore
            }
            resolve({ status: res.statusCode || 0, text: data, json });
          });
        }
      );
      req.on("error", reject);
      req.end();
    });
  }

  function httpPostRaw(
    url: string,
    rawBody: string,
    headers: Record<string, string> = {}
  ): Promise<{ status: number; text: string; json?: any }> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const req = http.request(
        {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port,
          path: parsedUrl.pathname,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(rawBody),
            ...headers,
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            let json;
            try {
              json = JSON.parse(data);
            } catch {
              // ignore
            }
            resolve({ status: res.statusCode || 0, text: data, json });
          });
        }
      );
      req.on("error", reject);
      if (rawBody) {
        req.write(rawBody);
      }
      req.end();
    });
  }

  function httpPost(
    url: string,
    body?: any,
    headers: Record<string, string> = {}
  ): Promise<{ status: number; text: string; json?: any }> {
    return httpPostRaw(url, body !== undefined ? JSON.stringify(body) : "", headers);
  }

  it("starts UI server bound to 127.0.0.1 and serves dashboard and API endpoints", async () => {
    const { server, port, url } = await startUiServer({
      cwd: tmpDir,
      port: 0, // OS空きポート割り当て
      open: false,
    });
    serverInstance = server;

    expect(port).toBeGreaterThan(0);
    expect(url).toBe(`http://127.0.0.1:${port}`);
    expect((server.address() as any).address).toBe("127.0.0.1");

    // GET / (Dashboard HTML)
    const pageRes = await httpGet(`${url}/`);
    expect(pageRes.status).toBe(200);
    expect(pageRes.text).toContain("<!DOCTYPE html>");
    expect(pageRes.text).toContain("shipguard Dashboard");
    expect(pageRes.text).not.toContain("fonts.googleapis.com");
    expect(pageRes.text).not.toContain("alert(");
    expect(pageRes.text).not.toContain("プロジェクト統計ツール");
    expect(pageRes.text).toContain(".v-card");

    // GET /api/status (起動直後の自動スキャンは audit.log に記録されない)
    const statusRes = await httpGet(`${url}/api/status`);
    expect(statusRes.status).toBe(200);
    expect(statusRes.json).toBeDefined();
    expect(statusRes.json.current).toBeDefined();
    expect(statusRes.json.history).toEqual([]);

    // POST /api/scan (明示的スキャンは audit.log に記録される)
    const scanRes = await httpPost(`${url}/api/scan`);
    expect(scanRes.status).toBe(200);
    expect(scanRes.json.success).toBe(true);
    expect(scanRes.json.result).toBeDefined();

    const afterScanStatus = await httpGet(`${url}/api/status`);
    expect(afterScanStatus.json.history).toHaveLength(1);

    // POST /api/browse-folder
    const folderRes = await httpPost(`${url}/api/browse-folder`);
    expect(folderRes.status).toBe(200);
    expect(folderRes.json.path).toBe("C:\\Mock\\Project");

    // POST /api/browse-file
    const fileRes = await httpPost(`${url}/api/browse-file`);
    expect(fileRes.status).toBe(200);
    expect(fileRes.json.path).toBe("C:\\Mock\\Project\\index.ts");
  });

  it("supports scanning a dynamic target directory specified in POST /api/scan", async () => {
    const customProjectDir = path.join(tmpDir, "custom-project");
    const dummyKey = "sk_" + "live_" + "0".repeat(24);
    await fs.mkdir(customProjectDir, { recursive: true });
    await fs.writeFile(
      path.join(customProjectDir, "index.ts"),
      `const secret = "${dummyKey}";`
    );

    const { server, url } = await startUiServer({
      cwd: tmpDir,
      port: 0,
      open: false,
    });
    serverInstance = server;

    const scanRes = await httpPost(`${url}/api/scan`, {
      targetDir: customProjectDir,
    });

    expect(scanRes.status).toBe(200);
    expect(scanRes.json.success).toBe(true);
    expect(scanRes.json.targetDir).toBe(customProjectDir);
    expect(scanRes.json.result.summary.critical).toBe(1);
    expect(scanRes.json.result.violations[0].ruleId).toBe("SEC-001");
  });

  it("rejects invalid Host (including mismatched port) and Origin headers with 403", async () => {
    const { server, url } = await startUiServer({
      cwd: tmpDir,
      port: 0,
      open: false,
    });
    serverInstance = server;

    const badHostRes = await httpGet(`${url}/api/status`, { Host: "evil.example.com" });
    expect(badHostRes.status).toBe(403);

    const mismatchedPortHostRes = await httpGet(`${url}/api/status`, { Host: "localhost:9999" });
    expect(mismatchedPortHostRes.status).toBe(403);

    const badOriginRes = await httpPost(`${url}/api/scan`, {}, { Origin: "https://evil.example.com" });
    expect(badOriginRes.status).toBe(403);
  });

  it("supports scanning a single file target without ENOTDIR and keeps /api/status consistent", async () => {
    const subDir = path.join(tmpDir, "single-file-proj");
    const filePath = path.join(subDir, "app.ts");
    await fs.mkdir(subDir, { recursive: true });
    await fs.writeFile(filePath, 'app.use(cors({ origin: "*" }));\n', "utf8");

    const { server, url } = await startUiServer({
      cwd: tmpDir,
      port: 0,
      open: false,
    });
    serverInstance = server;

    const scanRes = await httpPost(`${url}/api/scan`, { targetDir: filePath });
    expect(scanRes.status).toBe(200);
    expect(scanRes.json.success).toBe(true);
    expect(scanRes.json.result.summary.scannedFiles).toBe(1);
    expect(scanRes.json.result.violations[0].ruleId).toBe("SEC-004");

    const logExists = await fs
      .stat(path.join(subDir, ".shipguard", "audit.log"))
      .then(() => true)
      .catch(() => false);
    expect(logExists).toBe(true);

    const statusRes = await httpGet(
      `${url}/api/status?targetDir=${encodeURIComponent(filePath)}`
    );
    expect(statusRes.status).toBe(200);
    expect(statusRes.json.current).not.toBeNull();
    expect(statusRes.json.history).toHaveLength(1);
  });

  it("returns error without exposing full local paths when target has 0 scannable files or is missing", async () => {
    const emptyDir = path.join(tmpDir, "empty-dir");
    await fs.mkdir(emptyDir, { recursive: true });

    const { server, url } = await startUiServer({
      cwd: tmpDir,
      port: 0,
      open: false,
    });
    serverInstance = server;

    const emptyRes = await httpPost(`${url}/api/scan`, { targetDir: emptyDir });
    expect(emptyRes.status).toBe(500);
    expect(emptyRes.json.success).toBe(false);
    expect(emptyRes.json.error).toContain("0 件");
    expect(emptyRes.json.error).not.toContain(tmpDir);

    const missingPath = path.join(tmpDir, "does-not-exist-dir");
    const missingRes = await httpPost(`${url}/api/scan`, { targetDir: missingPath });
    expect(missingRes.status).toBe(500);
    expect(missingRes.json.success).toBe(false);
    expect(missingRes.json.error).not.toContain(tmpDir);
  });

  it("rejects malformed JSON body on POST /api/scan with 400", async () => {
    const { server, url } = await startUiServer({
      cwd: tmpDir,
      port: 0,
      open: false,
    });
    serverInstance = server;

    const badJsonRes = await httpPostRaw(`${url}/api/scan`, "{invalid json");
    expect(badJsonRes.status).toBe(400);
    expect(badJsonRes.json.success).toBe(false);

    const arrayBodyRes = await httpPostRaw(`${url}/api/scan`, "[1, 2, 3]");
    expect(arrayBodyRes.status).toBe(400);
    expect(arrayBodyRes.json.success).toBe(false);
  });

  it("rejects out-of-scope targetDir in GET /api/status with 403", async () => {
    const { server, url } = await startUiServer({
      cwd: tmpDir,
      port: 0,
      open: false,
    });
    serverInstance = server;

    const outsideDir = path.resolve(tmpDir, "..");
    const statusRes = await httpGet(
      `${url}/api/status?targetDir=${encodeURIComponent(outsideDir)}`
    );
    expect(statusRes.status).toBe(403);
  });

  it("guards against concurrent POST /api/scan requests with 409", async () => {
    const { server, url } = await startUiServer({
      cwd: tmpDir,
      port: 0,
      open: false,
    });
    serverInstance = server;

    const origCollect = scanner.collectFiles;
    const spy = vi.spyOn(scanner, "collectFiles").mockImplementation(async (...args) => {
      await new Promise((r) => setTimeout(r, 120));
      return origCollect(...args);
    });

    try {
      const [res1, res2] = await Promise.all([
        httpPost(`${url}/api/scan`, { targetDir: tmpDir }),
        httpPost(`${url}/api/scan`, { targetDir: tmpDir }),
      ]);
      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 409]);
    } finally {
      spy.mockRestore();
    }
  });

  it("returns error response when .shipguardrc.json is invalid", async () => {
    const badProjectDir = path.join(tmpDir, "bad-cfg");
    await fs.mkdir(badProjectDir, { recursive: true });
    await fs.writeFile(path.join(badProjectDir, ".shipguardrc.json"), "{ invalid", "utf8");

    const { server, url } = await startUiServer({
      cwd: tmpDir,
      port: 0,
      open: false,
    });
    serverInstance = server;

    const scanRes = await httpPost(`${url}/api/scan`, { targetDir: badProjectDir });
    expect(scanRes.status).toBe(500);
    expect(scanRes.json.success).toBe(false);
    expect(scanRes.json.error).toContain("JSON構文が不正");
  });

  it("escapes XSS payloads in dashboard renderDashboard script", () => {
    const html = getDashboardHtml(tmpDir);
    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
    expect(scriptMatch).not.toBeNull();
    // 末尾の loadData() 自動呼び出しを除いて関数を評価する
    const scriptBody = scriptMatch![1].replace(/loadData\(\)\.catch\([\s\S]*?\);/, "");

    const elements: Record<string, { innerHTML: string; textContent: string; value: string; style: Record<string, string> }> = {
      statsGrid: { innerHTML: "", textContent: "", value: "", style: {} },
      controls: { innerHTML: "", textContent: "", value: "", style: {} },
      violationsList: { innerHTML: "", textContent: "", value: "", style: {} },
      historyTbody: { innerHTML: "", textContent: "", value: "", style: {} },
      targetDirInput: { innerHTML: "", textContent: "", value: "", style: {} },
      errorBanner: { innerHTML: "", textContent: "", value: "", style: {} },
      warnBanner: { innerHTML: "", textContent: "", value: "", style: {} },
    };

    const sandbox: Record<string, any> = {
      document: {
        getElementById: (id: string) => elements[id],
        querySelectorAll: () => [],
      },
      fetch: async () => ({ ok: true, json: async () => ({}) }),
      encodeURIComponent,
      Number,
      String,
      Array,
    };

    vm.runInNewContext(scriptBody, sandbox);
    sandbox.renderDashboard({
      current: {
        summary: { scannedFiles: 1, totalViolations: 1, critical: 1, high: 0, medium: 0, low: 0, passed: false },
        violations: [
          {
            ruleId: '<script>alert("id")</script>',
            ruleName: '<img src=x onerror=alert("name")>',
            filePath: 'src/<svg onload=alert(1)>.ts',
            line: 1,
            message: 'msg <img src=x onerror=alert("msg")>',
            snippet: '<img src=x onerror=alert("xss")>',
            severity: 'critical"><script>alert(1)</script>',
          },
        ],
      },
      history: [
        {
          timestamp: '<script>alert("ts")</script>',
          passed: false,
          gitCommitHash: '<img src=x>',
          summary: { scannedFiles: 1, totalViolations: 1, critical: 1, high: 0, medium: 0, low: 0 },
        },
      ],
    });

    const renderedViolations = elements.violationsList.innerHTML;
    expect(renderedViolations).not.toContain("<img src=x");
    expect(renderedViolations).not.toContain("<script>alert");
    expect(renderedViolations).not.toContain("<svg onload");
    expect(renderedViolations).toContain("&lt;img src=x onerror=alert(&quot;xss&quot;)&gt;");
    expect(renderedViolations).toContain("&lt;script&gt;alert(&quot;id&quot;)&lt;/script&gt;");

    const renderedHistory = elements.historyTbody.innerHTML;
    expect(renderedHistory).not.toContain("<script>alert");
    expect(renderedHistory).toContain("&lt;script&gt;alert(&quot;ts&quot;)&lt;/script&gt;");
  });
});
