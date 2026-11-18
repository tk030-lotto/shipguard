import { execFile, spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const binPath = path.resolve(process.cwd(), "bin", "shipguard.js");

async function runCliProcess(
  args: string[],
  cwd: string
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [binPath, ...args], {
      cwd,
      encoding: "utf8",
    });
    return { exitCode: 0, stdout, stderr };
  } catch (err: any) {
    return {
      exitCode: typeof err.code === "number" ? err.code : 1,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
    };
  }
}

describe("CLI exit codes and flags", { timeout: 15000 }, () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "shipguard-cli-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it("exits with code 0 when no violations are found", async () => {
    await fs.writeFile(path.join(tmpDir, "clean.ts"), "export const ok = 1;\n", "utf8");
    const res = await runCliProcess(["scan"], tmpDir);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("[PASS]");
  });

  it("exits with code 0 on medium/low violations without --strict, and code 1 with --strict", async () => {
    await fs.writeFile(
      path.join(tmpDir, "cors.ts"),
      'app.use(cors({ origin: "*" }));\n',
      "utf8"
    );

    const normalRes = await runCliProcess(["scan"], tmpDir);
    expect(normalRes.exitCode).toBe(0);

    const strictRes = await runCliProcess(["scan", "--strict"], tmpDir);
    expect(strictRes.exitCode).toBe(1);
    expect(strictRes.stdout).toContain("[FAIL]");
  });

  it("exits with code 1 when critical violation is detected", async () => {
    const dummyKey = "sk_" + "live_" + "0".repeat(24);
    await fs.writeFile(
      path.join(tmpDir, "secret.ts"),
      `const k = "${dummyKey}";\n`,
      "utf8"
    );

    const res = await runCliProcess(["scan"], tmpDir);
    expect(res.exitCode).toBe(1);
    expect(res.stdout).toContain("sk_live...0000");
    expect(res.stdout).not.toContain(dummyKey);

    const showSecretsRes = await runCliProcess(["scan", "--show-secrets"], tmpDir);
    expect(showSecretsRes.exitCode).toBe(1);
    expect(showSecretsRes.stdout).toContain(dummyKey);
  });

  it("exits with code 0 when invoked without subcommand (default scan)", async () => {
    await fs.writeFile(path.join(tmpDir, "clean.ts"), "export const ok = 1;\n", "utf8");
    const res = await runCliProcess([], tmpDir);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("[PASS]");
    expect(res.stdout).toContain("SEC-003 は対象 SQL が 0 件のため未実施");
  });

  it("exits with code 2 when --format is unknown or -o extension mismatches format", async () => {
    await fs.writeFile(path.join(tmpDir, "clean.ts"), "export const ok = 1;\n", "utf8");

    const res = await runCliProcess(["scan", "--format", "bogus-format"], tmpDir);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toContain("不明な出力形式");

    const mismatchRes = await runCliProcess(["scan", "-o", "report.html"], tmpDir);
    expect(mismatchRes.exitCode).toBe(2);
    expect(mismatchRes.stderr).toContain("拡張子");
  });

  it("does not generate HTML when --open is used with --format json", async () => {
    await fs.writeFile(path.join(tmpDir, "clean.ts"), "export const ok = 1;\n", "utf8");

    const res = await runCliProcess(["scan", "--format", "json", "--open"], tmpDir);
    expect(res.exitCode).toBe(0);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.summary.passed).toBe(true);

    const autoHtml = path.join(tmpDir, ".shipguard", "report.html");
    const exists = await fs.stat(autoHtml).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });

  it("exits with code 2 when 0 files are scanned (empty dir or 2MB skip)", async () => {
    const emptyRes = await runCliProcess(["scan"], tmpDir);
    expect(emptyRes.exitCode).toBe(2);
    expect(emptyRes.stdout).not.toContain("[PASS]");
    expect(emptyRes.stderr).toContain("0 件");

    await fs.writeFile(path.join(tmpDir, ".shipguardrc.json"), JSON.stringify({ scan: { maxFileSizeBytes: 5 } }), "utf8");
    await fs.writeFile(path.join(tmpDir, "big.ts"), "export const bigValue = 123456;\n", "utf8");
    const skippedRes = await runCliProcess(["scan"], tmpDir);
    expect(skippedRes.exitCode).toBe(2);
    expect(skippedRes.stdout).not.toContain("[PASS]");
  });

  it("exits with code 2 on invalid CLI arguments, non-numeric options, and unknown commands", async () => {
    await fs.writeFile(path.join(tmpDir, "clean.ts"), "export const ok = 1;\n", "utf8");

    const unknownOpt = await runCliProcess(["scan", "--bogus-option"], tmpDir);
    expect(unknownOpt.exitCode).toBe(2);

    const missingFmtVal = await runCliProcess(["scan", "--format"], tmpDir);
    expect(missingFmtVal.exitCode).toBe(2);

    const unknownCmd = await runCliProcess(["unknown-command"], tmpDir);
    expect(unknownCmd.exitCode).toBe(2);
    expect(unknownCmd.stdout).not.toContain("[PASS]");

    const badLimit = await runCliProcess(["history", "--limit", "abc"], tmpDir);
    expect(badLimit.exitCode).toBe(2);

    const badPort = await runCliProcess(["ui", "--no-open", "--port", "abc"], tmpDir);
    expect(badPort.exitCode).toBe(2);

    const outOfRangePort = await runCliProcess(["ui", "--no-open", "--port", "70000"], tmpDir);
    expect(outOfRangePort.exitCode).toBe(2);
  });

  it("exits with code 2 when .shipguardrc.json has syntax, schema, or unknown rule ID error", async () => {
    await fs.writeFile(path.join(tmpDir, "clean.ts"), "export const ok = 1;\n", "utf8");

    await fs.writeFile(path.join(tmpDir, ".shipguardrc.json"), "{ broken", "utf8");
    const syntaxRes = await runCliProcess(["scan"], tmpDir);
    expect(syntaxRes.exitCode).toBe(2);
    expect(syntaxRes.stderr).toContain("JSON構文が不正");

    await fs.writeFile(
      path.join(tmpDir, ".shipguardrc.json"),
      JSON.stringify({ rules: { "SEC-001": "invalid-level" } }),
      "utf8"
    );
    const schemaRes = await runCliProcess(["scan"], tmpDir);
    expect(schemaRes.exitCode).toBe(2);
    expect(schemaRes.stderr).toContain("スキーマが不正");

    await fs.writeFile(
      path.join(tmpDir, ".shipguardrc.json"),
      JSON.stringify({ rules: { "SEC-01": "off" } }),
      "utf8"
    );
    const unknownRuleRes = await runCliProcess(["scan"], tmpDir);
    expect(unknownRuleRes.exitCode).toBe(2);
    expect(unknownRuleRes.stderr).toContain("スキーマが不正");
  });

  it("displays rule descriptions and corrected --strict help text", async () => {
    const res = await runCliProcess(["scan", "--help"], tmpDir);
    expect(res.exitCode).toBe(0);
    const normalizedStdout = res.stdout.replace(/\s+/g, " ");
    expect(normalizedStdout).toContain("critical/high に加え medium/low を含むすべての違反で終了コード1");
    expect(normalizedStdout).toContain("利用可能な監査ルール:");
    expect(normalizedStdout).toContain("SEC-001");
  });

  it("retries next port via CLI ui command when default port 3773 is occupied and --port is omitted", async () => {
    await fs.writeFile(path.join(tmpDir, "clean.ts"), "export const ok = 1;\n", "utf8");

    const blocker = http.createServer();
    let occupiedByTest = false;
    try {
      await new Promise<void>((resolve, reject) => {
        blocker.once("error", (err: any) => {
          if (err.code === "EADDRINUSE") {
            resolve();
          } else {
            reject(err);
          }
        });
        blocker.listen(3773, "127.0.0.1", () => {
          occupiedByTest = true;
          resolve();
        });
      });

      const output = await new Promise<string>((resolve, reject) => {
        const child = spawn(process.execPath, [binPath, "ui", "--no-open"], {
          cwd: tmpDir,
          stdio: ["ignore", "pipe", "pipe"],
        });
        let combined = "";
        const timer = setTimeout(() => {
          child.kill();
          reject(new Error(`UI retry test timed out. output=${combined}`));
        }, 10000);

        const onData = (chunk: Buffer) => {
          combined += chunk.toString("utf8");
          const plain = combined.replace(/\x1b\[[0-9;]*m/g, "");
          if (plain.includes("ダッシュボードURL: http://127.0.0.1:")) {
            clearTimeout(timer);
            child.kill();
            resolve(plain);
          }
        };
        child.stdout.on("data", onData);
        child.stderr.on("data", onData);
        child.on("error", (e) => {
          clearTimeout(timer);
          reject(e);
        });
      });

      expect(output).toContain("再試行します");
      expect(output).toContain("http://127.0.0.1:377");
    } finally {
      if (occupiedByTest) {
        blocker.closeAllConnections?.();
        await new Promise<void>((resolve) => blocker.close(() => resolve()));
      }
    }
  });
});
