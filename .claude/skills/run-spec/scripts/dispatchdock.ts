/**
 * Built-in registry with DispatchDock v1 compatibility: resolve registry home,
 * fold complete registry events and count live wrapper/agent PIDs.
 * Interrupted records retain a slot while an agent is alive; ended records do
 * not. A global directory lock covers admission through startup registration,
 * including managed starts. Dead lock owners are removed by unlinking their
 * specific owner file before removing the empty directory; incomplete locks
 * recover after ten seconds. Queue messages are shared across admission/retry
 * waits and limited to one per five minutes. Missing framework means Codex;
 * capacity is counted by framework. Existing registry rows are not rewritten.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { CheckFailure } from "./shared.ts";

export const dispatchHome = (): string => {
  const env = process.env;
  if (env.CODEX_DISPATCH_HOME) return resolve(env.CODEX_DISPATCH_HOME);
  const user =
    (process.platform === "win32"
      ? env.USERPROFILE || env.HOME
      : env.HOME || env.USERPROFILE) || homedir();
  return process.platform === "win32"
    ? join(env.APPDATA || join(user, "AppData", "Roaming"), "codex-dispatch")
    : join(env.XDG_CONFIG_HOME || join(user, ".config"), "codex-dispatch");
};

export const alive = (pid: unknown): boolean => {
  if (!Number.isSafeInteger(pid) || Number(pid) < 1) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
};

export type RunningDispatch = {
  id: string;
  name: string;
  repo: string;
  started: number;
  pid: number;
  agentPid?: number;
  framework: string;
  ended?: boolean;
  interrupted?: boolean;
};

export const runningDispatches = (): RunningDispatch[] => {
  let text: string;
  try {
    text = readFileSync(join(dispatchHome(), "runs.jsonl"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const records = new Map<string, RunningDispatch>();
  for (const line of text.slice(0, text.lastIndexOf("\n") + 1).split("\n")) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event?.v !== 1 || typeof event.id !== "string") continue;
    if (event.event === "start") {
      if (
        typeof event.name === "string" &&
        typeof event.repo === "string" &&
        isAbsolute(event.repo) &&
        Number.isFinite(event.started) &&
        !Number.isNaN(new Date(event.started).getTime())
      )
        records.set(event.id, {
          id: event.id,
          name: event.name,
          repo: event.repo,
          started: event.started,
          pid: event.pid,
          framework: event.framework ?? event.agent ?? "codex",
        });
    } else {
      const record = records.get(event.id);
      if (!record) continue;
      if (event.event === "spawned")
        record.agentPid = event.agentPid ?? event.codexPid;
      if (event.event === "end") record.ended = true;
      if (event.event === "interrupted") record.interrupted = true;
    }
  }
  return [...records.values()].filter(
    (record) =>
      !record.ended &&
      (alive(record.agentPid) || (!record.interrupted && alive(record.pid))),
  );
};

export const sameDirectory = (left: string, right: string): boolean => {
  const canonical = (path: string) =>
    existsSync(path) ? realpathSync(path) : resolve(path);
  const a = canonical(left);
  const b = canonical(right);
  return process.platform === "win32"
    ? a.toLowerCase() === b.toLowerCase()
    : a === b;
};

export const assertIdle = (worktree: string): void => {
  const running = runningDispatches().find((run) =>
    sameDirectory(run.repo, worktree),
  );
  if (running)
    throw new CheckFailure(
      `worktree 有活着的运行 ${running.name}，不能派发或续做：${worktree}`,
    );
};

export const queueReporter = (): ((reason: string) => void) => {
  let last = -Infinity;
  return (reason) => {
    const now = Date.now();
    if (now - last < 5 * 60 * 1000) return;
    last = now;
    console.log(`排队中：${reason}；有名额后自动开始。`);
  };
};

export const dispatchSlot = async (
  limit: number,
  worktree: string,
  queued: (reason: string) => void,
  framework = "codex",
): Promise<() => void> => {
  const lock = join(dispatchHome(), "run-spec-dispatch.lock");
  mkdirSync(dispatchHome(), { recursive: true });
  for (;;) {
    let acquired = false;
    try {
      mkdirSync(lock);
      acquired = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    if (acquired) {
      const owner = join(lock, String(process.pid));
      writeFileSync(owner, "");
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        process.off("exit", release);
        unlinkSync(owner);
        rmdirSync(lock);
      };
      process.once("exit", release);
      try {
        assertIdle(worktree);
        const count = runningDispatches().filter(run => run.framework === framework).length;
        if (count < limit) return release;
        queued(`运行 ${count}/${limit}`);
      } catch (error) {
        release();
        throw error;
      }
      release();
    } else {
      try {
        const owners = readdirSync(lock);
        const owner = owners.find((file) => /^[1-9]\d*$/.test(file));
        if (owner && !alive(Number(owner))) {
          unlinkSync(join(lock, owner));
          rmdirSync(lock);
        } else if (
          !owners.length &&
          Date.now() - statSync(lock).mtimeMs > 10000
        ) {
          rmdirSync(lock);
        }
      } catch (error) {
        if (
          !["ENOENT", "ENOTEMPTY"].includes(
            (error as NodeJS.ErrnoException).code ?? "",
          )
        )
          throw error;
      }
      queued("正在等待其他派发完成启动检查");
    }
    await delay(1000);
  }
};
