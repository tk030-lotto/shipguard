import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatJsonReport, formatMarkdownReport, outputReport } from "../src/reporter/index.js";
import type { ScanResult } from "../src/types/index.js";

describe("reporters", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "shipguard-reporter-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const mockResult: ScanResult = {
    id: "uuid-reporter-test",
    timestamp: "2026-09-18T13:00:00.000Z",
    gitCommitHash: "abcdef1234567890",
    summary: {
      scannedFiles: 20,
      totalViolations: 2,
      critical: 1,
      high: 1,
      medium: 0,
      low: 0,
      passed: false,
    },
    violations: [
      {
        ruleId: "SEC-001",
        ruleName: "Hardcoded Secret",
        filePath: "src/secret.ts",
        line: 12,
        column: 4,
        message: "Found Stripe secret key",
        snippet: 'const key = "sk_live_123456789012345678901234";',
        severity: "critical",
      },
      {
        ruleId: "SEC-003",
        ruleName: "Missing RLS in Database",
        filePath: "supabase/migrations/01_users.sql",
        line: 1,
        message: "Table 'users' does not have RLS enabled",
        severity: "high",
      },
    ],
  };

  it("formatJsonReport returns valid JSON with all fields", () => {
    const jsonStr = formatJsonReport(mockResult);
    const parsed = JSON.parse(jsonStr);
    expect(parsed.id).toBe("uuid-reporter-test");
    expect(parsed.summary.critical).toBe(1);
    expect(parsed.violations).toHaveLength(2);
  });

  it("formatMarkdownReport contains title, summary table and violations", () => {
    const md = formatMarkdownReport(mockResult);
    expect(md).toContain("# 🛡️ shipguard Audit Report");
    expect(md).toContain("FAILED");
    expect(md).toContain("| 🔴 CRITICAL | 1 |");
    expect(md).toContain("| 🟠 HIGH | 1 |");
    expect(md).toContain("[SEC-001]");
    expect(md).toContain("[SEC-003]");
    expect(md).toContain("sk_live_123456789012345678901234");
  });

  it("formatMarkdownReport displays passed status when no violations", () => {
    const passedResult: ScanResult = {
      ...mockResult,
      summary: {
        ...mockResult.summary,
        totalViolations: 0,
        critical: 0,
        high: 0,
        passed: true,
      },
      violations: [],
    };
    const md = formatMarkdownReport(passedResult);
    expect(md).toContain("PASSED");
    expect(md).toContain("No violations detected");
  });

  it("outputReport writes to file when options.output is specified", async () => {
    const outPath = path.join(tmpDir, "reports", "audit.md");
    await outputReport(mockResult, {
      format: "markdown",
      output: outPath,
      cwd: tmpDir,
    });

    const fileContent = await fs.readFile(outPath, "utf8");
    expect(fileContent).toContain("# 🛡️ shipguard Audit Report");
  });

  it("outputReport writes JSON to file when format is json", async () => {
    const outPath = path.join(tmpDir, "report.json");
    await outputReport(mockResult, {
      format: "json",
      output: outPath,
      cwd: tmpDir,
    });

    const fileContent = await fs.readFile(outPath, "utf8");
    const parsed = JSON.parse(fileContent);
    expect(parsed.id).toBe("uuid-reporter-test");
  });
});
