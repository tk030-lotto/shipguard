import pc from "picocolors";
import type { ScanResult, Violation } from "../types/index.js";

function getSeverityBadge(severity: Violation["severity"]): string {
  switch (severity) {
    case "critical":
      return pc.bgRed(pc.white(pc.bold(" CRITICAL ")));
    case "high":
      return pc.bgYellow(pc.black(pc.bold(" HIGH ")));
    case "medium":
      return pc.bgCyan(pc.black(pc.bold(" MEDIUM ")));
    case "low":
      return pc.bgBlue(pc.white(pc.bold(" LOW ")));
  }
}

export function printScanReport(result: ScanResult): void {
  console.log("");
  console.log(pc.bold(pc.cyan("  ▲ shipguard")) + pc.gray(` — 事前ローンチ監査`));
  console.log(pc.gray("  " + "─".repeat(50)));

  if (result.violations.length === 0) {
    console.log(pc.green("  ✔ 違反は検知されませんでした。デプロイ準備完了です。"));
  } else {
    console.log(
      pc.red(
        `  ✖ ${result.violations.length} 件のセキュリティ・設定上の課題が検知されました:\n`
      )
    );

    for (const v of result.violations) {
      const badge = getSeverityBadge(v.severity);
      const loc = pc.underline(`${v.filePath}:${v.line}${v.column ? `:${v.column}` : ""}`);
      console.log(`  ${badge} ${pc.bold(v.ruleId)} ${pc.gray(v.ruleName)}`);
      console.log(`    ${pc.gray("場所:")} ${loc}`);
      console.log(`    ${pc.gray("詳細:")} ${v.message}`);
      if (v.snippet) {
        console.log(`    ${pc.gray("該当:")} ${pc.dim(v.snippet)}`);
      }
      console.log("");
    }
  }

  console.log(pc.gray("  " + "─".repeat(50)));
  console.log(pc.bold("  監査サマリー:"));
  console.log(`    走査ファイル数 : ${result.summary.scannedFiles}`);
  console.log(`    総検知数       : ${result.summary.totalViolations}`);
  console.log(
    `    内訳           : ${pc.red(`CRITICAL: ${result.summary.critical}`)} | ${pc.yellow(`HIGH: ${result.summary.high}`)} | ${pc.cyan(`MEDIUM: ${result.summary.medium}`)} | ${pc.blue(`LOW: ${result.summary.low}`)}`
  );
  console.log("");

  if (result.summary.passed) {
    console.log(pc.bold(pc.green("  [PASS] 監査合格 - 致命的な問題はありません")));
  } else {
    console.log(pc.bold(pc.red("  [FAIL] 監査不合格 - 致命的な問題を解消してください")));
  }
  console.log("");
}
