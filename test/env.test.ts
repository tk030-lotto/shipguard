import { describe, expect, it } from "vitest";
import { clientEnvSecretsRule, envSyncRule } from "../src/rules/env.js";
import type { ScanContext } from "../src/types/index.js";

describe("SEC-002: クライアント公開プレフィックス秘密情報検知", () => {
  it("NEXT_PUBLIC_ プレフィックス付きの秘密情報を検知すること", () => {
    const context: ScanContext = {
      rootDir: "/mock",
      files: [
        {
          path: ".env.production",
          absolutePath: "/mock/.env.production",
          content: "NEXT_PUBLIC_STRIPE_SECRET_KEY=sk_live_12345\n",
          extension: "",
        },
      ],
      config: {},
    };

    const violations = clientEnvSecretsRule.check(context);
    expect(violations.length).toBe(1);
    expect(violations[0].ruleId).toBe("SEC-002");
    expect(violations[0].severity).toBe("high");
    expect(violations[0].message).toContain("NEXT_PUBLIC_STRIPE_SECRET_KEY");
  });

  it("VITE_ プレフィックス付きの機密キーを検知すること", () => {
    const context: ScanContext = {
      rootDir: "/mock",
      files: [
        {
          path: "src/config.ts",
          absolutePath: "/mock/src/config.ts",
          content: "const pass = import.meta.env.VITE_DATABASE_URL;",
          extension: ".ts",
        },
      ],
      config: {},
    };

    const violations = clientEnvSecretsRule.check(context);
    expect(violations.length).toBe(1);
    expect(violations[0].ruleId).toBe("SEC-002");
    expect(violations[0].message).toContain("VITE_DATABASE_URL");
  });

  it("ANON や PUBLISHABLE 等の公開用キーは検知しないこと", () => {
    const context: ScanContext = {
      rootDir: "/mock",
      files: [
        {
          path: ".env",
          absolutePath: "/mock/.env",
          content: [
            "NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...",
            "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_12345",
            "VITE_CLERK_PUBLISHABLE_KEY=pk_test_12345",
          ].join("\n"),
          extension: "",
        },
      ],
      config: {},
    };

    const violations = clientEnvSecretsRule.check(context);
    expect(violations.length).toBe(0);
  });
});

describe("CFG-001: 環境変数テンプレート未設定検知", () => {
  it(".env.example にあって .env にないキーを検知すること", () => {
    const context: ScanContext = {
      rootDir: "/mock",
      files: [
        {
          path: ".env.example",
          absolutePath: "/mock/.env.example",
          content: "DATABASE_URL=\nSTRIPE_SECRET_KEY=\nNEW_FEATURE_FLAG=\n",
          extension: "",
        },
        {
          path: ".env",
          absolutePath: "/mock/.env",
          content: "DATABASE_URL=postgres://...\nSTRIPE_SECRET_KEY=sk_...\n",
          extension: "",
        },
      ],
      config: {},
    };

    const violations = envSyncRule.check(context);
    expect(violations.length).toBe(1);
    expect(violations[0].ruleId).toBe("CFG-001");
    expect(violations[0].severity).toBe("low");
    expect(violations[0].message).toContain("NEW_FEATURE_FLAG");
  });

  it("すべてのキーが定義されていれば違反が0件であること", () => {
    const context: ScanContext = {
      rootDir: "/mock",
      files: [
        {
          path: ".env.example",
          absolutePath: "/mock/.env.example",
          content: "DATABASE_URL=\nPORT=\n",
          extension: "",
        },
        {
          path: ".env.local",
          absolutePath: "/mock/.env.local",
          content: "DATABASE_URL=postgres://...\nPORT=3000\n",
          extension: "",
        },
      ],
      config: {},
    };

    const violations = envSyncRule.check(context);
    expect(violations.length).toBe(0);
  });
});
