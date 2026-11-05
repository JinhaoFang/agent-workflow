/**
 * PR-check command: read the invoking checkout configuration and run its
 * prCheckCommand array from that checkout root, replacing every {pr} occurrence
 * in every element, including the executable. Inherit output and preserve exit
 * status; launch/signal failures exit 2. --dry-run prints the command only.
 * Apply verificationEnv; custom checks share the repository verification mutex.
 * Append one main-owned ledger entry for default and custom check commands.
 */
import {
  dispatchConfig,
  defaultPrCheckCommand,
  entry,
  git,
  verificationEnvironment,
  type Command,
  type Values,
} from "./shared.ts";
import {
  withVerificationRecord,
  verificationLedgerHelp,
} from "./verification-ledger.ts";

const prCheck = async (values: Values, numbers: number[]): Promise<void> => {
  const checkout = git(process.cwd(), ["rev-parse", "--show-toplevel"]);
  const root = git(checkout, ["worktree", "list", "--porcelain"])
    .split("\n")[0]
    .slice(9);
  await withVerificationRecord(
    root,
    "pr-check",
    { kind: "pr", number: numbers[0] },
    Boolean(values["dry-run"]),
    async (attempt) => {
      const config = dispatchConfig(checkout);
      const [program, ...args] = config.prCheckCommand.map((part) =>
        part.replaceAll("{pr}", String(numbers[0])),
      );
      if (values["dry-run"]) {
        console.log(
          `PR 检查命令（${checkout}）：${JSON.stringify([program, ...args])}`,
        );
        return;
      }
      const result = await attempt.run(
        checkout,
        config.exclusiveVerification &&
          JSON.stringify(config.prCheckCommand) !==
            JSON.stringify(defaultPrCheckCommand),
        program,
        args,
        {
          cwd: checkout,
          env: { ...process.env, ...verificationEnvironment(config, root) },
          stdio: "inherit",
        },
      );
      if (result.error)
        throw new Error("PR 检查命令无法运行，请检查程序路径和运行权限。");
      if (result.signal)
        throw new Error(`PR 检查命令被信号 ${result.signal} 中断。`);
      process.exitCode = result.status ?? 2;
    },
  );
};

export const prCheckCommand: Command = {
  options: {},
  positionals: 1,
  execute: prCheck,
  help: `${entry} pr-check <PR号> [--dry-run]
在当前工作区根目录运行配置的 prCheckCommand，逐项替换所有 {pr} 为 PR 号。
默认命令：["gh","pr","checks","{pr}","--watch"]；
本机 CI 配置示例：["make","ci-local","PR={pr}"]。
应用 verificationEnv，替换配置值中的 {mainRoot}，保留已有同名进程环境变量。
exclusiveVerification 开启时，非默认命令先取仓库验证锁，每 5 分钟最多打印一行等待信息；
POSIX 独立进程组全部退出后才回收；Windows 不支持进程组，仍只按持锁进程及启动时间回收。
子进程继承 RUN_SPEC_VERIFICATION_LOCK；嵌套 verify、land、自定义 pr-check 核对属主后复用锁，
过期或其他锁的标记照常排队。
默认 gh pr checks 命令不取锁，即使显式配置为默认数组。
程序和参数通过数组传入，不经 shell；直接显示命令输出，退出码与命令一致。
参数错误、程序无法启动或被信号中断时以 2 退出。
${verificationLedgerHelp}
--dry-run 只打印替换后的命令和运行目录，不执行命令。`,
};
