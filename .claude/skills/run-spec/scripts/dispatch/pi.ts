/**
 * pi 适配器：通过 JSON 模式和 stdin 派发，按完整消息记进度、用量与实际模型。
 * 技能从无模型 RPC 清单生成显式允许列表；只读保留 bash，不提供系统沙箱。
 * 会话保存到汇报同目录的 <记录名>.pi-sessions，用于核对实际推理强度。
 * TODO(design)：确认可写与完全权限也关闭扩展和 MCP，以阻止扩展重新注入技能。
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import type { Adapter, Detection, Event, Usage } from "./adapter.ts";

type Launcher = NonNullable<Detection["launcher"]>;
const blockedSkills = new Set(["run-spec", "setup-run-spec"]);
const tools = new Map<string, { name: string; args: Event }>();

function launcherFor(file: string): Launcher {
  if (!existsSync(file) || !statSync(file).isFile()) throw new Error(`找不到 pi CLI：${file}`);
  if (/\.(?:js|mjs|cjs)$/i.test(file)) return { executable: process.execPath, args: [file] };
  if (!/\.(?:cmd|bat)$/i.test(file)) return { executable: file, args: [] };
  const match = readFileSync(file, "utf8").match(/"%dp0%[\\/]([^"\r\n]+\.(?:js|mjs|cjs))"\s+%\*/i);
  if (match) return launcherFor(resolve(dirname(file), match[1]));
  throw new Error(`无法解析 pi 的启动包装：${file}；请在 agents.pi.path 配置可执行文件或 Node 入口的绝对路径`);
}

function resolveLauncher(env: NodeJS.ProcessEnv, configured: string | null): Launcher {
  if (configured) return launcherFor(configured);
  for (const directory of (env.PATH ?? env.Path ?? "").split(delimiter).filter(Boolean)) {
    for (const name of process.platform === "win32" ? ["pi.exe", "pi.cmd"] : ["pi"]) {
      const file = resolve(directory.replace(/^"|"$/g, ""), name);
      if (existsSync(file) && statSync(file).isFile()) return launcherFor(file);
    }
  }
  throw new Error("找不到 pi CLI；请确认 pi --version 能运行，或在 agents.pi.path 配置绝对路径");
}

function skillArgs(launcher: Launcher, root: string, env: NodeJS.ProcessEnv): string[] {
  const result = spawnSync(launcher.executable, [...launcher.args, "--mode", "rpc", "--no-session", "--no-extensions", "--no-mcp", "--offline", "--approve"], {
    cwd: root, env, input: '{"id":"run-spec-skills","type":"get_commands"}\n', encoding: "utf8", shell: false, windowsHide: true, timeout: 30000, maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error(`读取 pi 技能清单失败：${result.error?.message || result.stderr.trim() || `exit=${result.status}`}`);
  const responses = result.stdout.split("\n").flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
  const response = responses.find(row => row?.type === "response" && row.id === "run-spec-skills" && row.command === "get_commands");
  if (response?.success !== true || !Array.isArray(response.data?.commands)) throw new Error("pi 未返回有效的技能清单，拒绝在未隔离技能的情况下派发");
  const args: string[] = [];
  const paths = new Set<string>();
  for (const skill of response.data.commands.filter((item: Event) => item?.source === "skill")) {
    if (typeof skill.name !== "string" || !skill.name.startsWith("skill:") || typeof skill.sourceInfo?.path !== "string" || !isAbsolute(skill.sourceInfo.path) || !skill.sourceInfo.path.endsWith(".md")) throw new Error("pi 技能清单缺少名称或技能文件绝对路径");
    if (!blockedSkills.has(skill.name.slice(6)) && !paths.has(skill.sourceInfo.path)) {
      args.push("--skill", skill.sourceInfo.path);
      paths.add(skill.sourceInfo.path);
    }
  }
  return args;
}

const textContent = (content: unknown): string => Array.isArray(content)
  ? content.filter(block => block?.type === "text" && typeof block.text === "string").map(block => block.text).join("\n") : "";
const limited = (output: string) => {
  const text = Buffer.from(output.split("\n").slice(0, 200).join("\n")).subarray(0, 16384).toString("utf8").replace(/\uFFFD$/, "");
  return { output: text, truncated: text.length < output.length };
};
function usageFor(message: Event): Usage | null {
  const value = message.usage;
  if (!value || ![value.input, value.cacheRead, value.cacheWrite, value.output].every(count => Number.isSafeInteger(count) && count >= 0)) return null;
  const input = value.input + value.cacheRead + value.cacheWrite;
  return Number.isSafeInteger(input) ? { input, cached: value.cacheRead, output: value.output } : null;
}

function actualEffort(events: Event[], root: string, recordsRoot = root): string | null {
  const changed = events.filter(event => event.type === "thinking_level_changed" && typeof event.level === "string").at(-1);
  if (changed) return changed.level;
  const id = events.find(event => event.type === "session")?.id;
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]+$/.test(id)) return null;
  try {
    const runs = join(recordsRoot, ".codex-runs");
    for (const directory of readdirSync(runs, { withFileTypes: true })) {
      if (!directory.isDirectory() || !directory.name.endsWith(".pi-sessions")) continue;
      for (const file of readdirSync(join(runs, directory.name))) {
        if (!file.endsWith(`_${id}.jsonl`)) continue;
        const rows = readFileSync(join(runs, directory.name, file), "utf8").split("\n").flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
        if (!rows.some(row => row.type === "session" && row.id === id && typeof row.cwd === "string" && resolve(row.cwd) === resolve(root))) continue;
        const level = rows.filter(row => row.type === "thinking_level_change").at(-1)?.thinkingLevel;
        return typeof level === "string" ? level : null;
      }
    }
  } catch {}
  return null;
}

