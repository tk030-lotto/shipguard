import { z } from "zod";

export const SeverityLevelSchema = z.enum(["critical", "high", "medium", "low"]);
export const RuleSeverityConfigSchema = z.enum(["critical", "high", "medium", "low", "off"]);

export const DatabaseConfigSchema = z.object({
  migrationsDir: z.string().optional().default("supabase/migrations"),
  excludeTables: z.array(z.string()).optional().default([]),
});

export const LoggingConfigSchema = z.object({
  enabled: z.boolean().optional().default(true),
  path: z.string().optional().default(".shipguard/audit.log"),
});

export const ShipguardConfigSchema = z.object({
  $schema: z.string().optional(),
  ignore: z.array(z.string()).optional().default([]),
  rules: z.record(z.string(), RuleSeverityConfigSchema).optional().default({
    "SEC-001": "critical",
    "SEC-002": "high",
    "SEC-003": "high",
    "SEC-004": "medium",
    "CFG-001": "low",
  }),
  database: DatabaseConfigSchema.optional().default({
    migrationsDir: "supabase/migrations",
    excludeTables: [],
  }),
  logging: LoggingConfigSchema.optional().default({
    enabled: true,
    path: ".shipguard/audit.log",
  }),
});

export type ParsedShipguardConfig = z.infer<typeof ShipguardConfigSchema>;
