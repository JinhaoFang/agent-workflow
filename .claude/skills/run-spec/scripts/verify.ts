/**
 * Verify command: run the configured argument array in the main checkout or
 * the registered conventional ticket worktree. Merge stdout/stderr directly
 * into a unique main .codex-runs/verify-<ticket|main>-<time>-<pid>.log without
 * buffering process output. Print only its last 20 lines and one conclusion,
 * retaining the child exit status; launch/signal failures exit 2 and missing
 * worktrees exit 1. Read configuration from the invoking checkout, like land.
 * --dry-run prints the plan without running verification or writing a log.
 * Apply verificationEnv and serialize the verification action when configured.
 */
import {
  appendFileSync,
  closeSync,
  createReadStream,
  existsSync,
  mkdirSync,
  openSync,
} from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import {
  CheckFailure,
  dispatchConfig,
  entry,
  git,
  verificationEnvironment,
  type Command,
  type Values,
} from "./shared.ts";
import { runVerification } from "./verification-lock.ts";

const tailLines = 20;

const verify = async (values: Values, numbers: number[]): Promise<void> => {
  const checkout = git(process.cwd(), ["rev-parse", "--show-toplevel"]);
  const trees = git(checkout, ["worktree", "list", "--porcelain"]);
  const root = trees.split("\n")[0].slice(9);
  const ticket = numbers[0];
  const cwd = ticket === undefined ? root : `${root}.worktrees/${ticket}`;
  if (
    ticket !== undefined &&
    (!existsSync(cwd) ||
      !trees
        .split("\n\n")
        .some((block) => block.split("\n").includes(`worktree ${cwd}`)))
  )
    throw new CheckFailure(`工单 worktree 不存在：${cwd}`);
  const config = dispatchConfig(checkout);
  const directory = join(root, ".codex-runs");
  const log = join(
    directory,
    `verify-${ticket ?? "main"}-${Date.now()}-${process.pid}.log`,
  );
  if (values["dry-run"]) {
    console.log(
      `验证命令（${cwd}）：${JSON.stringify(config.verificationCommand)}`,
    );
    console.log(`完整日志：${log}（仅预览，不写入）`);
    return;
  }
  mkdirSync(directory, { recursive: true });
  const descriptor = openSync(log, "wx");
  const [program, ...args] = config.verificationCommand;
  let result: Awaited<ReturnType<typeof runVerification>>;
  try {
    result = await runVerification(
      checkout,
      config.exclusiveVerification,
      program,
      args,
      {
        cwd,
        env: { ...process.env, ...verificationEnvironment(config, root) },
        stdio: ["inherit", descriptor, descriptor],
      },
    );
  } finally {
    closeSync(descriptor);
  }
  if (result.error || result.signal)
    appendFileSync(
      log,
      result.error
        ? "\n出错：验证命令无法运行，请检查程序路径和运行权限。\n"
        : `\n出错：验证命令被信号 ${result.signal} 中断。\n`,
    );
  const tail: string[] = [];
  const lines = createInterface({
    input: createReadStream(log),
    crlfDelay: Infinity,
  });
  for await (const line of lines) {
    tail.push(line);
    if (tail.length > tailLines) tail.shift();
  }
  for (const line of tail) console.log(line);
  const status = result.status ?? 2;
  console.log(
    `${status === 0 ? "验证通过" : "出错：验证失败"}（退出码 ${status}，日志：${log}）`,
  );
  process.exitCode = status;
};

export const verifyCommand: Command = {
  options: {},
  positionals: 0,
  optionalPositionals: 1,
  execute: verify,
  help: `${entry} verify [<工单号>] [--dry-run]
读取当前工作区的 verificationCommand 参数数组；不给工单号时在主工作区运行，
给工单号时在 <主工作区>.worktrees/<工单号>/ 运行，不经 shell。
应用 verificationEnv（默认 {}），替换配置值中的 {mainRoot}，保留已有同名进程环境变量。
exclusiveVerification 默认 false；开启时验证前取 git 公共目录中的仓库锁，等待信息每 5 分钟最多一行；
POSIX 平台由独立进程组运行验证，组内全部作业退出后才回收；启动时间用于识别复用的进程号。
Windows 不支持进程组，保持按持锁进程及启动时间回收，无法保证孤儿子进程已退出。
子进程继承 RUN_SPEC_VERIFICATION_LOCK 标记；嵌套 verify、land、自定义 pr-check 核对当前锁属主后复用，
过期或其他锁的标记仍照常排队。
完整标准输出和错误输出合并写入主工作区 .codex-runs/verify-<工单号或 main>-<时间>-<进程号>.log，
每次生成独立日志；屏幕只打印末尾 ${tailLines} 行和一行结论（通过或失败、退出码、日志绝对路径）。
退出码与验证命令一致；程序无法启动或被信号中断时以 2 退出。
工单 worktree 未登记或路径不存在时说明路径并以 1 退出。
cleanup <spec> 清理本 spec 子工单的验证日志，保留 main 和其他工单的日志。
--dry-run 只打印命令、运行目录和日志计划，不执行命令、不写日志。`,
};
