import type { Rule, ScanContext, Violation } from "../types/index.js";

interface CorsPattern {
  name: string;
  regex: RegExp;
  message: string;
}

/**
 * SEC-004: ワイルドカードCORS設定検知パターン
 *
 * 検知対象:
 *   - { "Access-Control-Allow-Origin": "*" }  (オブジェクトリテラル)
 *   - setHeader / header / append("Access-Control-Allow-Origin", "*")
 *   - cors({ origin: "*" }) / origin: "*" ミドルウェア設定
 *   - cors("*")  (文字列引数による一括許可)
 *
 * 既知の制限:
 *   - 変数経由の動的設定 (origin: someVar) は検知不可
 *   - コメントアウト済み行は除外済み（呼び出し元でフィルタリング）
 *   - ASTベース解析が必要な複雑な記法は対象外
 */
const CORS_PATTERNS: CorsPattern[] = [
  {
    name: "Access-Control-Allow-Origin Header (object literal)",
    // スペースの有無を許容: "Access-Control-Allow-Origin" : "*"
    regex: /["'`]Access-Control-Allow-Origin["'`]\s*:\s*["'`]\*["'`]/gi,
    message: "ワイルドカード (*) を指定した Access-Control-Allow-Origin ヘッダーが設定されています",
  },
  {
    name: "setHeader Access-Control-Allow-Origin",
    // setHeader / header / append の引数にスペースが入るパターンも許容
    regex: /(?:setHeader|header|append)\s*\(\s*["'`]Access-Control-Allow-Origin["'`]\s*,\s*["'`]\*["'`]\s*\)/gi,
    message: "ワイルドカード (*) による Access-Control-Allow-Origin のヘッダー設定が記述されています",
  },
  {
    name: "CORS origin: * middleware",
    // origin: "*" / origin:"*" / origin : "*" 等のスペースバリアントを許容
    regex: /\borigin\s*:\s*["'`]\*["'`]/gi,
    message: "CORS設定で origin にワイルドカード (*) が指定されています",
  },
  {
    name: "cors(*) string argument",
    // cors("*") / cors('*') のような一括ワイルドカード許可
    regex: /\bcors\s*\(\s*["'`]\*["'`]\s*\)/gi,
    message: "CORS設定でワイルドカード文字列 (*) が引数に渡されています",
  },
];


export const corsRule: Rule = {
  id: "SEC-004",
  name: "ワイルドカードCORS設定検知",
  description: "APIルートやミドルウェアにおける Access-Control-Allow-Origin: * 等の過度に寛容なCORS設定を検知します",
  defaultSeverity: "medium",
  check(context: ScanContext): Violation[] {
    const violations: Violation[] = [];

    for (const file of context.files) {
      const isTarget = /\.(ts|tsx|js|jsx|mjs|cjs|json)$/.test(file.path);
      if (!isTarget) {
        continue;
      }

      const lines = file.content.split(/\r?\n/);

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const lineContent = lines[lineIndex];
        const trimmed = lineContent.trim();

        if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
          continue;
        }

        for (const pattern of CORS_PATTERNS) {
          pattern.regex.lastIndex = 0;
          const match = pattern.regex.exec(lineContent);

          if (match) {
            violations.push({
              ruleId: "SEC-004",
              ruleName: "ワイルドカードCORS設定検知",
              filePath: file.path,
              line: lineIndex + 1,
              column: match.index + 1,
              message: `${pattern.message}。本番環境では許可する信頼ドメイン（オリジン）を明示的に指定することを推奨します`,
              snippet: lineContent.trim(),
              severity: "medium",
            });
          }
        }
      }
    }

    return violations;
  },
};
