/**
 * Antigravity CLI 适配器：NDJSON stdin 任务、流式进度、最终结果及会话定位。
 * 在当前检出内创建短命的完整技能副本和排除清单，并验证实际可见集；
 * 启动桥仅改变发现起点，任务仍使用原仓库绝对路径，不修改共享 .agents。
 * 只读采用非破坏命令允许列表和写工具拒绝规则，没有操作系统只读沙箱。
 * 中途瞬时 API 错误若经后续 DONE 回复步恢复且终态带非空响应，只记过程并判成功。
 * 普通工具错误按工具结束记录供模型自行处理；命中权限拒绝规则的工具错误与 denied_actions 一律判失败。
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import type { Adapter, Detection, Event, Usage } from "./adapter.ts";
import { limitOutput } from "./codex.ts";

type Launcher = NonNullable<Detection["launcher"]>;
const blocked = ["run-spec", "setup-run-spec"];
const permissionPath = (path: string) => path.replace(/\\/g, "/").replace(/^[A-Za-z]:/, "");
const skillDeny = (root = "") => blocked.flatMap(name => [".agents", ".claude"].flatMap(directory => {
  const path = `${directory}/skills/${name}/SKILL.md`;
  return [`read_file(${path})`, ...(root ? [`read_file(${permissionPath(`${root}/${path}`)})`] : [])];
}));
const isolationSettings = { permissions: { allow: [] as string[], deny: skillDeny() } };
const commandArguments = "(?:\\s+[^;&|<>\\r\\n`$]*)?";
const readOnlyCommands = [
  "git(?:\\.exe)? (?:diff|status|show|log|merge-base|rev-parse|branch|ls-files|blame|cat-file)",
  "gh(?:\\.exe)? (?:issue|pr) (?:view|list|diff|status)",
  "gh(?:\\.exe)? api --method GET",
  "(?:rg|grep|find|ls|pwd|cat|head|tail|wc|stat|jq)(?:\\.exe)?",
].map(pattern => `command(regex:^${pattern}${commandArguments}$)`);
const permissionSettings = (readOnly: boolean) => ({
  toolPermission: "request-review", allowNonWorkspaceAccess: false,
  permissions: {
    allow: readOnly ? readOnlyCommands : ["command(*)"],
    deny: [...skillDeny(), ...(readOnly ? ["write_file(*)"] : []), "mcp(*)", "execute_url(*)"],
  },
});

function launcherFor(file: string): Launcher {
  if (!existsSync(file) || !statSync(file).isFile()) throw new Error(`找不到 agy CLI：${file}`);
  if (/\.(?:js|mjs|cjs)$/i.test(file)) return { executable: process.execPath, args: [file] };
  if (!/\.(?:cmd|bat)$/i.test(file)) return { executable: file, args: [] };
  const match = readFileSync(file, "utf8").match(/"%dp0%[\\/]([^"\r\n]+\.(?:js|mjs|cjs))"\s+%\*/i);
  if (match) return launcherFor(resolve(dirname(file), match[1]));
  throw new Error(`无法解析 agy 启动包装：${file}；请在 agents.agy.path 配置可执行文件或 Node 入口的绝对路径`);
}
function resolveLauncher(env: NodeJS.ProcessEnv, configured: string | null): Launcher {
  if (configured) return launcherFor(configured);
  for (const directory of (env.PATH ?? env.Path ?? "").split(delimiter).filter(Boolean)) {
    for (const name of process.platform === "win32" ? ["agy.exe", "agy.cmd"] : ["agy"]) {
      const file = resolve(directory.replace(/^"|"$/g, ""), name);
      if (existsSync(file) && statSync(file).isFile()) return launcherFor(file);
    }
  }
  throw new Error("找不到 agy CLI；请确认 agy --version 能运行，或配置 agents.agy.path");
}
const usageOf = (value: Event | undefined): Usage | null => {
  if (!value || ![value.input_tokens, value.cache_read_tokens, value.output_tokens].every(count => Number.isSafeInteger(count) && count >= 0)) return null;
  const input = value.input_tokens + value.cache_read_tokens;
  return Number.isSafeInteger(input) ? { input, cached: value.cache_read_tokens, output: value.output_tokens } : null;
};
const transcriptFor = (id: unknown): string | null => typeof id === "string" && /^[A-Za-z0-9_-]+$/.test(id)
  ? join(homedir(), ".gemini/antigravity-cli/brain", id, ".system_generated/logs/transcript.jsonl") : null;
