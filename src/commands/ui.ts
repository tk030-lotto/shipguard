import http from "node:http";
import path from "node:path";
import pc from "picocolors";
import { loadConfig } from "../config/loader.js";
import { readAuditLogsDetailed, resolveSafeLogPath } from "../logger/index.js";
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

class BadRequestError extends Error {}

/**
 * ターゲットパスがベースディレクトリの範囲内か判定する
 */
function isPathWithin(baseDir: string, targetPath: string): boolean {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(targetPath);
  const rel = path.relative(resolvedBase, resolvedTarget);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * Host / Origin ヘッダがローカルループバックに限定されているか検証する
 */
function isLocalRequestAllowed(req: http.IncomingMessage, actualPort: number | null): boolean {
  const hostHeader = req.headers.host;
  if (hostHeader) {
    const hostname = hostHeader.replace(/:\d+$/, "").toLowerCase();
    if (hostname !== "127.0.0.1" && hostname !== "localhost") {
      return false;
    }
  }

  const originHeader = req.headers.origin;
  if (originHeader) {
    try {
      const originUrl = new URL(originHeader);
      const originHost = originUrl.hostname.toLowerCase();
      if (originHost !== "127.0.0.1" && originHost !== "localhost") {
        return false;
      }
      if (actualPort !== null && Number(originUrl.port) !== actualPort) {
        return false;
      }
    } catch {
      return false;
    }
  }

  return true;
}

/**
 * リクエストボディをJSONとして厳格にパースするヘルパー
 */
function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      if (!data || data.trim() === "") {
        resolve({});
        return;
      }
      try {
        const parsed: unknown = JSON.parse(data);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          reject(new BadRequestError("リクエストボディはJSONオブジェクトである必要があります"));
          return;
        }
        resolve(parsed as Record<string, unknown>);
      } catch {
        reject(new BadRequestError("リクエストボディが不正なJSON形式です"));
      }
    });
    req.on("error", reject);
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
  let initialScanError: string | null = null;
  let isScanning = false;
  let boundPort: number | null = null;

  // 初回スキャンを実行して最新状態を準備（起動時の自動スキャンは監査ログに追記しない）
  try {
    latestResult = await runScan({ cwd: defaultRootDir, format: "terminal", skipAuditLog: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    initialScanError = msg;
    console.warn(pc.yellow(`  [UI] 初回スキャンの取得に失敗しました: ${msg}`));
  }

  const server = http.createServer(async (req, res) => {
    if (!isLocalRequestAllowed(req, boundPort)) {
      res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ success: false, error: "Forbidden: invalid Host or Origin" }));
      return;
    }

    const parsedUrl = new URL(req.url || "/", "http://127.0.0.1");
    const pathname = parsedUrl.pathname;

    // 1. ダッシュボード画面 HTML
    if (req.method === "GET" && (pathname === "/" || pathname === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(getDashboardHtml(currentTargetDir));
      return;
    }

    // 2. ステータス・履歴取得 API
    if (req.method === "GET" && pathname === "/api/status") {
      try {
        const queryDir = parsedUrl.searchParams.get("targetDir");
        if (queryDir && queryDir.includes("\0")) {
          res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: "Invalid targetDir: null byte detected" }));
          return;
        }

        const targetDir = queryDir ? path.resolve(queryDir) : currentTargetDir;
        if (
          queryDir &&
          !isPathWithin(defaultRootDir, targetDir) &&
          !isPathWithin(currentTargetDir, targetDir)
        ) {
          res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
          res.end(
            JSON.stringify({
              error: "指定されたディレクトリの履歴へのアクセスは許可されていません",
            })
          );
          return;
        }

        const config = await loadConfig(targetDir);
        const logRelativePath = config.logging?.path || ".shipguard/audit.log";
        const logFilePath = resolveSafeLogPath(targetDir, logRelativePath);
        const { records: history, skippedLines } = await readAuditLogsDetailed(logFilePath);

        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(
          JSON.stringify({
            targetDir,
            current: latestResult,
            history,
            skippedLogLines: skippedLines,
            error: initialScanError,
          })
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: msg }));
      }
      return;
    }

    // 3. 再スキャン実行 API (任意のディレクトリ指定に対応・二重実行ガード付き)
    if (req.method === "POST" && pathname === "/api/scan") {
      if (isScanning) {
        res.writeHead(409, { "Content-Type": "application/json; charset=utf-8" });
        res.end(
          JSON.stringify({
            success: false,
            error: "スキャンを実行中です。完了までお待ちください。",
          })
        );
        return;
      }

      isScanning = true;
      try {
        const body = await readJsonBody(req);
        if (
          body.targetDir !== undefined &&
          body.targetDir !== null &&
          typeof body.targetDir !== "string"
        ) {
          throw new BadRequestError("targetDir は文字列である必要があります");
        }

        const rawTargetDir =
          typeof body.targetDir === "string" && body.targetDir.trim() !== ""
            ? body.targetDir
            : null;

        // パストラバーサルガード: null バイトを含む不正パスを拒否
        if (rawTargetDir && rawTargetDir.includes("\0")) {
          res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ success: false, error: "Invalid targetDir: null byte detected" }));
          return;
        }

        const targetDir = rawTargetDir ? path.resolve(rawTargetDir) : currentTargetDir;
        const result = await runScan({ cwd: targetDir, format: "terminal" });

        currentTargetDir = targetDir;
        latestResult = result;
        initialScanError = null;

        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(
          JSON.stringify({
            success: true,
            targetDir,
            result: latestResult,
          })
        );
      } catch (err: unknown) {
        const status = err instanceof BadRequestError ? 400 : 500;
        const msg = err instanceof Error ? err.message : String(err);
        res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ success: false, error: msg }));
      } finally {
        isScanning = false;
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
      server.listen(port, "127.0.0.1", async () => {
        const actualPort = (server.address() as any).port;
        boundPort = actualPort;
        const url = `http://127.0.0.1:${actualPort}`;

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
