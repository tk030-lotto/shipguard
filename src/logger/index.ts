import { exec } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { AuditLogReadResult, AuditLogRecord, ScanResult, ShipguardConfig } from "../types/index.js";

const execAsync = promisify(exec);

/**
 * ログファイルのパスが rootDir の内側に収まることを検証して絶対パスを返す
 */
export function resolveSafeLogPath(
  rootDir: string,
  logRelativePath: string = ".shipguard/audit.log"
): string {
  if (!logRelativePath || logRelativePath.includes("\0")) {
    throw new Error("logging.path が不正です");
  }
  const resolvedRoot = path.resolve(rootDir);
  const resolvedLog = path.resolve(resolvedRoot, logRelativePath);
  const rel = path.relative(resolvedRoot, resolvedLog);
  if (!rel || rel === "." || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`logging.path が対象ディレクトリの外を指しています: ${logRelativePath}`);
  }
  return resolvedLog;
}

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
  const logAbsolutePath = resolveSafeLogPath(rootDir, logRelativePath);
  const logDir = path.dirname(logAbsolutePath);

  const gitHash = result.gitCommitHash ?? (await getGitCommitHash(rootDir));
  const record = createAuditLogRecord(result, gitHash);
  const line = JSON.stringify(record) + "\n";

  await fs.mkdir(logDir, { recursive: true });
  await fs.appendFile(logAbsolutePath, line, "utf8");

  return logAbsolutePath;
}

/**
 * 監査ログを全件読み込み、スキップした不正行の件数とともに返す
 */
export async function readAuditLogsDetailed(
  logFilePath: string
): Promise<AuditLogReadResult> {
  try {
    const content = await fs.readFile(logFilePath, "utf8");
    const lines = content.split("\n").filter((l) => l.trim().length > 0);
    const records: AuditLogRecord[] = [];
    let skippedLines = 0;

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as AuditLogRecord;
        if (
          !parsed ||
          typeof parsed !== "object" ||
          typeof parsed.id !== "string" ||
          typeof parsed.timestamp !== "string" ||
          !parsed.summary ||
          typeof parsed.passed !== "boolean"
        ) {
          skippedLines++;
          continue;
        }
        records.push(parsed);
      } catch {
        skippedLines++;
      }
    }

    return { records, skippedLines };
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return { records: [], skippedLines: 0 };
    }
    throw error;
  }
}

/**
 * 監査ログを全件読み込む
 */
export async function readAuditLogs(
  logFilePath: string
): Promise<AuditLogRecord[]> {
  const { records } = await readAuditLogsDetailed(logFilePath);
  return records;
}