export const pi: Adapter = {
  id: "pi", label: "pi", writesReport: false,
  isConcurrencyLimit: () => false,
  detect({ env, settings }) {
    try {
      const launcher = resolveLauncher(env, settings.path);
      const result = spawnSync(launcher.executable, [...launcher.args, "--version"], { env, encoding: "utf8", shell: false, windowsHide: true, timeout: 10000 });
      return { installed: !result.error && result.status === 0, version: result.status === 0 ? result.stdout.trim() || null : null, launcher };
    } catch (error) { return { installed: false, version: null, error: (error as Error).message }; }
  },
  command({ root, report, prompt, settings, detection, env }) {
    const launcher = detection.launcher ?? resolveLauncher(env, settings.path);
    const sessions = report.replace(/\.md$/, "") + ".pi-sessions";
    const args = [...launcher.args, "--mode", "json", "--approve", "--session-dir", sessions];
    if (settings.model !== null) args.push("--model", settings.model);
    if (settings.effort !== null) args.push("--thinking", settings.effort);
    args.push(...this.permissions[settings.permission].args, ...this.isolationArgs(), ...skillArgs(launcher, root, env));
    mkdirSync(sessions, { recursive: true });
    tools.clear();
    return { executable: launcher.executable, args, stdin: settings.permission === "read-only" ? `${prompt}\n\n只读权限：只允许读取文件、运行 git diff 等不改文件的命令；禁止写文件、修改配置或执行会产生文件改动的测试。bash 不受系统沙箱约束，请严格遵守。` : prompt };
  },
  restrictedCommand({ prompt, settings, detection, env, tools: profile }) {
    const launcher = detection.launcher ?? resolveLauncher(env, settings.path);
    const args = [...launcher.args, "--mode", "json", "--approve", "--no-session", "--no-extensions", "--no-mcp"];
    if (settings.model !== null) args.push("--model", settings.model);
    if (settings.effort !== null) args.push("--thinking", settings.effort);
    args.push(...(profile === "files" ? ["--tools", "read,grep,find,ls"] : ["--no-tools"]));
    tools.clear();
    return { executable: launcher.executable, args, stdin: prompt };
  },
  isolationArgs: () => ["--no-skills"],
  permissions: {
    "read-only": { args: ["--tools", "read,grep,find,ls,bash", "--no-extensions", "--no-mcp"], loss: "pi 没有系统沙箱；关闭扩展和 MCP，移除 edit/write。为 git diff 和只读复测保留 bash，仍可通过 shell、子进程、网络等途径写文件，依靠任务说明约束。" },
    "workspace-write": { args: ["--no-extensions", "--no-mcp"], loss: "pi 没有工作区写入边界，默认工具可写工作区外文件；关闭扩展和 MCP，避免扩展重新注入已屏蔽技能。" },
    full: { args: ["--no-extensions", "--no-mcp"], loss: "pi 没有系统沙箱，使用默认工具；关闭扩展和 MCP，避免扩展重新注入已屏蔽技能。" },
  },
  mapLine(line) {
    let event;
    try { event = JSON.parse(line); } catch { return line.trim() ? [{ kind: "text", text: line }] : []; }
    if (!event || typeof event !== "object" || Array.isArray(event)) return [];
    if (event.type === "session") { tools.clear(); return []; }
    if (event.type === "message_end" && event.message?.role === "assistant") {
      const message = event.message;
      const mapped: Event[] = [];
      const thinking = Array.isArray(message.content) ? message.content.filter((block: Event) => block.type === "thinking" && typeof block.thinking === "string").map((block: Event) => block.thinking).join("\n") : "";
      if (thinking) mapped.push({ kind: "think", text: thinking });
      const text = textContent(message.content);
      if (text) mapped.push({ kind: "say", text });
      const usage = usageFor(message);
      mapped.push({ kind: "turn", usage: { input: usage?.input ?? null, output: usage?.output ?? null } });
      if (["error", "aborted", "length"].includes(message.stopReason)) mapped.push({ kind: "error", text: message.errorMessage || `pi 消息未正常完成：${message.stopReason}` });
      return mapped;
    }
    if (event.type === "tool_execution_start") {
      const id = String(event.toolCallId ?? "");
      const name = String(event.toolName ?? "");
      const args = event.args ?? {};
      tools.set(id, { name, args });
      return [name === "bash" ? { kind: "cmd", id, phase: "start", command: String(args.command ?? "") }
        : { kind: "tool", id, phase: "start", name, detail: `${name} ${JSON.stringify(args)}` }];
    }
    if (event.type === "tool_execution_end") {
      const id = String(event.toolCallId ?? "");
      const call = tools.get(id);
      tools.delete(id);
      const name = call?.name ?? String(event.toolName ?? "");
      const output = limited(textContent(event.result?.content));
      return [name === "bash" ? { kind: "cmd", id, phase: "end", command: String(call?.args.command ?? ""), exit: Number.isInteger(event.result?.structuredContent?.exit_code) ? event.result.structuredContent.exit_code : null, isError: event.isError === true, ...output }
        : { kind: "tool", id, phase: "end", name, detail: `${name}${event.isError ? " 失败" : " 完成"}`, isError: event.isError === true, ...output }];
    }
    if (event.type === "agent_settled") return [{ kind: event.aborted ? "error" : "text", text: event.aborted ? "pi 任务已中止" : "pi 已完成全部自动工作" }];
    if (event.type === "error" || (event.type === "auto_retry_end" && event.success === false)) return [{ kind: "error", text: String(event.finalError ?? event.message ?? event.error ?? "pi 运行失败") }];
    return [];
  },
  outcome({ code, failed, events, root, recordsRoot }) {
    const messages = events.filter(event => event.type === "message_end" && event.message?.role === "assistant").map(event => event.message);
    const usage = messages.map(usageFor);
    const totals = usage.reduce<Usage>((total, value) => ({ input: total.input + (value?.input ?? 0), cached: total.cached + (value?.cached ?? 0), output: total.output + (value?.output ?? 0) }), { input: 0, cached: 0, output: 0 });
    const last = messages.at(-1);
    const settled = events.reduce((index, event, current) => event.type === "agent_settled" ? current : index, -1);
    const activity = events.reduce((index, event, current) => event.type !== "agent_settled" && /^(?:agent_|turn_|message_|tool_execution_|auto_retry_|compaction_)/.test(event.type) ? current : index, -1);
    const recovered = events.reduce((index, event, current) => event.type === "auto_retry_end" && event.success === true ? current : index, -1);
    return {
      success: code === 0 && !failed && settled > activity && events[settled]?.aborted === false && last?.stopReason === "stop" && !events.slice(recovered + 1).some(event => event.type === "error" || (event.type === "auto_retry_end" && event.success === false)),
      usage: usage.length > 0 && usage.every(value => value !== null) && Object.values(totals).every(Number.isSafeInteger) ? totals : null,
      actualModel: typeof last?.provider === "string" && typeof last.model === "string" ? `${last.provider}/${last.model}` : null,
      actualEffort: typeof last?.thinkingLevel === "string" ? last.thinkingLevel : actualEffort(events, root, recordsRoot),
    };
  },
};
