import fs from "node:fs/promises";
import path from "node:path";
import pc from "picocolors";
import type { ScanOptions, ScanResult } from "../types/index.js";
import { openInBrowser } from "../utils/open.js";
import { formatHtmlReport } from "./html.js";
import { formatJsonReport } from "./json.js";
import { formatMarkdownReport } from "./markdown.js";
import { printScanReport } from "./terminal.js";

export { formatHtmlReport } from "./html.js";
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
  } else if (format === "html") {
    content = formatHtmlReport(result);
  }

  // --open オプションが指定された、または format === 'html' で output 指定がない場合
  let targetHtmlPath: string | null = null;

  // ファイル出力指定がある場合
  if (options.output) {
    const filePath = path.resolve(options.cwd ?? process.cwd(), options.output);
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    // 指定が terminal のまま output が指定された場合は markdown 形式を標準として保存
    const fileContent = content ?? formatMarkdownReport(result);
    await fs.writeFile(filePath, fileContent, "utf8");

    if (format === "html" || filePath.endsWith(".html")) {
      targetHtmlPath = filePath;
    }

    // terminal 形式の場合は画面表示も行い、保存完了を通知
    if (format === "terminal") {
      printScanReport(result);
      console.log(pc.cyan(`  📄 レポートを保存しました: ${pc.underline(filePath)}\n`));
    }
  } else if (format === "html" || options.open) {
    // format が html または --open 指定時で output 未指定の場合、.shipguard/report.html に保存
    const autoDir = path.resolve(options.cwd ?? process.cwd(), ".shipguard");
    await fs.mkdir(autoDir, { recursive: true });
    targetHtmlPath = path.join(autoDir, "report.html");
    await fs.writeFile(targetHtmlPath, formatHtmlReport(result), "utf8");

    if (format === "terminal") {
      printScanReport(result);
    }
    console.log(pc.cyan(`  🌐 HTMLレポートを生成しました: ${pc.underline(targetHtmlPath)}\n`));
  } else {
    // 標準出力の処理
    if (format === "terminal") {
      printScanReport(result);
    } else if (content) {
      console.log(content);
    }
  }

  // ブラウザ自動オープン
  if (options.open && targetHtmlPath) {
    await openInBrowser(targetHtmlPath);
  }
}
