/**
 * 辅助派发统一入口：按席位解析任务，review 列表逐项运行同一提示并保存批次清单。
 * 在调用工作区执行，记录与评分表精确关联统一写主工作区；预览只读，不调用模型。
 * 批次名共用前缀，每份用 -<序号>-<框架>，重名为整个前缀追加 -2、-3。
 * 失败也保留关联与清单，继续其余审查份；不写 GitHub、不创建工单 worktree。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { adapterFor } from "./dispatch/adapters.ts";
import { run as dispatchTask } from "./dispatch/run.ts";
import { taskDetails } from "./dispatch/protocol.ts";
import { describeSeat, loadSeatConfiguration, resolveSeat, seatNames } from "./dispatch/settings.ts";
import { registerRecordBindings, readRecordBindings } from "./scorecard-bindings.ts";
import { entry, git, github, issueNumber, recordName, usageError, type Command, type Values } from "./shared.ts";

const run = async (values: Values, _numbers: number[], args: string[]): Promise<void> => {
  const seat = values.seat as string;
  if (!seatNames.includes(seat as typeof seatNames[number])) throw usageError("必须用 --seat 指定有效席位。", runCommand.help);
  const spec = values.spec === undefined ? undefined : issueNumber(values.spec as string);
  const cwd = git(process.cwd(), ["rev-parse", "--show-toplevel"]);
  const root = git(cwd, ["worktree", "list", "--porcelain"]).split("\n")[0].slice(9);
  const overrides = Object.fromEntries(["work-type", "agent", "model", "effort", "permission"].flatMap(key => values[key] === undefined ? [] : [[key, values[key] as string]]));
  const settings = resolveSeat(loadSeatConfiguration(cwd), seat, overrides["work-type"], overrides);
  const opts: Record<string, string> = values.name === undefined ? {} : { name: values.name as string };
  if (["engineering", "review", "research"].includes(seat)) opts.role = "engineering";
  const details = taskDetails(cwd, { task: args[0], extra: "", opts });
  const task = details.spec ? readFileSync(join(cwd, details.spec), "utf8") : args[0];
  if (!task.trim()) throw usageError("任务内容不能为空。", runCommand.help);
  const fallbackName = /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(details.name) ? details.name : `task-${Date.now()}`;
  const requested = values.name as string | undefined ?? (seat === "review" && spec ? `review-${spec}` : fallbackName);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(requested) || ["scorecard-records", "verification"].includes(requested)) throw usageError("记录名只含字母、数字、下划线、连字符，并以字母或数字开头。", runCommand.help);
  if (seat === "review" && spec && !new RegExp(`^review-${spec}(?:-|$)`).test(requested)) throw usageError("带 --spec 的 review 记录名必须以 review-<spec> 开头。", runCommand.help);
  const used = new Set([root, cwd].flatMap(checkout => {
    const directory = join(checkout, ".codex-runs");
    return existsSync(directory) ? readdirSync(directory).map(recordName) : [];
  }));
  let tickets = new Set<number>();
  if (spec !== undefined) {
    const api = github(false);
    api.issue(spec);
    tickets = new Set(api.list(`${api.endpoint(spec)}/sub_issues`).map(issue => issue.number));
    for (const binding of readRecordBindings(root, spec, tickets)) used.add(binding.name);
  }
  const occupied = (prefix: string) => used.has(prefix) || settings.some((setting, index) => used.has(`${prefix}-${index + 1}-${setting.agent}`));
  let prefix = requested;
  let suffix = 2;
  const selectNames = () => {
    while (occupied(prefix)) prefix = `${requested}-${suffix++}`;
    return settings.map((setting, index) => settings.length === 1 ? prefix : `${prefix}-${index + 1}-${setting.agent}`);
  };
  let names = selectNames();
  const dryRun = Boolean(values["dry-run"] || process.env.CODEX_DRY_RUN);
  if (spec !== undefined) registerRecordBindings(root, spec, tickets, names, true);
  for (const setting of settings) adapterFor(setting.agent);
  const prompt = [task, Object.keys(overrides).length ? `本次派发参数覆盖：${JSON.stringify(overrides)}` : "", settings.some(setting => setting.permission === "read-only") ? "本次任务只读：不改文件、不提交、不操作 GitHub。" : ""].filter(Boolean).join("\n\n");
  const directory = join(root, ".codex-runs");
  let manifest = "";
  let batch = { version: 1, seat, spec: spec ?? null, prefix, records: names };
  if (!dryRun) {
    mkdirSync(directory, { recursive: true });
    for (;;) {
      manifest = join(directory, `${prefix}.batch.json`);
      batch = { version: 1, seat, spec: spec ?? null, prefix, records: names };
      try {
        writeFileSync(manifest, JSON.stringify(batch, null, 2) + "\n", { flag: "wx" });
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        used.add(prefix);
        names = selectNames();
        if (spec !== undefined) registerRecordBindings(root, spec, tickets, names, true);
      }
    }
  }
  console.log(`派发批次：${prefix}${spec === undefined ? "" : `；关联 spec #${spec}`}\n${settings.map((setting, index) => `记录 ${names[index]}\n${describeSeat(setting)}`).join("\n")}`);
  if (dryRun) {
    console.log(`--dry-run：不启动模型、不写记录或关联。\n${details.role ? `角色：${details.role.name}（角色文档 ${details.role.doc}）\n` : ""}${prompt}`);
    return;
  }
  let exit = 0;
  for (const [index, setting] of settings.entries()) {
    const code = await dispatchTask([prompt, "--name", names[index], "--settings", JSON.stringify(setting), ...(opts.role ? ["--role", opts.role] : [])], cwd, {
      recordsRoot: root,
      onRecord(name) {
        batch.records[index] = name;
        writeFileSync(manifest, JSON.stringify(batch, null, 2) + "\n");
        if (spec !== undefined) registerRecordBindings(root, spec, tickets, [name]);
      },
    });
    if (code !== 0) exit = code === 2 ? 2 : exit || 1;
  }
  process.exitCode = exit;
};

export const runCommand: Command = {
  positionals: 1,
  textPositionals: true,
  options: Object.fromEntries(["seat", "spec", "name", "work-type", "agent", "model", "effort", "permission"].map(key => [key, { type: "string" as const }])),
  execute: run,
  help: `${entry} run <任务说明文件|任务文字> --seat <engineering|review|spec-review|research|watch> [--spec <S>] [--name <记录名>] [--dry-run]
覆盖参数：--work-type <工作类型> --agent <codex|claude|pi> --model <模型> --effort <强度> --permission <read-only|workspace-write|full>。
在当前工作区执行，任务文件在启动前读取；review 列表每项收到同样的提示，逐份运行，失败继续其余项。
engineering、review、research 告知工程负责人角色并要求阅读 docs/roles/engineering.md；spec-review、watch 不告知角色。
记录统一写主工作区 .codex-runs；--spec 只读查询 spec 与子工单，用现有 scorecard --record 存储自动关联每份精确名。
review 带 --spec 时默认名 review-<S>；其余默认取可用的任务文件名或 task-<时间>。重名为批次前缀追加 -2、-3。
多项记录名为 <前缀>-<序号>-<框架>，同名 <前缀>.batch.json 保存清单；review --record <前缀> 合计该清单。
只读席位在提示中要求不改文件、不提交、不操作 GitHub；权限实际限制和损失见 doctor。
--dry-run 仅打印实际设置、记录名、关联计划和提示，不启动模型、不写文件或关联、不写 GitHub。
帮助退出 0，任务未通过退出 1，参数或运行出错退出 2。`,
};
