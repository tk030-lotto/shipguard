import { Command } from "commander";
import { runScan } from "./commands/scan.js";
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
  .option("-i, --ignore <patterns...>", "監査対象外とするGlobパターンを指定します")
  .action(async (cmdOptions: { strict?: boolean; ignore?: string[] }) => {
    try {
      const options: ScanOptions = {
        strict: Boolean(cmdOptions.strict),
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
  });

export function runCLI(): void {
  program.parse(process.argv);
}
