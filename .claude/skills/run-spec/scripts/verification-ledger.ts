/**
 * Append one verification.jsonl entry per verify, land or pr-check invocation
 * to the main checkout's .codex-runs. Each UTF-8 JSON line uses one synchronous
 * O_APPEND write, so concurrent local processes never overwrite old entries.
 * Invocation timestamps include all stages; verification timestamps/exit status
 * separately identify real checks; launch failures and skipped checks are null. Land
 * failures carry the active step and diagnostic. Dry runs never create files.
 * Snapshot the main/ticket/PR branch before execution, with null when unknown.
 * Report ledger write failures on stderr without changing the command outcome.
 * Call withVerificationRecord and use its attempt.run for the verification step.
 * Each new invocation has its own UUID. A repository-scoped parent marker is
 * passed only to verification children, independently of mutex ownership.
 */
import { randomUUID } from "node:crypto";
import { closeSync, mkdirSync, openSync, realpathSync, writeSync } from "node:fs";
import { join } from "node:path";
import { CheckFailure, gh, git } from "./shared.ts";
import { runVerification } from "./verification-lock.ts";

type Target =
  | { kind: "main" }
  | { kind: "ticket" | "pr"; number: number };
type Caller = "verify" | "land" | "pr-check";
const invocationKey = "RUN_SPEC_VERIFICATION_INVOCATION";
const parentInvocation = (root: string): string | null => {
  try {
    const marker = JSON.parse(process.env[invocationKey] ?? "null");
    return marker?.root === root &&
      typeof marker.invocationId === "string" &&
      /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(marker.invocationId)
      ? marker.invocationId
      : null;
  } catch {
    return null;
  }
};

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
  invocationId = randomUUID();
  root: string;
  parentInvocationId: string | null;
  step = "preflight";
  queuedMinutes = 0;
  layer: "full" | "static" = "full";
  verification: {
    startedAt: string;
    finishedAt: string;
    exitCode: number;
  } | null = null;

  constructor(root: string) {
    this.root = realpathSync(root);
    this.parentInvocationId = parentInvocation(this.root);
  }

  async run(...parameters: Parameters<typeof runVerification>) {
    this.step = "verify";
    const [checkout, enabled, program, args, options] = parameters;
    const result = await runVerification(checkout, enabled, program, args, {
      ...options,
      env: {
        ...(options.env ?? process.env),
        [invocationKey]: JSON.stringify({
          root: this.root,
          invocationId: this.invocationId,
        }),
      },
    });
    this.queuedMinutes = result.queuedMinutes;
    this.verification =
      !result.error && result.startedAt && result.finishedAt
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
  const attempt = new VerificationAttempt(root);
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
            invocationId: attempt.invocationId,
            parentInvocationId: attempt.parentInvocationId,
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
invocationId：本次调用的独立 UUID；parentInvocationId：同仓库父验证调用的 UUID，没有父调用时为 null；
仅验证子进程继承 RUN_SPEC_VERIFICATION_INVOCATION，按主工作区真实路径隔离仓库，不依赖验证锁；
前置检查、启动失败和排队中断仍保留调用节点；旧行可以没有这两个字段。
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
尚未验证、验证程序无法启动或续做时跳过验证则为 null；正常启动后即使验证失败仍记录。
评分表先用完整台账建立父子关系，包装调用保留，verification.fullCount/fullMinutes 只汇总实际叶节点中 verification 非 null 的 full；
一次包装内多次子验证分别计数，旧行按原口径，断链或冲突标缺数，不按时间重叠猜关系；启动失败计入 failures.verificationLaunch。
排队与 land 继续按原始调用统计，包装行的等待和停止原因不因叶节点筛选丢失。
评分表 merges.fullVerificationFailures 只计 caller=land 的 full 验证非零退出；verify、pr-check 不计入该项。
台账写入失败时在标准错误打印一行提示，子命令退出码不变。
--dry-run 不创建或追加台账。`;
