import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import type { Ignore } from "ignore";
import _ignore from "ignore";
import type { FileEntry } from "../types/index.js";

// NodeNext / CJS 互換処理
const createIgnore: typeof _ignore =
  typeof _ignore === "function" ? _ignore : (_ignore as unknown as { default: typeof _ignore }).default;

const DEFAULT_IGNORE = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/.nuxt/**",
  "**/.output/**",
  "**/.shipguard/**",
  "**/coverage/**",
  "**/*.lock",
  "**/package-lock.json",
  "**/pnpm-lock.yaml",
  "**/bun.lockb",
  "**/*.min.js",
  "**/*.map",
  "**/*.png",
  "**/*.jpg",
  "**/*.jpeg",
  "**/*.gif",
  "**/*.svg",
  "**/*.ico",
  "**/*.pdf",
  "**/*.zip",
  "**/*.tar.gz",
  "**/test/**",
  "**/tests/**",
  "**/*.test.*",
  "**/*.spec.*",
];

const TARGET_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".sql",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".html",
];

const TARGET_FILENAMES = [
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
  ".env.staging",
  ".env.test",
  ".env.example",
];

/**
 * .gitignore ファイルを読み込み、ignore インスタンスを構築する
 */
async function loadGitignore(rootDir: string): Promise<Ignore> {
  const ig = (createIgnore as unknown as () => Ignore)();
  const gitignorePath = path.join(rootDir, ".gitignore");
  try {
    const content = await fs.readFile(gitignorePath, "utf-8");
    ig.add(content);
  } catch {
    // .gitignore が存在しない場合は無視
  }
  return ig;
}

/**
 * 指定パスがスキャン対象ファイルであるかを判定する
 */
function isTargetFile(relativePosixPath: string): boolean {
  const baseName = path.posix.basename(relativePosixPath);
  if (TARGET_FILENAMES.includes(baseName) || baseName.startsWith(".env.")) {
    return true;
  }
  const ext = path.posix.extname(relativePosixPath).toLowerCase();
  return TARGET_EXTENSIONS.includes(ext);
}

/**
 * ルートディレクトリ配下の対象ファイルを収集し、FileEntry 配列を返す
 */
export async function collectFiles(
  rootDir: string,
  customIgnore: string[] = []
): Promise<FileEntry[]> {
  const ig = await loadGitignore(rootDir);
  if (customIgnore.length > 0) {
    ig.add(customIgnore);
  }

  // fast-glob で走査（POSIX形式パスで取得）
  const allRelativePaths = await fg(["**/*", "**/.*"], {
    cwd: rootDir,
    dot: true,
    ignore: DEFAULT_IGNORE,
    onlyFiles: true,
    followSymbolicLinks: false,
  });

  const targetPaths = allRelativePaths.filter((relPath) => {
    // ignore によるチェック（相対パス）
    if (ig.ignores(relPath)) {
      return false;
    }
    return isTargetFile(relPath);
  });

  const fileEntries: FileEntry[] = [];

  for (const relPath of targetPaths) {
    const absolutePath = path.join(rootDir, relPath);
    try {
      const stats = await fs.stat(absolutePath);
      // 2MB以上の巨大ファイルは除外（静的監査の対象外）
      if (stats.size > 2 * 1024 * 1024) {
        continue;
      }

      const content = await fs.readFile(absolutePath, "utf-8");
      // バイナリファイル（NUL文字含む）はスキップ
      if (content.includes("\0")) {
        continue;
      }

      fileEntries.push({
        path: relPath,
        absolutePath,
        content,
        extension: path.extname(relPath).toLowerCase(),
      });
    } catch {
      // 読み込みエラーはスキップ
    }
  }

  return fileEntries;
}
