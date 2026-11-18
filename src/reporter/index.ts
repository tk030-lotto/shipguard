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

export const VALID_REPORT_FORMATS = ["terminal", "markdown", "json", "html"] as const;

/**
 * 出力フォーマットと出力先拡張子の整合性を検証する
 */
export function validateReportOptions(options: ScanOptions = {}): void {
  const format = options.format ?? "terminal";
  if (!VALID_REPORT_FORMATS.includes(format)) {
    throw new Error(
      `不明な出力形式が指定されました: ${format} (指定可能: ${VALID_REPORT_FORMATS.join(", ")})`
    );
  }

  if (options.output) {
    const ext = path.extname(options.output).toLowerCase();
    if (ext === ".json" && format !== "json") {
      throw new Error(
        `出力ファイル拡張子 '${ext}' と出力形式 '${format}' が一致しません (--format json を指定してください)`
      );
    }
    if ((ext === ".md" || ext === ".markdown") && format !== "markdown") {
      throw new Error(
        `出力ファイル拡張子 '${ext}' と出力形式 '${format}' が一致しません (--format markdown を指定してください)`
      );
    }
    if ((ext === ".html" || ext === ".htm") && format !== "html") {
      throw new Error(
        `出力ファイル拡張子 '${ext}' と出力形式 '${format}' が一致しません (--format html を指定してください)`
      );
    }
  }
}

/**
 * フォーマットおよび出力先オプションに基づいてレポートを出力
 */
export async function outputReport(
  result: ScanResult,
  options: ScanOptions = {}
): Promise<void> {
  validateReportOptions(options);

  const format = options.format ?? "terminal";
  let content: string | null = null;

  if (format === "json") {
    content = formatJsonReport(result);
  } else if (format === "markdown") {
    content = formatMarkdownReport(result);
  } else if (format === "html") {
    content = formatHtmlReport(result);
  }

  let targetHtmlPath: string | null = null;

  // ファイル出力指定がある場合
  if (options.output) {
    const filePath = path.resolve(options.cwd ?? process.cwd(), options.output);
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    const fileContent = content ?? formatMarkdownReport(result);
    await fs.writeFile(filePath, fileContent, "utf8");

    if (format === "html") {
      targetHtmlPath = filePath;
    }

    // terminal 形式の場合は画面表示も行い、保存完了を通知
    if (format === "terminal") {
      printScanReport(result);
      console.log(pc.cyan(`  📄 レポートを保存しました: ${pc.underline(filePath)}\n`));
    }
  } else if (format === "html") {
    // format が html で output 未指定の場合、.shipguard/report.html に保存
    const autoDir = path.resolve(options.cwd ?? process.cwd(), ".shipguard");
    await fs.mkdir(autoDir, { recursive: true });
    targetHtmlPath = path.join(autoDir, "report.html");
    await fs.writeFile(targetHtmlPath, content ?? formatHtmlReport(result), "utf8");

    console.log(pc.cyan(`  🌐 HTMLレポートを生成しました: ${pc.underline(targetHtmlPath)}\n`));
  } else {
    // 標準出力の処理（json / markdown は --open 指定時でも HTML へ化けさせず本来の形式を出力）
    if (format === "terminal") {
      printScanReport(result);
    } else if (content !== null) {
      console.log(content);
    }
  }

  // --open は format === "html" の場合にのみ作用する
  if (options.open && format === "html" && targetHtmlPath) {
    await openInBrowser(targetHtmlPath);
  }
}
