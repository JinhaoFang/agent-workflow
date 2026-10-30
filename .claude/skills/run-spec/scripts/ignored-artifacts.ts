/**
 * Ignored artifact protection for dispatch, land and cleanup. Enumerate ignored
 * leaves with NUL-delimited git output, expanding ignored directories without
 * following symlinks (including cloned repositories and empty directories).
 * Installation snapshots live in the worktree's private git directory. Initial
 * dispatch records all installation leaves; later installs add only new paths
 * and retain previously classified installation paths, so existing ticket
 * artifacts never become installation output on retries. Legacy trees retain
 * their conservative status across retries. Snapshots compare paths, not content.
 * Land excludes successfully copied record/QA leaves and moves remaining leaves,
 * archiving previous copies on collisions. Summaries show at most 20 top-level
 * paths and file counts, never individual leaf names.
 * Land may discard configured gitignore matches using Git's check-ignore in an
 * isolated temporary repository. Record/QA roots and copied leaves are protected;
 * the default empty pattern list preserves prior behavior, including cleanup.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { git } from "./shared.ts";

type Snapshot = { version: 1; files: string[]; legacy: boolean };

const snapshotFile = (worktree: string): string =>
  join(
    git(worktree, ["rev-parse", "--absolute-git-dir"]),
    "run-spec-installation.json",
  );

const readSnapshot = (file: string): Snapshot | undefined => {
  if (!existsSync(file)) return undefined;
  const snapshot = JSON.parse(readFileSync(file, "utf8"));
  if (
    snapshot?.version !== 1 ||
    typeof snapshot.legacy !== "boolean" ||
    !Array.isArray(snapshot.files) ||
    !snapshot.files.every(
      (path: unknown) =>
        typeof path === "string" &&
        path.length > 0 &&
        !isAbsolute(path) &&
        !path.split("/").some((part) => part === ".." || part === "."),
    )
  )
    throw new Error(`安装产物快照格式无效，worktree 已保留：${file}`);
  return snapshot;
};

const leaves = (root: string, path = ""): string[] => {
  const absolute = join(root, path);
  if (!lstatSync(absolute).isDirectory()) return [path];
  const entries = readdirSync(absolute, { withFileTypes: true });
  if (!entries.length) return path ? [`${path}/`] : [];
  return entries.flatMap((entry) => {
    const child = path ? `${path}/${entry.name}` : entry.name;
    return entry.isDirectory() ? leaves(root, child) : [child];
  });
};

export const artifactLeaves = (worktree: string, paths: string[]): string[] =>
  paths
    .filter((path) => existsSync(join(worktree, path)))
    .flatMap((path) => leaves(worktree, path));

const ignoredFiles = (worktree: string, directories: string[]): string[] => {
  const links = directories.filter((directory) => {
    try {
      return lstatSync(join(worktree, directory)).isSymbolicLink();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  });
  const result = spawnSync(
    "git",
    [
      "ls-files",
      "--others",
      "--ignored",
      "--exclude-standard",
      "--directory",
      "-z",
    ],
    { cwd: worktree, encoding: "utf8", maxBuffer: Infinity },
  );
  if (result.error || result.signal || result.status !== 0)
    throw new Error(`无法读取被忽略的文件，worktree 已保留：${worktree}`);
  return result.stdout
    .split("\0")
    .filter(Boolean)
    .filter(
      (path) =>
        !links.some((link) => path === link || path.startsWith(`${link}/`)),
    )
    .flatMap((path) => leaves(worktree, path.replace(/\/$/, "")))
    .filter(
      (path) =>
        !links.some((link) => path === link || path.startsWith(`${link}/`)),
    )
    .sort();
};

export const prepareInstallationSnapshot = (
  worktree: string,
  directories: string[],
  initial = false,
): (() => void) => {
  const file = snapshotFile(worktree);
  const previous = readSnapshot(file);
  const first = initial && !previous;
  const before = new Set(first ? [] : ignoredFiles(worktree, directories));
  const installed = new Set(previous?.files);
  return () => {
    const snapshot: Snapshot = {
      version: 1,
      legacy: !first && (previous?.legacy ?? true),
      files: ignoredFiles(worktree, directories).filter(
        (path) => installed.has(path) || !before.has(path),
      ),
    };
    const temporary = `${file}.${process.pid}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify(snapshot));
      renameSync(temporary, file);
    } finally {
      rmSync(temporary, { force: true });
    }
  };
};

export const ignoredArtifactPlan = (
  worktree: string,
  directories: string[],
) => {
  const snapshot = readSnapshot(snapshotFile(worktree));
  const legacy = !snapshot || snapshot.legacy;
  const installed = new Set(legacy ? [] : snapshot.files);
  return {
    legacy,
    files: ignoredFiles(worktree, directories).filter(
      (path) => !installed.has(path),
    ),
  };
};

export const printArtifactList = (files: string[]): void => {
  const counts = new Map<string, number>();
  for (const file of files) {
    const top = file.split("/")[0];
    counts.set(top, (counts.get(top) ?? 0) + (file.endsWith("/") ? 0 : 1));
  }
  const entries = [...counts].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  for (const [path, count] of entries.slice(0, 20))
    console.log(`  ${JSON.stringify(path)}：${count} 个文件`);
  if (entries.length > 20)
    console.log(`  其余 ${entries.length - 20} 个顶层路径已省略`);
  console.log(
    `  合计 ${entries.length} 个顶层路径，${[...counts.values()].reduce((sum, count) => sum + count, 0)} 个文件`,
  );
};

export const printKeptDirectory = (directory: string): void => {
  console.log(`删除保留目录：${directory}`);
  printArtifactList(leaves(directory));
};

const disposableFiles = (files: string[], patterns: string[]): Set<string> => {
  if (!files.length || !patterns.length) return new Set();
  const temporary = mkdtempSync(join(tmpdir(), "run-spec-disposable-"));
  try {
    git(temporary, ["init", "--quiet", "--template="]);
    writeFileSync(join(temporary, ".gitignore"), `${patterns.join("\n")}\n`);
    const result = spawnSync(
      "git",
      [
        "-c",
        "core.excludesFile=",
        "check-ignore",
        "--no-index",
        "--stdin",
        "-z",
      ],
      {
        cwd: temporary,
        encoding: "utf8",
        input: `${files.join("\0")}\0`,
        maxBuffer: Infinity,
      },
    );
    if (result.error || result.signal || ![0, 1].includes(result.status ?? -1))
      throw new Error("无法匹配 disposableIgnored 模式，worktree 已保留");
    return new Set(result.stdout.split("\0").filter(Boolean));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
};

export const keepIgnoredArtifacts = (
  worktree: string,
  directories: string[],
  destination: string,
  dryRun: boolean,
  copiedPaths: string[] = [],
  patterns: string[] = [],
  protectedDirectories: string[] = [],
): void => {
  const plan = ignoredArtifactPlan(worktree, directories);
  const copied = new Set(copiedPaths);
  plan.files = plan.files.filter((file) => !copied.has(file));
  const protectedPaths = protectedDirectories.map((directory) =>
    relative(worktree, resolve(worktree, directory)).split(sep).join("/"),
  );
  const discarded = disposableFiles(
    plan.files.filter(
      (file) =>
        !protectedPaths.some(
          (directory) => file === directory || file.startsWith(`${directory}/`),
        ),
    ),
    patterns,
  );
  plan.files = plan.files.filter((file) => !discarded.has(file));
  if (patterns.length) {
    const count = (files: string[]) =>
      files.filter((file) => !file.endsWith("/")).length;
    console.log(
      `按 disposableIgnored 模式${dryRun ? "将删除" : "删除"} ${count([...discarded])} 个被忽略文件`,
    );
    console.log(
      `${dryRun ? "将保留" : "保留"} ${count(plan.files)} 个被忽略文件 → ${destination}`,
    );
  }
  if (plan.legacy)
    console.log(
      patterns.length
        ? "没有原始安装产物快照（旧 worktree），派发记录和验收产物仍受保护，其余被忽略的条目按 disposableIgnored 配置删除或保留。"
        : "没有原始安装产物快照（旧 worktree），除配置的软链接与已复制的本工单记录、验收产物外，全部被忽略的条目均保留。",
    );
  if (!dryRun)
    for (const file of discarded) {
      if (file.endsWith("/")) rmdirSync(join(worktree, file));
      else rmSync(join(worktree, file));
    }
  if (!plan.files.length) return;
  console.log(`${dryRun ? "将移走" : "移走"}被忽略的条目 → ${destination}`);
  printArtifactList(plan.files);
  console.log(
    "需要的文件请从保留目录拷回主工作区；cleanup 会列出并删除本 spec 的保留目录。",
  );
  if (dryRun) return;
  const entryAt = (path: string) => {
    try {
      return lstatSync(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  };
  for (const directory of [resolve(destination, ".."), destination]) {
    const entry = entryAt(directory);
    if (entry && !entry.isDirectory())
      throw new Error(
        `保留目录已被占用或是软链接，worktree 已保留：${directory}`,
      );
  }
  mkdirSync(destination, { recursive: true });
  let archive: string | undefined;
  const archiveExisting = (path: string): void => {
    if (!archive) {
      archive = mkdtempSync(join(destination, ".previous-"));
      console.log(`已有同名条目移到历史保留目录：${archive}`);
    }
    const target = join(archive, relative(destination, path));
    mkdirSync(resolve(target, ".."), { recursive: true });
    renameSync(path, target);
  };
  for (const file of plan.files) {
    const target = join(destination, file);
    let directory = destination;
    for (const part of file.split("/").slice(0, -1)) {
      directory = join(directory, part);
      const entry = entryAt(directory);
      if (entry && !entry.isDirectory()) archiveExisting(directory);
      mkdirSync(directory, { recursive: true });
    }
    if (file.endsWith("/")) {
      rmdirSync(join(worktree, file));
    } else {
      if (entryAt(target)) archiveExisting(target);
      renameSync(join(worktree, file), target);
    }
  }
};
