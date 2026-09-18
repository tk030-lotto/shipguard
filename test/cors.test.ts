import { describe, expect, it } from "vitest";
import { corsRule } from "../src/rules/cors.js";
import type { ScanContext } from "../src/types/index.js";

describe("SEC-004: ワイルドカードCORS設定検知", () => {
  it("ヘッダーオブジェクト内の Access-Control-Allow-Origin: * を検知すること", () => {
    const context: ScanContext = {
      rootDir: "/mock",
      files: [
        {
          path: "src/api/route.ts",
          absolutePath: "/mock/src/api/route.ts",
          content: [
            "return new Response(JSON.stringify(data), {",
            "  headers: {",
            '    "Access-Control-Allow-Origin": "*",',
            '    "Access-Control-Allow-Methods": "GET, POST"',
            "  }",
            "});",
          ].join("\n"),
          extension: ".ts",
        },
      ],
      config: {},
    };

    const violations = corsRule.check(context);
    expect(violations.length).toBe(1);
    expect(violations[0].ruleId).toBe("SEC-004");
    expect(violations[0].severity).toBe("medium");
    expect(violations[0].line).toBe(3);
  });

  it("setHeader での Access-Control-Allow-Origin * を検知すること", () => {
    const context: ScanContext = {
      rootDir: "/mock",
      files: [
        {
          path: "src/server.ts",
          absolutePath: "/mock/src/server.ts",
          content: 'res.setHeader("Access-Control-Allow-Origin", "*");',
          extension: ".ts",
        },
      ],
      config: {},
    };

    const violations = corsRule.check(context);
    expect(violations.length).toBe(1);
    expect(violations[0].ruleId).toBe("SEC-004");
  });

  it("CORSミドルウェアの origin: * 設定を検知すること", () => {
    const context: ScanContext = {
      rootDir: "/mock",
      files: [
        {
          path: "src/app.ts",
          absolutePath: "/mock/src/app.ts",
          content: 'app.use(cors({ origin: "*" }));',
          extension: ".ts",
        },
      ],
      config: {},
    };

    const violations = corsRule.check(context);
    expect(violations.length).toBe(1);
    expect(violations[0].ruleId).toBe("SEC-004");
  });

  it("ドメインが限定されている場合は検知しないこと", () => {
    const context: ScanContext = {
      rootDir: "/mock",
      files: [
        {
          path: "src/api/route.ts",
          absolutePath: "/mock/src/api/route.ts",
          content: 'res.setHeader("Access-Control-Allow-Origin", "https://app.example.com");',
          extension: ".ts",
        },
      ],
      config: {},
    };

    const violations = corsRule.check(context);
    expect(violations.length).toBe(0);
  });

  it("コメントアウト行は検知しないこと", () => {
    const context: ScanContext = {
      rootDir: "/mock",
      files: [
        {
          path: "src/api/route.ts",
          absolutePath: "/mock/src/api/route.ts",
          content: '// "Access-Control-Allow-Origin": "*"',
          extension: ".ts",
        },
      ],
      config: {},
    };

    const violations = corsRule.check(context);
    expect(violations.length).toBe(0);
  });
});
