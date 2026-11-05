/**
 * 内置派发生命周期，移植自 LBEILC/DispatchDock v0.1.3 lib/run.mjs。
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
 * 保留 stdin、原始日志、统一事件、进度和 v1 全局登记；不接管窗口或托管服务。
 * 成败与用量由适配器给出，保存为同名 .json 和登记的 end 字段。
 * 外部信号只登记 interrupted，不伪造 end；仍存活的 agent 继续占名额。
 */
import { spawn } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
import { relative, resolve, join } from "node:path";
import { createInterface } from "node:readline";
import { dispatchHome } from "../dispatchdock.ts";
import type { Adapter, Event, SeatSettings } from "./adapter.ts";
import { agentNames, describeSeat, loadSeatConfiguration, resolveSeat, seatNames } from "./settings.ts";
import { adapterFor } from "./adapters.ts";
import { clip, formatProgress, parseArgs, progressFooter, progressHeader, recordPaths, registryWriter, taskDetails } from "./protocol.ts";

export const settingsFor = (opts: Record<string, string>, root = process.cwd()): SeatSettings => {
  if (opts.settings !== undefined) {
    let value;
    try { value = JSON.parse(opts.settings); } catch { throw new Error("内部参数 --settings 必须是有效的席位 JSON 对象"); }
    if (!value || !seatNames.includes(value.seat) || !agentNames.includes(value.agent) || typeof value.workType !== "string" || !value.workType || !["read-only", "workspace-write", "full"].includes(value.permission) || !["model", "effort", "path", "tier"].every(key => value[key] === null || typeof value[key] === "string"))
      throw new Error("内部参数 --settings 缺少有效的席位、工作类型、框架、模型、强度、权限或路径");
    return value as SeatSettings;
  }
  const permission = opts.permission ?? (opts.sandbox === "danger-full-access" ? "full" : opts.sandbox);
  const settings = resolveSeat(loadSeatConfiguration(root), opts.seat, opts["work-type"], { ...opts, ...(permission ? { permission } : {}) });
  if (settings.length !== 1) throw new Error("本入口只启动一个席位配置；review 列表由审查命令逐项启动");
  return settings[0];
};

export const run = async (args: string[], root = process.cwd()): Promise<number> => {
  const parsed = parseArgs(args);
  const details = taskDetails(root, parsed);
  const dryRun = Boolean(process.env.CODEX_DRY_RUN);
  const settings = settingsFor(parsed.opts, root);
  if (dryRun) {
    console.log(describeSeat(settings));
    if (!adapterAvailable(settings.agent)) console.log(`提示：框架 ${settings.agent} 尚未接入适配器，当前不可用`);
  }
  const adapter = dryRun ? null : adapterFor(settings.agent);
  const started = Date.now();
  const paths = recordPaths(root, details.name, progressHeader(details.title, details.role?.name, started, adapter?.label ?? settings.agent), dryRun);
  if (dryRun) {
    console.log(`记录名：${paths.name}\n----\n${details.prompt}`);
    return 0;
  }
  console.log(`记录名：${paths.name}\n进度：${paths.progress}`);
  return runPrepared(adapter!, settings, parsed, details, paths, started, root);
};

const adapterAvailable = (agent: string): boolean => {
  try { adapterFor(agent); return true; } catch { return false; }
};

