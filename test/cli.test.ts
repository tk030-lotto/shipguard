import { execFile } from "node:child_process";
import fs from "node:fs/promises";
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

  it("exits with code 2 when --format is unknown", async () => {
    const res = await runCliProcess(["scan", "--format", "bogus-format"], tmpDir);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toContain("不明な出力形式");
  });

  it("exits with code 2 when .shipguardrc.json has syntax or schema error", async () => {
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
  });

  it("displays rule descriptions and corrected --strict help text", async () => {
    const res = await runCliProcess(["scan", "--help"], tmpDir);
    expect(res.exitCode).toBe(0);
    const normalizedStdout = res.stdout.replace(/\s+/g, " ");
    expect(normalizedStdout).toContain("critical/high に加え medium/low を含むすべての違反で終了コード1");
    expect(normalizedStdout).toContain("利用可能な監査ルール:");
    expect(normalizedStdout).toContain("SEC-001");
  });
});
