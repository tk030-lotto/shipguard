import { exec } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { AuditLogRecord, ScanResult, ShipguardConfig } from "../types/index.js";

const execAsync = promisify(exec);

/**
 * Gitコミットハッシュを取得（取得できない場合はundefined）
 */
export async function getGitCommitHash(cwd: string = process.cwd()): Promise<string | undefined> {
  try {
    const { stdout } = await execAsync("git rev-parse HEAD", {
      cwd,
    });
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * 監査ログレコードを生成
 */
export function createAuditLogRecord(
  result: ScanResult,
  gitCommitHash?: string
): AuditLogRecord {
  return {
    id: result.id,
    timestamp: result.timestamp,
    gitCommitHash,
    summary: {
      scannedFiles: result.summary.scannedFiles,
      totalViolations: result.summary.totalViolations,
      critical: result.summary.critical,
      high: result.summary.high,
      medium: result.summary.medium,
      low: result.summary.low,
    },
    passed: result.summary.passed,
    violations: result.violations.map((v) => ({
      ruleId: v.ruleId,
      filePath: v.filePath,
      line: v.line,
      message: v.message,
      severity: v.severity,
    })),
  };
}

/**
 * 監査結果を .shipguard/audit.log に NDJSON 形式で追記保存
 */
export async function appendAuditLog(
  result: ScanResult,
  rootDir: string = process.cwd(),
  config?: ShipguardConfig
): Promise<string | null> {
  // ログ記録が無効化されている場合はスキップ
  if (config?.logging?.enabled === false) {
    return null;
  }

  const logRelativePath = config?.logging?.path || ".shipguard/audit.log";
  const logAbsolutePath = path.resolve(rootDir, logRelativePath);
  const logDir = path.dirname(logAbsolutePath);

  const gitHash = result.gitCommitHash ?? (await getGitCommitHash(rootDir));
  const record = createAuditLogRecord(result, gitHash);
  const line = JSON.stringify(record) + "\n";

  await fs.mkdir(logDir, { recursive: true });
  await fs.appendFile(logAbsolutePath, line, "utf8");

  return logAbsolutePath;
}

/**
 * 監査ログを全件読み込む
 */
export async function readAuditLogs(
  logFilePath: string
): Promise<AuditLogRecord[]> {
  try {
    const content = await fs.readFile(logFilePath, "utf8");
    const lines = content.split("\n").filter((l) => l.trim().length > 0);
    const records: AuditLogRecord[] = [];

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as AuditLogRecord;
        records.push(parsed);
      } catch {
        // 不正な行はスキップ
      }
    }

    return records;
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}
