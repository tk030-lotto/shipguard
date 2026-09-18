import http from "node:http";
import path from "node:path";
import pc from "picocolors";
import { loadConfig } from "../config/loader.js";
import { readAuditLogs } from "../logger/index.js";
import type { AuditLogRecord, ScanResult } from "../types/index.js";
import { selectFileDialog, selectFolderDialog } from "../utils/dialog.js";
import { openInBrowser } from "../utils/open.js";
import { runScan } from "./scan.js";
import { getDashboardHtml } from "./ui-html.js";

export interface UiOptions {
  cwd?: string;
  port?: number;
  open?: boolean;
}

/**
 * リクエストボディをJSONとしてパースするヘルパー
 */
function readJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

/**
 * ローカルWeb UIサーバーを起動する
 */
export async function startUiServer(
  options: UiOptions = {}
): Promise<{ server: http.Server; port: number; url: string }> {
  const defaultRootDir = path.resolve(options.cwd ?? process.cwd());
  let currentTargetDir = defaultRootDir;
  let latestResult: ScanResult | null = null;

  // 初回スキャンを実行して最新状態を準備
  try {
    latestResult = await runScan({ cwd: defaultRootDir, format: "terminal" });
  } catch (error) {
    console.warn(pc.yellow(`  [UI] 初回スキャンの取得に失敗しました: ${error}`));
  }

  const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url || "/", "http://localhost");
    const pathname = parsedUrl.pathname;

    // 1. ダッシュボード画面 HTML
    if (req.method === "GET" && (pathname === "/" || pathname === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(getDashboardHtml(currentTargetDir));
      return;
    }

    // 2. ステータス・履歴取得 API
    if (req.method === "GET" && pathname === "/api/status") {
      const queryDir = parsedUrl.searchParams.get("targetDir");
      const targetDir = queryDir ? path.resolve(queryDir) : currentTargetDir;
      const config = await loadConfig(targetDir);
      const logRelativePath = config.logging?.path || ".shipguard/audit.log";
      const logFilePath = path.resolve(targetDir, logRelativePath);
      const history: AuditLogRecord[] = await readAuditLogs(logFilePath);

      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          targetDir,
          current: latestResult,
          history,
        })
      );
      return;
    }

    // 3. 再スキャン実行 API (任意のディレクトリ指定に対応)
    if (req.method === "POST" && pathname === "/api/scan") {
      try {
        const body = await readJsonBody(req);
        const rawTargetDir = body.targetDir ? String(body.targetDir) : null;
        const targetDir = rawTargetDir ? path.resolve(rawTargetDir) : currentTargetDir;

        // パストラバーサルガード: null バイトを含む不正パスを拒否
        if (rawTargetDir && rawTargetDir.includes("\0")) {
          res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ success: false, error: "Invalid targetDir: null byte detected" }));
          return;
        }

        currentTargetDir = targetDir;

        latestResult = await runScan({ cwd: targetDir, format: "terminal" });
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(
          JSON.stringify({
            success: true,
            targetDir,
            result: latestResult,
          })
        );
      } catch (err: any) {
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ success: false, error: err?.message || String(err) }));
      }
      return;
    }

    // 4. フォルダ選択ダイアログ API
    if (req.method === "POST" && pathname === "/api/browse-folder") {
      try {
        const selected = await selectFolderDialog();
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ path: selected }));
      } catch (err: any) {
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ path: null, error: err?.message }));
      }
      return;
    }

    // 5. ファイル選択ダイアログ API
    if (req.method === "POST" && pathname === "/api/browse-file") {
      try {
        const selected = await selectFileDialog();
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ path: selected }));
      } catch (err: any) {
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ path: null, error: err?.message }));
      }
      return;
    }

    // 404 Not Found
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  });

  let currentPort = options.port ?? 3773;
  const maxPortAttempts = 10;
  let attempts = 0;

  return new Promise((resolve, reject) => {
    function tryListen(port: number) {
      server.listen(port, async () => {
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
    }

    server.on("error", (err: any) => {
      if (err.code === "EADDRINUSE" && attempts < maxPortAttempts && !options.port) {
        attempts++;
        currentPort++;
        console.warn(pc.yellow(`  [UI] ポート ${currentPort - 1} は使用中です。ポート ${currentPort} で再試行します...`));
        tryListen(currentPort);
      } else {
        reject(err);
      }
    });

    tryListen(currentPort);
  });
}
