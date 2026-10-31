/**
 * Append one verification.jsonl entry per verify, land or pr-check invocation
 * to the main checkout's .codex-runs. Each UTF-8 JSON line uses one synchronous
 * O_APPEND write, so concurrent local processes never overwrite old entries.
 * Invocation timestamps include all stages; verification timestamps/exit status
 * separately identify real checks and retries that skip verification. Land
 * failures carry the active step and diagnostic. Dry runs never create files.
 * Call withVerificationRecord and use its attempt.run for the verification step.
 */
import { closeSync, mkdirSync, openSync, writeSync } from "node:fs";
import { join } from "node:path";
import { CheckFailure } from "./shared.ts";
import { runVerification } from "./verification-lock.ts";

type Target =
  | { kind: "main" }
  | { kind: "ticket" | "pr"; number: number };
type Caller = "verify" | "land" | "pr-check";

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
      const directory = join(root, ".codex-runs");
      mkdirSync(directory, { recursive: true });
      const line = Buffer.from(
        JSON.stringify({
          startedAt,
          finishedAt: new Date().toISOString(),
          queuedMinutes: attempt.queuedMinutes,
          layer: attempt.layer,
          target,
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
    }
  }
};

export const verificationLedgerHelp = `验证台账：主工作区 .codex-runs/verification.jsonl，每次调用追加一行 JSON，不改旧行；
本机并发追加使用 O_APPEND 和单次写入；cleanup 不删除此公共台账。
startedAt、finishedAt：本次调用的起止 UTC 时间（ISO 8601）；
queuedMinutes：实际等验证锁的分钟数，不取锁或复用已有锁时为 0；
layer：验证层 full 或 static，当前总是 full；caller：verify、land 或 pr-check；
target：对象，kind 为 main（主工作区）、ticket（工单）或 pr（PR），后两者的 number 是对应号码；
exitCode：子命令最终退出码；stopReason：land 停下的 {step,message}，成功或其他调用方为 null；
step 为 preflight、rebase、install、verify、merge、push、copy、retain、remove-worktree 或 remove-branch；
verification：实际验证的 {startedAt,finishedAt,exitCode}，不含排队、安装、合并和清理时间；
尚未验证或续做时跳过验证则为 null，统计验证次数时只计非 null 的记录。
--dry-run 不创建或追加台账。`;
