/**
 * Shared node:test fixtures: disposable directories/Git repositories, command
 * runners. No network is required. Pass a TestContext to register cleanup or
 * clean manually.
 * Repository helpers disable signing and hooks only in their temporary clones.
 */
import { execFileSync, spawnSync } from "node:child_process";
import type {
  ExecFileSyncOptionsWithStringEncoding,
  SpawnSyncOptionsWithStringEncoding,
} from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { TestContext } from "node:test";

export const temporaryDirectory = (context?: TestContext): string => {
  const root = mkdtempSync(join(tmpdir(), "workflow-test-"));
  context?.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
};

export const runCommand = (
  program: string,
  args: string[],
  options: Omit<SpawnSyncOptionsWithStringEncoding, "encoding"> & {
    encoding?: BufferEncoding;
  } = {},
) => spawnSync(program, args, { timeout: 30000, ...options, encoding: "utf8" });

export const commandOutput = (
  program: string,
  args: string[],
  options: Omit<ExecFileSyncOptionsWithStringEncoding, "encoding"> & {
    encoding?: BufferEncoding;
  } = {},
): string =>
  execFileSync(program, args, { timeout: 30000, ...options, encoding: "utf8" });

export const gitRepository = (
  context?: TestContext,
  files: Record<string, string> = {},
) => {
  const root = temporaryDirectory(context);
  const git = (args: string[]): string =>
    commandOutput("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: "pipe",
    }).trim();
  git(["init", "--quiet", "--initial-branch=main"]);
  git(["config", "core.hooksPath", join(root, "no-hooks")]);
  git(["config", "commit.gpgSign", "false"]);
  git(["config", "user.name", "Workflow Test"]);
  git(["config", "user.email", "workflow-test@example.com"]);
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), contents);
  }
  return { root, git };
};
