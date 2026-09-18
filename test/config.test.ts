import { describe, expect, it } from "vitest";
import { ShipguardConfigSchema } from "../src/config/schema.js";

describe("Config Schema & Loader", () => {
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
});
