/**
 * Run `node tools/check-doc-commands.ts [repository-root]` to check documented
 * pnpm scripts/built-ins and literal repository-relative node entry files.
 * Scan backtick spans (including fenced commands) in Git-visible AGENTS.md,
 * README.md, docs/{README,roadmap}.md, docs/roles/, docs/agents/, and Markdown
 * in .claude/skills/{run-spec,setup-run-spec}/. Skip missing documents, research,
 * reports and docs/workflow/bootstrap.md. Project scripts come from package.json;
 * the pnpm built-in snapshot is pinned separately below.
 * Skip angle-bracket placeholders and dynamic/absolute node paths. Commands
 * are inspected as text, never executed; the static built-in snapshot matches
 * the builtinsVersion below, checked against packageManager on every run.
 * Source: https://registry.npmjs.org/pnpm/10.34.6
 * On pnpm upgrades, download the official pinned package and confirm its version
 * using Node on bin/pnpm.cjs. Compare help --all, commandNames registrations
 * (including completion-server), the npm passthrough allowlist, and run fallback
 * aliases; update this snapshot/version and CLI fixture tests together. Checking
 * documents never invokes pnpm; do not trust a wrapper's version/help alone.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { reportError, usageError } from "./cli.ts";

const builtinsVersion = "10.34.6";
const builtins = new Set(
  `access add adduser approve-builds audit bin bugs c cache cat-file cat-index
  ci clean-install completion completion-server config create dedupe deploy
  deprecate dislink dist-tag dlx docs doctor edit env exec fetch find find-hash
  get help home i ic ignored-builds import info init install install-clean
  install-test issues it la licenses link list ll ln login logout ls m multi
  outdated owner pack patch patch-commit patch-remove ping pkg prefix profile
  prune publish rb rebuild recursive remove repo restart rm root run run-script
  s se search self-update server set set-script setup show star stars start
  store t team test token tst un uni uninstall unlink unpublish unstar up
  update upgrade v version view whoami why xmas`.split(/\s+/),
);

const isRuleDocument = (path: string): boolean =>
  ["AGENTS.md", "README.md", "docs/README.md", "docs/roadmap.md"].includes(path) ||
  (path.endsWith(".md") &&
    (/^docs\/(?:roles|agents)\//.test(path) ||
      /^\.claude\/skills\/(?:run-spec|setup-run-spec)\//.test(path)));

const isFile = (path: string): boolean => {
  try {
    return statSync(path).isFile();
  } catch (error) {
    if (
      ["ENOENT", "ENOTDIR"].includes(
        (error as NodeJS.ErrnoException).code ?? "",
      )
    )
      return false;
    throw error;
  }
};

const main = (): void => {
  const usage = "node tools/check-doc-commands.ts [仓库根目录]";
  const [rootArg, ...extra] = process.argv.slice(2);
  if (rootArg === "--help" && extra.length === 0) {
    console.log(`用法：${usage}\n检查规则文档里的 pnpm 命令和 node 脚本路径。`);
    return;
  }
  if (extra.length || rootArg?.startsWith("-")) {
    throw usageError("最多提供一个仓库根目录。", usage);
  }
  const root = resolve(rootArg ?? process.cwd());
  const manifest = JSON.parse(
    readFileSync(resolve(root, "package.json"), "utf8"),
  );
  const scripts = new Set(Object.keys(manifest.scripts ?? {}));
  const paths = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8", stdio: "pipe" },
  ).split("\0");
  let failures = 0;
  const pnpmVersion = /^pnpm@([^+]+)(?:\+.*)?$/.exec(
    manifest.packageManager ?? "",
  )?.[1];
  if (pnpmVersion !== builtinsVersion) {
    console.error(
      `出错：package.json:1 doc-command pnpm 白名单版本 ${builtinsVersion} 与 packageManager 版本 ${pnpmVersion ?? manifest.packageManager ?? "未声明"} 不一致；请按 tools/check-doc-commands.ts 文件头的方法更新白名单和版本。`,
    );
    failures += 1;
  }

  for (const path of [...new Set(paths)].filter(isRuleDocument).sort()) {
    const absolute = resolve(root, path);
    if (!isFile(absolute)) continue;
    const text = readFileSync(absolute, "utf8");
    for (const span of text.matchAll(/(?<!`)(`+)(?!`)([\s\S]*?)\1(?!`)/g)) {
      const content = span[2];
      for (const invocation of content.matchAll(
        /(?:^|[\r\n]|&&|\|\||;)\s*(pnpm|node)\s+([^\r\n;&|]*)/g,
      )) {
        const command = `${invocation[1]} ${invocation[2].trim()}`;
        if (/<[^>\r\n]+>/.test(command)) continue;
        const tokens = invocation[2].match(/"[^"]*"|'[^']*'|[^\s]+/g) ?? [];
        let reason: string | undefined;
        if (invocation[1] === "pnpm") {
          while (
            [
              "-s",
              "--silent",
              "-w",
              "--workspace-root",
              "-r",
              "--recursive",
            ].includes(tokens[0] ?? "")
          ) {
            tokens.shift();
          }
          const explicitRun = ["run", "run-script"].includes(tokens[0] ?? "");
          if (explicitRun) tokens.shift();
          const name = tokens[0]?.replace(/^(?:"(.*)"|'(.*)')$/, "$1$2");
          if (
            name &&
            !name.startsWith("-") &&
            !scripts.has(name) &&
            (explicitRun || !builtins.has(name))
          ) {
            reason = `项目脚本${explicitRun ? "" : "或 pnpm 内置命令"}不存在：${command}`;
          }
        } else {
          const file = tokens[0]?.replace(/^(?:"(.*)"|'(.*)')$/, "$1$2");
          if (
            file &&
            !file.startsWith("-") &&
            !isAbsolute(file) &&
            !/[$`~*?{}]/.test(file) &&
            !isFile(resolve(root, file))
          ) {
            reason = `node 脚本文件不存在：${command}`;
          }
        }
        if (reason) {
          const offset =
            span.index +
            span[1].length +
            invocation.index +
            invocation[0].indexOf(invocation[1]);
          const line = text.slice(0, offset).split("\n").length;
          console.error(`出错：${path}:${line} doc-command ${reason}`);
          failures += 1;
        }
      }
    }
  }
  if (failures) process.exitCode = 1;
};

try {
  main();
} catch (error) {
  reportError(error);
}
