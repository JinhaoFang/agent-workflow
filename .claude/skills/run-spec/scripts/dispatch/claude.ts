/**
 * Claude Code 非交互适配器：数组参数、stdin 任务、主线程分片和工具关联。
 * 使用 skillOverrides 按名称关闭流程技能，保留其余技能；关闭 MCP、会话持久化、
 * hooks 和自动记忆。plan 加工具裁剪实现只读，不等同于操作系统沙箱。
 * 最终 result 判定成败；总用量只读一次，不累加分片中重复的占位用量。
 * 每个派发 CLI 进程运行一个任务，command 重置该任务的文本与工具状态。
 * 启动包装解析沿用 Codex 适配器的 MIT 实现，许可原文见同目录 LICENSE。
 * MIT License
 *
 * Copyright (c) 2026 LBEILC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { delimiter, dirname, resolve } from "node:path";
import type { Adapter, Event, Usage } from "./adapter.ts";
import { limitOutput } from "./codex.ts";

const launcherFor = (file: string): { executable: string; args: string[] } => {
  if (!existsSync(file) || !statSync(file).isFile()) throw new Error(`找不到 Claude Code CLI：${file}`);
  if (/\.(js|mjs|cjs)$/i.test(file)) return { executable: process.execPath, args: [file] };
  if (!/\.(cmd|bat)$/i.test(file)) return { executable: file, args: [] };
  const match = readFileSync(file, "utf8").match(/"%dp0%[\\/]([^"\r\n]+\.(?:js|mjs|cjs))"\s+%\*/i);
  if (match) return launcherFor(resolve(dirname(file), match[1]));
  throw new Error(`无法解析 Claude Code 启动包装：${file}；请在 agents.claude.path 配置可执行文件或 Node 入口的绝对路径`);
};
const resolveLauncher = (env: NodeJS.ProcessEnv, path: string | null) => {
  if (path) return launcherFor(path);
  for (const directory of (env.PATH ?? env.Path ?? "").split(delimiter).filter(Boolean)) {
    for (const name of process.platform === "win32" ? ["claude.exe", "claude.cmd"] : ["claude"]) {
      const file = resolve(directory.replace(/^"|"$/g, ""), name);
      if (existsSync(file) && statSync(file).isFile()) return launcherFor(file);
    }
  }
  throw new Error("找不到 Claude Code CLI；请确认 claude --version 可运行，或配置 agents.claude.path");
};
const usageOf = (value: Event | undefined): Usage | null => {
  if (!value) return null;
  const values = [value.input_tokens, value.cache_creation_input_tokens ?? 0, value.cache_read_input_tokens ?? 0, value.output_tokens];
  if (!values.every(count => Number.isSafeInteger(count) && count >= 0)) return null;
  const input = values[0] + values[1] + values[2];
  return Number.isSafeInteger(input) ? { input, cached: values[2], output: values[3] } : null;
};
const toolText = (value: unknown): string => typeof value === "string" ? value : Array.isArray(value)
  ? value.filter(block => block?.type === "text").map(block => block.text ?? "").join("\n") : "";
const resultUsage = (result: Event | undefined): Usage | null => {
  const models = result?.modelUsage;
  if (models && typeof models === "object" && !Array.isArray(models) && Object.keys(models).length > 0) {
    const values = Object.values(models).map(value => {
      const usage = value as Event | null;
      return usageOf(usage ? { input_tokens: usage.inputTokens, output_tokens: usage.outputTokens, cache_creation_input_tokens: usage.cacheCreationInputTokens, cache_read_input_tokens: usage.cacheReadInputTokens } : undefined);
    });
    if (values.every(value => value !== null)) {
      const total = values.reduce<Usage>((sum, value) => ({ input: sum.input + value!.input, cached: sum.cached + value!.cached, output: sum.output + value!.output }), { input: 0, cached: 0, output: 0 });
      if (Object.values(total).every(Number.isSafeInteger)) return total;
    }
  }
  return usageOf(result?.usage);
};

let messages = new Map<string, string>();
let tools = new Map<string, Event>();
let seen = new Set<string>();

