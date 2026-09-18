import http from "node:http";
import path from "node:path";
import pc from "picocolors";
import { loadConfig } from "../config/loader.js";
import { readAuditLogs } from "../logger/index.js";
import type { AuditLogRecord, ScanResult } from "../types/index.js";
import { openInBrowser } from "../utils/open.js";
import { runScan } from "./scan.js";
import { getDashboardHtml } from "./ui-html.js";

export interface UiOptions {
  cwd?: string;
  port?: number;
  open?: boolean;
}

/**
 * ローカルWeb UIサーバーを起動する
 */
export async function startUiServer(
  options: UiOptions = {}
): Promise<{ server: http.Server; port: number; url: string }> {
  const rootDir = options.cwd ?? process.cwd();
  const config = await loadConfig(rootDir);
  const logRelativePath = config.logging?.path || ".shipguard/audit.log";
  const logFilePath = path.resolve(rootDir, logRelativePath);

  let latestResult: ScanResult | null = null;

  // 初回スキャンを実行して最新状態を準備
  try {
    latestResult = await runScan({ cwd: rootDir, format: "terminal" });
  } catch (error) {
    console.warn(pc.yellow(`  [UI] 初回スキャンの取得に失敗しました: ${error}`));
  }

  const server = http.createServer(async (req, res) => {
    const url = req.url || "/";

    // 1. ダッシュボード画面 HTML
    if (req.method === "GET" && (url === "/" || url === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(getDashboardHtml());
      return;
    }

    // 2. ステータス・履歴取得 API
    if (req.method === "GET" && url === "/api/status") {
      const history: AuditLogRecord[] = await readAuditLogs(logFilePath);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          current: latestResult,
          history,
        })
      );
      return;
    }

    // 3. 再スキャン実行 API
    if (req.method === "POST" && url === "/api/scan") {
      try {
        latestResult = await runScan({ cwd: rootDir, format: "terminal" });
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ success: true, result: latestResult }));
      } catch (err: any) {
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ success: false, error: err?.message || String(err) }));
      }
      return;
    }

    // 404 Not Found
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  });

  const desiredPort = options.port ?? 3773;

  return new Promise((resolve, reject) => {
    server.on("error", (err: any) => {
      reject(err);
    });

    server.listen(desiredPort, async () => {
      const actualPort = (server.address() as any).port;
      const url = `http://localhost:${actualPort}`;

      console.log("");
      console.log(pc.bold(pc.cyan("  ▲ shipguard UI")) + pc.gray(" — ローカルダッシュボード稼働中"));
      console.log(pc.green(`  ✔ ダッシュボードURL: ${pc.underline(pc.bold(url))}`));
      console.log(pc.gray("  (Ctrl + C で終了します)\n"));

      if (options.open !== false) {
        await openInBrowser(url);
      }

      resolve({ server, port: actualPort, url });
    });
  });
}
