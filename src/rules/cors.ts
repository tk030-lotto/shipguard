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
 *   - setHeader / set / header / append("Access-Control-Allow-Origin", "*") (複数行含む)
 *   - cors({ origin: "*" }) / cors({ origin: true }) / origin: "*" / origin: true
 *   - cors("*")  (文字列引数による一括許可)
 *
 * 既知の制限:
 *   - 変数経由の動的設定 (origin: someVar) は検知不可
 *   - コメントアウト済みコードは除外済み
 *   - ASTベース解析が必要な複雑な記法は対象外
 */
const CORS_PATTERNS: CorsPattern[] = [
  {
    name: "Access-Control-Allow-Origin Header (object literal)",
    regex: /["'`]Access-Control-Allow-Origin["'`]\s*:\s*["'`]\*["'`]/gi,
    message: "ワイルドカード (*) を指定した Access-Control-Allow-Origin ヘッダーが設定されています",
  },
  {
    name: "setHeader / set Access-Control-Allow-Origin",
    regex: /\b(?:setHeader|set|header|append)\s*\(\s*["'`]Access-Control-Allow-Origin["'`]\s*,\s*["'`]\*["'`]\s*\)/gi,
    message: "ワイルドカード (*) による Access-Control-Allow-Origin のヘッダー設定が記述されています",
  },
  {
    name: "CORS origin: * or true middleware",
    regex: /\borigin\s*:\s*(?:["'`]\*["'`]|true\b)/gi,
    message: "CORS設定で origin にワイルドカード (*) または全オリジン許可 (true) が指定されています",
  },
  {
    name: "cors(*) string argument",
    regex: /\bcors\s*\(\s*["'`]\*["'`]\s*\)/gi,
    message: "CORS設定でワイルドカード文字列 (*) が引数に渡されています",
  },
];

/**
 * 文字列リテラル内を壊さず、行番号を保ったまま JS/TS コメント（// と /* ... *\/）を除去する
 */
function stripJsCommentsPreservingLines(code: string): string {
  let out = "";
  let i = 0;
  const len = code.length;

  while (i < len) {
    const ch = code[i];
    const next = i + 1 < len ? code[i + 1] : "";

    // 文字列リテラル ("...", '...', `...`)
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      out += ch;
      i++;
      while (i < len) {
        const c = code[i];
        out += c;
        i++;
        if (c === "\\" && i < len) {
          out += code[i];
          i++;
          continue;
        }
        if (c === quote) {
          break;
        }
      }
      continue;
    }

    // 行コメント (// ...)
    if (ch === "/" && next === "/") {
      i += 2;
      while (i < len && code[i] !== "\n" && code[i] !== "\r") {
        i++;
      }
      continue;
    }

    // ブロックコメント (/* ... */)
    if (ch === "/" && next === "*") {
      out += "  ";
      i += 2;
      while (i < len) {
        if (code[i] === "*" && i + 1 < len && code[i + 1] === "/") {
          out += "  ";
          i += 2;
          break;
        }
        out += code[i] === "\n" ? "\n" : " ";
        i++;
      }
      continue;
    }

    out += ch;
    i++;
  }

  return out;
}

function getLineAndColumnAt(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lastNewlineIndex = -1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === "\n") {
      line++;
      lastNewlineIndex = i;
    }
  }
  return { line, column: offset - lastNewlineIndex };
}

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

      const originalLines = file.content.split(/\r?\n/);
      const isJson = file.path.toLowerCase().endsWith(".json");
      const searchable = isJson ? file.content : stripJsCommentsPreservingLines(file.content);

      for (const pattern of CORS_PATTERNS) {
        pattern.regex.lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = pattern.regex.exec(searchable)) !== null) {
          const { line, column } = getLineAndColumnAt(searchable, match.index);
          const snippet = (originalLines[line - 1] ?? "").trim();

          violations.push({
            ruleId: corsRule.id,
            ruleName: corsRule.name,
            filePath: file.path,
            line,
            column,
            message: `${pattern.message}。本番環境では許可する信頼ドメイン（オリジン）を明示的に指定することを推奨します`,
            snippet,
            severity: corsRule.defaultSeverity,
          });
        }
      }
    }

    return violations;
  },
};
