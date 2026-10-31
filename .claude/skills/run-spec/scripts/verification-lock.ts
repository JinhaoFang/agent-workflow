/**
 * Repository-wide verification mutex: run complete commands with
 * runVerification(checkout, enabled, program, args, options). Atomic mkdir in the git
 * common directory coordinates all worktrees without dependencies. Owner files
 * use unique names plus PID/start identity (Linux boot ID and /proc start ticks,
 * Windows creation ticks, or POSIX ps start time), so reused PIDs are reclaimed.
 * On POSIX a detached worker acquires/records its own process group before
 * starting the command, avoiding a launch/registration race. Reclamation and
 * release retain locks until every non-zombie group member exits. Windows keeps
 * PID/start-identity recovery. RUN_SPEC_VERIFICATION_LOCK carries the exact lock
 * path and unique owner filename; nested commands validate it before reusing
 * ownership and stay in the original job group. Workers relay queue/results
 * over IPC; disconnected parents do not interrupt an already running job.
 * POSIX callers forward SIGINT/SIGTERM to the worker's entire process group.
 * Empty incomplete locks recover after ten seconds. Waiters poll once per
 * second and report at most once per five minutes. No external dependencies.
 * Results include command timestamps and actual lock-wait minutes measured in
 * the acquiring worker; bypassed/inherited locks have zero wait minutes.
 */
import { spawn, spawnSync, type SpawnOptions } from "node:child_process";
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

const markerKey = "RUN_SPEC_VERIFICATION_LOCK";
type Result = {
  status: number | null;
  signal: NodeJS.Signals | null;
  error?: Error;
  queuedMinutes: number;
  startedAt: string | null;
  finishedAt: string | null;
};
type Message = {
  type: "queue" | "acquired" | "result";
  status?: number | null;
  signal?: NodeJS.Signals | null;
  error?: string;
  queuedMinutes?: number;
  startedAt?: string | null;
  finishedAt?: string | null;
};
const queueMessage =
  "排队中：正在等待同一仓库的完整验证结束；锁释放后自动开始。";

const groupAlive = (group: number, exclude?: number): boolean => {
  try {
    process.kill(-group, 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
  }
  if (process.platform === "linux") {
    for (const pid of readdirSync("/proc")) {
      if (!/^\d+$/.test(pid) || Number(pid) === exclude) continue;
      try {
        const fields = readFileSync(`/proc/${pid}/stat`, "utf8")
          .split(/\) /)
          .at(-1)!
          .split(" ");
        if (Number(fields[2]) === group && !["Z", "X"].includes(fields[0]))
          return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    return false;
  }
  const result = spawnSync("ps", ["-A", "-o", "pid=,pgid=,stat="], {
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C" },
  });
  if (result.error || result.signal || result.status !== 0)
    throw new Error("无法查询验证作业进程组，请检查 ps 程序和权限。");
  return result.stdout.split("\n").some((line) => {
    const [pid, pgid, state] = line.trim().split(/\s+/);
    return (
      Number(pid) !== exclude && Number(pgid) === group && !/^[ZX]/.test(state)
    );
  });
};

const ownerAlive = (lock: string, owner: string): boolean => {
  const match = /^([1-9]\d*)-[^.]+\.([\w-]+)$/.exec(owner);
  if (!match || !Number.isSafeInteger(Number(match[1])))
    throw new Error(
      "验证锁记录中的进程号无效，请检查 git 公共目录中的锁文件。",
    );
  const content = readFileSync(join(lock, owner), "utf8");
  const record = content ? JSON.parse(content) : {};
  if (
    record.processGroup !== undefined &&
    record.processGroup !== Number(match[1])
  )
    throw new Error(
      "验证锁记录中的进程组无效，请检查 git 公共目录中的锁文件。",
    );
  const identity = processIdentity(Number(match[1]));
  const expected = Buffer.from(match[2], "base64url").toString();
  if (identity !== undefined) return identity === expected;
  return (
    process.platform !== "win32" &&
    record.processGroup !== undefined &&
    (process.platform !== "linux" ||
      expected.startsWith(
        `${readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim()}:`,
      )) &&
    groupAlive(record.processGroup)
  );
};

const inheritedOwner = (lock: string, marker: string | undefined): boolean => {
  if (!marker) return false;
  try {
    const value = JSON.parse(marker);
    if (
      value.lock !== lock ||
      typeof value.owner !== "string" ||
      readdirSync(lock).length !== 1 ||
      !readdirSync(lock).includes(value.owner)
    )
      return false;
    return ownerAlive(lock, value.owner);
  } catch {
    return false;
  }
};

const acquire = async (
  lock: string,
): Promise<{ release: () => void; marker: string; queuedMinutes: number }> => {
  const identity = processIdentity(process.pid);
  if (!identity) throw new Error("无法确定当前验证锁进程的启动时间。");
  let lastReport = -Infinity;
  let queuedAt: number | undefined;
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
        writeFileSync(
          owner,
          JSON.stringify({
            ...(process.platform === "win32"
              ? {}
              : { processGroup: process.pid }),
          }),
          { flag: "wx" },
        );
      } catch (error) {
        rmdirSync(lock);
        throw error;
      }
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        process.off("exit", release);
        if (
          process.platform !== "win32" &&
          groupAlive(process.pid, process.pid)
        )
          return;
        unlinkSync(owner);
        rmdirSync(lock);
      };
      process.once("exit", release);
      return {
        release,
        marker: JSON.stringify({ lock, owner: owner.slice(lock.length + 1) }),
        queuedMinutes:
          queuedAt === undefined ? 0 : (performance.now() - queuedAt) / 60000,
      };
    }
    queuedAt ??= performance.now();
    let reclaimed = false;
    try {
      const owners = readdirSync(lock);
      for (const owner of owners) {
        if (!ownerAlive(lock, owner)) {
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
      send({ type: "queue" });
    }
    await delay(1000);
  }
};

