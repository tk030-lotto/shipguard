import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectFiles } from "../src/core/scanner.js";

describe("scanner: ファイル収集エンジン", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shipguard-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("対象ファイルを収集し、.gitignore の指定を除外すること", async () => {
    // ファイル作成
    await fs.writeFile(path.join(tempDir, "index.ts"), "console.log('hello');");
    await fs.writeFile(path.join(tempDir, "ignored.ts"), "console.log('ignored');");
    await fs.writeFile(path.join(tempDir, "image.png"), "binary-data");
    await fs.writeFile(path.join(tempDir, ".gitignore"), "ignored.ts\n");

    const files = await collectFiles(tempDir);

    const filePaths = files.map((f) => f.path.replace(/\\/g, "/"));
    expect(filePaths).toContain("index.ts");
    expect(filePaths).not.toContain("ignored.ts");
    expect(filePaths).not.toContain("image.png");
  });
});
