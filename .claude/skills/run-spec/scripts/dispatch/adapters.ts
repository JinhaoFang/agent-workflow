/**
 * 已接入的适配器登记；框架名称和受限调用能力均从登记取得。
 * doctor 从这里取权限映射，不另维护一套框架权限表。
 */
import type { Adapter } from "./adapter.ts";
import { codex } from "./codex.ts";
import { claude } from "./claude.ts";
import { pi } from "./pi.ts";

export const adapters: Record<string, Adapter> = { codex, claude, pi };
export const agentNames = (): string[] => Object.keys(adapters);
export const adapterFor = (agent: string): Adapter => {
  const adapter = adapters[agent];
  if (!adapter) throw new Error(`框架 ${agent} 尚未接入适配器，当前不可用`);
  return adapter;
};
