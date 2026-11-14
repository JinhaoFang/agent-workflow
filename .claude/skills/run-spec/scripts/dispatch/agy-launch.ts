/**
 * agy 启动桥：在当前检出内的短命技能清单目录运行真实 CLI，原样转发标准流。
 * 参数为 <隔离目录> <可执行文件> [CLI 参数…]；结束或收到信号后删除本次目录。
 * 用法 --help 退出 0，启动或参数错误退出 2，正常保留子进程退出码。
 */
import { spawn } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const [directory, executable, ...args] = process.argv.slice(2);
if (directory === "--help") console.log("用法：agy-launch.ts <隔离目录> <可执行文件> [参数…]\n内部启动桥，以参数数组运行 agy，转发标准流并删除本次技能隔离目录。");
else if (!directory || !executable) { console.error("出错：缺少 agy 隔离目录或可执行文件。"); process.exitCode = 2; }
else {
  if (!basename(directory).startsWith("agy-isolation-") || basename(dirname(directory)) !== ".codex-runs" || resolve(directory, "../..") !== process.cwd()) {
    console.error("出错：agy 隔离目录必须是当前检出 .codex-runs 下的本次 agy-isolation-* 目录。");
    process.exit(2);
  }
  try {
    console.log(JSON.stringify({ event: "dispatch", argv: [executable, ...args], cwd: directory, skills: JSON.parse(readFileSync(join(directory, "visible-skills.json"), "utf8")) }));
  } catch {
    rmSync(directory, { recursive: true, force: true });
    console.error("出错：无法读取 agy 已验证的技能清单。");
    process.exit(2);
  }
  const child = spawn(executable, args, { cwd: directory, env: process.env, stdio: "inherit", shell: false, windowsHide: true });
  let failed = false;
  for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"] as const) process.on(signal, () => child.kill(signal));
  child.on("error", error => { failed = true; console.error(`出错：启动 agy 失败：${error.message}`); });
  child.on("close", (code) => { rmSync(directory, { recursive: true, force: true }); process.exitCode = failed ? 2 : code ?? 1; });
}
