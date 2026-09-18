import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startUiServer } from "../src/commands/ui.js";

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

  function httpPost(url: string): Promise<{ status: number; text: string; json?: any }> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const req = http.request(
        {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port,
          path: parsedUrl.pathname,
          method: "POST",
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
  });
});
