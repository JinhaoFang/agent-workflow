/**
 * 公共协议：任务文字、独占记录文件、全局追加登记和进度行；供内置派发入口使用。
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
import { appendFileSync, existsSync, mkdirSync, writeFileSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import type { Event } from "./adapter.ts";

export function clip(s: unknown, n = 140) {
  const one = String(s ?? '').replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n)}…` : one;
}

export function formatProgress(e: Event) {
  switch (e.kind) {
    case 'say': return [`说：${clip(e.text, 200)}`];
    case 'think': return e.text ? [`思考：${clip(e.text, 160)}`] : [];
    case 'cmd': return e.phase === 'start' ? [`运行：${clip(e.command, 120)}`]
      : e.exit !== 0 ? [`  命令失败（exit ${e.exit}）：${clip(e.command, 120)}`] : [];
    case 'file': return e.files.map((f: Event) => `${{ add: '新增', update: '修改', delete: '删除' }[f.kind as 'add' | 'update' | 'delete']}文件：${f.path}`);
    case 'plan': return [`计划：${e.items.map((t: Event) => `${t.done ? '[x]' : '[ ]'} ${clip(t.text, 40)}`).join('  ')}`];
    case 'tool': return [e.name === 'web_search' ? `搜索：${clip(e.detail)}` : `工具：${e.detail}`];
    case 'turn': return [`一轮结束（输入 ${e.usage.input ?? '?'}，输出 ${e.usage.output ?? '?'} tokens）`];
    case 'error': return [`出错：${clip(e.text)}`];
    case 'text': return [clip(e.text)];
    default: return [];
  }
}

export function progressHeader(title: string, role: string | undefined, started: number, framework = "Codex") {
  return `=== ${framework} 开始：${title}${role ? `（角色：${role}）` : ''}  ${new Date(started).toLocaleString('zh-CN')} ===\n`;
}
export function progressFooter(code: number | null, minutes: string, report: string, framework = "Codex") {
  return `\n=== ${framework} 结束：exit=${code}，用时 ${minutes} 分钟，汇报在 ${report} ===\n`;
}


export function registryWriter(home: string) {
  return (record: Event) => {
    try {
      mkdirSync(home, { recursive: true });
      appendFileSync(join(home, 'runs.jsonl'), `${JSON.stringify({ v: 1, ...record })}\n`);
    } catch {}
  };
}

export function recordPaths(root: string, requested: string, header: string, dryRun = false) {
  const runs = join(root, '.codex-runs');
  if (!dryRun) mkdirSync(runs, { recursive: true });
  for (let n = 1; ; n++) {
    const name = n === 1 ? requested : `${requested}-${n}`;
    const progress = join(runs, `${name}.progress.log`);
    if (dryRun) { if (existsSync(progress)) continue; }
    else {
      try { writeFileSync(progress, header, { flag: 'wx' }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue; throw error; }
    }
    return { name, progress, report: join(runs, `${name}.md`), raw: join(runs, `${name}.log`), events: join(runs, `${name}.events.jsonl`) };
  }
}

export function parseArgs(args: string[]) {
  const opts: Record<string, string> = {}, positional: string[] = [];
  const names = ['role', 'name', 'host', 'model', 'effort', 'tier', 'sandbox', 'watch-window', 'seat'];
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (a === '--') { positional.push(...args.slice(k + 1)); break; }
    if (a.startsWith('--')) {
      if (!names.includes(a.slice(2)) || !args[k + 1] || args[k + 1].startsWith('--')) throw new Error(`参数无效或缺少值：${a}`);
      opts[a.slice(2)] = args[++k];
    } else positional.push(a);
  }
  if (!positional[0]) throw new Error('用法：node .claude/skills/run-spec/scripts/dispatch-task.ts <任务说明文件 | "任务文字"> ["补充说明"] [--role <角色文档名>] [--name <记录名>] [--host <claude-code|devin>]');
  if (opts.host && !['claude-code', 'devin'].includes(opts.host)) throw new Error(`无效的派活方：${opts.host}`);
  return { opts, task: positional[0], extra: positional[1] ?? '' };
}

export const clipTitle = (s: string) => {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > 60 ? `${one.slice(0, 60)}…` : one;
};

export function taskDetails(root: string, { opts, task, extra }: ReturnType<typeof parseArgs>) {
  const target = resolve(root, task);
  const spec = existsSync(target) && statSync(target).isFile() ? task : null;
  let role = null;
  if (opts.role) {
    const doc = /[\\/.]/.test(opts.role) ? opts.role : `docs/roles/${opts.role}.md`;
    if (!existsSync(resolve(root, doc))) throw new Error(`找不到角色文档：${resolve(root, doc)}`);
    const title = readFileSync(resolve(root, doc), 'utf8').split(/\r?\n/).find(l => l.startsWith('# ')) ?? '';
    role = { doc, name: title.replace(/^#\s*(角色[:：]\s*)?/, '').trim() || opts.role };
  }
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
  const name = opts.name ?? (spec ? basename(spec, extname(spec)) : `task-${stamp}`);
  if (!name || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) throw new Error(`无效的记录名：${name}`);
  const prompt = [
    role ? `你在本项目中的角色是「${role.name}」。` : '',
    existsSync(join(root, 'AGENTS.md')) ? '请先阅读仓库根目录的 AGENTS.md（共同规则）。' : '',
    role ? `再阅读你的角色文档 ${role.doc}，严格遵守其中的职责、硬规则、完成标准和汇报格式。` : '',
    spec ? `然后完成任务说明 ${spec} 中的全部内容，按要求验证、提交，最后给出汇报。` : `任务：\n${task}`,
    extra,
  ].filter(Boolean).join('\n');
  return { spec, role, name, prompt, title: spec ?? clipTitle(task) };
}
