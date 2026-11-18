import fs from "node:fs/promises";
import path from "node:path";
import type { ShipguardConfig } from "../types/index.js";
import { ShipguardConfigSchema } from "./schema.js";

export const DEFAULT_CONFIG: ShipguardConfig = ShipguardConfigSchema.parse({});

export async function loadConfig(rootDir: string): Promise<ShipguardConfig> {
  const configPath = path.join(rootDir, ".shipguardrc.json");

  let raw: string;
  try {
    raw = await fs.readFile(configPath, "utf-8");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return DEFAULT_CONFIG;
    }
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`設定ファイルの読み込みに失敗しました (${configPath}): ${msg}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`設定ファイルのJSON構文が不正です (${configPath}): ${msg}`);
  }

  const parsed = ShipguardConfigSchema.safeParse(json);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`設定ファイルのスキーマが不正です (${configPath}): ${details}`);
  }

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
    scan: {
      ...DEFAULT_CONFIG.scan,
      ...(parsed.data.scan || {}),
    },
  };
}
