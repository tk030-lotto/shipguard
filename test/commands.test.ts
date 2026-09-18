import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runHistory } from "../src/commands/history.js";
import { DEFAULT_CONFIG_TEMPLATE, runInit } from "../src/commands/init.js";
import { appendAuditLog } from "../src/logger/index.js";
import type { ScanResult } from "../src/types/index.js";

describe("commands", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "shipguard-cmd-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("runInit", () => {
    it("creates .shipguardrc.json when not present", async () => {
      const res = await runInit({ cwd: tmpDir });
      expect(res.created).toBe(true);
      expect(res.path).toBe(path.resolve(tmpDir, ".shipguardrc.json"));

      const content = JSON.parse(await fs.readFile(res.path, "utf8"));
      expect(content.rules["SEC-001"]).toBe("critical");
      expect(content.$schema).toBe(DEFAULT_CONFIG_TEMPLATE.$schema);
    });

    it("does not overwrite existing file without --force", async () => {
      const configPath = path.resolve(tmpDir, ".shipguardrc.json");
      await fs.writeFile(configPath, JSON.stringify({ custom: true }));

      const res = await runInit({ cwd: tmpDir, force: false });
      expect(res.created).toBe(false);

      const content = JSON.parse(await fs.readFile(configPath, "utf8"));
      expect(content.custom).toBe(true);
    });

    it("overwrites existing file with --force", async () => {
      const configPath = path.resolve(tmpDir, ".shipguardrc.json");
      await fs.writeFile(configPath, JSON.stringify({ custom: true }));

      const res = await runInit({ cwd: tmpDir, force: true });
      expect(res.created).toBe(true);

      const content = JSON.parse(await fs.readFile(configPath, "utf8"));
      expect(content.rules["SEC-001"]).toBe("critical");
      expect(content.custom).toBeUndefined();
    });
  });

  describe("runHistory", () => {
    const mockResult: ScanResult = {
      id: "hist-uuid-1",
      timestamp: "2026-09-18T10:00:00.000Z",
      summary: {
        scannedFiles: 5,
        totalViolations: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        passed: true,
      },
      violations: [],
    };

    it("returns empty array if no logs exist", async () => {
      const records = await runHistory({ cwd: tmpDir });
      expect(records).toEqual([]);
    });

    it("reads logs in reverse order with limit", async () => {
      await appendAuditLog({ ...mockResult, id: "run-1", timestamp: "2026-09-18T10:00:00.000Z" }, tmpDir);
      await appendAuditLog({ ...mockResult, id: "run-2", timestamp: "2026-09-18T11:00:00.000Z" }, tmpDir);
      await appendAuditLog({ ...mockResult, id: "run-3", timestamp: "2026-09-18T12:00:00.000Z" }, tmpDir);

      const records = await runHistory({ cwd: tmpDir, limit: 2 });
      expect(records).toHaveLength(2);
      expect(records[0].id).toBe("run-3");
      expect(records[1].id).toBe("run-2");
    });

    it("clears logs when clear is true", async () => {
      await appendAuditLog(mockResult, tmpDir);
      const logFile = path.resolve(tmpDir, ".shipguard/audit.log");
      expect(await fs.stat(logFile).then(() => true).catch(() => false)).toBe(true);

      const records = await runHistory({ cwd: tmpDir, clear: true });
      expect(records).toEqual([]);
      expect(await fs.stat(logFile).then(() => true).catch(() => false)).toBe(false);
    });
  });
});
