import { describe, expect, it } from "vitest";
import { secretsRule } from "../src/rules/secrets.js";
import type { ScanContext } from "../src/types/index.js";

describe("SEC-001: ハードコードシークレット検知", () => {
  const dummyStripeKey = "sk_" + "live_" + "0".repeat(30);
  const dummyOpenAiKey = "sk-" + "proj-" + "0".repeat(36);

  it("Stripeの本番用秘密鍵を正しく検知し、デフォルトでmessageとsnippetの両方をマスクすること", () => {
    const context: ScanContext = {
      rootDir: "/mock",
      files: [
        {
          path: "src/payment.ts",
          absolutePath: "/mock/src/payment.ts",
          content: `const stripeKey = "${dummyStripeKey}";`,
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
    expect(violations[0].message).toContain("sk_live...0000");
    expect(violations[0].snippet).toContain("sk_live...0000");
    expect(violations[0].snippet).not.toContain(dummyStripeKey);
    expect(violations[0].line).toBe(1);
  });

  it("showSecrets が true の場合は snippet に原文が表示されること", () => {
    const rawKey = dummyStripeKey;
    const context: ScanContext = {
      rootDir: "/mock",
      files: [
        {
          path: "src/payment.ts",
          absolutePath: "/mock/src/payment.ts",
          content: `const stripeKey = "${rawKey}";`,
          extension: ".ts",
        },
      ],
      config: {},
      showSecrets: true,
    };

    const violations = secretsRule.check(context);
    expect(violations.length).toBe(1);
    expect(violations[0].snippet).toContain(rawKey);
    expect(violations[0].message).toContain("sk_live...0000");
  });

  it("OpenAIのAPIキーを正しく検知すること", () => {
    const context: ScanContext = {
      rootDir: "/mock",
      files: [
        {
          path: "src/ai.ts",
          absolutePath: "/mock/src/ai.ts",
          content: `const apiKey = "${dummyOpenAiKey}";`,
          extension: ".ts",
        },
      ],
      config: {},
    };

    const violations = secretsRule.check(context);
    expect(violations.length).toBe(1);
    expect(violations[0].message).toContain("OpenAI API Key");
    expect(violations[0].snippet).not.toContain(dummyOpenAiKey);
  });

  it(".env.example 内のプレースホルダーは検知しないこと", () => {
    const placeholder = "sk_" + "live_your_key_here_placeholder";
    const context: ScanContext = {
      rootDir: "/mock",
      files: [
        {
          path: ".env.example",
          absolutePath: "/mock/.env.example",
          content: `STRIPE_SECRET_KEY=${placeholder}\n`,
          extension: "",
        },
      ],
      config: {},
    };

    const violations = secretsRule.check(context);
    expect(violations.length).toBe(0);
  });

  it(".env / .env.local 等の実環境変数ファイルは SEC-001 の対象外となること", () => {
    const context: ScanContext = {
      rootDir: "/mock",
      files: [
        {
          path: ".env",
          absolutePath: "/mock/.env",
          content: `STRIPE_SECRET_KEY=${dummyStripeKey}\n`,
          extension: "",
        },
        {
          path: ".env.local",
          absolutePath: "/mock/.env.local",
          content: `OPENAI_API_KEY=${dummyOpenAiKey}\n`,
          extension: "",
        },
      ],
      config: {},
    };

    const violations = secretsRule.check(context);
    expect(violations.length).toBe(0);
  });

  it(".env.example 内のプレースホルダーではない実キー形式は引き続き検知されること", () => {
    const context: ScanContext = {
      rootDir: "/mock",
      files: [
        {
          path: ".env.example",
          absolutePath: "/mock/.env.example",
          content: `STRIPE_SECRET_KEY=${dummyStripeKey}\n`,
          extension: "",
        },
      ],
      config: {},
    };

    const violations = secretsRule.check(context);
    expect(violations.length).toBe(1);
  });

  it("文字列連結・テンプレートリテラル・配列joinによる秘密鍵の組み立てを検知しマスクすること", () => {
    const partA = "sk_";
    const partB = "live_";
    const partC = "abcdefghijklmnopqrstuvwx";
    const partArr1 = "sk_live_abcd";
    const partArr2 = "efghijklmnopqrstuvwx";

    const context: ScanContext = {
      rootDir: "/mock",
      files: [
        {
          path: "src/concat.ts",
          absolutePath: "/mock/src/concat.ts",
          content: [
            `const a = "${partA}" + "${partB}" + "${partC}";`,
            `const b = \`${partA}${partB}\${suffix}\`;`,
            `const c = ["${partArr1}", "${partArr2}"].join("");`,
          ].join("\n"),
          extension: ".ts",
        },
      ],
      config: {},
    };

    const violations = secretsRule.check(context);
    expect(violations).toHaveLength(3);
    expect(violations.map((v) => v.line)).toEqual([1, 2, 3]);
    expect(violations[0].snippet).not.toContain(partC);
    expect(violations[1].snippet).not.toContain("`${");
    expect(violations[2].snippet).not.toContain(partArr2);
  });
});
