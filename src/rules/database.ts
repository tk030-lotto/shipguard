import type { Rule, ScanContext, Violation } from "../types/index.js";

interface TableCreation {
  name: string;
  filePath: string;
  line: number;
  snippet: string;
}

/**
 * SQL文からテーブル名を正規化して抽出するヘルパー
 */
function cleanIdentifier(identifier: string): string {
  return identifier.replace(/["'`]/g, "").toLowerCase();
}

/**
 * SEC-003: データベース RLS (Row Level Security) 未有効化検知
 */
export const databaseRlsRule: Rule = {
  id: "SEC-003",
  name: "データベース RLS 未有効化検知",
  description: "マイグレーションSQLファイル内で定義されたテーブルの RLS 有効化漏れを検知します",
  defaultSeverity: "high",
  check(context: ScanContext): Violation[] {
    const violations: Violation[] = [];

    // マイグレーションSQLファイル群（.sql）を対象とする
    const sqlFiles = context.files.filter((f) => f.path.endsWith(".sql"));
    if (sqlFiles.length === 0) {
      return violations;
    }

    const createdTables = new Map<string, TableCreation>();
    const enabledRlsTables = new Set<string>();

    // 1. 全SQLファイルを走査して CREATE TABLE と ENABLE ROW LEVEL SECURITY を抽出
    for (const file of sqlFiles) {
      const lines = file.content.split(/\r?\n/);

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const lineContent = lines[lineIndex];

        // コメント行（-- で始まる）はスキップ
        if (lineContent.trim().startsWith("--")) {
          continue;
        }

        // CREATE TABLE [IF NOT EXISTS] [schema.]table_name
        const createTableRegex =
          /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[a-zA-Z0-9_]+\.)?["'`]?([a-zA-Z0-9_]+)["'`]?\s*(?:\(|$)/gi;
        let createMatch: RegExpExecArray | null;

        while ((createMatch = createTableRegex.exec(lineContent)) !== null) {
          const rawName = createMatch[1];
          const normalized = cleanIdentifier(rawName);

          // 一時テーブルやシステムテーブル（pg_, sql_ 等）は除外
          if (normalized.startsWith("pg_") || normalized.startsWith("sql_")) {
            continue;
          }

          if (!createdTables.has(normalized)) {
            createdTables.set(normalized, {
              name: rawName,
              filePath: file.path,
              line: lineIndex + 1,
              snippet: lineContent.trim(),
            });
          }
        }

        // ALTER TABLE [ONLY] [schema.]table_name ENABLE ROW LEVEL SECURITY
        const enableRlsRegex =
          /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:[a-zA-Z0-9_]+\.)?["'`]?([a-zA-Z0-9_]+)["'`]?\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi;
        let rlsMatch: RegExpExecArray | null;

        while ((rlsMatch = enableRlsRegex.exec(lineContent)) !== null) {
          const rawName = rlsMatch[1];
          enabledRlsTables.add(cleanIdentifier(rawName));
        }
      }
    }

    // 2. 設定ファイルの除外テーブルリストを取得
    const excludeTables = new Set(
      (context.config.database?.excludeTables || []).map((t) => cleanIdentifier(t))
    );

    // 3. 突合チェック: 作成されたテーブルで RLS が有効化されておらず、除外リストにもないものを検知
    for (const [normalizedName, tableInfo] of createdTables.entries()) {
      if (excludeTables.has(normalizedName)) {
        continue;
      }

      if (!enabledRlsTables.has(normalizedName)) {
        violations.push({
          ruleId: "SEC-003",
          ruleName: "データベース RLS 未有効化検知",
          filePath: tableInfo.filePath,
          line: tableInfo.line,
          message: `テーブル '${tableInfo.name}' で Row Level Security (RLS) が有効化されていません。'ALTER TABLE "${tableInfo.name}" ENABLE ROW LEVEL SECURITY;' をマイグレーションに追加してください`,
          snippet: tableInfo.snippet,
          severity: "high",
        });
      }
    }

    return violations;
  },
};
