import fs from "node:fs/promises";
import path from "node:path";
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
 * .gitignore ファイルを読み込み、ignore インスタンスと否定パターンの有無を返す
 */
async function loadGitignore(rootDir: string): Promise<{ ig: Ignore; hasNegation: boolean }> {
  const ig = (createIgnore as unknown as () => Ignore)();
  let hasNegation = false;
  const gitignorePath = path.join(rootDir, ".gitignore");
  try {
    const content = await fs.readFile(gitignorePath, "utf-8");
    ig.add(content);
    hasNegation = content
      .split(/\r?\n/)
      .some((line) => {
        const trimmed = line.trim();
        return trimmed.length > 0 && !trimmed.startsWith("#") && trimmed.startsWith("!");
      });
  } catch {
    // .gitignore が存在しない場合は無視
  }
  return { ig, hasNegation };
}

/**
 * DEFAULT_IGNORE 用の ignore インスタンスを構築する（ディレクトリ段階の除外にも対応）
 */
function createDefaultIgnore(): Ignore {
  const ig = (createIgnore as unknown as () => Ignore)();
  ig.add(DEFAULT_IGNORE);
  // "**/dir/**" 形式をディレクトリ名単体 ("**/dir/") にもマッチさせる
  const dirPatterns = DEFAULT_IGNORE
    .filter((p) => p.endsWith("/**"))
    .map((p) => p.slice(0, -2));
  ig.add(dirPatterns);
  return ig;
}

/**
 * ディレクトリ配下を再帰的に走査して相対POSIXパス一覧を収集する（シンボリックリンク非追従）
 */
async function walkDirectory(
  rootDir: string,
  defaultIg: Ignore,
  userIg: Ignore,
  canPruneUserDirs: boolean
): Promise<string[]> {
  const collected: string[] = [];

  async function walk(currentAbsDir: string, currentRelPosix: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(currentAbsDir, { withFileTypes: true });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[shipguard] skip dir: ${currentRelPosix || "."} (read error: ${msg})`);
      return;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      // シンボリックリンクは追跡しない
      if (entry.isSymbolicLink()) {
        continue;
      }

      const relPosix = currentRelPosix ? `${currentRelPosix}/${entry.name}` : entry.name;
      const absPath = path.join(currentAbsDir, entry.name);

      if (entry.isDirectory()) {
        if (defaultIg.ignores(`${relPosix}/`)) {
          continue;
        }
        if (canPruneUserDirs && userIg.ignores(`${relPosix}/`)) {
          continue;
        }
        await walk(absPath, relPosix);
      } else if (entry.isFile()) {
        if (defaultIg.ignores(relPosix)) {
          continue;
        }
        collected.push(relPosix);
      }
    }
  }

  await walk(rootDir, "");
  return collected;
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
  customIgnore: string[] = [],
  maxFileSizeBytes: number = 2 * 1024 * 1024
): Promise<FileEntry[]> {
  // 単一ファイルまたは存在確認のハンドリング
  let stat;
  try {
    stat = await fs.stat(rootDir);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`スキャン対象が存在しないかアクセスできません: ${rootDir} (${msg})`);
  }

  if (stat.isFile()) {
    if (stat.size > maxFileSizeBytes) {
      const limitMB = (maxFileSizeBytes / (1024 * 1024)).toFixed(1);
      console.warn(
        `[shipguard] skip: ${path.basename(rootDir)} (${(stat.size / 1024).toFixed(0)} KB > ${limitMB} MB limit)`
      );
      return [];
    }
    const content = await fs.readFile(rootDir, "utf-8");
    if (content.includes("\0")) {
      return [];
    }
    const ext = path.extname(rootDir).toLowerCase();
    return [
      {
        path: path.basename(rootDir),
        absolutePath: path.resolve(rootDir),
        content,
        extension: ext,
      },
    ];
  }

  if (!stat.isDirectory()) {
    throw new Error(`スキャン対象がファイルまたはディレクトリではありません: ${rootDir}`);
  }

  const { ig, hasNegation } = await loadGitignore(rootDir);
  let hasCustomNegation = false;
  if (customIgnore.length > 0) {
    ig.add(customIgnore);
    hasCustomNegation = customIgnore.some((p) => p.trim().startsWith("!"));
  }

  const defaultIg = createDefaultIgnore();
  const canPruneUserDirs = !hasNegation && !hasCustomNegation;
  const allRelativePaths = await walkDirectory(rootDir, defaultIg, ig, canPruneUserDirs);

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
      // 閾値超過の巨大ファイルは除外（静的監査の対象外）
      if (stats.size > maxFileSizeBytes) {
        const limitMB = (maxFileSizeBytes / (1024 * 1024)).toFixed(1);
        console.warn(
          `[shipguard] skip: ${relPath} (${(stats.size / 1024).toFixed(0)} KB > ${limitMB} MB limit)`
        );
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
    } catch (error: unknown) {
      // 権限エラー・破損ファイル等は警告を出してスキップ
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[shipguard] skip: ${relPath} (read error: ${msg})`);
    }
  }

  return fileEntries;
}
