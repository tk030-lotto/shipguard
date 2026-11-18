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
  it("maxFileSizeBytes 閾値を超えるファイルはスキップされること", async () => {
    // 5バイトのファイルを作成し、閾値を4バイトに設定してスキップされるか確認
    await fs.writeFile(path.join(tempDir, "small.ts"), "hello");
    await fs.writeFile(path.join(tempDir, "large.ts"), "larger");

    const files = await collectFiles(tempDir, [], 4);

    const filePaths = files.map((f) => f.path.replace(/\\/g, "/"));
    // "hello"(5バイト) > 4バイト閾値 → スキップ
    // "larger"(6バイト) > 4バイト閾値 → スキップ
    expect(filePaths).not.toContain("small.ts");
    expect(filePaths).not.toContain("large.ts");
  });

  it("デフォルト閾値未満のファイルは収集されること", async () => {
    await fs.writeFile(path.join(tempDir, "app.ts"), "console.log('ok');");

    const files = await collectFiles(tempDir);

    const filePaths = files.map((f) => f.path.replace(/\\/g, "/"));
    expect(filePaths).toContain("app.ts");
  });

  it("存在しないパスや stat 失敗時は空配列ではなく例外をスローすること", async () => {
    const nonExistent = path.join(tempDir, "missing-dir");
    await expect(collectFiles(nonExistent)).rejects.toThrow("スキャン対象が存在しないかアクセスできません");
  });

  it("自動除外・customIgnore・否定付き .gitignore・dotfile・バイナリ除外・単一ファイル上限が維持されること", async () => {
    await fs.mkdir(path.join(tempDir, "node_modules", "pkg"), { recursive: true });
    await fs.mkdir(path.join(tempDir, ".shipguard"), { recursive: true });
    await fs.mkdir(path.join(tempDir, "src"), { recursive: true });

    await fs.writeFile(path.join(tempDir, "node_modules", "pkg", "index.js"), "console.log(1);");
    await fs.writeFile(path.join(tempDir, ".shipguard", "report.html"), "<html></html>");
    await fs.writeFile(path.join(tempDir, "src", "app.test.ts"), "test();");
    await fs.writeFile(path.join(tempDir, "src", "custom-skip.ts"), "skip();");
    await fs.writeFile(path.join(tempDir, "src", "keep.ts"), "keep();");
    await fs.writeFile(path.join(tempDir, ".env"), "SECRET=1");
    await fs.writeFile(path.join(tempDir, "binary.ts"), "abc\0def");
    await fs.writeFile(path.join(tempDir, ".gitignore"), "src/*.ts\n!src/keep.ts\n");

    const files = await collectFiles(tempDir, ["src/custom-skip.ts"]);
    const filePaths = files.map((f) => f.path.replace(/\\/g, "/"));

    expect(filePaths).toContain("src/keep.ts");
    expect(filePaths).toContain(".env");
    expect(filePaths).not.toContain("node_modules/pkg/index.js");
    expect(filePaths).not.toContain(".shipguard/report.html");
    expect(filePaths).not.toContain("src/app.test.ts");
    expect(filePaths).not.toContain("src/custom-skip.ts");
    expect(filePaths).not.toContain("binary.ts");

    // 単一ファイルでのサイズ上限スキップ
    const singleFile = path.join(tempDir, "src", "keep.ts");
    const skippedSingle = await collectFiles(singleFile, [], 2);
    expect(skippedSingle).toEqual([]);
  });
});
