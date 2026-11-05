#!/usr/bin/env node
/**
 * 用参数数组执行一次验证命令，把命令、工作目录、输出、退出码和起止时间保留到一个新证据目录。
 * 用法：./docs/verification/workflow/record.mjs --out <新目录> -- <程序> <参数…>。
 * 不经过 shell，不覆盖旧证据，不处理被驱动程序的现场；收拾办法见 README.md。
 * 透传命令的 0/1/2 退出码，其他退出状态归为 2；参数或启动错误以中文报错、退出 2。
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

const usage = "./docs/verification/workflow/record.mjs --out <新目录> -- <程序> <参数…>";
try {
  let parsed;
  try {
    parsed = parseArgs({ allowPositionals: true, options: { out: { type: "string" }, help: { type: "boolean" } } });
  } catch {
    throw new Error(`参数错误。用法：${usage}`);
  }
  const { values, positionals } = parsed;
  if (values.help) {
    console.log(`用法：${usage}\n记录一次真实命令；证据目录必须尚不存在。`);
  } else {
    if (!values.out || !positionals.length) throw new Error(`缺少证据目录或命令。用法：${usage}`);
    const out = resolve(values.out);
    if (existsSync(out)) throw new Error(`证据目录已存在，请换一个新目录：${out}`);
    mkdirSync(out, { recursive: true });
    const save = (name, value) => writeFileSync(join(out, name), JSON.stringify(value, null, 2) + "\n");
    const command = { argv: positionals, cwd: process.cwd(), startedAt: new Date().toISOString() };
    save("command.json", command);
    console.log(`命令参数数组：${JSON.stringify(positionals)}\n证据目录：${out}`);
    const result = spawnSync(positionals[0], positionals.slice(1), { encoding: "utf8", shell: false, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024 });
    writeFileSync(join(out, "stdout.log"), result.stdout ?? "");
    writeFileSync(join(out, "stderr.log"), result.stderr ?? "");
    const exitCode = result.error || result.signal || ![0, 1, 2].includes(result.status) ? 2 : result.status;
    save("result.json", { ...command, finishedAt: new Date().toISOString(), processExitCode: result.status, signal: result.signal, error: result.error?.message ?? null, exitCode });
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    console.log(`退出码：${exitCode}`);
    process.exitCode = exitCode;
    if (result.error) throw new Error(`命令无法启动：${result.error.message}`);
    if (result.signal) throw new Error(`命令被信号 ${result.signal} 中断。`);
  }
} catch (error) {
  console.error(`出错：${error.message}`);
  process.exitCode = 2;
}
