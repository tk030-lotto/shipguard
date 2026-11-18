import path from "node:path";
import type { Rule, ScanContext, Violation } from "../types/index.js";

interface SecretPattern {
  name: string;
  regex: RegExp;
  message: string;
}

const KNOWN_CONCAT_PREFIXES = [
  "sk_live_",
  "rk_live_",
  "sk-proj-",
  "ghp_",
  "github_pat_",
  "AKIA",
  "xoxb-",
  "AIzaSy",
];

const TEMPLATE_SECRET_REGEX = new RegExp(
  `\`([^\`\\r\\n]*\\b(${KNOWN_CONCAT_PREFIXES.join("|")})[^\`\\r\\n]*\\$\\{[^\`\\r\\n]*)\``,
  "g"
);
const STRING_CONCAT_EXPR_REGEX =
  /(?:(["'])(?:(?!\1)[^\\\r\n]|\\.)*\1\s*\+\s*)+(["'])(?:(?!\2)[^\\\r\n]|\\.)*\2/g;
const ARRAY_JOIN_EXPR_REGEX =
  /\[\s*(?:(["'])(?:(?!\1)[^\\\r\n]|\\.)*\1\s*,\s*)*(["'])(?:(?!\2)[^\\\r\n]|\\.)*\2\s*,?\s*\]\s*\.\s*join\s*\(\s*(["'])\3\s*\)/g;
const QUOTED_LITERAL_REGEX = /(["'])((?:(?!\1)[^\\\r\n]|\\.)*)\1/g;

const SECRET_PATTERNS: SecretPattern[] = [
  {
    name: "Stripe Secret Key",
    regex: /\b(sk_live_[0-9a-zA-Z]{24,})\b/g,
    message: "Stripe本番用シークレットキーがコード内にハードコードされています",
  },
  {
    name: "Stripe Restricted Key",
    regex: /\b(rk_live_[0-9a-zA-Z]{24,})\b/g,
    message: "Stripe制限付きAPIキーがコード内にハードコードされています",
  },
  {
    name: "OpenAI API Key",
    regex: /\b(sk-(?:proj-)?[a-zA-Z0-9_-]{32,})\b/g,
    message: "OpenAIのAPIキーがコード内にハードコードされています",
  },
  {
    name: "GitHub Personal Access Token",
    regex: /\b(ghp_[0-9a-zA-Z]{36}|github_pat_[0-9a-zA-Z_]{60,})\b/g,
    message: "GitHubパーソナルアクセストークンがコード内に直接記述されています",
  },
  {
    name: "AWS Access Key ID",
    regex: /\b(AKIA[0-9A-Z]{16})\b/g,
    message: "AWS Access Key IDがコード内にハードコードされています",
  },
  {
    name: "Resend API Key",
    regex: /\b(re_[0-9a-zA-Z]{24,})\b/g,
    message: "ResendのAPIキーがコード内にハードコードされています",
  },
  {
    name: "Slack Bot Token",
    regex: /\b(xoxb-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24})\b/g,
    message: "Slackボットトークンがコード内にハードコードされています",
  },
  {
    name: "Google API Key",
    regex: /\b(AIzaSy[0-9a-zA-Z_-]{33})\b/g,
    message: "Google APIキーがコード内にハードコードされています",
  },
  {
    name: "Private Key Header",
    regex: /(-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----)/g,
    message: "暗号秘密鍵（Private Key）ファイルまたはブロックが直接含まれています",
  },
];

/**
 * トークン文字列をマスク化（安全な表示用）
 */
function maskSecret(secret: string): string {
  if (secret.length <= 8) {
    return "********";
  }
  const prefix = secret.slice(0, 7);
  const suffix = secret.slice(-4);
  return `${prefix}...${suffix}`;
}

function isPlaceholderSecret(matchedString: string): boolean {
  return (
    /^(.)\1+$/.test(matchedString) ||
    /your_?key|sample|dummy|placeholder|example|test/i.test(matchedString)
  );
}

function extractJoinedLiterals(expr: string): string {
  QUOTED_LITERAL_REGEX.lastIndex = 0;
  let joined = "";
  let m: RegExpExecArray | null;
  while ((m = QUOTED_LITERAL_REGEX.exec(expr)) !== null) {
    joined += m[2];
  }
  return joined;
}

export const secretsRule: Rule = {
  id: "SEC-001",
  name: "ハードコードシークレット検知",
  description: "Stripe, OpenAI, AWS, GitHub等の秘密鍵やAPIトークンの漏洩を検知します",
  defaultSeverity: "critical",
  check(context: ScanContext): Violation[] {
    const violations: Violation[] = [];

    for (const file of context.files) {
      const baseName = path.posix.basename(file.path.replace(/\\/g, "/"));
      const isExampleEnv =
        file.path.endsWith(".example") ||
        file.path.endsWith(".sample") ||
        file.path.endsWith(".template");
      const isRealEnv =
        (baseName === ".env" || baseName.startsWith(".env.")) && !isExampleEnv;

      // .env / .env.local 等の実環境変数ファイルは秘密鍵の正規配置先のため SEC-001 対象外
      if (isRealEnv) {
        continue;
      }

      const lines = file.content.split(/\r?\n/);

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const lineContent = lines[lineIndex];
        const lineMatches: Array<{
          patternName: string;
          message: string;
          matchedString: string;
          rawExpr: string;
          colNum: number;
        }> = [];

        // 1. 通常の単一リテラル検知
        for (const pattern of SECRET_PATTERNS) {
          pattern.regex.lastIndex = 0;
          let match: RegExpExecArray | null;

          while ((match = pattern.regex.exec(lineContent)) !== null) {
            const matchedString = match[1] ?? match[0];
            if (isExampleEnv && isPlaceholderSecret(matchedString)) {
              continue;
            }
            lineMatches.push({
              patternName: pattern.name,
              message: pattern.message,
              matchedString,
              rawExpr: matchedString,
              colNum: match.index + 1,
            });
          }
        }

        // 2. 文字列連結 / 配列 join による断片組み立ての検知
        for (const exprRegex of [STRING_CONCAT_EXPR_REGEX, ARRAY_JOIN_EXPR_REGEX]) {
          exprRegex.lastIndex = 0;
          let exprMatch: RegExpExecArray | null;
          while ((exprMatch = exprRegex.exec(lineContent)) !== null) {
            const rawExpr = exprMatch[0];
            const joined = extractJoinedLiterals(rawExpr);
            for (const pattern of SECRET_PATTERNS) {
              pattern.regex.lastIndex = 0;
              const pMatch = pattern.regex.exec(joined);
              if (pMatch) {
                const matchedString = pMatch[1] ?? pMatch[0];
                if (isExampleEnv && isPlaceholderSecret(matchedString)) {
                  continue;
                }
                const colNum = exprMatch.index + 1;
                // 同一位置の単一リテラルと重複しない場合のみ追加
                const alreadyRecorded = lineMatches.some(
                  (existing) => existing.colNum === colNum && existing.patternName === pattern.name
                );
                if (!alreadyRecorded) {
                  lineMatches.push({
                    patternName: pattern.name,
                    message: `${pattern.message}（組み立て式を検知）`,
                    matchedString,
                    rawExpr,
                    colNum,
                  });
                }
              }
            }
          }
        }

        // 3. テンプレートリテラル内の既知プレフィックス検知 (`sk_live_${...}` 等)
        TEMPLATE_SECRET_REGEX.lastIndex = 0;
        let tmplMatch: RegExpExecArray | null;
        while ((tmplMatch = TEMPLATE_SECRET_REGEX.exec(lineContent)) !== null) {
          const rawExpr = tmplMatch[0];
          const inner = tmplMatch[1];
          const prefix = tmplMatch[2];
          if (isExampleEnv && isPlaceholderSecret(inner)) {
            continue;
          }
          lineMatches.push({
            patternName: `Secret Template (${prefix}...)`,
            message: `既知の秘密鍵プレフィックス '${prefix}' を含むテンプレートリテラルが記述されています`,
            matchedString: inner,
            rawExpr,
            colNum: tmplMatch.index + 1,
          });
        }

        if (lineMatches.length === 0) {
          continue;
        }

        const rawSnippet = lineContent.trim();
        let displaySnippet = rawSnippet;
        if (!context.showSecrets) {
          for (const m of lineMatches) {
            const replacement = maskSecret(m.matchedString);
            displaySnippet = displaySnippet.split(m.rawExpr).join(replacement);
            if (m.rawExpr !== m.matchedString) {
              displaySnippet = displaySnippet.split(m.matchedString).join(replacement);
            }
          }
        }

        const lineNum = lineIndex + 1;
        for (const m of lineMatches) {
          const masked = maskSecret(m.matchedString);
          violations.push({
            ruleId: secretsRule.id,
            ruleName: secretsRule.name,
            filePath: file.path,
            line: lineNum,
            column: m.colNum,
            message: `${m.message} (${m.patternName}: ${masked})`,
            snippet: displaySnippet,
            severity: secretsRule.defaultSeverity,
          });
        }
      }
    }

    return violations;
  },
};
