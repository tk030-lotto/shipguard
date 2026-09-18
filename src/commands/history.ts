import fs from "node:fs/promises";
import path from "node:path";
import pc from "picocolors";
import { loadConfig } from "../config/loader.js";
import { readAuditLogs } from "../logger/index.js";
import type { AuditLogRecord } from "../types/index.js";

export interface HistoryOptions {
  cwd?: string;
  limit?: number;
  clear?: boolean;
}

/**
 * 監査履歴を表示またはクリアする
 */
export async function runHistory(
  options: HistoryOptions = {}
): Promise<AuditLogRecord[]> {
  const rootDir = options.cwd ?? process.cwd();
  const config = await loadConfig(rootDir);
  const logRelativePath = config.logging?.path || ".shipguard/audit.log";
  const logFilePath = path.resolve(rootDir, logRelativePath);

  // ログクリア指定の場合
  if (options.clear) {
    try {
      await fs.unlink(logFilePath);
      console.log(pc.green(`  ✔ 監査履歴ログを削除しました: ${pc.underline(logFilePath)}\n`));
    } catch (error: any) {
      if (error?.code === "ENOENT") {
        console.log(pc.gray(`  ℹ 削除対象の監査ログが存在しません。\n`));
      } else {
        throw error;
      }
    }
    return [];
  }

  // ログ読み出し
  const records = await readAuditLogs(logFilePath);

  console.log("");
  console.log(pc.bold(pc.cyan("  ▲ shipguard")) + pc.gray(` — 監査履歴`));
  console.log(pc.gray("  " + "─".repeat(60)));

  if (records.length === 0) {
    console.log(
      pc.gray("  ℹ 監査履歴がありません。まず 'shipguard scan' を実行してください。\n")
    );
    return [];
  }

  const limit = options.limit && options.limit > 0 ? options.limit : 10;
  // 最新順（降順）にして件数制限
  const recentRecords = [...records].reverse().slice(0, limit);

  console.log(
    pc.gray(`  直近 ${recentRecords.length} 件の実行履歴 (全 ${records.length} 件中):\n`)
  );

  for (const record of recentRecords) {
    const status = record.passed
      ? pc.bold(pc.green(" PASS "))
      : pc.bold(pc.red(" FAIL "));
    const commit = record.gitCommitHash
      ? pc.gray(`[${record.gitCommitHash.substring(0, 7)}]`)
      : pc.gray("[-]      ");
    const counts = `${pc.red(`C:${record.summary.critical}`)} ${pc.yellow(`H:${record.summary.high}`)} ${pc.cyan(`M:${record.summary.medium}`)} ${pc.blue(`L:${record.summary.low}`)}`;

    console.log(
      `  ${status} ${pc.white(record.timestamp)} ${commit} 検知:${record.summary.totalViolations}件 (${counts}) ファイル:${record.summary.scannedFiles}`
    );
  }

  console.log(pc.gray("  " + "─".repeat(60)));
  console.log("");

  return recentRecords;
}
