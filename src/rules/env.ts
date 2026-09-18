import path from "node:path";
import type { Rule, ScanContext, Violation } from "../types/index.js";

// クライアント公開プレフィックス一覧
const PUBLIC_PREFIXES = [
  "NEXT_PUBLIC_",
  "VITE_",
  "PUBLIC_",
  "NUXT_PUBLIC_",
  "EXPO_PUBLIC_",
];

// 秘密情報を示唆するキーワード
const SENSITIVE_KEYWORDS = [
  "SECRET",
  "PRIVATE",
  "PASSWORD",
  "PASSWD",
  "SERVICE_ROLE",
  "ADMIN_KEY",
  "DATABASE_URL",
  "DB_PASS",
];

// 公開が意図されているホワイトリストキーワード
const SAFE_KEYWORDS = [
  "PUBLISHABLE",
  "ANON",
  "PUBLIC_KEY",
];

/**
 * 環境変数ファイルから KEY=VALUE のキー名を抽出する
 */
function parseEnvKeys(content: string): Array<{ key: string; line: number }> {
  const result: Array<{ key: string; line: number }> = [];
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match) {
      result.push({ key: match[1], line: i + 1 });
    }
  }

  return result;
}

/**
 * SEC-002: クライアント公開プレフィックスが付いた環境変数の秘密情報検知
 */
export const clientEnvSecretsRule: Rule = {
  id: "SEC-002",
  name: "クライアント公開プレフィックス秘密情報検知",
  description: "NEXT_PUBLIC_ や VITE_ などの公開プレフィックスに秘密情報が含まれている疑いのある変数を検知します",
  defaultSeverity: "high",
  check(context: ScanContext): Violation[] {
    const violations: Violation[] = [];

    for (const file of context.files) {
      const isEnvFile = path.basename(file.path).startsWith(".env");
      const isSourceCode = /\.(ts|tsx|js|jsx|mjs)$/.test(file.path);

      if (!isEnvFile && !isSourceCode) {
        continue;
      }

      const lines = file.content.split(/\r?\n/);

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const lineContent = lines[lineIndex];

        for (const prefix of PUBLIC_PREFIXES) {
          const regex = new RegExp(`\\b(${prefix}[A-Za-z0-9_]+)\\b`, "g");
          let match: RegExpExecArray | null;

          while ((match = regex.exec(lineContent)) !== null) {
            const varName = match[1];
            const upperName = varName.toUpperCase();

            // ホワイトリストチェック（ANONやPUBLISHABLEが含まれていれば安全と判定）
            const isSafe = SAFE_KEYWORDS.some((safe) => upperName.includes(safe));
            if (isSafe) {
              continue;
            }

            // 危険キーワードチェック
            const isSensitive = SENSITIVE_KEYWORDS.some((kw) => upperName.includes(kw));
            if (isSensitive) {
              violations.push({
                ruleId: "SEC-002",
                ruleName: "クライアント公開プレフィックス秘密情報検知",
                filePath: file.path,
                line: lineIndex + 1,
                column: match.index + 1,
                message: `公開環境変数プレフィックス '${prefix}' が付与された変数 '${varName}' に秘密情報が含まれている可能性があります`,
                snippet: lineContent.trim(),
                severity: "high",
              });
            }
          }
        }
      }
    }

    return violations;
  },
};

/**
 * CFG-001: .env.example のキーがローカルの .env に設定されているかの検証
 */
export const envSyncRule: Rule = {
  id: "CFG-001",
  name: "環境変数テンプレート未設定検知",
  description: ".env.example に定義された環境変数が .env / .env.local に設定されているかを検証します",
  defaultSeverity: "low",
  check(context: ScanContext): Violation[] {
    const violations: Violation[] = [];

    const exampleFile = context.files.find((f) =>
      f.path.endsWith(".env.example") || f.path.endsWith(".env.template")
    );

    if (!exampleFile) {
      return violations;
    }

    const exampleKeys = parseEnvKeys(exampleFile.content);
    if (exampleKeys.length === 0) {
      return violations;
    }

    const localEnvFiles = context.files.filter((f) => {
      const base = path.basename(f.path);
      return base === ".env" || base === ".env.local";
    });

    if (localEnvFiles.length === 0) {
      violations.push({
        ruleId: "CFG-001",
        ruleName: "環境変数テンプレート未設定検知",
        filePath: exampleFile.path,
        line: 1,
        message: `${exampleFile.path} が存在しますが、ローカル環境変数ファイル（.env または .env.local）が見つかりません`,
        snippet: exampleFile.path,
        severity: "low",
      });
      return violations;
    }

    const definedKeys = new Set<string>();
    for (const f of localEnvFiles) {
      const keys = parseEnvKeys(f.content);
      for (const item of keys) {
        definedKeys.add(item.key);
      }
    }

    for (const item of exampleKeys) {
      if (!definedKeys.has(item.key)) {
        violations.push({
          ruleId: "CFG-001",
          ruleName: "環境変数テンプレート未設定検知",
          filePath: exampleFile.path,
          line: item.line,
          message: `環境変数 '${item.key}' が .env.example に定義されていますが、ローカル環境変数（.env/.env.local）に設定されていません`,
          snippet: `${item.key}=`,
          severity: "low",
        });
      }
    }

    return violations;
  },
};
