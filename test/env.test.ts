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
          content: "NEXT_PUBLIC_STRIPE_SECRET_KEY=sk_live_00000\n",
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

  it(".env.example / .env.sample / .env.template は SEC-002 の検査対象から除外されること", () => {
    const context: ScanContext = {
      rootDir: "/mock",
      files: [
        {
          path: ".env.example",
          absolutePath: "/mock/.env.example",
          content: "NEXT_PUBLIC_SERVICE_ROLE_KEY=your_key_here\n",
          extension: "",
        },
        {
          path: ".env.sample",
          absolutePath: "/mock/.env.sample",
          content: "VITE_ADMIN_KEY=placeholder\n",
          extension: "",
        },
        {
          path: ".env.template",
          absolutePath: "/mock/.env.template",
          content: "PUBLIC_SECRET_TOKEN=placeholder\n",
          extension: "",
        },
      ],
      config: {},
    };

    const violations = clientEnvSecretsRule.check(context);
    expect(violations.length).toBe(0);
  });

  it("危険語を安全語より先に判定し、TOKEN / API_KEY / KEY を検知し、コメント行と非代入行を除外すること", () => {
    const context: ScanContext = {
      rootDir: "/mock",
      files: [
        {
          path: ".env",
          absolutePath: "/mock/.env",
          content: [
            "NEXT_PUBLIC_SUPABASE_ANON_KEY=safe",
            "NEXT_PUBLIC_ANON_SERVICE_ROLE_KEY=danger1",
            "NEXT_PUBLIC_DB_PASSWORD_ANON=danger2",
            "NEXT_PUBLIC_OPENAI_API_KEY=danger3",
            "NEXT_PUBLIC_MAPBOX_TOKEN=danger4",
            "NEXT_PUBLIC_GITHUB_TOKEN=danger5",
            "NEXT_PUBLIC_CUSTOM_KEY=danger6",
            "# NEXT_PUBLIC_COMMENTED_SECRET=ignored",
            "not a var NEXT_PUBLIC_INLINE_SECRET here",
          ].join("\n"),
          extension: "",
        },
        {
          path: "src/config.ts",
          absolutePath: "/mock/src/config.ts",
          content: [
            "// process.env.NEXT_PUBLIC_COMMENT_KEY",
            "const bad = process.env.NEXT_PUBLIC_ANON_SERVICE_ROLE_KEY;",
          ].join("\n"),
          extension: ".ts",
        },
      ],
      config: {},
    };

    const violations = clientEnvSecretsRule.check(context);
    const envLines = violations.filter((v) => v.filePath === ".env").map((v) => v.line);
    const srcLines = violations.filter((v) => v.filePath === "src/config.ts").map((v) => v.line);

    expect(envLines).toEqual([2, 3, 4, 5, 6, 7]);
    expect(srcLines).toEqual([2]);
  });

  it("export 接頭辞付きの代入を SEC-002 で検知し、値をマスクすること", () => {
    const secretVal = "secret_jwt_payload_xyz";
    const context: ScanContext = {
      rootDir: "/mock",
      files: [
        {
          path: ".env",
          absolutePath: "/mock/.env",
          content: `export NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=${secretVal}\n`,
          extension: "",
        },
      ],
      config: {},
    };

    const violations = clientEnvSecretsRule.check(context);
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toContain("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY");
    expect(violations[0].snippet).toBe("export NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=********");
    expect(violations[0].snippet).not.toContain(secretVal);
  });

  it("CFG-001 でも export 接頭辞付きの定義済み変数を認識し誤報しないこと", () => {
    const context: ScanContext = {
      rootDir: "/mock",
      files: [
        {
          path: ".env.example",
          absolutePath: "/mock/.env.example",
          content: "DATABASE_URL=\n",
          extension: "",
        },
        {
          path: ".env",
          absolutePath: "/mock/.env",
          content: "export DATABASE_URL=postgres://localhost/db\n",
          extension: "",
        },
      ],
      config: {},
    };

    const violations = envSyncRule.check(context);
    expect(violations).toHaveLength(0);
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
