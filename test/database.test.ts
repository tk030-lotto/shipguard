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
});
