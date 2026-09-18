import { describe, expect, it } from "vitest";
import { secretsRule } from "../src/rules/secrets.js";
import type { ScanContext } from "../src/types/index.js";

describe("SEC-001: ハードコードシークレット検知", () => {
  it("Stripeの本番用秘密鍵を正しく検知しマスクすること", () => {
    const context: ScanContext = {
      rootDir: "/mock",
      files: [
        {
          path: "src/payment.ts",
          absolutePath: "/mock/src/payment.ts",
          content: 'const stripeKey = "sk_live_51AbcDefGhiJklMnoPqrStuVwxYz123456";',
          extension: ".ts",
        },
      ],
      config: {},
    };

    const violations = secretsRule.check(context);
    expect(violations.length).toBe(1);
    expect(violations[0].ruleId).toBe("SEC-001");
    expect(violations[0].severity).toBe("critical");
    expect(violations[0].message).toContain("Stripe Secret Key");
    expect(violations[0].message).toContain("sk_live...3456");
    expect(violations[0].line).toBe(1);
  });

  it("OpenAIのAPIキーを正しく検知すること", () => {
    const context: ScanContext = {
      rootDir: "/mock",
      files: [
        {
          path: "src/ai.ts",
          absolutePath: "/mock/src/ai.ts",
          content: 'const apiKey = "sk-proj-abc1234567890abcdef1234567890abcdef123456";',
          extension: ".ts",
        },
      ],
      config: {},
    };

    const violations = secretsRule.check(context);
    expect(violations.length).toBe(1);
    expect(violations[0].message).toContain("OpenAI API Key");
  });

  it(".env.example 内のプレースホルダーは検知しないこと", () => {
    const context: ScanContext = {
      rootDir: "/mock",
      files: [
        {
          path: ".env.example",
          absolutePath: "/mock/.env.example",
          content: "STRIPE_SECRET_KEY=sk_live_your_key_here_placeholder\n",
          extension: "",
        },
      ],
      config: {},
    };

    const violations = secretsRule.check(context);
    expect(violations.length).toBe(0);
  });
});
