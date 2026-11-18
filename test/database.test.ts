import { describe, expect, it } from "vitest";
import { databaseRlsRule } from "../src/rules/database.js";
import type { ScanContext } from "../src/types/index.js";

describe("SEC-003: データベース RLS 未有効化検知", () => {
  it("RLS未設定のCREATE TABLEを正しく検知すること", () => {
    const context: ScanContext = {
      rootDir: "/mock",
      files: [
        {
          path: "supabase/migrations/20240101_init.sql",
          absolutePath: "/mock/supabase/migrations/20240101_init.sql",
          content: [
            "CREATE TABLE users (",
            "  id UUID PRIMARY KEY,",
            "  email TEXT NOT NULL",
            ");",
          ].join("\n"),
          extension: ".sql",
        },
      ],
      config: {},
    };

    const violations = databaseRlsRule.check(context);
    expect(violations.length).toBe(1);
    expect(violations[0].ruleId).toBe("SEC-003");
    expect(violations[0].severity).toBe("high");
    expect(violations[0].message).toContain("users");
    expect(violations[0].line).toBe(1);
  });

  it("同一ファイルでRLSが有効化されている場合は検知しないこと", () => {
    const context: ScanContext = {
      rootDir: "/mock",
      files: [
        {
          path: "supabase/migrations/20240101_init.sql",
          absolutePath: "/mock/supabase/migrations/20240101_init.sql",
          content: [
            "CREATE TABLE users (id UUID PRIMARY KEY);",
            "ALTER TABLE users ENABLE ROW LEVEL SECURITY;",
          ].join("\n"),
          extension: ".sql",
        },
      ],
      config: {},
    };

    const violations = databaseRlsRule.check(context);
    expect(violations.length).toBe(0);
  });

  it("別マイグレーションファイルでRLSが有効化されている場合も検知しないこと（複数ファイル突合）", () => {
    const context: ScanContext = {
      rootDir: "/mock",
      files: [
        {
          path: "supabase/migrations/01_create_posts.sql",
          absolutePath: "/mock/supabase/migrations/01_create_posts.sql",
          content: 'CREATE TABLE public."posts" (id SERIAL PRIMARY KEY, title TEXT);',
          extension: ".sql",
        },
        {
          path: "supabase/migrations/02_enable_rls.sql",
          absolutePath: "/mock/supabase/migrations/02_enable_rls.sql",
          content: 'ALTER TABLE ONLY public."posts" ENABLE ROW LEVEL SECURITY;',
          extension: ".sql",
        },
      ],
      config: {},
    };

    const violations = databaseRlsRule.check(context);
    expect(violations.length).toBe(0);
  });

  it("excludeTables に指定されたテーブルは検知対象外となること", () => {
    const context: ScanContext = {
      rootDir: "/mock",
      files: [
        {
          path: "supabase/migrations/01_tables.sql",
          absolutePath: "/mock/supabase/migrations/01_tables.sql",
          content: [
            "CREATE TABLE system_logs (id SERIAL PRIMARY KEY, msg TEXT);",
            "CREATE TABLE user_accounts (id SERIAL PRIMARY KEY);",
          ].join("\n"),
          extension: ".sql",
        },
      ],
      config: {
        database: {
          excludeTables: ["system_logs"],
        },
      },
    };

    const violations = databaseRlsRule.check(context);
    expect(violations.length).toBe(1);
    expect(violations[0].message).toContain("user_accounts");
    expect(violations[0].message).not.toContain("system_logs");
  });

  it("migrationsDir 設定に従い対象ディレクトリ配下のSQLのみが検査されること", () => {
    const context: ScanContext = {
      rootDir: "/mock",
      files: [
        {
          path: "prisma/migrations/01_init.sql",
          absolutePath: "/mock/prisma/migrations/01_init.sql",
          content: "CREATE TABLE orders (id SERIAL PRIMARY KEY);",
          extension: ".sql",
        },
        {
          path: "supabase/migrations/01_other.sql",
          absolutePath: "/mock/supabase/migrations/01_other.sql",
          content: "CREATE TABLE ignored_by_dir (id SERIAL PRIMARY KEY);",
          extension: ".sql",
        },
        {
          path: "scripts/seed.sql",
          absolutePath: "/mock/scripts/seed.sql",
          content: "CREATE TABLE seed_temp (id SERIAL PRIMARY KEY);",
          extension: ".sql",
        },
      ],
      config: {
        database: {
          migrationsDir: "prisma/migrations",
        },
      },
    };

    const violations = databaseRlsRule.check(context);
    expect(violations.length).toBe(1);
    expect(violations[0].filePath).toBe("prisma/migrations/01_init.sql");
    expect(violations[0].message).toContain("orders");
  });

  it("§10.2の9入力（コメント除去・複数行・CTAS・引用識別子・分割キーワード）で1,2,3,4,5,7のみ検知し6,8,9を非検知とすること", () => {
    const migrationFiles = [
      {
        name: "001_plain.sql",
        sql: "CREATE TABLE public.users (\n  id uuid primary key,\n  email text\n);",
      },
      {
        name: "002_ctas.sql",
        sql: "CREATE TABLE public.users_copy AS SELECT * FROM public.users;",
      },
      {
        name: "003_multiline.sql",
        sql: "CREATE TABLE\n  public.orders (\n  id bigint primary key\n);",
      },
      {
        name: "004_commented_rls.sql",
        sql: "CREATE TABLE public.commented (id int); -- ALTER TABLE public.commented ENABLE ROW LEVEL SECURITY;",
      },
      {
        name: "005_quoted_schema.sql",
        sql: 'CREATE TABLE "public"."quoted_users" (id int);',
      },
      {
        name: "006_block_comment.sql",
        sql: "/* CREATE TABLE fake_from_block_comment (id int); */",
      },
      {
        name: "007_block_split.sql",
        sql: "CREATE /* split */ TABLE public.split_kw (id int);",
      },
      {
        name: "008_leading_comment.sql",
        sql: "-- CREATE TABLE fake_from_line_comment (id int);",
      },
      {
        name: "009_ok.sql",
        sql: "CREATE TABLE public.ok_table (id int);\nALTER TABLE public.ok_table ENABLE ROW LEVEL SECURITY;",
      },
    ];

    const context: ScanContext = {
      rootDir: "/mock",
      files: migrationFiles.map((m) => ({
        path: `supabase/migrations/${m.name}`,
        absolutePath: `/mock/supabase/migrations/${m.name}`,
        content: m.sql,
        extension: ".sql",
      })),
      config: {},
    };

    const violations = databaseRlsRule.check(context);
    const detectedFiles = violations.map((v) => v.filePath).sort();
    expect(detectedFiles).toEqual([
      "supabase/migrations/001_plain.sql",
      "supabase/migrations/002_ctas.sql",
      "supabase/migrations/003_multiline.sql",
      "supabase/migrations/004_commented_rls.sql",
      "supabase/migrations/005_quoted_schema.sql",
      "supabase/migrations/007_block_split.sql",
    ]);
  });
});
