export type Severity = "critical" | "high" | "medium" | "low";
export type RuleSeverityConfig = Severity | "off";

export interface Violation {
  ruleId: string;
  ruleName: string;
  filePath: string;
  line: number;
  column?: number;
  message: string;
  snippet?: string;
  severity: Severity;
}

export interface FileEntry {
  path: string; // Relative to rootDir
  absolutePath: string;
  content: string;
  extension: string;
}

export interface ShipguardConfig {
  $schema?: string;
  ignore?: string[];
  rules?: Record<string, RuleSeverityConfig>;
  database?: {
    migrationsDir?: string;
    excludeTables?: string[];
  };
  logging?: {
    enabled?: boolean;
    path?: string;
  };
}

export interface ScanContext {
  rootDir: string;
  files: FileEntry[];
  config: ShipguardConfig;
}

export interface Rule {
  id: string;
  name: string;
  description: string;
  defaultSeverity: Severity;
  check: (context: ScanContext) => Promise<Violation[]> | Violation[];
}

export interface ScanSummary {
  scannedFiles: number;
  totalViolations: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  passed: boolean;
}

export interface ScanResult {
  id: string;
  timestamp: string;
  gitCommitHash?: string;
  summary: ScanSummary;
  violations: Violation[];
}

export interface AuditLogRecord {
  id: string;
  timestamp: string;
  gitCommitHash?: string;
  summary: {
    scannedFiles: number;
    totalViolations: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  passed: boolean;
  violations: Array<{
    ruleId: string;
    filePath: string;
    line: number;
    message: string;
    severity: Severity;
  }>;
}

export interface ScanOptions {
  strict?: boolean;
  format?: "terminal" | "markdown" | "json" | "html";
  output?: string;
  open?: boolean;
  ignore?: string[];
  cwd?: string;
}
