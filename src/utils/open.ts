import { execFile } from "node:child_process";

/**
 * 指定されたURLまたはローカルファイルパスを既定のブラウザで開く
 */
export function openInBrowser(target: string): Promise<void> {
  return new Promise((resolve) => {
    // execFile を使用して引数をシェル経由で渡さず、インジェクションを防止する
    let file: string;
    let args: string[];

    switch (process.platform) {
      case "win32":
        // cmd /c start "" "<target>" — execFile でシェルを明示的に指定
        file = "cmd";
        args = ["/c", "start", "", target];
        break;
      case "darwin":
        file = "open";
        args = [target];
        break;
      default:
        file = "xdg-open";
        args = [target];
        break;
    }

    execFile(file, args, (error) => {
      if (error) {
        // ブラウザ起動失敗時もプロセスをクラッシュさせずに続行
        console.warn(`[shipguard] ブラウザの自動起動に失敗しました: ${error.message}`);
      }
      resolve();
    });
  });
}
