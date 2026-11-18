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
  it("cors('*') 文字列引数パターンを検知すること", () => {
    const context: ScanContext = {
      rootDir: "/mock",
      files: [
        {
          path: "src/server.ts",
          absolutePath: "/mock/src/server.ts",
          content: "app.use(cors('*'));",
          extension: ".ts",
        },
      ],
      config: {},
    };

    const violations = corsRule.check(context);
    expect(violations.length).toBe(1);
    expect(violations[0].ruleId).toBe("SEC-004");
    expect(violations[0].message).toContain("引数");
  });

  it("origin : '*' (スペースあり) パターンを検知すること", () => {
    const context: ScanContext = {
      rootDir: "/mock",
      files: [
        {
          path: "src/app.ts",
          absolutePath: "/mock/src/app.ts",
          content: "app.use(cors({ origin : '*' }));",
          extension: ".ts",
        },
      ],
      config: {},
    };

    const violations = corsRule.check(context);
    expect(violations.length).toBe(1);
    expect(violations[0].ruleId).toBe("SEC-004");
  });

  it("res.set()・複数行setHeader・origin: true を検知し、コメントや通常文字列を非検知とすること", () => {
    const context: ScanContext = {
      rootDir: "/mock",
      files: [
        {
          path: "src/a.ts",
          absolutePath: "/mock/src/a.ts",
          content: [
            'res.set("Access-Control-Allow-Origin", "*");',
            "res.setHeader(",
            '  "Access-Control-Allow-Origin",',
            '  "*"',
            ");",
            "app.use(cors({ origin: true }));",
            '// res.setHeader("Access-Control-Allow-Origin", "*");',
            'const doc = "Access-Control-Allow-Origin: *";',
          ].join("\n"),
          extension: ".ts",
        },
      ],
      config: {},
    };

    const violations = corsRule.check(context);
    expect(violations.map((v) => v.line)).toEqual([1, 2, 6]);
  });
});
