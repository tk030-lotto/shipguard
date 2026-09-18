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
      await fs.writeFile(
        path.join(tmpDir, "stripe.ts"),
        'const key = "sk_live_123456789012345678901234";'
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

      // 5. CFG-001: Missing env in .env
      await fs.writeFile(
        path.join(tmpDir, ".env.example"),
        "DATABASE_URL=\nMISSING_IN_LOCAL=\n"
      );

      const result = await runScan({ cwd: tmpDir });

      expect(result.summary.passed).toBe(false);
      expect(result.summary.critical).toBe(1); // SEC-001
      expect(result.summary.high).toBe(2);     // SEC-002, SEC-003
      expect(result.summary.medium).toBe(1);   // SEC-004
      expect(result.summary.low).toBe(1);      // CFG-001
      expect(result.summary.totalViolations).toBe(5);

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
});