function actualSettings(events: Event[]): { model: string | null; effort: string | null; sessionId: string | null; sessionPath: string | null } {
  const sessionId = events.find(event => event.event === "init")?.conversation_id;
  const sessionPath = transcriptFor(sessionId);
  let model: string | null = null;
  let effort: string | null = null;
  if (sessionPath) {
    try {
      const rows = readFileSync(sessionPath, "utf8").split("\n").flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
      const response = rows.filter(row => row.source === "MODEL" && typeof row.model === "string").at(-1);
      model = response?.model ?? null;
      effort = typeof response?.effort === "string" ? response.effort : model?.match(/-(low|medium|high|xhigh|max)$/)?.[1] ?? null;
    } catch {}
  }
  const response = events.filter(event => event.event === "step_update" && event.step_update?.step_type === "agent_response").at(-1)?.step_update;
  const result = events.filter(event => event.event === "result").at(-1)?.result;
  return { model: response?.model ?? result?.model ?? model, effort: response?.effort ?? result?.effort ?? effort, sessionId: sessionPath ? sessionId : null, sessionPath };
}
const toolErrorMessage = (step: Event | null | undefined): string => {
  const error = step?.tool_info?.error;
  return String((typeof error === "string" ? error : error?.message) ?? step?.error ?? "");
};
const isDeniedToolStep = (step: Event | null | undefined): boolean =>
  step?.step_type === "tool"
  && /permission check failed|Permission denied for [A-Za-z0-9_]+\(|Matches user-configured deny rule/i.test(toolErrorMessage(step));
const isErrorStep = (step: Event | null | undefined): boolean =>
  step?.step_type === "error_message" || step?.step_type === "error"
  || (step?.state === "ERROR" && step?.step_type !== "tool");
const isRecoveredApiResult = (result: Event | undefined): boolean =>
  !result?.denied_actions?.length
  && typeof result?.response === "string" && result.response.trim().length > 0
  && /^API error \(attempt \d+\):/i.test(String(result?.error ?? ""));
const texts = new Map<number, string>();
let topError = false, deniedTool = false, hadStepError = false, recoveredStep = false, lastStepError = false;
const resetStream = () => {
  texts.clear();
  topError = false;
  deniedTool = false;
  hadStepError = false;
  recoveredStep = false;
  lastStepError = false;
};

export const agy: Adapter = {
  id: "agy", label: "Antigravity CLI", writesReport: false,
  isConcurrencyLimit: output => /concurrency limit|too many (?:concurrent |simultaneous )?requests|rate[ _-]?limit|RESOURCE_EXHAUSTED|\b429\b/i.test(output) && !/quota.{0,40}(?:exhausted|exceeded)|daily.{0,30}limit/i.test(output),
  detect({ env, settings }) {
    try {
      const launcher = resolveLauncher(env, settings.path);
      const result = spawnSync(launcher.executable, [...launcher.args, "--version"], { env, encoding: "utf8", shell: false, windowsHide: true, timeout: 10000 });
      return { installed: !result.error && result.status === 0, version: result.status === 0 ? result.stdout.trim() || null : null, launcher };
    } catch (error) { return { installed: false, version: null, error: (error as Error).message }; }
  },
  command({ root, prompt, settings, detection, env }) {
    resetStream();
    const launcher = detection.launcher ?? resolveLauncher(env, settings.path);
    const parent = join(root, ".codex-runs");
    mkdirSync(parent, { recursive: true });
    const directory = mkdtempSync(join(parent, "agy-isolation-"));
    try {
      mkdirSync(join(directory, ".agents/skills"), { recursive: true });
      const skills = join(root, ".agents/skills");
      const expected: string[] = [];
      if (existsSync(skills)) for (const name of readdirSync(skills)) {
        const source = join(skills, name);
        const file = join(source, "SKILL.md");
        if (!existsSync(file) || !statSync(file).isFile()) continue;
        const skillName = readFileSync(file, "utf8").match(/^name:\s*['"]?([a-z0-9-]+)['"]?\s*$/m)?.[1];
        if (blocked.includes(name) || skillName && blocked.includes(skillName)) continue;
        cpSync(realpathSync(source), join(directory, ".agents/skills", name), { recursive: true, dereference: true });
        if (skillName) expected.push(skillName);
      }
      writeFileSync(join(directory, ".agents/skills.json"), JSON.stringify({ exclude: blocked }));
      const permission = [...this.permissions[settings.permission].args];
      const settingsIndex = permission.indexOf("--settings");
      const value = JSON.parse(permission[settingsIndex + 1]);
      const normRoot = permissionPath(root);
      value.permissions.allow.push(`read_file(${normRoot})`);
      if (settings.permission === "workspace-write") value.permissions.allow.push(`write_file(${normRoot})`);
      value.permissions.deny = [...new Set([...value.permissions.deny, ...skillDeny(root)])];
      permission[settingsIndex + 1] = JSON.stringify(value);
      const args = [...launcher.args, "--add-dir", root, ...permission];
      const probe = spawnSync(launcher.executable, [...args, "--output-format", "json", "-p", "/skills"], { cwd: directory, env, encoding: "utf8", shell: false, windowsHide: true, timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
      let result;
      try { result = JSON.parse(probe.stdout); } catch {}
      const visible = result?.command?.data?.skills;
      if (probe.error || probe.status !== 0 || result?.status !== "SUCCESS" || !Array.isArray(visible) || visible.some((skill: Event) => typeof skill.name !== "string" || blocked.includes(skill.name)) || expected.some(name => !visible.some((skill: Event) => skill.name === name))) throw new Error("agy 未返回保留其余技能且屏蔽 run-spec、setup-run-spec 的有效技能清单，拒绝派发");
      writeFileSync(join(directory, "visible-skills.json"), JSON.stringify(visible.map((skill: Event) => skill.name)));
      if (settings.model !== null) args.push("--model", settings.model);
      if (settings.effort !== null) args.push("--effort", settings.effort);
      args.push("--input-format", "stream-json", "--output-format", "stream-json");
      const instruction = `\n\n任务仓库根目录：${root}。当前目录仅用于技能隔离；所有仓库读取、git 命令和编辑均使用上述根目录的绝对路径。禁止读取两项流程技能的 SKILL.md 或调用 run-spec、setup-run-spec 技能。`;
      const readOnly = settings.permission === "read-only" ? "\n只读权限：只允许读取和非破坏命令；禁止写文件、改配置、提交、派发子代理或执行会生成缓存和报告的测试。没有操作系统只读沙箱，shell、子进程和网络仍须遵守此约束。" : "";
      return { executable: process.execPath, args: [join(import.meta.dirname, "agy-launch.ts"), directory, launcher.executable, ...args], stdin: JSON.stringify({ event: "user", message: { content: prompt + instruction + readOnly } }) + "\n" };
    } catch (error) { rmSync(directory, { recursive: true, force: true }); throw error; }
  },
  isolationArgs: () => ["--settings", JSON.stringify(isolationSettings)],
  permissions: {
    "read-only": { args: ["--mode", "accept-edits", "--settings", JSON.stringify(permissionSettings(true))], loss: "agy 没有操作系统只读沙箱；拒绝写文件工具、MCP 和浏览器执行，以跨平台命令正则自动批准所列审查与调研命令并附只读任务约束。正则限制命令前缀及整行匹配时的 shell 连接符，不验证全部参数；find、git、jq 等参数、子进程、原生子代理/工作流、网络下载和 CLI 缓存/会话仍可能写文件；allowNonWorkspaceAccess:false 不是系统边界。" },
    "workspace-write": { args: ["--mode", "accept-edits", "--settings", JSON.stringify(permissionSettings(false))], loss: "agy 无头可写档显式放行仓库根 read_file、write_file 与 command(*)，以执行测试、静态检查和 git add/commit；拒绝 MCP 和浏览器执行。allowNonWorkspaceAccess:false 没有操作系统工作区边界，shell 和子进程仍可写工作区外。" },
    full: { args: ["--dangerously-skip-permissions", "--settings", JSON.stringify(isolationSettings)], loss: "agy 跳过权限确认，没有操作系统沙箱；技能排除及显式拒绝规则仍保留。" },
  },
  mapLine(line) {
    let event: Event;
    try { event = JSON.parse(line); } catch { return []; }
    if (!event || typeof event !== "object") return [];
    if (event.event === "dispatch") return [{ kind: "text", text: `agy 可用技能：${event.skills.join("、")}`, argv: event.argv, cwd: event.cwd, skills: event.skills }];
    if (event.event === "init") {
      resetStream();
      const path = transcriptFor(event.conversation_id);
      return path ? [{ kind: "text", text: `agy 会话：${event.conversation_id}；记录：${path}`, session: event.conversation_id, transcript: path }] : [];
    }
    if (event.event === "result") {
      const result = event.result ?? {};
      const usage = usageOf(result.usage);
      const recovered = !topError && !deniedTool && hadStepError && recoveredStep && !lastStepError && isRecoveredApiResult(result);
      return [...(typeof result.response === "string" && result.response ? [{ kind: "say", text: result.response }] : []),
        ...(recovered ? [{ kind: "text", text: `agy 中途瞬时错误已自动恢复：${result.error}` }]
          : result.status !== "SUCCESS" || result.error || result.denied_actions?.length ? [{ kind: "error", text: String(result.error || (result.denied_actions?.length ? `agy 权限拒绝：${JSON.stringify(result.denied_actions)}` : `agy 未正常完成：${result.status ?? "缺少状态"}`)) }] : []),
        { kind: "turn", usage: { input: usage?.input ?? null, output: usage?.output ?? null } }];
    }
    if (event.event === "error") {
      topError = true;
      return [{ kind: "error", text: String(event.error ?? event.message ?? "agy 运行失败") }];
    }
    const step = event.event === "step_update" && event.step_update && typeof event.step_update === "object" ? event.step_update : null;
    if (!step) return [];
    if (isDeniedToolStep(step)) {
      deniedTool = true;
      return [{ kind: "error", text: `agy 权限拒绝：${toolErrorMessage(step)}` }];
    }
    if (isErrorStep(step)) {
      hadStepError = true;
      recoveredStep = false;
      lastStepError = true;
    } else {
      lastStepError = false;
      if (hadStepError && step.step_type === "agent_response" && step.state === "DONE") recoveredStep = true;
    }
    if (step.step_type === "agent_response" && typeof step.text_delta === "string") {
      const text = (texts.get(step.step_index) ?? "") + step.text_delta;
      texts.set(step.step_index, text);
      return [{ kind: "say", text }];
    }
    if (step.step_type === "error" || (step.state === "ERROR" && step.step_type !== "tool")) {
      return [{ kind: "error", text: String(step.error ?? step.text_delta ?? "agy 模型运行失败") }];
    }
    if (step.tool_info) {
      const tool = step.tool_info;
      const output = tool.output !== undefined && tool.output !== null && tool.output !== ""
        ? tool.output
        : (typeof tool.error === "string" ? tool.error : tool.error?.message) ?? "";
      return [{ kind: "tool", id: String(step.step_index), phase: step.state === "DONE" || step.state === "ERROR" ? "end" : "start", name: String(tool.name ?? step.tool_name ?? "工具"), detail: `${tool.name ?? step.tool_name} ${JSON.stringify(tool.parameters ?? {})}`, ...limitOutput(String(output)) }];
    }
    return [];
  },
  outcome({ code, failed, events }) {
    const index = events.reduce((last, event, current) => event.event === "result" ? current : last, -1);
    const result = index >= 0 ? events[index]?.result : undefined;
    const steps = index >= 0 ? events.slice(0, index).flatMap(event => event.event === "step_update" && event.step_update && typeof event.step_update === "object" ? [event.step_update] : []) : [];
    const denied = Boolean(result?.denied_actions?.length) || steps.some(isDeniedToolStep);
    const lastError = steps.reduce((found, step, current) => isErrorStep(step) ? current : found, -1);
    const clean = result?.status === "SUCCESS" && !result.error && lastError === -1;
    const recovered = lastError >= 0
      && steps.slice(lastError + 1).some(step => step.step_type === "agent_response" && step.state === "DONE")
      && !isErrorStep(steps.at(-1))
      && isRecoveredApiResult(result);
    const actual = actualSettings(events);
    return {
      success: code === 0 && !failed && index >= 0 && !denied
        && !events.some(event => event.event === "error")
        && !events.slice(index + 1).some(event => event.event === "step_update" || event.event === "init")
        && (clean || recovered),
      usage: usageOf(result?.usage),
      actualModel: actual.model, actualEffort: actual.effort,
      sessionId: actual.sessionId, sessionPath: actual.sessionPath,
    };
  },
};
