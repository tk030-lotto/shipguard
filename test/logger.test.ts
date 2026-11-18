import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendAuditLog,
  createAuditLogRecord,
  readAuditLogs,
  readAuditLogsDetailed,
  resolveSafeLogPath,
} from "../src/logger/index.js";
import type { ScanResult } from "../src/types/index.js";

describe("audit logger", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "shipguard-logger-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const mockResult: ScanResult = {
    id: "test-uuid-1234",
    timestamp: "2026-09-18T12:00:00.000Z",
    summary: {
      scannedFiles: 10,
      totalViolations: 1,
      critical: 1,
      high: 0,
      medium: 0,
      low: 0,
      passed: false,
    },
    violations: [
      {
        ruleId: "SEC-001",
        ruleName: "Hardcoded Secret",
        filePath: "src/secret.ts",
        line: 5,
        column: 10,
        message: "Found secret",
        severity: "critical",
      },
    ],
  };

  it("createAuditLogRecord formats record correctly", () => {
    const record = createAuditLogRecord(mockResult, "commit-hash-abc");
    expect(record.id).toBe("test-uuid-1234");
    expect(record.gitCommitHash).toBe("commit-hash-abc");
    expect(record.passed).toBe(false);
    expect(record.violations).toHaveLength(1);
    expect(record.violations[0].ruleId).toBe("SEC-001");
    // column や snippet は軽量化のため除外されていることを確認
    expect((record.violations[0] as any).column).toBeUndefined();
  });

  it("appendAuditLog writes NDJSON to .shipguard/audit.log", async () => {
    const logPath = await appendAuditLog(mockResult, tmpDir);
    expect(logPath).toBe(path.resolve(tmpDir, ".shipguard/audit.log"));

    const exists = await fs.stat(logPath!).then(() => true).catch(() => false);
    expect(exists).toBe(true);

    const logs = await readAuditLogs(logPath!);
    expect(logs).toHaveLength(1);
    expect(logs[0].id).toBe("test-uuid-1234");
    expect(logs[0].summary.critical).toBe(1);
  });

  it("appendAuditLog appends multiple runs correctly", async () => {
    await appendAuditLog(mockResult, tmpDir);
    const secondResult = {
      ...mockResult,
      id: "test-uuid-5678",
      timestamp: "2026-09-18T12:05:00.000Z",
    };
    const logPath = await appendAuditLog(secondResult, tmpDir);

    const logs = await readAuditLogs(logPath!);
    expect(logs).toHaveLength(2);
    expect(logs[0].id).toBe("test-uuid-1234");
    expect(logs[1].id).toBe("test-uuid-5678");
  });

  it("appendAuditLog does nothing if logging.enabled is false", async () => {
    const logPath = await appendAuditLog(mockResult, tmpDir, {
      logging: { enabled: false },
    });
    expect(logPath).toBeNull();

    const expectedFile = path.resolve(tmpDir, ".shipguard/audit.log");
    const exists = await fs.stat(expectedFile).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });

  it("readAuditLogs returns empty array when log file does not exist", async () => {
    const nonExistent = path.resolve(tmpDir, "does-not-exist.log");
    const logs = await readAuditLogs(nonExistent);
    expect(logs).toEqual([]);
  });

  it("readAuditLogsDetailed returns skippedLines count for corrupted NDJSON lines", async () => {
    const logPath = path.resolve(tmpDir, ".shipguard/audit.log");
    await fs.mkdir(path.dirname(logPath), { recursive: true });
    const validLine = JSON.stringify(createAuditLogRecord(mockResult));
    await fs.writeFile(
      logPath,
      `${validLine}\n{broken json\n{"not": "audit-record"}\n`,
      "utf8"
    );

    const { records, skippedLines } = await readAuditLogsDetailed(logPath);
    expect(records).toHaveLength(1);
    expect(skippedLines).toBe(2);
  });

  it("appendAuditLog and resolveSafeLogPath reject logging.path escaping rootDir", async () => {
    await expect(
      appendAuditLog(mockResult, tmpDir, {
        logging: { enabled: true, path: "../outside.log" },
      })
    ).rejects.toThrow("対象ディレクトリの外");

    const outsideAbs = path.resolve(tmpDir, "..", "outside-abs.log");
    expect(() => resolveSafeLogPath(tmpDir, outsideAbs)).toThrow("対象ディレクトリの外");
  });

  it("rejects logging.path escaping rootDir via junction / symlink realpath", async () => {
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "shipguard-outside-target-"));
    try {
      const junctionPath = path.join(tmpDir, ".shipguard");
      await fs.symlink(outsideDir, junctionPath, "junction");

      await expect(
        appendAuditLog(mockResult, tmpDir)
      ).rejects.toThrow("実パスが対象ディレクトリの外");

      const outsideLogExists = await fs
        .stat(path.join(outsideDir, "audit.log"))
        .then(() => true)
        .catch(() => false);
      expect(outsideLogExists).toBe(false);
    } finally {
      await fs.rm(outsideDir, { recursive: true, force: true });
    }
  });
});
