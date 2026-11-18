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

// 強い秘密情報を示唆するキーワード（安全語が含まれていても優先して検知）
const STRONG_SENSITIVE_KEYWORDS = [
  "SECRET",
  "PRIVATE",
  "PASSWORD",
  "PASSWD",
  "SERVICE_ROLE",
  "ADMIN_KEY",
  "DATABASE_URL",
  "DB_PASS",
  "TOKEN",
  "API_KEY",
];

// 公開が意図されているホワイトリストキーワード
const SAFE_KEYWORDS = [
  "PUBLISHABLE",
  "ANON",
  "PUBLIC_KEY",
];

// 汎用キーワード（安全語に該当しない場合のみ検知）
const GENERIC_SENSITIVE_KEYWORDS = [
  "KEY",
];

/**
 * 変数名が公開プレフィックス下で危険とみなされるか判定する（危険語を安全語より先に評価）
 */
function isSensitivePublicVar(upperName: string): boolean {
  if (STRONG_SENSITIVE_KEYWORDS.some((kw) => upperName.includes(kw))) {
    return true;
  }
  if (SAFE_KEYWORDS.some((safe) => upperName.includes(safe))) {
    return false;
  }
  return GENERIC_SENSITIVE_KEYWORDS.some((kw) => upperName.includes(kw));
}

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
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
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
      const baseName = path.posix.basename(file.path.replace(/\\/g, "/"));
      const isTemplateEnv =
        baseName === ".env.example" ||
        baseName === ".env.sample" ||
        baseName === ".env.template" ||
        (baseName.startsWith(".env.") &&
          (baseName.endsWith(".example") ||
            baseName.endsWith(".sample") ||
            baseName.endsWith(".template")));

      if (isTemplateEnv) {
        continue;
      }

      const isEnvFile = baseName === ".env" || baseName.startsWith(".env.");
      const isSourceCode = /\.(ts|tsx|js|jsx|mjs)$/.test(file.path);

      if (!isEnvFile && !isSourceCode) {
        continue;
      }

      const lines = file.content.split(/\r?\n/);

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const lineContent = lines[lineIndex];
        const trimmed = lineContent.trim();

        if (!trimmed) {
          continue;
        }

        if (isEnvFile) {
          // .env ファイルはコメント行を除外し、行頭の代入形式 (NAME=value) のみ検査する
          if (trimmed.startsWith("#")) {
            continue;
          }
          const assignMatch = trimmed.match(/^(export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
          if (!assignMatch) {
            continue;
          }
          const exportPrefix = assignMatch[1] ? "export " : "";
          const varName = assignMatch[2];
          const rawValue = assignMatch[3].trim();
          const matchedPrefix = PUBLIC_PREFIXES.find((prefix) => varName.startsWith(prefix));
          if (!matchedPrefix) {
            continue;
          }
          if (isSensitivePublicVar(varName.toUpperCase())) {
            const colIndex = lineContent.indexOf(varName);
            const maskedSnippet = rawValue
              ? `${exportPrefix}${varName}=********`
              : `${exportPrefix}${varName}=`;
            violations.push({
              ruleId: clientEnvSecretsRule.id,
              ruleName: clientEnvSecretsRule.name,
              filePath: file.path,
              line: lineIndex + 1,
              column: colIndex >= 0 ? colIndex + 1 : 1,
              message: `公開環境変数プレフィックス '${matchedPrefix}' が付与された変数 '${varName}' に秘密情報が含まれている可能性があります`,
              snippet: maskedSnippet,
              severity: clientEnvSecretsRule.defaultSeverity,
            });
          }
          continue;
        }

        // ソースコード行のコメントは対象外
        if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
          continue;
        }

        for (const prefix of PUBLIC_PREFIXES) {
          const regex = new RegExp(`\\b(${prefix}[A-Za-z0-9_]+)\\b`, "g");
          let match: RegExpExecArray | null;

          while ((match = regex.exec(lineContent)) !== null) {
            const varName = match[1];
            const upperName = varName.toUpperCase();

            if (isSensitivePublicVar(upperName)) {
              violations.push({
                ruleId: clientEnvSecretsRule.id,
                ruleName: clientEnvSecretsRule.name,
                filePath: file.path,
                line: lineIndex + 1,
                column: match.index + 1,
                message: `公開環境変数プレフィックス '${prefix}' が付与された変数 '${varName}' に秘密情報が含まれている可能性があります`,
                snippet: trimmed,
                severity: clientEnvSecretsRule.defaultSeverity,
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
        ruleId: envSyncRule.id,
        ruleName: envSyncRule.name,
        filePath: exampleFile.path,
        line: 1,
        message: `${exampleFile.path} が存在しますが、ローカル環境変数ファイル（.env または .env.local）が見つかりません`,
        snippet: exampleFile.path,
        severity: envSyncRule.defaultSeverity,
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
          ruleId: envSyncRule.id,
          ruleName: envSyncRule.name,
          filePath: exampleFile.path,
          line: item.line,
          message: `環境変数 '${item.key}' が .env.example に定義されていますが、ローカル環境変数（.env/.env.local）に設定されていません`,
          snippet: `${item.key}=`,
          severity: envSyncRule.defaultSeverity,
        });
      }
    }

    return violations;
  },
};
