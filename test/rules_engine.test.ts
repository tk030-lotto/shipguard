import { describe, expect, it } from "vitest";
import { ALL_RULES, executeRules } from "../src/rules/index.js";
import type { ScanContext } from "../src/types/index.js";

describe("Rule Engine (executeRules)", () => {
  const dummyStripeKey = "sk_" + "live_" + "0".repeat(24);

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
          content: `const key = "${dummyStripeKey}";`,
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
          content: `const key = "${dummyStripeKey}";`,
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

  it("設定未指定時は Rule.defaultSeverity と Rule.name が適用されること", async () => {
    const targetRule = ALL_RULES.find((r) => r.id === "SEC-001")!;
    const originalSeverity = targetRule.defaultSeverity;
    const originalName = targetRule.name;

    try {
      targetRule.defaultSeverity = "medium";
      targetRule.name = "カスタムルール名";

      const context: ScanContext = {
        rootDir: "/mock",
        files: [
          {
            path: "src/secret.ts",
            absolutePath: "/mock/src/secret.ts",
            content: `const key = "${dummyStripeKey}";`,
            extension: ".ts",
          },
        ],
        config: {},
      };

      const violations = await executeRules(context);
      expect(violations.length).toBe(1);
      expect(violations[0].severity).toBe("medium");
      expect(violations[0].ruleName).toBe("カスタムルール名");
    } finally {
      targetRule.defaultSeverity = originalSeverity;
      targetRule.name = originalName;
    }
  });
});
