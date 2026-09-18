import type { Rule, ScanContext, Violation } from "../types/index.js";

interface SecretPattern {
  name: string;
  regex: RegExp;
  message: string;
}

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

export const secretsRule: Rule = {
  id: "SEC-001",
  name: "ハードコードシークレット検知",
  description: "Stripe, OpenAI, AWS, GitHub等の秘密鍵やAPIトークンの漏洩を検知します",
  defaultSeverity: "critical",
  check(context: ScanContext): Violation[] {
    const violations: Violation[] = [];

    for (const file of context.files) {
      // .env.example や .env.template、.shipguard 関連は通常サンプル値のため特定条件以外は除外
      const isExampleEnv =
        file.path.endsWith(".example") ||
        file.path.endsWith(".sample") ||
        file.path.endsWith(".template");

      const lines = file.content.split(/\r?\n/);

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const lineContent = lines[lineIndex];

        for (const pattern of SECRET_PATTERNS) {
          // regexのlastIndexをリセットして走査
          pattern.regex.lastIndex = 0;
          let match: RegExpExecArray | null;

          while ((match = pattern.regex.exec(lineContent)) !== null) {
            const matchedString = match[1] ?? match[0];

            // プレースホルダーの除外（例: your_key_here, 00000000, xxxxxxxx）
            const isPlaceholder =
              /^(.)\1+$/.test(matchedString) ||
              /your_?key|sample|dummy|placeholder|example|test/i.test(matchedString);

            if (isExampleEnv && isPlaceholder) {
              continue;
            }

            const masked = maskSecret(matchedString);
            const lineNum = lineIndex + 1;
            const colNum = match.index + 1;

            violations.push({
              ruleId: "SEC-001",
              ruleName: "ハードコードシークレット検知",
              filePath: file.path,
              line: lineNum,
              column: colNum,
              message: `${pattern.message} (${pattern.name}: ${masked})`,
              snippet: lineContent.trim(),
              severity: "critical",
            });
          }
        }
      }
    }

    return violations;
  },
};