export const claude: Adapter = {
  id: "claude",
  label: "Claude Code",
  writesReport: false,
  detect({ env, settings }) {
    try {
      const launcher = resolveLauncher(env, settings.path);
      const result = spawnSync(launcher.executable, [...launcher.args, "--version"], { env, encoding: "utf8", shell: false, windowsHide: true, timeout: 10000 });
      return { installed: !result.error && result.status === 0, version: result.status === 0 ? result.stdout.trim() || null : null, launcher };
    } catch (error) { return { installed: false, version: null, error: (error as Error).message }; }
  },
  command({ prompt, settings, detection, env }) {
    messages = new Map();
    tools = new Map();
    seen = new Set();
    const launcher = detection.launcher ?? resolveLauncher(env, settings.path);
    const args = [...launcher.args, "-p", "--output-format", "stream-json", "--verbose", "--no-session-persistence", "--strict-mcp-config", "--permission-prompts", "none"];
    if (settings.model !== null) args.push("--model", settings.model);
    if (settings.effort !== null) args.push("--effort", settings.effort);
    args.push(...this.permissions[settings.permission].args, ...this.isolationArgs());
    return { executable: launcher.executable, args, stdin: prompt };
  },
  isolationArgs() {
    return ["--settings", JSON.stringify({ skillOverrides: { "run-spec": "off", "setup-run-spec": "off" }, disableAllHooks: true, autoMemoryEnabled: false, useAutoModeDuringPlan: false })];
  },
  permissions: {
    "read-only": {
      args: ["--permission-mode", "plan", "--tools", "Read,Glob,Grep,Bash,Skill"],
      loss: "plan 与工具裁剪依赖 Claude 的只读命令判断，保留 git diff 等 Bash 读取；没有操作系统只读沙箱，不开放写文件、退出 plan 或子代理工具",
    },
    "workspace-write": {
      args: ["--permission-mode", "acceptEdits"],
      loss: "自动批准文件编辑，Bash 等操作仍受权限规则约束；没有仅限工作区的操作系统沙箱，非交互中需要确认的操作可能被拒绝",
    },
    full: {
      args: ["--permission-mode", "bypassPermissions"],
      loss: "跳过 Claude 权限确认，没有操作系统沙箱；宿主或托管策略仍可拒绝启用此模式",
    },
  },
  mapLine(line) {
    let event: Event;
    try { event = JSON.parse(line); } catch { return []; }
    if (!event || typeof event !== "object" || Array.isArray(event)) return [];
    if (typeof event.uuid === "string") {
      if (seen.has(event.uuid)) return [];
      seen.add(event.uuid);
    }
    const mapped: Event[] = [];
    if (event.type === "assistant") {
      const main = event.parent_tool_use_id == null;
      const id = event.message?.id;
      for (const block of Array.isArray(event.message?.content) ? event.message.content : []) {
        if (main && block.type === "text" && typeof block.text === "string" && typeof id === "string") {
          const text = (messages.get(id) ?? "") + block.text;
          messages.set(id, text);
          mapped.push({ kind: "say", text });
        } else if (main && block.type === "thinking" && block.thinking) mapped.push({ kind: "think", text: String(block.thinking) });
        else if (block.type === "tool_use" && typeof block.id === "string") {
          tools.set(block.id, block);
          mapped.push(block.name === "Bash"
            ? { kind: "cmd", id: block.id, phase: "start", command: String(block.input?.command ?? "") }
            : { kind: "tool", id: block.id, phase: "start", name: String(block.name), detail: `${block.name} ${JSON.stringify(block.input ?? {})}` });
        }
      }
    } else if (event.type === "user") {
      for (const block of Array.isArray(event.message?.content) ? event.message.content : []) {
        if (block.type !== "tool_result") continue;
        const tool = tools.get(block.tool_use_id);
        if (!tool) continue;
        tools.delete(block.tool_use_id);
        const output = limitOutput(toolText(block.content));
        if (tool.name === "Bash") mapped.push({ kind: "cmd", id: block.tool_use_id, phase: "end", command: String(tool.input?.command ?? ""), exit: block.is_error ? 1 : 0, ...output });
        else mapped.push({ kind: "tool", id: block.tool_use_id, phase: "end", name: tool.name, detail: `${tool.name} ${block.is_error ? "失败" : "完成"}`, ...output });
      }
    } else if (event.type === "result" && event.parent_tool_use_id == null) {
      if (event.is_error === true || event.subtype !== "success") mapped.push({ kind: "error", text: String(event.errors?.join("\n") || event.result || event.subtype || "Claude 未成功结束") });
      if (messages.size === 0 && typeof event.result === "string" && event.result) mapped.push({ kind: "say", text: event.result });
      const usage = resultUsage(event);
      mapped.push({ kind: "turn", usage: { input: usage?.input ?? null, output: usage?.output ?? null } });
    }
    return mapped;
  },
  outcome({ code, failed, events }) {
    const result = events.filter(event => event.type === "result" && event.parent_tool_use_id == null).at(-1);
    const responses = events.filter(event => event.type === "assistant" && event.parent_tool_use_id == null && typeof event.message?.id === "string");
    const usage = resultUsage(result);
    const model = responses.map(event => event.message.model).filter(value => typeof value === "string" && value !== "<synthetic>").at(-1);
    const models = result?.modelUsage && typeof result.modelUsage === "object" && !Array.isArray(result.modelUsage) ? Object.keys(result.modelUsage) : [];
    return {
      success: code === 0 && !failed && result?.subtype === "success" && result.is_error === false,
      usage,
      actualModel: model ?? (models.length === 1 ? models[0] : null),
      actualEffort: null,
    };
  },
};
