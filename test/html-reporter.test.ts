import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatHtmlReport, outputReport } from "../src/reporter/index.js";
import type { ScanResult } from "../src/types/index.js";

describe("HTML Reporter", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "shipguard-html-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const mockResult: ScanResult = {
    id: "uuid-html-test",
    timestamp: "2026-09-18T14:00:00.000Z",
    gitCommitHash: "1234567890abcdef",
    summary: {
      scannedFiles: 15,
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
        line: 10,
        column: 5,
        message: "Stripe key found: <script>alert(1)</script>",
        snippet: 'const k = "sk_live_123456789012345678901234";',
        severity: "critical",
      },
    ],
  };

  it("generates standalone HTML with escaped characters and modern UI styles", () => {
    const html = formatHtmlReport(mockResult);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("shipguard Audit Report");
    expect(html).toContain("FAILED");
    expect(html).toContain("SEC-001");
    // XSS防止エスケープの確認
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    // CSSとコントロール
    expect(html).toContain("badge-critical");
    expect(html).toContain("filterViolations");
  });

  it("outputReport saves HTML file when format is html", async () => {
    const outPath = path.join(tmpDir, "report.html");
    await outputReport(mockResult, {
      format: "html",
      output: outPath,
      cwd: tmpDir,
    });

    const exists = await fs.stat(outPath).then(() => true).catch(() => false);
    expect(exists).toBe(true);

    const content = await fs.readFile(outPath, "utf8");
    expect(content).toContain("<!DOCTYPE html>");
    expect(content).toContain("SEC-001");
  });

  it("outputReport creates .shipguard/report.html when format is html without output path", async () => {
    await outputReport(mockResult, {
      format: "html",
      cwd: tmpDir,
    });

    const expected = path.join(tmpDir, ".shipguard", "report.html");
    const exists = await fs.stat(expected).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });
});
