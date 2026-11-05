/**
 * Codex 检测、数组启动、事件映射、成败与用量；读取匹配会话补足实际模型和强度。
 * 移植自 LBEILC/DispatchDock v0.1.3；许可原文见同目录 LICENSE。
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
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { delimiter, dirname, relative, resolve, join } from 'node:path';

import { homedir } from 'node:os';
import type { Adapter, Event } from './adapter.ts';

const missing = '找不到 Codex CLI。确认 codex --version 能运行；非标准安装可在 config.json 的 agents.codex.path 写 Codex 的绝对路径。';
function launcherFor(file: string) {
  if (!existsSync(file) || !statSync(file).isFile()) throw new Error(missing);
  if (/\.(js|mjs|cjs)$/i.test(file)) return { executable: process.execPath, args: [file] };
  if (!/\.(cmd|bat)$/i.test(file)) return { executable: file, args: [] };
  const wrapper = readFileSync(file, 'utf8');
  const match = wrapper.match(/"%dp0%[\\/]([^"\r\n]+\.(?:js|mjs|cjs))"\s+%\*/i);
  const entry = match && resolve(dirname(file), match[1]);
  if (entry && existsSync(entry) && statSync(entry).isFile()) return { executable: process.execPath, args: [entry] };
  throw new Error(`无法解析 Codex 的启动包装：${file}。可在 config.json 的 agents.codex.path 写 codex.exe 或 Codex 的 Node 入口（codex.js）的绝对路径。`);
}
export function resolveLauncher(env = process.env, platform = process.platform, configuredPath: string | null = null) {
  if (configuredPath) return launcherFor(configuredPath);
  if (env.CODEX_DISPATCH_TEST_AGENT) return { executable: process.execPath, args: [resolve(env.CODEX_DISPATCH_TEST_AGENT)] };
  const names = platform === 'win32' ? ['codex.exe', 'codex.cmd'] : ['codex'];
  for (const dir of (env.PATH ?? env.Path ?? '').split(delimiter).filter(Boolean)) {
    for (const name of names) {
      const file = resolve(dir.replace(/^"|"$/g, ''), name);
      if (existsSync(file) && statSync(file).isFile()) return launcherFor(file);
    }
  }
  throw new Error(missing);
}

