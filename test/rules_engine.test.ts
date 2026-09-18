import { describe, expect, it } from "vitest";
import { ALL_RULES, executeRules } from "../src/rules/index.js";
import type { ScanContext } from "../src/types/index.js";

describe("Rule Engine (executeRules)", () => {
  it("5つのルールがすべて登録されていること", () => {
    const ruleIds = ALL_RULES.map((r) => r.id);
    expect(ruleIds).toContain("SEC-001");
    expect(ruleIds).toContain("SEC-002");
    expect(ruleIds).toContain("SEC-003");
    expect(ruleIds).toContain("SEC-004");
    expect(ruleIds).toContain("CFG-001");
  });

  it("設定で off にされたルールは実行・検知されないこと", async () => {
    const context: ScanContext = {
      rootDir: "/mock",
      files: [
        {
          path: "src/secret.ts",
          absolutePath: "/mock/src/secret.ts",
          content: 'const key = "sk_live_123456789012345678901234";',
          extension: ".ts",
        },
      ],
      config: {
        rules: {
          "SEC-001": "off",
        },
      },
    };

    const violations = await executeRules(context);
    expect(violations.length).toBe(0);
  });

  it("設定で指定された Severity に上書きされること", async () => {
    const context: ScanContext = {
      rootDir: "/mock",
      files: [
        {
          path: "src/secret.ts",
          absolutePath: "/mock/src/secret.ts",
          content: 'const key = "sk_live_123456789012345678901234";',
          extension: ".ts",
        },
      ],
      config: {
        rules: {
          "SEC-001": "low",
        },
      },
    };

    const violations = await executeRules(context);
    expect(violations.length).toBe(1);
    expect(violations[0].severity).toBe("low");
  });
});
