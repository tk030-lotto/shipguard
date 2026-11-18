import { describe, expect, it } from "vitest";
import { runScan } from "../src/commands/scan.js";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";

describe("E2E Scan Integration", () => {
  it("各ルールの違反を含むディレクトリで全ルールが正しく検知され不合格判定となること", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "shipguard-e2e-"));

    try {
      // 1. SEC-001: Stripe Key
      const dummyStripeKey = "sk_" + "live_" + "0".repeat(24);
      await fs.writeFile(
        path.join(tmpDir, "stripe.ts"),
        `const key = "${dummyStripeKey}";`
      );

      // 2. SEC-002: Client exposed secret env
      await fs.writeFile(
        path.join(tmpDir, ".env"),
        "DATABASE_URL=postgres://localhost:5432/mydb\nNEXT_PUBLIC_SERVICE_ROLE_KEY=abcdef123456\n"
      );

      // 3. SEC-003: RLS not enabled in migration SQL
      const migDir = path.join(tmpDir, "supabase", "migrations");
      await fs.mkdir(migDir, { recursive: true });
      await fs.writeFile(
        path.join(migDir, "01_create.sql"),
        "CREATE TABLE customers (id SERIAL PRIMARY KEY, name TEXT);"
      );

      // 4. SEC-004: CORS wildcard
      await fs.writeFile(
        path.join(tmpDir, "api.ts"),
        'res.setHeader("Access-Control-Allow-Origin", "*");'
      );

      // 5. CFG-001: Missing env in .env (NEXT_PUBLIC_SECRET in .env.example should not trigger SEC-002)
      await fs.writeFile(
        path.join(tmpDir, ".env.example"),
        "DATABASE_URL=\nMISSING_IN_LOCAL=\nNEXT_PUBLIC_SAMPLE_SECRET=\n"
      );

      const result = await runScan({ cwd: tmpDir });

      expect(result.summary.passed).toBe(false);
      expect(result.summary.critical).toBe(1); // SEC-001
      expect(result.summary.high).toBe(2);     // SEC-002, SEC-003
      expect(result.summary.medium).toBe(1);   // SEC-004
      expect(result.summary.low).toBe(2);      // CFG-001 (MISSING_IN_LOCAL, NEXT_PUBLIC_SAMPLE_SECRET)
      expect(result.summary.totalViolations).toBe(6);

      const sec001 = result.violations.find((v) => v.ruleId === "SEC-001");
      expect(sec001?.snippet).toContain("sk_live...0000");
      expect(sec001?.snippet).not.toContain(dummyStripeKey);
      expect(result.notices).toBeUndefined();

      const ruleIds = result.violations.map((v) => v.ruleId);
      expect(ruleIds).toContain("SEC-001");
      expect(ruleIds).toContain("SEC-002");
      expect(ruleIds).toContain("SEC-003");
      expect(ruleIds).toContain("SEC-004");
      expect(ruleIds).toContain("CFG-001");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("再現A: .gitignore に .env がある構成でも SEC-002 が .env 本体を検査し CFG-001 が誤報しないこと", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "shipguard-e2e-env-a-"));
    try {
      await fs.writeFile(path.join(tmpDir, ".gitignore"), ".env\n.env.local\n");
      await fs.writeFile(
        path.join(tmpDir, ".env"),
        "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=abc\nNEXT_PUBLIC_STRIPE_SECRET_KEY=xyz\n"
      );
      await fs.writeFile(
        path.join(tmpDir, ".env.example"),
        "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=\nNEXT_PUBLIC_STRIPE_SECRET_KEY=\n"
      );

      const result = await runScan({ cwd: tmpDir });
      expect(result.summary.passed).toBe(false);
      expect(result.summary.high).toBe(2);
      expect(result.violations.filter((v) => v.ruleId === "SEC-002")).toHaveLength(2);
      expect(result.violations.filter((v) => v.ruleId === "CFG-001")).toHaveLength(0);
      expect(result.notices).toEqual([
        "SEC-003 は対象 SQL が 0 件のため未実施（migrationsDir: supabase/migrations）",
      ]);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("再現B: .gitignore が無い構成で .env 内の API キーを SEC-001 が critical としないこと", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "shipguard-e2e-env-b-"));
    try {
      const dummyKey = "sk_" + "live_" + "a".repeat(24);
      await fs.writeFile(path.join(tmpDir, ".env"), `STRIPE_SECRET_KEY=${dummyKey}\n`);

      const result = await runScan({ cwd: tmpDir });
      expect(result.summary.passed).toBe(true);
      expect(result.summary.critical).toBe(0);
      expect(result.summary.totalViolations).toBe(0);
      expect(result.notices).toEqual([
        "SEC-003 は対象 SQL が 0 件のため未実施（migrationsDir: supabase/migrations）",
      ]);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
