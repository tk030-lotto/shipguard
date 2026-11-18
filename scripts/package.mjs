import { readFileSync, existsSync, rmSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { execSync, execFileSync } from "node:child_process";
import os from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");

const pkg = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf8"));
const version = pkg.version;
const zipFileName = `shipguard-v${version}.zip`;
const zipFilePath = resolve(rootDir, zipFileName);

console.log(`[package] Preparing release archive: ${zipFileName}`);

const requiredEntries = [
  "dist",
  "bin",
  "package.json",
  "schema.json",
  "README.md",
  "LICENSE",
  "shipguard-ui.bat",
];

for (const entry of requiredEntries) {
  const p = resolve(rootDir, entry);
  if (!existsSync(p)) {
    console.error(`[package] Error: Required entry '${entry}' not found at ${p}`);
    process.exit(1);
  }
}

if (existsSync(zipFilePath)) {
  rmSync(zipFilePath);
}

const isWindows = process.platform === "win32";

try {
  if (isWindows) {
    const pathsArg = requiredEntries.join(", ");
    const psCommand = `powershell -NoProfile -Command "Compress-Archive -Path ${pathsArg} -DestinationPath '${zipFileName}' -Force"`;
    console.log(`[package] Executing: ${psCommand}`);
    execSync(psCommand, { cwd: rootDir, stdio: "inherit" });
  } else {
    const filesArg = requiredEntries.join(" ");
    const zipCommand = `zip -r "${zipFileName}" ${filesArg}`;
    console.log(`[package] Executing: ${zipCommand}`);
    execSync(zipCommand, { cwd: rootDir, stdio: "inherit" });
  }
  console.log(`[package] Successfully generated: ${zipFileName}`);
} catch (err) {
  console.error(`[package] Failed to create zip archive:`, err);
  process.exit(1);
}

// 自己確認: 一時ディレクトリへ展開して node_modules なしで --version と scan が動作することを検証
const verifyRoot = mkdtempSync(join(os.tmpdir(), "shipguard-zip-verify-"));
const extractDir = join(verifyRoot, "extracted");
const targetDir = join(verifyRoot, "sample-project");

try {
  mkdirSync(extractDir, { recursive: true });
  mkdirSync(targetDir, { recursive: true });

  console.log(`[package] Verifying standalone execution from extracted archive...`);
  if (isWindows) {
    execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -LiteralPath '${zipFilePath}' -DestinationPath '${extractDir}' -Force`,
      ],
      { stdio: "inherit" }
    );
  } else {
    execFileSync("unzip", ["-q", zipFilePath, "-d", extractDir], { stdio: "inherit" });
  }

  const cliEntry = join(extractDir, "bin", "shipguard.js");
  if (!existsSync(cliEntry)) {
    throw new Error(`Extracted CLI entry not found: ${cliEntry}`);
  }

  const versionOutput = execFileSync(process.execPath, [cliEntry, "--version"], {
    cwd: targetDir,
    encoding: "utf8",
  }).trim();

  if (versionOutput !== version) {
    throw new Error(`Unexpected --version output: '${versionOutput}' (expected '${version}')`);
  }
  console.log(`[package] Verified --version: ${versionOutput}`);

  writeFileSync(join(targetDir, "index.ts"), "export const ok = true;\n", "utf8");
  execFileSync(process.execPath, [cliEntry, "scan"], {
    cwd: targetDir,
    encoding: "utf8",
    stdio: "inherit",
  });
  console.log(`[package] Verified standalone scan passed successfully.`);
} catch (err) {
  console.error(`[package] Standalone verification failed:`, err);
  process.exit(1);
} finally {
  rmSync(verifyRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
