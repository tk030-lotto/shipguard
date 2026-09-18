import { exec } from "node:child_process";

/**
 * 指定されたURLまたはローカルファイルパスを既定のブラウザで開く
 */
export function openInBrowser(target: string): Promise<void> {
  return new Promise((resolve) => {
    let cmd = "";
    switch (process.platform) {
      case "win32":
        // Windows では start "" "target"
        cmd = `start "" "${target}"`;
        break;
      case "darwin":
        cmd = `open "${target}"`;
        break;
      default:
        cmd = `xdg-open "${target}"`;
        break;
    }

    exec(cmd, (error) => {
      if (error) {
        // ブラウザ起動失敗時もプロセスをクラッシュさせずに続行
        console.warn(`[shipguard] ブラウザの自動起動に失敗しました: ${error.message}`);
      }
      resolve();
    });
  });
}
