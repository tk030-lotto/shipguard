import { readFileSync, existsSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
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
