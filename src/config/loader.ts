import fs from "node:fs/promises";
import path from "node:path";
import type { ShipguardConfig } from "../types/index.js";

const DEFAULT_CONFIG: ShipguardConfig = {
  ignore: [],
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
};

export async function loadConfig(rootDir: string): Promise<ShipguardConfig> {
  const configPath = path.join(rootDir, ".shipguardrc.json");
  try {
    const raw = await fs.readFile(configPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<ShipguardConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      rules: {
        ...DEFAULT_CONFIG.rules,
        ...(parsed.rules || {}),
      },
      database: {
        ...DEFAULT_CONFIG.database,
        ...(parsed.database || {}),
      },
      logging: {
        ...DEFAULT_CONFIG.logging,
        ...(parsed.logging || {}),
      },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}
