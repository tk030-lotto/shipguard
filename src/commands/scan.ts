import crypto from "node:crypto";
import { loadConfig } from "../config/loader.js";
import { collectFiles } from "../core/scanner.js";
import { appendAuditLog, getGitCommitHash } from "../logger/index.js";
import { outputReport } from "../reporter/index.js";
import { executeRules } from "../rules/index.js";
import type { ScanOptions, ScanResult, Violation } from "../types/index.js";

/**
 * 監査スキャンを実行し、結果を返す
 */
export async function runScan(options: ScanOptions = {}): Promise<ScanResult> {
  const rootDir = options.cwd ?? process.cwd();
  const config = await loadConfig(rootDir);

  // カスタム除外パターンの統合
  const customIgnore = [
    ...(config.ignore || []),
    ...(options.ignore || []),
  ];

  // 1. ファイル収集（設定のサイズ閾値を適用）
  const maxFileSizeBytes = config.scan?.maxFileSizeBytes ?? 2 * 1024 * 1024;
  const files = await collectFiles(rootDir, customIgnore, maxFileSizeBytes);

  // 2. ルール実行
  const violations: Violation[] = await executeRules({
    rootDir,
    files,
    config,
  });

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
    gitCommitHash: await getGitCommitHash(rootDir),
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
  };

  // 4. 監査ログのローカル永続化 (.shipguard/audit.log)
  await appendAuditLog(result, rootDir, config);

  // 5. レポート出力
  await outputReport(result, options);

  return result;
}
