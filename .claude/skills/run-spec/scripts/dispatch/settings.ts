/**
 * 席位配置统一解析：内置、用户、仓库、环境、参数逐字段覆盖，review 列表整体替换。
 * 用户文件可缺省，存在但无效时拒绝运行；工作类型词表只取仓库配置。
 * 供派发入口和 doctor 使用，不写文件；来源、回落原因随设置进入派发记录。
 * 旧 DispatchDock 的模型、强度、路径仍作为兼容默认；codexSandbox 只管工程 Codex。
 * 空环境值视为未设置，回落到下一层，不登记为环境来源。
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { dispatchHome } from "../dispatchdock.ts";
import type { SeatSettings, Permission } from "./adapter.ts";

export const seatNames = ["engineering", "review", "spec-review", "research", "watch"] as const;
export const agentNames = ["codex", "claude", "pi"] as const;
export class SeatConfigError extends Error {}
type Profile = { agent?: string; model?: string | null; effort?: string | null; permission?: Permission };
type Layer = {
  seats?: Record<string, Record<string, Profile | Profile[]>>;
  agents?: Record<string, { concurrency?: number; path?: string | null }>;
  workTypes?: Record<string, string>;
  codexSandbox?: string;
  codexConcurrency?: number;
};
export type SeatConfiguration = {
  user: Layer;
  repository: Layer;
  userFile: string;
  userExists: boolean;
  workTypes: Record<string, string>;
};

const object = (value: unknown): value is Record<string, any> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0 && !/[\0\r\n]/.test(value);
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
const read = (file: string, optional: boolean): any => {
  try { return JSON.parse(readFileSync(file, "utf8")); }
  catch (error) {
    if (optional && (error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new SeatConfigError(`配置文件无法读取或不是有效 JSON：${file}`);
  }
};

const validate = (value: unknown, source: string, user: boolean): Layer => {
  if (!object(value)) throw new SeatConfigError(`${source} 必须是 JSON 对象`);
  const fail = (key: string, expected: string): never => { throw new SeatConfigError(`${source} 的 ${key} 必须是${expected}`); };
  if (user && Object.keys(value).some(key => !["seats", "agents"].includes(key))) fail("顶层配置项", " seats 或 agents；工作类型词表只放仓库 workTypes");
  if (value.workTypes !== undefined) {
    if (!object(value.workTypes) || !Object.entries(value.workTypes).every(([name, description]) => text(name) && name === name.trim() && name !== "default" && text(description))) fail("workTypes", "名称到一句非空说明的对象，不能使用 default");
  }
  if (value.seats !== undefined) {
    if (!object(value.seats)) fail("seats", "席位到分档的对象");
    for (const [seat, profiles] of Object.entries(value.seats)) {
      if (!seatNames.includes(seat as typeof seatNames[number]) || !object(profiles)) fail(`seats.${seat}`, "已知席位的分档对象");
      for (const [name, profile] of Object.entries(profiles as object)) {
        if (!text(name) || name !== name.trim() || (!user && name !== "default" && !Object.hasOwn(value.workTypes ?? {}, name))) fail(`seats.${seat}.${name}`, "default 或仓库 workTypes 中的名称");
        const items = Array.isArray(profile) ? profile : [profile];
        if ((Array.isArray(profile) && seat !== "review") || !items.length) fail(`seats.${seat}.${name}`, "非空配置对象，只有 review 支持非空列表");
        for (const item of items) {
          if (!object(item) || Object.keys(item).some(key => !["agent", "model", "effort", "permission"].includes(key))) fail(`seats.${seat}.${name}`, "仅含 agent、model、effort、permission 的对象");
          if (item.agent !== undefined && !agentNames.includes(item.agent)) fail(`seats.${seat}.${name}.agent`, "codex、claude 或 pi");
          for (const key of ["model", "effort"]) if (item[key] !== undefined && item[key] !== null && !text(item[key])) fail(`seats.${seat}.${name}.${key}`, "非空单行字符串或 null");
          if (item.permission !== undefined && !["read-only", "workspace-write", "full"].includes(item.permission)) fail(`seats.${seat}.${name}.permission`, "read-only、workspace-write 或 full");
        }
      }
    }
  }
  if (value.agents !== undefined) {
    if (!object(value.agents)) fail("agents", "框架到配置的对象");
    for (const [agent, settings] of Object.entries(value.agents)) {
      if (!agentNames.includes(agent as typeof agentNames[number]) || !object(settings) || Object.keys(settings).some(key => !["path", "concurrency"].includes(key))) fail(`agents.${agent}`, "已知框架的 path、concurrency 配置对象");
      const item = settings as Record<string, unknown>;
      if (item.concurrency !== undefined && !positive(item.concurrency)) fail(`agents.${agent}.concurrency`, "安全范围内的正整数");
      if (item.path !== undefined && item.path !== null && (!text(item.path) || !isAbsolute(item.path))) fail(`agents.${agent}.path`, "绝对可执行路径或 null");
    }
  }
  return value;
};

export const loadSeatConfiguration = (root: string, repository?: unknown): SeatConfiguration => {
  const userFile = join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "agent-workflow/seats.json");
  const user = read(userFile, true);
  const repoValue = repository === undefined ? read(join(root, "docs/agents/run-spec.json"), true) : repository;
  const repo = validate(structuredClone(repoValue === undefined ? {} : repoValue), "仓库配置", false);
  return { user: validate(user === undefined ? {} : user, `用户配置 ${userFile}`, true), repository: repo, userFile, userExists: user !== undefined, workTypes: repo.workTypes ?? {} };
};

const legacySettings = (): Record<string, any> => {
  const value = readLegacy();
  return value?.v === 1 && object(value.agents?.codex) ? value.agents.codex : {};
};
const readLegacy = (): any => {
  try { return JSON.parse(readFileSync(join(dispatchHome(), "config.json"), "utf8")); }
  catch (error) {
    if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
};

export const frameworkSettings = (config: SeatConfiguration, agent: string) => {
  let concurrency = 2;
  let path: string | null = agent === "codex" ? legacySettings().path ?? null : null;
  const sources = { concurrency: "内置默认", path: path ? "旧 DispatchDock agents.codex.path" : "内置默认（PATH）" };
  for (const [layer, source] of [[config.user, `用户 ${config.userFile}`], [config.repository, "仓库 run-spec.json"]] as const) {
    if (agent === "codex" && layer.codexConcurrency !== undefined) {
      concurrency = layer.codexConcurrency;
      sources.concurrency = `${source}.codexConcurrency（兼容）`;
    }
    const settings = layer.agents?.[agent];
    if (settings?.concurrency !== undefined) { concurrency = settings.concurrency; sources.concurrency = `${source}.agents.${agent}.concurrency`; }
    if (settings?.path !== undefined) { path = settings.path; sources.path = `${source}.agents.${agent}.path`; }
  }
  const key = `RUN_SPEC_${agent.toUpperCase()}_CONCURRENCY`;
  if (process.env[key]) {
    if (!/^[1-9]\d*$/.test(process.env[key]!) || !positive(Number(process.env[key]))) throw new Error(`配置 codexConcurrency/agents.${agent}.concurrency 的环境变量 ${key} 必须是安全范围内的正整数`);
    concurrency = Number(process.env[key]); sources.concurrency = `环境变量 ${key}`;
  }
  return { concurrency, path, sources };
};

export const workTypeFromBody = (body: string): string => {
  const types = [...body.matchAll(/^工作类型[：:][ \t]*([^\r\n]*)\r?$/gm)].map(match => match[1].trim());
  if (types.length > 1) throw new Error("工单正文只能写一行工作类型");
  if (types.length && !types[0]) throw new Error("工作类型名称不能为空");
  return types[0] ?? "default";
};

export const resolveSeat = (config: SeatConfiguration, seat = "engineering", workType = "default", overrides: Record<string, string> = {}, workTypeSource = "内置默认"): SeatSettings[] => {
  if (!seatNames.includes(seat as typeof seatNames[number])) throw new Error(`未知席位：${seat}`);
  if (workType !== "default" && !Object.hasOwn(config.workTypes, workType)) throw new Error(`工作类型不在仓库 workTypes 词表中：${workType}`);
  for (const key of ["model", "effort"]) if (overrides[key] !== undefined && !text(overrides[key])) throw new Error(`命令参数 --${key} 必须是非空单行字符串`);
  const builtin = { agent: ["spec-review", "watch"].includes(seat) ? "claude" : "codex", model: seat === "watch" ? "haiku" : null, effort: null, permission: ["review", "spec-review", "research"].includes(seat) ? "read-only" : "workspace-write" } as Profile;
  type Item = { values: Profile; sources: Record<string, string> };
  const base: Item = { values: builtin, sources: Object.fromEntries(Object.keys(builtin).map(key => [key, "内置默认"])) };
  let items: Item[] = [base];
  let hasProfile = false;
  for (const [layer, source] of [[config.user, `用户 ${config.userFile}`], [config.repository, "仓库 run-spec.json"]] as const) {
    for (const name of workType === "default" ? ["default"] : ["default", workType]) {
      const value = layer.seats?.[seat]?.[name];
      if (value === undefined) continue;
      if (name === workType && workType !== "default") hasProfile = true;
      const apply = (current: Item, patch: Profile, suffix = ""): Item => ({ values: { ...current.values, ...patch }, sources: { ...current.sources, ...Object.fromEntries(Object.keys(patch).map(key => [key, `${source}.seats.${seat}.${name}${suffix}.${key}`])) } });
      items = Array.isArray(value) ? value.map((item, index) => apply(base, item, `[${index}]`)) : items.map(item => apply(item, value));
    }
  }
  const legacy = legacySettings();
  return items.map(({ values, sources }) => {
    for (const key of ["agent", "model", "effort", "permission"] as const) {
      if (overrides[key] !== undefined) {
        (values as Record<string, unknown>)[key] = overrides[key]; sources[key] = `命令参数 --${key}`;
      }
    }
    if (!agentNames.includes(values.agent as typeof agentNames[number])) throw new Error(`未知框架：${values.agent}`);
    if (values.agent === "codex") {
      for (const key of ["model", "effort"] as const) {
        if (sources[key] === "内置默认" && legacy[key]) { values[key] = legacy[key]; sources[key] = `旧 DispatchDock agents.codex.${key}`; }
        if (process.env[`CODEX_${key.toUpperCase()}`] && overrides[key] === undefined) { values[key] = process.env[`CODEX_${key.toUpperCase()}`]!; sources[key] = `环境变量 CODEX_${key.toUpperCase()}`; }
      }
      if (seat === "engineering" && sources.permission === "内置默认") {
        const sandbox = config.repository.codexSandbox ?? legacy.sandbox;
        if (sandbox) { values.permission = sandbox === "danger-full-access" ? "full" : sandbox; sources.permission = config.repository.codexSandbox ? "仓库 run-spec.json.codexSandbox（兼容）" : "旧 DispatchDock agents.codex.sandbox"; }
      }
      if (process.env.CODEX_SANDBOX && seat === "engineering" && overrides.permission === undefined) {
        values.permission = process.env.CODEX_SANDBOX === "danger-full-access" ? "full" : process.env.CODEX_SANDBOX as Permission; sources.permission = "环境变量 CODEX_SANDBOX";
      }
    }
    if (!["read-only", "workspace-write", "full"].includes(values.permission!)) throw new Error(`无效的权限：${values.permission}`);
    const framework = frameworkSettings(config, values.agent!);
    return { seat, workType, agent: values.agent!, model: values.model ?? null, effort: values.effort ?? null, permission: values.permission!, path: framework.path, tier: values.agent === "codex" ? overrides.tier ?? (process.env.CODEX_TIER || legacy.tier || null) : null,
      sources: { ...sources, seat: "命令席位", workType: overrides["work-type"] !== undefined ? "命令参数 --work-type" : workTypeSource, path: framework.sources.path },
      fallbackReason: workType !== "default" && !hasProfile ? `工作类型「${workType}」在词表内，但席位 ${seat} 未配置该档，回落到 default` : null,
    };
  });
};

export const describeSeat = (settings: SeatSettings): string =>
  `席位：${settings.seat}；工作类型：${settings.workType}；框架：${settings.agent}；模型：${settings.model ?? "框架默认"}；强度：${settings.effort ?? "框架默认"}；权限：${settings.permission}\n来源：${JSON.stringify(settings.sources)}${settings.fallbackReason ? `\n提示：${settings.fallbackReason}` : ""}`;