const runPrepared = async (adapter: Adapter, settings: SeatSettings, parsed: ReturnType<typeof parseArgs>, details: ReturnType<typeof taskDetails>, paths: ReturnType<typeof recordPaths>, started: number, root: string): Promise<number> => {
  const registry = registryWriter(dispatchHome());
  writeFileSync(paths.raw, "");
  writeFileSync(paths.events, "");
  const interactive = Boolean(process.stdout.isTTY);
  const progress = (text: string, at = Date.now()) => {
    const line = `[${new Date(at).toLocaleTimeString("zh-CN", { hour12: false })}] ${text}`;
    appendFileSync(paths.progress, `${line}\n`);
    if (interactive) console.log(line);
  };
  const id = `${paths.name}-${started}-${process.pid}`;
  const detection = await adapter.detect({ env: process.env, settings });
  const metadata = { seat: settings.seat, workType: settings.workType, agent: adapter.id, framework: adapter.id, model: settings.model, effort: settings.effort, permission: settings.permission, sources: settings.sources, fallbackReason: settings.fallbackReason };
  registry({ event: "start", id, repo: root, name: paths.name, spec: details.spec ? relative(root, resolve(root, details.spec)).replaceAll("\\", "/") : null,
    title: details.title, role: details.role?.name ?? null, pid: process.pid, started,
    progress: paths.progress, report: paths.report, raw: paths.raw, ...metadata,
    tier: settings.tier, sandbox: adapter.permissions[settings.permission].args.at(-1), agentVersion: detection.version, events: paths.events,
    dispatcher: { host: parsed.opts.host ?? (process.env.CLAUDECODE === "1" ? "claude-code" : "unknown"), session: process.env.CLAUDE_CODE_SESSION_ID ?? null },
  });
  let seq = 0;
  let lastSay: string | null = null;
  const errors: string[] = [];
  const rawEvents: Event[] = [];
  const emit = (event: Event, at = Date.now()) => {
    const unified = { ...event, v: 1, seq: ++seq, at };
    appendFileSync(paths.events, `${JSON.stringify(unified)}\n`);
    if (event.kind === "say") lastSay = event.text;
    if (event.kind === "error") errors.push(event.text);
    for (const line of formatProgress(unified)) progress(line, at);
  };
  const finish = (code: number | null, failed = false): number => {
    if (!adapter.writesReport && lastSay !== null) writeFileSync(paths.report, lastSay);
    const outcome = adapter.outcome({ code, failed, events: rawEvents, settings, root });
    const exit = outcome.success ? 0 : code === 0 || code === null ? 1 : code;
    const minutes = ((Date.now() - started) / 60000).toFixed(1);
    const summary = { v: 1, id, name: paths.name, ...metadata, ...outcome, exit, processExit: code, started, at: Date.now(), minutes: Number(minutes) };
    writeFileSync(join(root, ".codex-runs", `${paths.name}.json`), JSON.stringify(summary, null, 2) + "\n");
    appendFileSync(paths.progress, progressFooter(exit, minutes, paths.report, adapter.label));
    registry({ ...summary, event: "end" });
    if (exit !== 0 && !interactive) for (const text of errors) console.log(`出错：${clip(text)}`);
    console.log(`exit=${exit} report=${paths.report}`);
    return exit;
  };
  let command;
  try {
    if (!detection.installed) throw new Error(detection.error ?? `找不到可用的 ${adapter.label} CLI`);
    command = adapter.command({ root, report: paths.report, prompt: details.prompt, settings, detection, env: process.env });
  } catch (error) {
    emit({ kind: "error", text: `启动 ${adapter.label} 失败：${(error as Error).message}` });
    return finish(2, true);
  }
  return await new Promise<number>((complete) => {
    const child = spawn(command.executable, command.args, { cwd: root, env: process.env, stdio: ["pipe", "pipe", "pipe"], shell: false, windowsHide: true });
    registry({ event: "spawned", id, codexPid: adapter.id === "codex" ? child.pid ?? null : undefined, agentPid: child.pid ?? null, at: Date.now() });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    createInterface({ input: child.stdout }).on("line", line => {
      const at = Date.now();
      let event;
      try { event = JSON.parse(line); } catch {}
      if (event && typeof event === "object" && !Array.isArray(event)) rawEvents.push(event);
      appendFileSync(paths.raw, `${event && typeof event === "object" && !Array.isArray(event) ? JSON.stringify({ ...event, _at: at }) : line}\n`);
      for (const mapped of adapter.mapLine(line, { root })) emit(mapped, at);
    });
    let stderr = "";
    child.stderr.on("data", chunk => { appendFileSync(paths.raw, chunk); stderr = (stderr + chunk).slice(-4096); });
    let failed = false;
    child.on("error", error => { failed = true; emit({ kind: "error", text: `启动 ${adapter.label} 失败：${error.message}` }); });
    child.stdin.on("error", (error: NodeJS.ErrnoException) => { if (error.code !== "EPIPE") { failed = true; emit({ kind: "error", text: error.message }); } });
    const signals = ["SIGINT", "SIGTERM", "SIGBREAK", "SIGHUP"] as const;
    const handlers = signals.map(signal => {
      const handler = () => {
        appendFileSync(paths.progress, `\n=== 派发脚本收到 ${signal}，被外部中断 ===\n`);
        registry({ event: "interrupted", id, signal, at: Date.now() });
        process.exit(1);
      };
      process.on(signal, handler);
      return { signal, handler };
    });
    child.stdin.end(command.stdin, "utf8");
    child.on("close", code => {
      for (const { signal, handler } of handlers) process.off(signal, handler);
      if (!failed && code !== 0) {
        const tail = stderr.split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(-5).join("\n");
        if (tail) emit({ kind: "error", text: tail });
        const hint = tail && adapter.failureHint?.(stderr);
        if (hint) emit({ kind: "error", text: hint });
      }
      complete(finish(failed ? 2 : code, failed));
    });
  });
};
