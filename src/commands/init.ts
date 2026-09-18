import fs from "node:fs/promises";
import path from "node:path";
import pc from "picocolors";

export interface InitOptions {
  cwd?: string;
  force?: boolean;
}

export const DEFAULT_CONFIG_TEMPLATE = {
  $schema: "https://raw.githubusercontent.com/tk030-lotto/shipguard/main/schema.json",
  ignore: [
    "**/*.test.ts",
    "**/*.spec.ts",
    "docs/**",
  ],
  rules: {
    "SEC-001": "critical",
    "SEC-002": "high",
    "SEC-003": "high",
    "SEC-004": "medium",
    "CFG-001": "low",
  },
  database: {
    migrationsDir: "supabase/migrations",
    excludeTables: [],
  },
  logging: {
    enabled: true,
    path: ".shipguard/audit.log",
  },
  scan: {
    // スキャン対象ファイルの最大サイズ（バイト）。デフォルト: 2MB (2097152)
    maxFileSizeBytes: 2097152,
  },
};

/**
 * .shipguardrc.json 設定ファイルを生成する
 */
export async function runInit(
  options: InitOptions = {}
): Promise<{ created: boolean; path: string }> {
  const rootDir = options.cwd ?? process.cwd();
  const configPath = path.resolve(rootDir, ".shipguardrc.json");

  // 既存ファイルのチェック
  const exists = await fs.stat(configPath).then(() => true).catch(() => false);

  if (exists && !options.force) {
    console.log(
      pc.yellow(`  ℹ .shipguardrc.json は既に存在します (上書きするには --force を指定してください)`)
    );
    return { created: false, path: configPath };
  }

  const content = JSON.stringify(DEFAULT_CONFIG_TEMPLATE, null, 2) + "\n";
  await fs.writeFile(configPath, content, "utf8");

  console.log(
    pc.green(`  ✔ .shipguardrc.json を作成しました: ${pc.underline(configPath)}`)
  );

  return { created: true, path: configPath };
}
