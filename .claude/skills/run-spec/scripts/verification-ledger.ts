/**
 * Append one verification.jsonl entry per verify, land or pr-check invocation
 * to the main checkout's .codex-runs. Each UTF-8 JSON line uses one synchronous
 * O_APPEND write, so concurrent local processes never overwrite old entries.
 * Invocation timestamps include all stages; verification timestamps/exit status
 * separately identify real checks and retries that skip verification. Land
 * failures carry the active step and diagnostic. Dry runs never create files.
 * Snapshot the main/ticket/PR branch before execution, with null when unknown.
 * Report ledger write failures on stderr without changing the command outcome.
 * Call withVerificationRecord and use its attempt.run for the verification step.
 */
import { closeSync, mkdirSync, openSync, writeSync } from "node:fs";
import { join } from "node:path";
import { CheckFailure, gh, git } from "./shared.ts";
import { runVerification } from "./verification-lock.ts";

type Target =
  | { kind: "main" }
  | { kind: "ticket" | "pr"; number: number };
type Caller = "verify" | "land" | "pr-check";

const verificationBranch = (root: string, target: Target): string | null => {
  if (target.kind === "ticket") return `ticket/${target.number}`;
  try {
    if (target.kind === "main") {
      const branch = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
      return branch && branch !== "HEAD" ? branch : null;
    }
    const { headRefName } = JSON.parse(
      gh(["pr", "view", String(target.number), "--json", "headRefName"]),
    );
    return typeof headRefName === "string" && headRefName ? headRefName : null;
  } catch {
    return null;
  }
};

export class VerificationAttempt {
  step = "preflight";
  queuedMinutes = 0;
  layer: "full" | "static" = "full";
  verification: {
    startedAt: string;
    finishedAt: string;
    exitCode: number;
  } | null = null;

  async run(...args: Parameters<typeof runVerification>) {
    this.step = "verify";
    const result = await runVerification(...args);
    this.queuedMinutes = result.queuedMinutes;
    this.verification =
      result.startedAt && result.finishedAt
        ? {
            startedAt: result.startedAt,
            finishedAt: result.finishedAt,
            exitCode: result.status ?? 2,
          }
        : null;
    return result;
  }
}

export const withVerificationRecord = async (
  root: string,
  caller: Caller,
  target: Target,
  dryRun: boolean,
  action: (attempt: VerificationAttempt) => Promise<void>,
): Promise<void> => {
  const startedAt = new Date().toISOString();
  const branch = dryRun ? null : verificationBranch(root, target);
  const attempt = new VerificationAttempt();
  let exitCode = 0;
  let stopReason: { step: string; message: string } | null = null;
  try {
    await action(attempt);
    exitCode = Number(process.exitCode ?? 0);
  } catch (error) {
    exitCode = error instanceof CheckFailure ? 1 : 2;
    if (caller === "land")
      stopReason = { step: attempt.step, message: (error as Error).message };
    throw error;
  } finally {
    if (!dryRun) {
      try {
        const directory = join(root, ".codex-runs");
        mkdirSync(directory, { recursive: true });
        const line = Buffer.from(
          JSON.stringify({
            startedAt,
            finishedAt: new Date().toISOString(),
            queuedMinutes: attempt.queuedMinutes,
            layer: attempt.layer,
            target,
            branch,
            caller,
            exitCode,
            stopReason,
            verification: attempt.verification,
          }) + "\n",
        );
        const descriptor = openSync(join(directory, "verification.jsonl"), "a");
        try {
          if (writeSync(descriptor, line) !== line.length)
            throw new Error("验证台账写入不完整，请检查磁盘空间和文件系统。");
        } finally {
          closeSync(descriptor);
        }
      } catch {
        console.error("出错：验证台账写入失败，请检查主工作区 .codex-runs 的权限和磁盘空间；子命令退出码保持不变。");
      }
    }
  }
};

export const verificationLedgerHelp = `验证台账：主工作区 .codex-runs/verification.jsonl，每次调用追加一行 JSON，不改旧行；
本机并发追加使用 O_APPEND 和单次写入；cleanup 不删除此公共台账。
startedAt、finishedAt：本次调用的起止 UTC 时间（ISO 8601）；
queuedMinutes：实际等验证锁的分钟数，不取锁或复用已有锁时为 0；
layer：实际选择的验证层 full（完整验证）或 static（静态检查）；pr-check 为 full；caller：verify、land 或 pr-check；
target：对象，kind 为 main（主工作区）、ticket（工单）或 pr（PR），后两者的 number 是对应号码；
branch：所属分支，主工作区取 git rev-parse --abbrev-ref HEAD，分离头指针时为 null；
verify <T> 和 land <T> 为 ticket/<T>；pr-check 取 PR 的 headRefName，取不到时为 null；
评分表靠 branch 把行归到 spec。
exitCode：子命令最终退出码；stopReason：land 停下的 {step,message}，成功或其他调用方为 null；
step 为 preflight、rebase、install、verify、merge、push、copy、retain、remove-worktree 或 remove-branch；
verification：实际验证的 {startedAt,finishedAt,exitCode}，不含排队、安装、合并和清理时间；
尚未验证或续做时跳过验证则为 null，统计验证次数时只计非 null 的记录。
台账写入失败时在标准错误打印一行提示，子命令退出码不变。
--dry-run 不创建或追加台账。`;
