import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, loadConfig } from "../src/config/loader.js";
import { ShipguardConfigSchema } from "../src/config/schema.js";

describe("Config Schema & Loader", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "shipguard-cfg-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
  it("空オブジェクトからデフォルト設定が正常に生成されること", () => {
    const config = ShipguardConfigSchema.parse({});
    expect(config.rules?.["SEC-001"]).toBe("critical");
    expect(config.rules?.["SEC-002"]).toBe("high");
    expect(config.rules?.["SEC-003"]).toBe("high");
    expect(config.rules?.["SEC-004"]).toBe("medium");
    expect(config.rules?.["CFG-001"]).toBe("low");
    expect(config.database?.migrationsDir).toBe("supabase/migrations");
    expect(config.database?.excludeTables).toEqual([]);
    expect(config.logging?.enabled).toBe(true);
  });

  it("カスタム設定で上書きができること", () => {
    const custom = {
      rules: {
        "SEC-001": "off",
        "SEC-003": "critical",
      },
      database: {
        migrationsDir: "prisma/migrations",
        excludeTables: ["schema_migrations", "spatial_ref_sys"],
      },
    };

    const config = ShipguardConfigSchema.parse(custom);
    expect(config.rules?.["SEC-001"]).toBe("off");
    expect(config.rules?.["SEC-003"]).toBe("critical");
    expect(config.database?.migrationsDir).toBe("prisma/migrations");
    expect(config.database?.excludeTables).toEqual(["schema_migrations", "spatial_ref_sys"]);
  });

  it("不正な重要度が指定された場合は safeParse が失敗すること", () => {
    const invalid = {
      rules: {
        "SEC-001": "super-critical",
      },
    };

    const result = ShipguardConfigSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
  it("scan.maxFileSizeBytes デフォルト値が 2MB であること", () => {
    const config = ShipguardConfigSchema.parse({});
    expect(config.scan?.maxFileSizeBytes).toBe(2 * 1024 * 1024);
  });

  it("scan.maxFileSizeBytes をカスタム値に設定できること", () => {
    const config = ShipguardConfigSchema.parse({
      scan: { maxFileSizeBytes: 512 * 1024 },
    });
    expect(config.scan?.maxFileSizeBytes).toBe(512 * 1024);
  });

  it("scan.maxFileSizeBytes に 0 または負数を指定した場合は safeParse が失敗すること", () => {
    const resultZero = ShipguardConfigSchema.safeParse({ scan: { maxFileSizeBytes: 0 } });
    expect(resultZero.success).toBe(false);

    const resultNeg = ShipguardConfigSchema.safeParse({ scan: { maxFileSizeBytes: -1 } });
    expect(resultNeg.success).toBe(false);
  });

  it("未知のキーが含まれる場合は strict モードにより safeParse が失敗すること", () => {
    const result = ShipguardConfigSchema.safeParse({ unknownField: true });
    expect(result.success).toBe(false);
  });

  it("loadConfig は .shipguardrc.json が存在しない場合のみ DEFAULT_CONFIG を返すこと", async () => {
    const config = await loadConfig(tmpDir);
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it("loadConfig は JSON 構文エラー時に例外をスローすること", async () => {
    await fs.writeFile(path.join(tmpDir, ".shipguardrc.json"), "{ invalid json", "utf8");
    await expect(loadConfig(tmpDir)).rejects.toThrow("JSON構文が不正");
  });

  it("loadConfig はスキーマ不一致（値 typo や未知キー）時に例外をスローすること", async () => {
    await fs.writeFile(
      path.join(tmpDir, ".shipguardrc.json"),
      JSON.stringify({ rules: { "SEC-001": "critcial" } }),
      "utf8"
    );
    await expect(loadConfig(tmpDir)).rejects.toThrow("スキーマが不正");

    await fs.writeFile(
      path.join(tmpDir, ".shipguardrc.json"),
      JSON.stringify({ databse: { excludeTables: [] } }),
      "utf8"
    );
    await expect(loadConfig(tmpDir)).rejects.toThrow("スキーマが不正");
  });
});
