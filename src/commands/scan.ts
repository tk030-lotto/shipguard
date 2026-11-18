import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../config/loader.js";
import { collectFiles } from "../core/scanner.js";
import { appendAuditLog, getGitCommitHash } from "../logger/index.js";
import { outputReport, validateReportOptions } from "../reporter/index.js";
import { getDatabaseMigrationSqlFiles } from "../rules/database.js";
import { executeRules } from "../rules/index.js";
import type { ScanOptions, ScanResult, Violation } from "../types/index.js";

/**
 * 監査スキャンを実行し、結果を返す
 */
export async function runScan(options: ScanOptions = {}): Promise<ScanResult> {
  validateReportOptions(options);

  const rootDir = options.cwd ?? process.cwd();

  // 単一ファイル指定時は親ディレクトリを設定・ログの基底とする
  let logBaseDir = rootDir;
  try {
    const stat = await fs.stat(rootDir);
    if (stat.isFile()) {
      logBaseDir = path.dirname(rootDir);
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`スキャン対象が存在しないかアクセスできません: ${rootDir} (${msg})`);
  }

  const config = await loadConfig(logBaseDir);

  // カスタム除外パターンの統合
  const customIgnore = [
    ...(config.ignore || []),
    ...(options.ignore || []),
  ];

  // 1. ファイル収集（設定のサイズ閾値を適用）
  const maxFileSizeBytes = config.scan?.maxFileSizeBytes ?? 2 * 1024 * 1024;
  const files = await collectFiles(rootDir, customIgnore, maxFileSizeBytes);

  if (files.length === 0) {
    throw new Error(
      "走査対象ファイルが 0 件のため監査を実施できません（除外設定またはファイルサイズ上限を確認してください）"
    );
  }

  // 2. ルール実行
  const violations: Violation[] = await executeRules({
    rootDir,
    files,
    config,
    showSecrets: options.showSecrets,
  });

  // SEC-003 対象 SQL が 0 件の場合の注記生成（終了コードには影響させない）
  const notices: string[] = [];
  if (config.rules?.["SEC-003"] !== "off") {
    const sqlFiles = getDatabaseMigrationSqlFiles({
      rootDir,
      files,
      config,
    });
    if (sqlFiles.length === 0) {
      const migrationsDir = config.database?.migrationsDir ?? "supabase/migrations";
      notices.push(`SEC-003 は対象 SQL が 0 件のため未実施（migrationsDir: ${migrationsDir}）`);
    }
  }

  // 3. サマリー集計
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;

  for (const v of violations) {
    switch (v.severity) {
      case "critical":
        criticalCount++;
        break;
      case "high":
        highCount++;
        break;
      case "medium":
        mediumCount++;
        break;
      case "low":
        lowCount++;
        break;
    }
  }

  // 判定（通常は critical / high がなければ pass。--strict の場合は全レベル対象）
  const passed = options.strict
    ? violations.length === 0
    : criticalCount === 0 && highCount === 0;

  const result: ScanResult = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    gitCommitHash: await getGitCommitHash(logBaseDir),
    summary: {
      scannedFiles: files.length,
      totalViolations: violations.length,
      critical: criticalCount,
      high: highCount,
      medium: mediumCount,
      low: lowCount,
      passed,
    },
    violations,
    ...(notices.length > 0 ? { notices } : {}),
  };

  // 4. 監査ログのローカル永続化 (.shipguard/audit.log)
  if (!options.skipAuditLog) {
    await appendAuditLog(result, logBaseDir, config);
  }

  // 5. レポート出力
  await outputReport(result, options);

  return result;
}
