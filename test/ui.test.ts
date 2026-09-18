import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startUiServer } from "../src/commands/ui.js";

vi.mock("../src/utils/dialog.js", () => ({
  selectFolderDialog: vi.fn().mockResolvedValue("C:\\Mock\\Project"),
  selectFileDialog: vi.fn().mockResolvedValue("C:\\Mock\\Project\\index.ts"),
}));

describe("UI Server", () => {
  let tmpDir: string;
  let serverInstance: http.Server | null = null;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "shipguard-ui-test-"));
  });

  afterEach(async () => {
    if (serverInstance) {
      await new Promise<void>((resolve) => serverInstance!.close(() => resolve()));
      serverInstance = null;
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function httpGet(url: string): Promise<{ status: number; text: string; json?: any }> {
    return new Promise((resolve, reject) => {
      http
        .get(url, (res) => {
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
        })
        .on("error", reject);
    });
  }

  function httpPost(url: string, body?: any): Promise<{ status: number; text: string; json?: any }> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const postData = body ? JSON.stringify(body) : "";
      const req = http.request(
        {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port,
          path: parsedUrl.pathname,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(postData),
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
      if (postData) {
        req.write(postData);
      }
      req.end();
    });
  }

  it("starts UI server and serves dashboard and API endpoints", async () => {
    const { server, port, url } = await startUiServer({
      cwd: tmpDir,
      port: 0, // OS空きポート割り当て
      open: false,
    });
    serverInstance = server;

    expect(port).toBeGreaterThan(0);
    expect(url).toBe(`http://localhost:${port}`);

    // GET / (Dashboard HTML)
    const pageRes = await httpGet(`${url}/`);
    expect(pageRes.status).toBe(200);
    expect(pageRes.text).toContain("<!DOCTYPE html>");
    expect(pageRes.text).toContain("shipguard Dashboard");

    // GET /api/status
    const statusRes = await httpGet(`${url}/api/status`);
    expect(statusRes.status).toBe(200);
    expect(statusRes.json).toBeDefined();
    expect(statusRes.json.current).toBeDefined();
    expect(Array.isArray(statusRes.json.history)).toBe(true);

    // POST /api/scan
    const scanRes = await httpPost(`${url}/api/scan`);
    expect(scanRes.status).toBe(200);
    expect(scanRes.json.success).toBe(true);
    expect(scanRes.json.result).toBeDefined();

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
    await fs.mkdir(customProjectDir, { recursive: true });
    await fs.writeFile(
      path.join(customProjectDir, "index.ts"),
      'const secret = "sk_live_123456789012345678901234";'
    );

    const { server, port, url } = await startUiServer({
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
});
