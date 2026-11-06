/**
 * 派发汇总只读入口：识别内置层同名 .json，并校验统一用量。
 * 旧记录不伪装成新记录；新记录缺用量时保留 null，不回退成估算。
 */
import { existsSync, readFileSync } from "node:fs";
import type { Usage } from "./adapter.ts";
export type Summary = { v: 1; framework: string; success: boolean; usage: Usage | null; actualModel: string | null; actualEffort: string | null; minutes: number };
export const dispatchSummary = (file: string): Summary | null => {
  if (!existsSync(file)) return null;
  let value;
  try { value = JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
  if (value?.v !== 1 || typeof value.framework !== "string" || typeof value.success !== "boolean") return null;
  const usage = value.usage;
  if (!usage || ![usage.input, usage.cached, usage.output].every(count => Number.isSafeInteger(count) && count >= 0) || usage.cached > usage.input) value.usage = null;
  return value;
};