export function shortCommand(s: string) {
  const m = s.match(/^(?:"[^"]*powershell(?:\.exe)?"|(?:\S*[\\/])?powershell(?:\.exe)?)\s+(?:-\w+\s+)*-Command\s+(['"])([\s\S]*)\1$/i);
  return m ? m[2].replace(m[1] === "'" ? /''/g : /`"/g, m[1]) : s;
}

export function limitOutput(output: string) {
  const bytes = Buffer.from(output.split('\n').slice(0, 200).join('\n'));
  const limited = bytes.subarray(0, 16384).toString('utf8').replace(/\uFFFD$/, '');
  return { output: limited, truncated: limited.length < output.length };
}

export function mapLine(line: string, { root }: { root: string }) {
  let e;
  try { e = JSON.parse(line); } catch { return line.trim() ? [{ kind: 'text', text: line }] : []; }
  if (!e || typeof e !== 'object' || Array.isArray(e)) return [];
  if (e.type === 'turn.completed') return [{ kind: 'turn', usage: { input: e.usage?.input_tokens ?? null, output: e.usage?.output_tokens ?? null } }];
  if (e.type === 'turn.failed' || e.type === 'error') return [{ kind: 'error', text: String(e.error?.message ?? e.message ?? JSON.stringify(e)) }];
  const i = e.item;
  if (!i || !['item.started', 'item.updated', 'item.completed'].includes(e.type)) return [];
  const done = e.type === 'item.completed';
  switch (i.type) {
    case 'agent_message': return done ? [{ kind: 'say', text: String(i.text ?? '') }] : [];
    case 'reasoning': return done && i.text ? [{ kind: 'think', text: String(i.text) }] : [];
    case 'command_execution': {
      const event: Event = { kind: 'cmd', id: String(i.id ?? ''), phase: done ? 'end' : 'start', command: shortCommand(String(i.command ?? '')) };
      if (done) Object.assign(event, { exit: typeof i.exit_code === 'number' ? i.exit_code : null }, limitOutput(String(i.aggregated_output ?? i.output ?? '')));
      return [event];
    }
    case 'file_change': return done ? [{ kind: 'file', files: (Array.isArray(i.changes) ? i.changes : [])
      .filter((f: Event) => typeof f?.path === 'string').map((f: Event) => ({ kind: ['add', 'update', 'delete'].includes(f.kind) ? f.kind : 'update', path: relative(root, resolve(root, f.path)).replaceAll('\\', '/') })) }] : [];
    case 'todo_list': return [{ kind: 'plan', items: (Array.isArray(i.items) ? i.items : []).map((t: Event) => ({ text: String(t?.text ?? ''), done: t?.completed === true })) }];
    case 'web_search': return done ? [] : [{ kind: 'tool', name: 'web_search', detail: String(i.query ?? '') }];
    case 'mcp_tool_call': return done ? [] : [{ kind: 'tool', name: 'mcp_tool_call', detail: `${i.server ?? ''} ${i.tool ?? ''}` }];
    case 'error': return /unrecognized configuration/.test(i.message ?? '') ? [] : [{ kind: 'error', text: String(i.message ?? '') }];
    default: return [];
  }
}

export const codex: Adapter = {
  label: "Codex",
  id: 'codex',
  writesReport: true,
  detect({ env, settings }) {
    try {
      const launcher = resolveLauncher(env, process.platform, settings.path);
      const result = spawnSync(launcher.executable, [...launcher.args, '--version'], { env, encoding: 'utf8', shell: false, windowsHide: true, timeout: 10000 });
      return { installed: !result.error && result.status === 0, version: result.status === 0 ? result.stdout.trim() || null : null, launcher };
    } catch (error) { return { installed: false, version: null, error: (error as Error).message }; }
  },
  command({ root, report, prompt, settings, detection, env = process.env }) {
    const launcher = detection?.launcher ?? resolveLauncher(env, process.platform, settings.path);
    const args = [...launcher.args, 'exec', '--json', '-C', root];
    if (settings.model != null) args.push('-m', settings.model);
    if (settings.effort != null) args.push('-c', `model_reasoning_effort=${JSON.stringify(settings.effort)}`);
    if (settings.tier != null) args.push('-c', `service_tier=${JSON.stringify(settings.tier)}`);
    args.push(...this.permissions[settings.permission].args, ...this.isolationArgs());
    args.push('-o', report, '-');
    return { executable: launcher.executable, args, stdin: prompt };
  },
  mapLine,
  isolationArgs() {
    return ['-c', 'skills.config=[{name="run-spec",enabled=false},{name="setup-run-spec",enabled=false}]'];
  },
  permissions: {
    "read-only": { args: ["-s", "read-only"], loss: null },
    "workspace-write": { args: ["-s", "workspace-write"], loss: null },
    full: { args: ["-s", "danger-full-access"], loss: null },
  },
  outcome({ code, failed, events, root }) {
    const turns = events.filter(event => event.type === 'turn.completed');
    const values = turns.map(event => event.usage);
    const keys = ['input_tokens', 'cached_input_tokens', 'output_tokens'];
    const totals = keys.map(key => values.reduce((sum, value) => sum + (value?.[key] ?? NaN), 0));
    const complete = values.length > 0 && values.every(value => keys.every(key => Number.isSafeInteger(value?.[key]) && value[key] >= 0) && value.cached_input_tokens <= value.input_tokens) && totals.every(Number.isSafeInteger);
    const thread = events.find(event => event.type === 'thread.started')?.thread_id;
    const actual = actualSettings(thread, root);
    return {
      success: code === 0 && !failed && !events.some(event => ['turn.failed', 'error'].includes(event.type) || (event.item?.type === 'error' && !/unrecognized configuration/.test(event.item.message ?? ''))),
      usage: complete ? { input: totals[0], cached: totals[1], output: totals[2] } : null,
      actualModel: [...events].reverse().find(event => typeof event.model === 'string')?.model ?? actual.model,
      actualEffort: actual.effort,
    };
  },
  failureHint(stderr) {
    if (/Not inside a trusted directory/i.test(stderr)) return '当前目录不是 git 仓库，Codex 拒绝运行。在项目目录里先运行 git init，或换到已有的 git 仓库再派发。';
    return null;
  },
};

function actualSettings(thread: unknown, root: string): { model: string | null; effort: string | null } {
  const result: { model: string | null; effort: string | null } = { model: null, effort: null };
  if (typeof thread !== 'string' || !/^[A-Za-z0-9_-]+$/.test(thread)) return result;
  const walk = (directory: string): void => {
    if (!existsSync(directory)) return;
    for (const file of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, file.name);
      if (file.isDirectory()) walk(path);
      else if (file.isFile() && file.name.endsWith(`${thread}.jsonl`)) {
        const rows = readFileSync(path, 'utf8').split(/\r?\n/).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
        if (!rows.some(row => row.type === 'session_meta' && row.payload?.id === thread && typeof row.payload.cwd === 'string' && resolve(row.payload.cwd) === resolve(root))) continue;
        const context = rows.filter(row => row.type === 'turn_context').at(-1)?.payload;
        result.model = typeof context?.model === 'string' ? context.model : null;
        result.effort = typeof context?.effort === 'string' ? context.effort : null;
      }
    }
  };
  try { walk(join(process.env.CODEX_HOME ?? join(homedir(), '.codex'), 'sessions')); } catch {}
  return result;
}
