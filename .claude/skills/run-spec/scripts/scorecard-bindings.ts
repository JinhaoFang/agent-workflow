/**
 * 评分表的精确记录归属：正常登记写主工作区 version=1 文件，预览仅内存合并；
 * 同名跨 spec 或与 gh-/review- 规范归属冲突时报错。目录锁串行更新，临时文件
 * 原子替换；重复登记不改文件。只保存关联，不授予任何原始记录的删除权限。
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { alive } from "./dispatchdock.ts";
import { matchesRecord, recordName } from "./shared.ts";

export type RecordBinding = { spec: number; name: string; registeredAt: string };
export const bindingFile = (root: string): string => join(root, ".codex-runs/scorecard-records.json");
const validName = (name: unknown): name is string => typeof name === "string" &&
  /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) && recordName(name) === name &&
  !["scorecard-records", "verification"].includes(name);
const assertName = (name: unknown): void => {
  if (!validName(name)) throw new Error("--record 必须是精确派发记录名，不能包含路径、通配符或文件后缀。");
};
const canonical = (name: string, spec: number, tickets: Set<number>): boolean =>
  matchesRecord(name, `review-${spec}`) || [...tickets].some((ticket) => matchesRecord(name, `gh-${ticket}`));
const assertOwner = (name: string, spec: number, tickets: Set<number>): void => {
  if (/^(?:gh|review)-[1-9]\d*(?:-|$)/.test(name) && !canonical(name, spec, tickets))
    throw new Error(`记录 ${name} 与 spec #${spec} 的规范归属冲突，不能显式关联。`);
};
const load = (root: string): RecordBinding[] => {
  const file = bindingFile(root);
  if (!existsSync(file)) return [];
  const value = JSON.parse(readFileSync(file, "utf8"));
  if (value?.version !== 1 || !Array.isArray(value.records)) throw new Error("评分表记录归属文件无效，需要 version=1 和 records 数组。");
  const names = new Set<string>();
  for (const row of value.records) {
    if (!row || !Number.isSafeInteger(row.spec) || row.spec < 1 || !validName(row.name) ||
      typeof row.registeredAt !== "string" || !Number.isFinite(Date.parse(row.registeredAt)))
      throw new Error("评分表记录归属文件包含无效记录。");
    if (names.has(row.name)) throw new Error(`评分表记录归属文件重复登记了 ${row.name}。`);
    names.add(row.name);
  }
  return value.records;
};
const selected = (records: RecordBinding[], spec: number, tickets: Set<number>): RecordBinding[] => {
  for (const row of records) {
    if (row.spec === spec) assertOwner(row.name, spec, tickets);
    else if (canonical(row.name, spec, tickets)) throw new Error(`记录 ${row.name} 已归属 spec #${row.spec}，与 spec #${spec} 的规范归属冲突。`);
  }
  return records.filter((row) => row.spec === spec).sort((a, b) => a.name.localeCompare(b.name));
};
export const readRecordBindings = (root: string, spec: number, tickets: Set<number>): RecordBinding[] => selected(load(root), spec, tickets);
const acquire = (directory: string): (() => void) => {
  const lock = join(directory, "scorecard-records.lock");
  const deadline = Date.now() + 30000;
  const wait = new Int32Array(new SharedArrayBuffer(4));
  for (;;) {
    let acquired = false;
    try { mkdirSync(lock); acquired = true; } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    if (acquired) {
      const owner = join(lock, String(process.pid));
      try { writeFileSync(owner, ""); } catch (error) { rmdirSync(lock); throw error; }
      return () => { unlinkSync(owner); rmdirSync(lock); };
    }
    try {
      const owners = readdirSync(lock);
      if (owners.length === 1 && /^[1-9]\d*$/.test(owners[0]) && !alive(Number(owners[0]))) {
        unlinkSync(join(lock, owners[0]));
        rmdirSync(lock);
      } else if (!owners.length && Date.now() - statSync(lock).mtimeMs > 10000) rmdirSync(lock);
    } catch (error) {
      if (!["ENOENT", "ENOTEMPTY"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
    }
    if (Date.now() >= deadline) throw new Error("等待评分表记录归属锁超时，请核对正在登记的进程。");
    Atomics.wait(wait, 0, 0, 25);
  }
};
export const registerRecordBindings = (root: string, spec: number, tickets: Set<number>, names: string[], dryRun = false): RecordBinding[] => {
  for (const name of names) { assertName(name); assertOwner(name, spec, tickets); }
  if (!names.length) return readRecordBindings(root, spec, tickets);
  const merge = (records: RecordBinding[]): RecordBinding[] => {
    selected(records, spec, tickets);
    const registeredAt = new Date().toISOString();
    for (const name of new Set(names)) {
      const existing = records.find((row) => row.name === name);
      if (existing && existing.spec !== spec) throw new Error(`记录 ${name} 已归属 spec #${existing.spec}，不能关联到 spec #${spec}。`);
      if (!existing) records.push({ spec, name, registeredAt });
    }
    return records;
  };
  if (dryRun) return selected(merge(load(root)), spec, tickets);
  const directory = join(root, ".codex-runs");
  mkdirSync(directory, { recursive: true });
  const release = acquire(directory);
  const temporary = join(directory, `scorecard-records-${process.pid}-${randomUUID()}.tmp`);
  try {
    const records = load(root);
    const previous = records.length;
    merge(records);
    if (records.length !== previous) {
      records.sort((a, b) => a.spec - b.spec || a.name.localeCompare(b.name));
      writeFileSync(temporary, JSON.stringify({ version: 1, records }, null, 2) + "\n", { flag: "wx" });
      renameSync(temporary, bindingFile(root));
    }
    return selected(records, spec, tickets);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
    release();
  }
};