const send = (message: Message) => {
  if (process.connected) process.send!(message, () => {});
};

const run = (
  program: string,
  args: string[],
  options: SpawnOptions,
): Promise<Result> =>
  new Promise((resolveResult) => {
    const startedAt = new Date().toISOString();
    let failure: Error | undefined;
    const child = spawn(program, args, options);
    child.once("error", (error) => {
      failure = error;
    });
    child.once("close", (status, signal) =>
      resolveResult({
        status: failure ? null : status,
        signal,
        queuedMinutes: 0,
        startedAt,
        finishedAt: new Date().toISOString(),
        ...(failure ? { error: failure } : {}),
      }),
    );
  });

export const verificationWorker = async (): Promise<void> => {
  let ownership: Awaited<ReturnType<typeof acquire>> | undefined;
  try {
    const [lock, program, ...args] = process.argv.slice(1);
    ownership = await acquire(lock);
    send({
      type: "acquired",
      queuedMinutes: ownership.queuedMinutes,
      startedAt: new Date().toISOString(),
    });
    const result = await run(program, args, {
      env: { ...process.env, [markerKey]: ownership.marker },
      stdio: "inherit",
    });
    send({
      ...result,
      queuedMinutes: ownership.queuedMinutes,
      error: result.error?.message,
      type: "result",
    });
    process.exitCode = result.status ?? 2;
  } catch (error) {
    send({
      type: "result",
      status: null,
      signal: null,
      error: (error as Error).message,
    });
    process.exitCode = 2;
  } finally {
    ownership?.release();
  }
};

export const runVerification = async (
  checkout: string,
  enabled: boolean,
  program: string,
  args: string[],
  options: SpawnOptions,
): Promise<Result> => {
  const lock = resolve(
    checkout,
    git(checkout, ["rev-parse", "--git-common-dir"]),
    "run-spec-verification.lock",
  );
  if (!enabled || inheritedOwner(lock, options.env?.[markerKey]))
    return run(program, args, options);
  const streams = Array.isArray(options.stdio)
    ? options.stdio
    : [
        options.stdio ?? "inherit",
        options.stdio ?? "inherit",
        options.stdio ?? "inherit",
      ];
  let reported: Message | undefined;
  let queuedAt: number | undefined;
  let queuedMinutes = 0;
  let startedAt: string | null = null;
  const worker = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { verificationWorker } from ${JSON.stringify(import.meta.url)}; await verificationWorker();`,
      lock,
      program,
      ...args,
    ],
    {
      ...options,
      detached: process.platform !== "win32",
      stdio: [...streams, "ipc"],
    },
  );
  worker.on("message", (message: Message) => {
    if (message.type === "queue") {
      queuedAt ??= performance.now();
      console.log(queueMessage);
    } else if (message.type === "acquired") {
      queuedMinutes = message.queuedMinutes ?? 0;
      queuedAt = undefined;
      startedAt = message.startedAt ?? new Date().toISOString();
    } else if (message.type === "result") reported = message;
  });
  const forward = (signal: NodeJS.Signals) => {
    if (!worker.pid) return;
    try {
      process.kill(-worker.pid, signal);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  };
  const forwardInterrupt = () => forward("SIGINT");
  const forwardTermination = () => forward("SIGTERM");
  if (process.platform !== "win32") {
    process.on("SIGINT", forwardInterrupt);
    process.on("SIGTERM", forwardTermination);
  }
  return new Promise((resolveResult) => {
    let failure: Error | undefined;
    worker.once("error", (error) => {
      failure = error;
    });
    worker.once("close", (status, signal) => {
      process.off("SIGINT", forwardInterrupt);
      process.off("SIGTERM", forwardTermination);
      resolveResult({
        status: reported?.status ?? status,
        signal: reported?.signal ?? signal,
        queuedMinutes:
          reported?.queuedMinutes ??
          (queuedAt === undefined
            ? queuedMinutes
            : (performance.now() - queuedAt) / 60000),
        startedAt: reported?.startedAt ?? startedAt,
        finishedAt:
          reported?.finishedAt ?? (startedAt ? new Date().toISOString() : null),
        ...(reported?.error
          ? { error: new Error(reported.error) }
          : failure
            ? { error: failure }
            : {}),
      });
    });
  });
};
