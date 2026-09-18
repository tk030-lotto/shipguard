import fs from "node:fs/promises";
import path from "node:path";
import pc from "picocolors";
import type { ScanOptions, ScanResult } from "../types/index.js";
import { formatJsonReport } from "./json.js";
import { formatMarkdownReport } from "./markdown.js";
import { printScanReport } from "./terminal.js";

export { formatJsonReport } from "./json.js";
export { formatMarkdownReport } from "./markdown.js";
export { printScanReport } from "./terminal.js";

/**
 * フォーマットおよび出力先オプションに基づいてレポートを出力
 */
export async function outputReport(
  result: ScanResult,
  options: ScanOptions = {}
): Promise<void> {
  const format = options.format ?? "terminal";
  let content: string | null = null;

  if (format === "json") {
    content = formatJsonReport(result);
  } else if (format === "markdown") {
    content = formatMarkdownReport(result);
  }

  // ファイル出力指定がある場合
  if (options.output) {
    const filePath = path.resolve(options.cwd ?? process.cwd(), options.output);
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    // 指定が terminal のまま output が指定された場合は markdown 形式を標準として保存
    const fileContent = content ?? formatMarkdownReport(result);
    await fs.writeFile(filePath, fileContent, "utf8");

    // terminal 形式の場合は画面表示も行い、保存完了を通知
    if (format === "terminal") {
      printScanReport(result);
      console.log(pc.cyan(`  📄 レポートを保存しました: ${pc.underline(filePath)}\n`));
    }
    return;
  }

  // 標準出力の処理
  if (format === "terminal") {
    printScanReport(result);
  } else if (content) {
    // json または markdown の直接出力（CIやパイプ処理向け）
    console.log(content);
  }
}
