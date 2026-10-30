/**
 * Repository-wide verification mutex: wrap only complete verification actions
 * with withVerificationLock(checkout, enabled, action). Atomic mkdir in the git
 * common directory coordinates all worktrees without dependencies. Owner files
 * use unique names plus PID/start identity (Linux boot ID and /proc start ticks,
 * Windows creation ticks, or POSIX ps start time), so reused PIDs are reclaimed.
 * Normal completion/exit removes only this owner's file; later contenders reap
 * dead owners after SIGKILL. Empty incomplete locks recover after ten seconds.
 * Waiters poll once per second and report at most once per five minutes.
 */
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { git } from "./shared.ts";

const processIdentity = (pid: number): string | undefined => {
  try {
    process.kill(pid, 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return undefined;
    if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
  }
  if (process.platform === "linux") {
    try {
      const fields = readFileSync(`/proc/${pid}/stat`, "utf8")
        .split(/\) /)
        .at(-1)!
        .split(" ");
      if (["Z", "X"].includes(fields[0])) return undefined;
      return `${readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim()}:${fields[19]}`;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }
  const result =
    process.platform === "win32"
      ? spawnSync(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            `(Get-Process -Id ${pid}).StartTime.ToUniversalTime().Ticks`,
          ],
          { encoding: "utf8" },
        )
      : spawnSync("ps", ["-p", String(pid), "-o", "lstart="], {
          encoding: "utf8",
          env: { ...process.env, LC_ALL: "C" },
        });
  if (result.error || result.signal)
    throw new Error("无法读取验证锁进程的启动时间，请检查进程查询程序和权限。");
  return result.status === 0 ? result.stdout.trim() || undefined : undefined;
};

const acquire = async (checkout: string): Promise<() => void> => {
  const lock = resolve(
    checkout,
    git(checkout, ["rev-parse", "--git-common-dir"]),
    "run-spec-verification.lock",
  );
  const identity = processIdentity(process.pid);
  if (!identity) throw new Error("无法确定当前验证锁进程的启动时间。");
  let lastReport = -Infinity;
  for (;;) {
    let acquired = false;
    try {
      mkdirSync(lock);
      acquired = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    if (acquired) {
      const owner = join(
        lock,
        `${process.pid}-${randomUUID()}.${Buffer.from(identity).toString("base64url")}`,
      );
      try {
        writeFileSync(owner, "", { flag: "wx" });
      } catch (error) {
        rmdirSync(lock);
        throw error;
      }
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        process.off("exit", release);
        unlinkSync(owner);
        rmdirSync(lock);
      };
      process.once("exit", release);
      return release;
    }
    let reclaimed = false;
    try {
      const owners = readdirSync(lock);
      for (const owner of owners) {
        const match = /^([1-9]\d*)-[^.]+\.([\w-]+)$/.exec(owner);
        if (!match || !Number.isSafeInteger(Number(match[1])))
          throw new Error(
            "验证锁记录中的进程号无效，请检查 git 公共目录中的锁文件。",
          );
        if (
          processIdentity(Number(match[1])) !==
          Buffer.from(match[2], "base64url").toString()
        ) {
          unlinkSync(join(lock, owner));
          rmdirSync(lock);
          reclaimed = true;
        }
      }
      if (!owners.length && Date.now() - statSync(lock).mtimeMs > 10000) {
        rmdirSync(lock);
        reclaimed = true;
      }
    } catch (error) {
      if (
        !["ENOENT", "ENOTEMPTY"].includes(
          (error as NodeJS.ErrnoException).code ?? "",
        )
      )
        throw error;
    }
    if (reclaimed) continue;
    if (Date.now() - lastReport >= 5 * 60 * 1000) {
      lastReport = Date.now();
      console.log("排队中：正在等待同一仓库的完整验证结束；锁释放后自动开始。");
    }
    await delay(1000);
  }
};

export const withVerificationLock = async <T>(
  checkout: string,
  enabled: boolean,
  action: () => T | Promise<T>,
): Promise<T> => {
  if (!enabled) return action();
  const release = await acquire(checkout);
  try {
    return await action();
  } finally {
    release();
  }
};
