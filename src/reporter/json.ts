import type { ScanResult } from "../types/index.js";

/**
 * 監査結果を整形されたJSON文字列として生成
 */
export function formatJsonReport(result: ScanResult): string {
  return JSON.stringify(result, null, 2);
}
