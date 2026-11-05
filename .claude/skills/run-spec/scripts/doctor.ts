/**
 * Read-only run-spec doctor: register doctorCommand in tickets.ts. Inspect the
 * invoking checkout, main-worktree dispatcher and Claude-only skills, GitHub
 * settings, documentation and configuration. Never fix or write repository
 * state. Git ignore probes use a disposable work tree with copied applicable
 * .gitignore files and the original git directory/excludes; linked directories
 * use checkout-relative paths normalized by configuration loading for same-name
 * symlinks and git probes;
 * artifact/record directories are real directories.
 * Skill isolation checks project/ancestor and user Codex/shared roots, following
 * real paths. Tracked source skills and installed skills are both accepted.
 * Missing prerequisites exit 1; unexpected probe/runtime errors exit 2.
 * Probe the Claude CLI with --version; optional config values show their source.
 * Invalid optional configuration exits 2, preserving existing prerequisite exits.
 * Check an existing checkout-root .env with git check-ignore without reading it.
 * Resolve Codex through DispatchDock's configured path, then PATH, and probe its version.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative } from "node:path";
import { codexVersion } from "./dispatchdock.ts";
import { adapters } from "./dispatch/adapters.ts";
import { describeSeat, frameworkSettings, resolveSeat, seatNames, SeatConfigError } from "./dispatch/settings.ts";
import {
  CheckFailure,
  OptionalConfigError,
  dispatchConfig,
  entry,
  gh,
  ghResult,
  git,
  usageError,
  verificationEnvironment,
  type Command,
  type DispatchConfig,
  type Values,
} from "./shared.ts";

const requireCheck = (condition: boolean, detail: string): void => {
  if (!condition) throw new CheckFailure(detail);
};

const isFile = (path: string): boolean =>
  existsSync(path) && statSync(path).isFile();

const hasEntry = (path: string): boolean => {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
};

const within = (root: string, path: string): boolean => {
  const rel = relative(root, path);
  return (
    rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith("../"))
  );
};

const ancestors = (root: string): string[] => {
  const paths = [root];
  while (dirname(paths.at(-1)!) !== paths.at(-1))
    paths.push(dirname(paths.at(-1)!));
  return paths;
};

const skillLocations = (checkout: string, main: string) => {
  const projects = [...new Set([...ancestors(checkout), ...ancestors(main)])];
  const claude = [
    ...new Set([
      join(checkout, ".claude/skills"),
      join(main, ".claude/skills"),
      join(
        process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"),
        "skills",
      ),
    ]),
  ];
  const shared = [
    ...new Set([
      ...projects.flatMap((path) => [
        join(path, ".agents/skills"),
        join(path, ".codex/skills"),
      ]),
      join(homedir(), ".agents/skills"),
      join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "skills"),
      "/etc/codex/skills",
    ]),
  ];
  return { claude, shared };
};

const ignored = (root: string, directory: string, link: boolean): boolean => {
  const temporary = mkdtempSync(join(tmpdir(), "run-spec-doctor-"));
  try {
    const gitDirectory = git(root, ["rev-parse", "--absolute-git-dir"]);
    const parts = directory.replaceAll("\\", "/").split("/").filter(Boolean);
    for (let index = 0; index < parts.length; index++) {
      const parent = join(...parts.slice(0, index), ".gitignore");
      if (isFile(join(root, parent))) {
        mkdirSync(dirname(join(temporary, parent)), { recursive: true });
        writeFileSync(
          join(temporary, parent),
          readFileSync(join(root, parent)),
        );
      }
    }
    const target = join(temporary, ...parts);
    mkdirSync(dirname(target), { recursive: true });
    if (link) symlinkSync(root, target, "dir");
    else {
      mkdirSync(target, { recursive: true });
      writeFileSync(join(target, "doctor-probe"), "");
    }
    const probe = spawnSync(
      "git",
      [
        "--git-dir",
        gitDirectory,
        "--work-tree",
        temporary,
        "check-ignore",
        "--no-index",
        "-q",
        "--",
        link ? directory : `${directory.replace(/\/$/, "")}/doctor-probe`,
      ],
      { cwd: temporary, encoding: "utf8" },
    );
    if (probe.error || (probe.status !== 0 && probe.status !== 1))
      throw new Error("无法实测 git 忽略规则，请检查 git 和忽略文件的权限。");
    return probe.status === 0;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
};

const doctor = (values: Values): void => {
  if (values["dry-run"] !== undefined)
    throw usageError("doctor 始终只读，不接受 --dry-run。", doctorCommand.help);
  let failures = 0;
  let runtimeErrors = 0;
  const check = (
    name: string,
    repair: string,
    inspect: () => string | void,
  ): void => {
    try {
      const detail = inspect();
      console.log(`通过：${name}${detail ? `；${detail}` : ""}`);
    } catch (error) {
      failures++;
      if (!(error instanceof CheckFailure)) runtimeErrors++;
      const message =
        error instanceof Error && /\p{Script=Han}/u.test(error.message)
          ? error.message
          : "检查运行出错，请检查文件权限和运行环境。";
      console.error(`出错：不通过：${name}；${message}\n修法：${repair}`);
    }
  };
  const cwd = process.cwd();
  let checkout = "";
  let main = "";
  check(
    "git 与仓库属主",
    "让仓库属主修正权限；确认仓库可信后可执行 git config --global --add safe.directory <仓库绝对路径>；安装 git 并在仓库内运行。",
    () => {
      const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
        cwd,
        encoding: "utf8",
      });
      requireCheck(
        !result.error && result.status === 0,
        /dubious ownership|safe.directory/.test(result.stderr ?? "")
          ? "git 拒绝使用仓库：仓库属主不匹配。"
          : "当前用户不能使用 git 或当前目录不是 git 仓库。",
      );
      checkout = result.stdout.trim();
      main = git(checkout, ["worktree", "list", "--porcelain"])
        .split("\n")[0]
        .slice(9);
      requireCheck(
        typeof process.getuid !== "function" ||
          statSync(checkout).uid === process.getuid(),
        "仓库属主与当前用户不一致。",
      );
      return checkout;
    },
  );
  check("Node 版本", "升级 Node 到 22.18.0 或更新版本。", () => {
    const [major, minor] = process.versions.node.split(".").map(Number);
    requireCheck(
      major > 22 || (major === 22 && minor >= 18),
      `当前版本 ${process.versions.node}，需要至少 22.18.0。`,
    );
    return process.versions.node;
  });
  check("gh 版本", "安装或升级 GitHub CLI 到 2.83.0 或更新版本。", () => {
    const result = ghResult(["--version"]);
    const match = /gh version (\d+)\.(\d+)\.(\d+)/.exec(result.stdout ?? "");
    requireCheck(
      !result.error && result.status === 0 && !!match,
      "无法读取 gh 版本。",
    );
    requireCheck(
      Number(match![1]) > 2 ||
        (Number(match![1]) === 2 && Number(match![2]) >= 83),
      `当前版本 ${match![0]}，需要至少 2.83.0。`,
    );
    return match![0];
  });
  check(
    "gh 认证",
    "运行 gh auth login，并确认当前用户有目标仓库的读取权限。",
    () => {
      const result = ghResult(["auth", "status"]);
      requireCheck(
        !result.error && result.status === 0,
        "当前用户的 gh 认证不可用。",
      );
    },
  );
  let repo = "";
  check(
    "GitHub 仓库访问",
    "检查 git remote、gh 认证、仓库权限、网络和代理配置。",
    () => {
      repo = (
        JSON.parse(gh(["repo", "view", "--json", "nameWithOwner"])) as {
          nameWithOwner: string;
        }
      ).nameWithOwner;
      requireCheck(
        typeof repo === "string" && /^[\w.-]+\/[\w.-]+$/.test(repo),
        "无法确定 GitHub 仓库名称。",
      );
      return repo;
    },
  );
  check(
    "GitHub 执行角色标签",
    "补建 role:engineering、role:design、ready-for-human 三个标签。",
    () => {
      requireCheck(!!repo, "仓库访问检查未通过，无法读取标签。");
      const pages = JSON.parse(
        gh([
          "api",
          "--method",
          "GET",
          `repos/${repo}/labels`,
          "--paginate",
          "--slurp",
        ]),
      ) as { name: string }[][];
      const labels = new Set(pages.flat().map((label) => label.name));
      const missing = [
        "role:engineering",
        "role:design",
        "ready-for-human",
      ].filter((label) => !labels.has(label));
      requireCheck(missing.length === 0, `缺少标签：${missing.join("、")}。`);
    },
  );
  let settings: Record<string, unknown> | undefined;
  check(
    "GitHub 只允许 merge commit",
    "在 GitHub 仓库 Settings → General → Pull Requests 中启用 merge commit，关闭 squash merge 和 rebase merge。",
    () => {
      requireCheck(!!repo, "仓库访问检查未通过，无法读取设置。");
      settings = JSON.parse(gh(["api", "--method", "GET", `repos/${repo}`]));
      requireCheck(
        settings?.allow_merge_commit === true &&
          settings.allow_squash_merge === false &&
          settings.allow_rebase_merge === false,
        "合并方式必须只有 merge commit。",
      );
    },
  );
  check(
    "GitHub 合并后自动删除分支",
    "在 GitHub 仓库 Settings → General → Pull Requests 中打开 Automatically delete head branches。",
    () => {
      requireCheck(
        settings?.delete_branch_on_merge === true,
        "合并后自动删除分支未打开或无法读取设置。",
      );
    },
  );
  const root = checkout || cwd;
  const locations = skillLocations(root, main || root);
  const document = (path: string): string =>
    isFile(join(root, path)) ? readFileSync(join(root, path), "utf8") : "";
  for (const [name, path] of [
    ["Matt 工单约定", "docs/agents/issue-tracker.md"],
    ["Matt 领域文档说明", "docs/agents/domain.md"],
  ])
    check(
      name,
      `请用户运行 /setup-matt-pocock-skills，补齐非空的 ${path}。`,
      () => {
        requireCheck(document(path).trim().length > 0, `缺少或为空：${path}。`);
      },
    );
  check(
    "Matt 分诊标签说明",
    "请用户运行 /setup-matt-pocock-skills，补齐 docs/agents/triage-labels.md。",
    () => {
      const triage = [...locations.claude, ...locations.shared].some((path) =>
        hasEntry(join(path, "triage")),
      );
      requireCheck(
        !triage || document("docs/agents/triage-labels.md").trim().length > 0,
        "已安装 triage，但缺少或为空：docs/agents/triage-labels.md。",
      );
      return triage ? "已安装 triage，说明存在" : "未安装 triage，无需分诊说明";
    },
  );
  for (const name of ["run-spec", "setup-run-spec"]) {
    check(
      `技能隔离 ${name}`,
      `把 ${name} 放在 .claude/skills 或用户 Claude Code 专用技能目录，移除共享目录副本及指向共享目录的软链接；run-spec 的来源副本和安装副本都可用。`,
      () => {
        const installed = locations.claude
          .map((path) => join(path, name))
          .filter(hasEntry);
        const exposed = locations.shared
          .map((path) => join(path, name))
          .filter(hasEntry);
        if (name === "setup-run-spec" && !installed.length && !exposed.length)
          return "尚未安装，无需检查";
        requireCheck(
          exposed.length === 0,
          `Codex 可见的目录存在此技能：${exposed.join("、")}。`,
        );
        requireCheck(
          installed.some((path) => isFile(join(path, "SKILL.md"))),
          "Claude Code 专用目录中缺少有效的 SKILL.md。",
        );
        const shared = locations.shared
          .filter(existsSync)
          .map((path) => realpathSync(path));
        for (const path of installed) {
          requireCheck(existsSync(path), `技能软链接失效：${path}。`);
          requireCheck(
            !shared.some((base) => within(base, realpathSync(path))),
            `Claude Code 技能指向共享目录：${path}。`,
          );
        }
        return installed.join("、");
      },
    );
  }
  let config: DispatchConfig | undefined;
  check(
    "执行配置完整",
    "按 docs/agents/run-spec.md 补齐或修正 docs/agents/run-spec.json 的必填项；可选 codexConcurrency 为正整数（默认 2，可由 RUN_SPEC_CODEX_CONCURRENCY 覆盖），prCheckCommand 为非空参数数组（默认 gh pr checks {pr} --watch），verificationEnv 为字符串到字符串的对象（默认 {}），exclusiveVerification 为布尔值（默认 false），disposableIgnored 为 gitignore 模式数组（默认 []）；staticCheckCommand 为非空参数数组，staticOnlyPaths 为 gitignore 模式数组，后者需要同时配置前者。",
    () => {
      try {
        config = dispatchConfig(root);
      } catch (error) {
        if (error instanceof OptionalConfigError || error instanceof SeatConfigError) throw error;
        if (error instanceof SyntaxError)
          throw new CheckFailure("执行配置不是有效的 JSON。");
        if (error instanceof Error && /缺少|必须是/.test(error.message))
          throw new CheckFailure(error.message);
        throw error;
      }
    },
  );
  if (config) {
    const seats = config.seatConfiguration;
    const used = new Set<string>();
    console.log(`用户席位配置：${seats.userFile}；${seats.userExists ? "已读取" : "文件不存在，使用仓库和内置默认"}`);
    console.log(`工作类型词表：${JSON.stringify(seats.workTypes)}；来源：仓库 run-spec.json.workTypes`);
    for (const [name, description] of Object.entries(seats.workTypes)) {
      if (!Object.values(seats.user.seats ?? {}).some(profiles => Object.hasOwn(profiles, name)))
        console.log(`提示：工作类型「${name}」（${description}）在词表内，但用户未配档；各席位按实际配置回落到 default。`);
    }
    for (const seat of seatNames) {
      for (const workType of ["default", ...Object.keys(seats.workTypes)]) {
        check(`席位配置 ${seat}.${workType}`, "修正 seats 分档、agents 框架配置或环境变量后重试。", () => {
          const entries = resolveSeat(seats, seat, workType, {}, workType === "default" ? "内置默认" : "仓库 workTypes");
          for (const [index, settings] of entries.entries()) {
            used.add(settings.agent);
            console.log(`${seat}.${workType}${entries.length > 1 ? `[${index}]` : ""}：${describeSeat(settings)}`);
            const framework = frameworkSettings(seats, settings.agent);
            console.log(`框架配置 ${settings.agent}：${JSON.stringify(framework)}`);
            const adapter = adapters[settings.agent];
            if (!adapter) {
              console.log(`提示：框架 ${settings.agent} 尚未接入适配器，当前不可用；权限映射损失未知${settings.permission === "read-only" ? "，无法确认强制只读" : ""}。`);
            } else {
              const mapping = adapter.permissions[settings.permission];
              console.log(`权限映射 ${settings.agent}/${settings.permission}：参数 ${JSON.stringify(mapping.args)}；损失：${mapping.loss ?? "无"}`);
              if (mapping.loss && settings.permission === "read-only") console.log(`提示：只读席位 ${seat} 的强制只读存在限制：${mapping.loss}`);
            }
          }
        });
      }
    }
    for (const agent of used) {
      const settings = frameworkSettings(seats, agent);
      check(agent === "codex" ? "Codex CLI 可用" : agent === "claude" ? "claude CLI 可用" : `席位框架安装 ${agent}`, `安装 ${agent === "claude" ? "Claude Code CLI" : agent} 并加入 PATH，或配置 agents.${agent}.path。`, () => {
        if (agent === "codex") return codexVersion(settings.path, settings.sources.path);
        const path = settings.path ?? agent;
        const result = spawnSync(/\.(?:js|mjs|cjs)$/i.test(path) ? process.execPath : path, [...(/\.(?:js|mjs|cjs)$/i.test(path) ? [path] : []), "--version"], { encoding: "utf8", timeout: 10000, shell: false });
        requireCheck(!result.error && result.status === 0 && !!result.stdout.trim(), `框架 ${agent} 未安装或无法运行 ${path} --version`);
        return `${result.stdout.trim()}；路径：${path}；来源：${settings.sources.path}${adapters[agent] ? "" : "；适配器尚未接入，派发不可用"}`;
      });
    }
    check("兼容配置 codexSandbox/codexConcurrency", "权限建议迁到 seats.engineering.default.permission，并发迁到 agents.codex.concurrency。", () =>
      `codexSandbox=${config!.codexSandbox}（来源：仓库旧项，仅作工程 Codex 的兼容默认）；codexConcurrency=${config!.codexConcurrency}（来源：${frameworkSettings(seats, "codex").sources.concurrency}）；建议改用 seats/agents，新席位字段优先。`);
  }
  for (const key of [
    "codexConcurrency",
    "prCheckCommand",
    "exclusiveVerification",
    "disposableIgnored",
    "staticCheckCommand",
    "staticOnlyPaths",
  ] as const)
    check(
      `可选配置 ${key}`,
      "先修正执行配置和 RUN_SPEC_CODEX_CONCURRENCY 环境变量，再重新运行 doctor。",
      () => {
        requireCheck(!!config, "执行配置未通过，无法读取实际取值和来源。");
        return `实际取值 ${JSON.stringify(config![key])}；来源：${config!.optionalSources[key]}`;
      },
    );
  check(
    "可选配置 verificationEnv",
    "把 verificationEnv 配成字符串到字符串的对象，或省略以使用默认 {}；不要放密钥。",
    () => {
      requireCheck(!!config, "执行配置未通过，无法读取实际取值和来源。");
      const effective = verificationEnvironment(config!, main || root);
      const sources = Object.fromEntries(
        Object.keys(effective).map((key) => [
          key,
          process.env[key] === undefined
            ? config!.optionalSources.verificationEnv
            : "进程环境",
        ]),
      );
      return `实际取值 ${JSON.stringify(effective)}；来源：${config!.optionalSources.verificationEnv}；各变量来源：${JSON.stringify(sources)}`;
    },
  );
  check(
    "过时配置 dispatchScript",
    "删除执行配置中的 dispatchScript；run-spec 已自带派发层。",
    () => config?.dispatchScript === undefined ? "未配置，无需处理" : "已忽略 dispatchScript，可以删除；来源：仓库 run-spec.json.dispatchScript；派发使用 run-spec 内置入口。",
  );
  const directories: [string, string, boolean][] = [
    ["派发记录目录", ".codex-runs", false],
  ];
  if (config)
    directories.push(
      ["验收产物目录", config.acceptanceRoot, false],
      ...config.symlinkDirectories.map(
        (directory): [string, string, boolean] => [
          "worktree 软链接目录",
          directory,
          true,
        ],
      ),
    );
  else
    check(
      "验收产物及软链接目录忽略",
      "先补齐执行配置，再重新运行 doctor。",
      () => {
        throw new CheckFailure("执行配置未通过，无法确定要检查的目录。");
      },
    );
  for (const [name, directory, link] of directories)
    check(
      `${name}忽略 ${directory}`,
      `在 .gitignore 中添加能覆盖 ${directory} 的规则${link ? "，不要带末尾斜杠（例如 references 而非 references/）" : "，并确保其下的产物都被忽略"}；取消此目录中已有文件的 git 跟踪。`,
      () => {
        requireCheck(!!checkout, "git 检查未通过，无法实测忽略规则。");
        requireCheck(
          !git(root, ["ls-files", "--", directory]),
          "目录中存在 git 跟踪的文件，忽略规则对它们不生效。",
        );
        requireCheck(
          ignored(root, directory, link),
          link
            ? "同名软链接实测未被 git 忽略；带末尾斜杠的规则只匹配真目录。"
            : "同名目录下的产物未被 git 忽略。",
        );
        return link
          ? "同名软链接实测通过，仓库未改动"
          : "同名目录产物实测通过，仓库未改动";
      },
    );
  check("仓库根目录 .env 忽略", "在 .gitignore 中加入 .env", () => {
    requireCheck(!!checkout, "git 检查未通过，无法确定仓库根目录。");
    if (!hasEntry(join(checkout, ".env"))) return ".env 不存在";
    const result = spawnSync("git", ["check-ignore", "-q", "--", ".env"], {
      cwd: checkout,
      encoding: "utf8",
    });
    if (result.error || (result.status !== 0 && result.status !== 1))
      throw new Error("无法实测 .env 的 git 忽略规则，请检查 git 和文件权限。");
    requireCheck(result.status === 0, ".env 未被 git 忽略。");
    return "git 实测 .env 已被忽略";
  });
  const agents = document("AGENTS.md");
  check(
    "AGENTS.md 角色一节",
    "在 AGENTS.md 增加角色一节，写明设计负责人和工程负责人的分工。",
    () => {
      const section =
        /^#{1,6}\s+[^\n]*(?:角色|Roles?)\b[^\n]*\n([\s\S]*?)(?=^#{1,6}\s|$(?![\s\S]))/im.exec(
          agents,
        ) ??
        /^#{1,6}\s+[^\n]*角色[^\n]*\n([\s\S]*?)(?=^#{1,6}\s|$(?![\s\S]))/m.exec(
          agents,
        );
      requireCheck(
        !!section &&
          /设计负责人|design/i.test(section[1]) &&
          /工程负责人|engineering/i.test(section[1]),
        "缺少同时说明设计与工程分工的角色一节。",
      );
    },
  );
  check(
    "AGENTS.md 提交尾注",
    "在 AGENTS.md 的提交格式代码块中列出 Refs: #<工单号> 和 Role: design | engineering，置于同一尾注段。",
    () => {
      const blocks = [...agents.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map(
        (match) => match[1],
      );
      requireCheck(
        blocks.some(
          (block) =>
            /^\s*Refs:\s*#/m.test(block) &&
            /^\s*Role:\s*[^\n]*(?:design|engineering)/m.test(block),
        ),
        "提交格式代码块缺少 Refs 和 Role 尾注。",
      );
    },
  );
  console.log(
    `自检结束：${failures === 0 ? "全部通过" : `${failures} 项不通过`}${runtimeErrors ? `，${runtimeErrors} 项运行出错` : ""}。`,
  );
  process.exitCode = runtimeErrors ? 2 : failures ? 1 : 0;
};

export const doctorCommand: Command = {
  options: {},
  positionals: 0,
  execute: doctor,
  help: `${entry} doctor
只读自检，逐项输出通过、不通过和修法，不改仓库、不改 GitHub。
列出 seats 五个席位的 default 及 workTypes 各档实际值、逐字段来源、回落原因和 review 列表。
用户文件 $XDG_CONFIG_HOME/agent-workflow/seats.json（默认 ~/.config/agent-workflow/seats.json）不存在时使用默认；格式错误退出 2。
优先级：参数 > 环境变量 > 仓库 > 用户 > 内置；框架路径和并发放 agents，报告各框架安装情况。
权限映射及损失直接取适配器 permissions；只读有损失时提示，未接适配器如实报告不可用。
词表内用户未配档只提示；codexSandbox/codexConcurrency 继续兼容并建议迁移。
检查 git 可用性与仓库属主、gh 认证与仓库访问、gh >= 2.83、Node >= 22.18、claude CLI 可用；
Codex CLI 先查席位 agents.codex.path，兼容旧 DispatchDock 配置，再查 PATH，并运行 --version；失败列出查找位置；
GitHub 的 role:engineering、role:design、ready-for-human 标签、只允许 merge commit、合并后自动删除分支；
Matt 的工单约定和领域文档说明，安装 triage 时检查分诊标签说明；
run-spec（以及装了的 setup-run-spec）的 Claude Code 专用位置及 Codex 共享目录隔离；
执行配置完整；dispatchScript 不再使用，存在时提示可删除；验收产物目录、.codex-runs 目录和每个 worktree 软链接目录被 git 忽略；
报告可选配置 codexConcurrency、prCheckCommand、verificationEnv、exclusiveVerification、disposableIgnored 的实际取值及来源；
报告 staticCheckCommand（默认 null，未配置）、staticOnlyPaths（默认 []）的实际取值及来源；
staticCheckCommand 为非空参数数组；staticOnlyPaths 为非空单行 gitignore 模式的数组，不能含 NUL；
只配 staticOnlyPaths 是配置错误；上述两项格式或组合错误以 2 退出。
disposableIgnored 默认 []，每项为非空单行 gitignore 模式，不能含 NUL；格式错误退出 2；
verificationEnv 显示替换 {mainRoot} 并保留已有进程环境后的实际值与逐变量来源；格式错误退出 2；
软链接目录用临时目录中的同名软链接实测，识别带末尾斜杠的无效规则；
仓库根目录 .env 存在时用 git 实测被忽略，未被忽略的修法是在 .gitignore 中加入 .env；不存在时通过；
AGENTS.md 的角色一节及提交格式中的 Refs、Role 尾注。
全部通过退出 0；前提或必填配置检查不通过退出 1；可选配置格式、参数错误或检查运行出错退出 2。`,
};
