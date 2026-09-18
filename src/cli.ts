import { Command } from "commander";
import { runHistory } from "./commands/history.js";
import { runInit } from "./commands/init.js";
import { runScan } from "./commands/scan.js";
import { startUiServer } from "./commands/ui.js";
import type { ScanOptions } from "./types/index.js";

const program = new Command();

program
  .name("shipguard")
  .description("個人開発者のための事前ローンチ・セキュリティ＆設定監査CLI")
  .version("0.1.0");

program
  .command("scan", { isDefault: true })
  .description("プロジェクトを走査し、セキュリティ・設定不備を監査します")
  .option("-s, --strict", "WARNING/LOWレベルを含むすべての違反で終了コード1を返します")
  .option("-f, --format <format>", "出力形式を指定します (terminal, markdown, json, html)", "terminal")
  .option("-o, --output <path>", "レポート出力先ファイルパスを指定します")
  .option("--open", "スキャン完了後にレポートをブラウザで開きます")
  .option("-i, --ignore <patterns...>", "監査対象外とするGlobパターンを指定します")
  .action(
    async (cmdOptions: {
      strict?: boolean;
      format?: "terminal" | "markdown" | "json" | "html";
      output?: string;
      open?: boolean;
      ignore?: string[];
    }) => {
      try {
        const options: ScanOptions = {
          strict: Boolean(cmdOptions.strict),
          format: cmdOptions.format,
          output: cmdOptions.output,
          open: cmdOptions.open,
          ignore: cmdOptions.ignore,
        };

        const result = await runScan(options);

        // 終了コードの制御
        if (!result.summary.passed) {
          process.exit(1);
        }
        process.exit(0);
      } catch (error) {
        console.error("エラーが発生しました:", error);
        process.exit(2);
      }
    }
  );

program
  .command("ui")
  .description("ローカルWeb UIダッシュボードを起動します")
  .option("-p, --port <number>", "サーバーのポート番号", (v) => parseInt(v, 10), 3773)
  .option("--no-open", "起動時にブラウザを自動で開かない")
  .action(async (options: { port?: number; open?: boolean }) => {
    try {
      await startUiServer({ port: options.port, open: options.open });
    } catch (error) {
      console.error("UIサーバーの起動に失敗しました:", error);
      process.exit(2);
    }
  });

program
  .command("init")
  .description(".shipguardrc.json 設定ファイルを生成します")
  .option("--force", "既存ファイルがある場合も強制的に上書きします")
  .action(async (options: { force?: boolean }) => {
    try {
      await runInit({ force: options.force });
      process.exit(0);
    } catch (error) {
      console.error("エラーが発生しました:", error);
      process.exit(2);
    }
  });

program
  .command("history")
  .description("過去のスキャン実行ログを一覧表示します")
  .option("-n, --limit <number>", "表示する最新ログ件数", (v) => parseInt(v, 10), 10)
  .option("--clear", "監査履歴ログを削除します")
  .action(async (options: { limit?: number; clear?: boolean }) => {
    try {
      await runHistory({ limit: options.limit, clear: options.clear });
      process.exit(0);
    } catch (error) {
      console.error("エラーが発生しました:", error);
      process.exit(2);
    }
  });

export function runCLI(): void {
  program.parse(process.argv);
}
