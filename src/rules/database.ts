import type { FileEntry, Rule, ScanContext, Violation } from "../types/index.js";

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
  return identifier.replace(/["'`[\]]/g, "").toLowerCase();
}

/**
 * 文字列リテラル・引用符識別子を壊さず、行番号を保ったまま SQL コメント（-- と /* ... *\/）を除去する
 */
export function stripSqlCommentsPreservingLines(sql: string): string {
  let out = "";
  let i = 0;
  const len = sql.length;

  while (i < len) {
    const ch = sql[i];
    const next = i + 1 < len ? sql[i + 1] : "";

    // シングルクォート文字列 ('...' / '' エスケープ)
    if (ch === "'") {
      out += ch;
      i++;
      while (i < len) {
        const c = sql[i];
        out += c;
        i++;
        if (c === "'") {
          if (i < len && sql[i] === "'") {
            out += sql[i];
            i++;
          } else {
            break;
          }
        }
      }
      continue;
    }

    // ダブルクォート識別子 ("..." / "" エスケープ)
    if (ch === '"') {
      out += ch;
      i++;
      while (i < len) {
        const c = sql[i];
        out += c;
        i++;
        if (c === '"') {
          if (i < len && sql[i] === '"') {
            out += sql[i];
            i++;
          } else {
            break;
          }
        }
      }
      continue;
    }

    // 行コメント (-- ...)
    if (ch === "-" && next === "-") {
      i += 2;
      while (i < len && sql[i] !== "\n" && sql[i] !== "\r") {
        i++;
      }
      continue;
    }

    // ブロックコメント (/* ... */) — 改行は保持して行番号を維持する
    if (ch === "/" && next === "*") {
      out += "  ";
      i += 2;
      while (i < len) {
        if (sql[i] === "*" && i + 1 < len && sql[i + 1] === "/") {
          out += "  ";
          i += 2;
          break;
        }
        out += sql[i] === "\n" ? "\n" : " ";
        i++;
      }
      continue;
    }

    out += ch;
    i++;
  }

  return out;
}

/**
 * 文字オフセットから 1-indexed の行番号を算出する
 */
function getLineNumberAt(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === "\n") {
      line++;
    }
  }
  return line;
}

/**
 * migrationsDir 設定に一致する SQL ファイル群を抽出する
 */
export function getDatabaseMigrationSqlFiles(context: ScanContext): FileEntry[] {
  const rawMigrationsDir = context.config.database?.migrationsDir ?? "supabase/migrations";
  const normalizedDir = rawMigrationsDir
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/+$/, "");

  return context.files.filter((f) => {
    const normalizedPath = f.path.replace(/\\/g, "/").replace(/^\.\//, "");
    if (!normalizedPath.endsWith(".sql")) {
      return false;
    }
    if (!normalizedDir || normalizedDir === ".") {
      return true;
    }
    return normalizedPath.startsWith(`${normalizedDir}/`);
  });
}

const CREATE_TABLE_REGEX =
  /\bCREATE\s+(?:TEMP(?:ORARY)?\s+|UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(?:"[^"]+"|`[^`]+`|\[[^\]]+\]|[a-zA-Z_][a-zA-Z0-9_]*)\s*\.\s*)?("[^"]+"|`[^`]+`|\[[^\]]+\]|[a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\(|AS\b)/gi;

const ENABLE_RLS_REGEX =
  /\bALTER\s+TABLE\s+(?:ONLY\s+)?(?:(?:"[^"]+"|`[^`]+`|\[[^\]]+\]|[a-zA-Z_][a-zA-Z0-9_]*)\s*\.\s*)?("[^"]+"|`[^`]+`|\[[^\]]+\]|[a-zA-Z_][a-zA-Z0-9_]*)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY\b/gi;

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

    const sqlFiles = getDatabaseMigrationSqlFiles(context);
    if (sqlFiles.length === 0) {
      return violations;
    }

    const createdTables = new Map<string, TableCreation>();
    const enabledRlsTables = new Set<string>();

    // 1. 全SQLファイルからコメント除去後に CREATE TABLE (CTAS/複数行/引用識別子含む) と RLS 有効化を抽出
    for (const file of sqlFiles) {
      const originalLines = file.content.split(/\r?\n/);
      const stripped = stripSqlCommentsPreservingLines(file.content);

      CREATE_TABLE_REGEX.lastIndex = 0;
      let createMatch: RegExpExecArray | null;
      while ((createMatch = CREATE_TABLE_REGEX.exec(stripped)) !== null) {
        const rawName = createMatch[1];
        const cleanRaw = rawName.replace(/^["'`[]|["'`\]]$/g, "");
        const normalized = cleanIdentifier(rawName);

        // 一時テーブルやシステムテーブル（pg_, sql_）は除外
        if (normalized.startsWith("pg_") || normalized.startsWith("sql_")) {
          continue;
        }

        if (!createdTables.has(normalized)) {
          const lineNum = getLineNumberAt(stripped, createMatch.index);
          const snippet = (originalLines[lineNum - 1] ?? "").trim();
          createdTables.set(normalized, {
            name: cleanRaw,
            filePath: file.path,
            line: lineNum,
            snippet,
          });
        }
      }

      ENABLE_RLS_REGEX.lastIndex = 0;
      let rlsMatch: RegExpExecArray | null;
      while ((rlsMatch = ENABLE_RLS_REGEX.exec(stripped)) !== null) {
        const rawName = rlsMatch[1];
        enabledRlsTables.add(cleanIdentifier(rawName));
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
          ruleId: databaseRlsRule.id,
          ruleName: databaseRlsRule.name,
          filePath: tableInfo.filePath,
          line: tableInfo.line,
          message: `テーブル '${tableInfo.name}' で Row Level Security (RLS) が有効化されていません。'ALTER TABLE "${tableInfo.name}" ENABLE ROW LEVEL SECURITY;' をマイグレーションに追加してください`,
          snippet: tableInfo.snippet,
          severity: databaseRlsRule.defaultSeverity,
        });
      }
    }

    return violations;
  },
};
