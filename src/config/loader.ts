import fs from "node:fs/promises";
import path from "node:path";
import type { ShipguardConfig } from "../types/index.js";
import { ShipguardConfigSchema } from "./schema.js";

export const DEFAULT_CONFIG: ShipguardConfig = ShipguardConfigSchema.parse({});

export async function loadConfig(rootDir: string): Promise<ShipguardConfig> {
  const configPath = path.join(rootDir, ".shipguardrc.json");
  try {
    const raw = await fs.readFile(configPath, "utf-8");
    const json = JSON.parse(raw);
    const parsed = ShipguardConfigSchema.safeParse(json);
    if (parsed.success) {
      return {
        ...DEFAULT_CONFIG,
        ...parsed.data,
        rules: {
          ...DEFAULT_CONFIG.rules,
          ...(parsed.data.rules || {}),
        },
        database: {
          ...DEFAULT_CONFIG.database,
          ...(parsed.data.database || {}),
        },
        logging: {
          ...DEFAULT_CONFIG.logging,
          ...(parsed.data.logging || {}),
        },
      };
    }
    return DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}
