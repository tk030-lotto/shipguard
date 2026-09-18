import { execFile } from "node:child_process";

/**
 * Windows / macOS / Linux でフォルダ選択ダイアログを開き、選択されたパスを返す
 */
export function selectFolderDialog(): Promise<string | null> {
  return new Promise((resolve) => {
    if (process.platform === "win32") {
      const psCommand = `
        Add-Type -AssemblyName System.Windows.Forms;
        $dialog = New-Object System.Windows.Forms.FolderBrowserDialog;
        $dialog.Description = 'スキャン対象のプロジェクトフォルダを選択してください';
        $dialog.ShowNewFolderButton = $false;
        if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
          [Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
          Write-Output $dialog.SelectedPath;
        }
      `.trim();

      execFile(
        "powershell",
        ["-NoProfile", "-STA", "-Command", psCommand],
        { encoding: "utf8" },
        (error, stdout) => {
          if (error) {
            resolve(null);
            return;
          }
          const selected = stdout.trim();
          resolve(selected || null);
        }
      );
    } else if (process.platform === "darwin") {
      const script = `POSIX path of (choose folder with prompt "スキャン対象のプロジェクトフォルダを選択してください")`;
      execFile("osascript", ["-e", script], { encoding: "utf8" }, (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }
        resolve(stdout.trim() || null);
      });
    } else {
      // Linux: zenity が利用可能な場合
      execFile(
        "zenity",
        ["--file-selection", "--directory", "--title=スキャン対象フォルダを選択"],
        { encoding: "utf8" },
        (error, stdout) => {
          if (error) {
            resolve(null);
            return;
          }
          resolve(stdout.trim() || null);
        }
      );
    }
  });
}

/**
 * Windows / macOS / Linux でファイル選択ダイアログを開き、選択されたパスを返す
 */
export function selectFileDialog(): Promise<string | null> {
  return new Promise((resolve) => {
    if (process.platform === "win32") {
      const psCommand = `
        Add-Type -AssemblyName System.Windows.Forms;
        $dialog = New-Object System.Windows.Forms.OpenFileDialog;
        $dialog.Title = 'スキャン対象ファイルを選択してください';
        $dialog.Filter = 'ソースコード (*.ts;*.tsx;*.js;*.jsx;*.env*;*.sql)|*.ts;*.tsx;*.js;*.jsx;*.env*;*.sql|すべてのファイル (*.*)|*.*';
        if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
          [Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
          Write-Output $dialog.FileName;
        }
      `.trim();

      execFile(
        "powershell",
        ["-NoProfile", "-STA", "-Command", psCommand],
        { encoding: "utf8" },
        (error, stdout) => {
          if (error) {
            resolve(null);
            return;
          }
          const selected = stdout.trim();
          resolve(selected || null);
        }
      );
    } else if (process.platform === "darwin") {
      const script = `POSIX path of (choose file with prompt "スキャン対象ファイルを選択してください")`;
      execFile("osascript", ["-e", script], { encoding: "utf8" }, (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }
        resolve(stdout.trim() || null);
      });
    } else {
      execFile(
        "zenity",
        ["--file-selection", "--title=スキャン対象ファイルを選択"],
        { encoding: "utf8" },
        (error, stdout) => {
          if (error) {
            resolve(null);
            return;
          }
          resolve(stdout.trim() || null);
        }
      );
    }
  });
}
