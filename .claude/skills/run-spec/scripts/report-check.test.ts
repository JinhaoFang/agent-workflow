/**
 * report-check 的 CLI 测试：真实临时 git 仓库、入库 HTML 样本、实际 Chromium。
 * 从命令行核对四项结果、退出码、固定 360 的量法、分段 PNG 和临时目录清理；
 * 核对启动首行包含浏览器 PID 和临时用户目录绝对路径，成功、检查失败及启动失败后该目录均已删除。
 * 长页覆盖按序分段、每段不高于视口、手机展开折叠和延迟重排、清理后保留全部截图；
 * 多页签样本覆盖浅色与深色桌面 [role="tab"] 巡检与恢复初始态（含深色恢复步时间线移除、隐藏或 2000px 溢出拦截，report.2、report.5）、切换抛错、非默认页签时间线溢出或消失隐藏及手机解除隐藏面板。
 * 延迟溢出样本覆盖视口切换后 150 毫秒才出现的窄屏失败；分段 PNG 共用一处断言。
 * 另测时间线溢出/缺失、路径优先级、Playwright 缓存/PATH 查找、参数和启动失败。
 * 不访问 GitHub；隔离 HOME、缓存和 PATH 证明缺少 Chromium 时明确以 2 退出。
 * 浏览器测试仅在自动查找明确报告“找不到 Chromium”时跳过，输出具体原因；
 * 找到后启动失败或 CDP 出错仍使测试失败。本机 ci:local 沿用同一环境和跳过口径。
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { test } from "node:test";

const cli = join(import.meta.dirname, "tickets.ts");
const fixture = (name: string): string => join(import.meta.dirname, "fixtures", `report-check-${name}.html`);
const probe = spawnSync(process.execPath, [cli, "report-check", fixture("ok"), "--dry-run"], {
  encoding: "utf8", timeout: 30000,
});
assert.ifError(probe.error);
const browser = /^Chromium：(.+)$/m.exec(probe.stdout)?.[1];
const missing = probe.status === 2 && probe.stderr.includes("找不到 Chromium");
assert.ok(browser || missing, `Chromium 探测出错，不能跳过：${probe.stdout}${probe.stderr}`);
const skip = browser ? false : `找不到 Chromium，跳过真实浏览器检查：${probe.stderr.trim()}`;

const repository = () => {
  const root = mkdtempSync(join(tmpdir(), "report-check-cli-"));
  const bin = join(root, "bin");
  const temporary = join(root, "temporary");
  const home = join(root, "home");
  for (const directory of [bin, temporary, home]) mkdirSync(directory);
  const git = spawnSync("git", ["init", "--initial-branch=main", root], { encoding: "utf8" });
  assert.ifError(git.error);
  assert.equal(git.status, 0, git.stderr);
  const env: NodeJS.ProcessEnv = {
    ...process.env, HOME: home, USERPROFILE: home,
    XDG_CACHE_HOME: join(home, ".cache"), LOCALAPPDATA: join(home, "AppData", "Local"),
    TMPDIR: temporary, TMP: temporary, TEMP: temporary,
    PATH: bin,
  };
  delete env.RUN_SPEC_CHROMIUM;
  const input = join(root, "汇报 #1 空格.html");
  copyFileSync(fixture("ok"), input);
  const run = (args: string[], overrides: NodeJS.ProcessEnv = {}) => {
    const result = spawnSync(process.execPath, [cli, ...args], {
      cwd: root, env: { ...env, ...overrides }, encoding: "utf8", timeout: 60000,
    });
    assert.ifError(result.error);
    return result;
  };
  const fake = (path: string): void => {
    mkdirSync(resolve(path, ".."), { recursive: true });
    writeFileSync(path, `#!${process.execPath}\nprocess.stderr.write("伪浏览器启动失败\\n"); process.exit(3);\n`, { mode: 0o755 });
  };
  return { root, bin, temporary, home, env, input, run, fake };
};

const results = (stdout: string): { name: string; passed: boolean }[] =>
  [...stdout.matchAll(/^\[(通过|失败)\] ([^：]+)：/gm)].map((match) => ({ name: match[2], passed: match[1] === "通过" }));

const assertBrowserSite = (stdout: string, temporary: string): void => {
  const matches = [...stdout.matchAll(/^浏览器现场：PID=([1-9]\d*)，用户目录=(.+)$/gm)];
  assert.equal(matches.length, 1, stdout);
  const [line, , profile] = matches[0];
  assert.ok(stdout.startsWith(line + "\n"), "启动后立即输出现场位置");
  assert.ok(isAbsolute(profile), profile);
  assert.equal(dirname(profile), temporary);
  assert.equal(existsSync(profile), false, "日志中的临时用户目录已删除");
};

const assertScreenshots = (
  stdout: string, directory: string,
  groups: readonly (readonly [group: string, width: number, heights: readonly (number | undefined)[]])[],
): void => {
  const expected: string[] = [];
  for (const [group, width, heights] of groups) {
    assert.ok(stdout.includes(`截图组 ${group}：${heights.length} 张，目录：${directory}`), stdout);
    for (const [index, height] of heights.entries()) {
      const name = `${group}-${String(index + 1).padStart(2, "0")}.png`;
      expected.push(name);
      const path = join(directory, name);
      assert.ok(stdout.includes(`截图：${path}`), stdout);
      const png = readFileSync(path);
      assert.equal(png.subarray(1, 4).toString(), "PNG");
      assert.equal(png.readUInt32BE(16), width);
      const actualHeight = png.readUInt32BE(20);
      assert.ok(actualHeight > 0 && actualHeight <= 800);
      if (height !== undefined) assert.equal(actualHeight, height);
    }
  }
  assert.deepEqual(readdirSync(directory).sort(), expected.sort(), "只保留连续编号的分段截图，不生成整页长图");
};

test("report-check 帮助、参数、缺失文件和缺失 Chromium 的退出码", () => {
  const repo = repository();
  try {
    const help = repo.run(["report-check", "--help"]);
    assert.equal(help.status, 0, help.stderr);
    for (const text of ["RUN_SPEC_CHROMIUM", "file://", "<= 360", '[data-slot="timeline"]', "恢复初始激活页签", "--out", "--chromium", "chromium-headless-shell", "light-1280-01.png", "dark-1280-01.png", "mobile-360-01.png", "1280×800", "360×800", "不输出整页长图", "每组张数和目录", "浏览器现场：PID=<进程号>，用户目录=<绝对路径>"]) {
      assert.ok(help.stdout.includes(text), text);
    }
    assert.match(repo.run(["--help"]).stdout, /report-check <汇报文件>/);
    for (const args of [[], [repo.input, "extra.html"], [repo.input, "--unknown"], [repo.input, "--chromium"], [repo.input, "--out"]]) {
      const result = repo.run(["report-check", ...args]);
      assert.equal(result.status, 2, result.stdout + result.stderr);
      assert.match(result.stderr, /^出错：/);
    }
    const absent = repo.run(["report-check", join(repo.root, "missing.html")]);
    assert.equal(absent.status, 2);
    assert.match(absent.stderr, /出错：.*不存在/);
    const directory = repo.run(["report-check", repo.root]);
    assert.equal(directory.status, 2);
    assert.match(directory.stderr, /出错：.*不是文件/);
    const missing = repo.run(["report-check", repo.input]);
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /出错：找不到 Chromium/);
    assert.match(missing.stderr, /--chromium/);
    assert.match(missing.stderr, /chromium-headless-shell/);
    assert.deepEqual(readdirSync(repo.temporary), []);
  } finally {
    rmSync(repo.root, { recursive: true, force: true });
  }
});

test("report-check 参数、环境变量、缓存和系统路径按顺序选择", () => {
  const repo = repository();
  try {
    const explicit = join(repo.root, "指定的 Chromium");
    const environment = join(repo.root, "环境变量 Chromium");
    const cache = process.platform === "darwin"
      ? join(repo.home, "Library", "Caches", "ms-playwright")
      : process.platform === "win32"
        ? join(repo.env.LOCALAPPDATA!, "ms-playwright")
        : join(repo.env.XDG_CACHE_HOME!, "ms-playwright");
    const shell = join(cache, "chromium_headless_shell-1243", "chrome-headless-shell-linux64", "chrome-headless-shell");
    const older = join(cache, "chromium_headless_shell-999", "chrome-linux", "headless_shell");
    const full = join(cache, "chromium-1244", "chrome-linux", "chrome");
    const system = join(repo.bin, process.platform === "win32" ? "chromium.exe" : "chromium");
    for (const file of [explicit, environment, shell, older, full, system]) repo.fake(file);
    const base = ["report-check", repo.input, "--dry-run"];
    const check = (expected: string, args = base, overrides: NodeJS.ProcessEnv = {}): void => {
      const result = repo.run(args, overrides);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.ok(result.stdout.includes(`Chromium：${expected}\n`), result.stdout);
      assert.ok(!result.stdout.includes("浏览器现场："), result.stdout);
    };
    check(explicit, [...base, "--chromium", explicit], { RUN_SPEC_CHROMIUM: environment });
    check(environment, base, { RUN_SPEC_CHROMIUM: environment });
    check(shell);
    rmSync(join(cache, "chromium_headless_shell-1243"), { recursive: true });
    check(older);
    rmSync(join(cache, "chromium_headless_shell-999"), { recursive: true });
    check(full);
    rmSync(cache, { recursive: true });
    check(system);
    const invalid = repo.run([...base, "--chromium", join(repo.root, "missing")], { RUN_SPEC_CHROMIUM: environment });
    assert.equal(invalid.status, 2);
    assert.match(invalid.stderr, /Chromium 路径不可执行/);
    const invalidEnvironment = repo.run(base, { RUN_SPEC_CHROMIUM: join(repo.root, "missing") });
    assert.equal(invalidEnvironment.status, 2);
    assert.match(invalidEnvironment.stderr, /Chromium 路径不可执行/);
    assert.deepEqual(readdirSync(repo.temporary), []);
  } finally {
    rmSync(repo.root, { recursive: true, force: true });
  }
});

test("report-check 启动失败以 2 退出且删除临时用户目录", () => {
  const repo = repository();
  try {
    const program = join(repo.root, "失败的浏览器");
    repo.fake(program);
    const result = repo.run(["report-check", repo.input, "--chromium", program]);
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.match(result.stderr, /出错：Chromium 启动失败（退出码 3）/);
    assert.match(result.stderr, /伪浏览器启动失败/);
    assertBrowserSite(result.stdout, repo.temporary);
    assert.deepEqual(readdirSync(repo.temporary), []);
  } finally {
    rmSync(repo.root, { recursive: true, force: true });
  }
});

for (const [name, failure] of [
  ["ok", undefined], ["overflow", "窄屏不横向滚动"], ["delayed-overflow", "窄屏不横向滚动"],
  ["console", "控制台零报错"], ["global", "无新增全局名"],
] as const) {
  test(`report-check 样本 ${name} 只在对应检查失败，截图保留`, { skip }, () => {
    const repo = repository();
    try {
      copyFileSync(fixture(name), repo.input);
      const output = join(repo.root, "自选截图目录");
      const explicit = name === "ok" || name === "console";
      const result = repo.run([
        "report-check", repo.input,
        ...(explicit ? ["--chromium", browser!] : []),
        ...(name === "ok" ? [] : ["--out", output]),
      ], {
        PATH: `${repo.bin}${delimiter}${process.env.PATH}`,
        RUN_SPEC_CHROMIUM: explicit ? join(repo.root, "不可用的环境变量") : browser,
      });
      assert.equal(result.status, failure ? 1 : 0, result.stdout + result.stderr);
      assertBrowserSite(result.stdout, repo.temporary);
      const checks = results(result.stdout);
      assert.equal(checks.length, 4, result.stdout);
      assert.deepEqual(checks.filter((item) => !item.passed).map((item) => item.name), failure ? [failure] : []);
      assert.match(result.stdout, /基准=file:\/\//);
      if (name === "console") {
        assert.match(result.stdout, /console.error=1，未捕获异常=1/);
        assert.match(result.stdout, /汇报样本的控制台错误/);
        assert.match(result.stdout, /汇报样本的未捕获异常/);
      }
      if (name === "global") assert.match(result.stdout, /新增=1.*\["reportCheckLeak"\]/);
      if (name === "overflow" || name === "delayed-overflow") {
        const sizes = /scrollWidth=(\d+)，设定宽度=360，innerWidth=(\d+)，已展开折叠=1\/1/.exec(result.stdout);
        assert.ok(sizes, result.stdout);
        assert.ok(Number(sizes[1]) > 360);
        assert.equal(sizes[1], sizes[2], "旧 innerWidth 量法在这个样本上会错误通过");
      }
      const directory = name === "ok" ? join(repo.root, "out", "report-check", "汇报 #1 空格") : output;
      assertScreenshots(result.stdout, directory, [
        ["light-1280", 1280, [800]],
        ["dark-1280", 1280, [800]],
        ["mobile-360", 360, name === "overflow" || name === "delayed-overflow" ? [800, undefined] : [800]],
      ]);
      assert.deepEqual(readdirSync(repo.temporary), [], "检查完成后临时用户目录已删除");
    } finally {
      rmSync(repo.root, { recursive: true, force: true });
    }
  });
}

test("report-check 长页按视口分段，手机展开折叠并等延迟重排，清理现场后截图仍在", { skip }, () => {
  const repo = repository();
  try {
    copyFileSync(fixture("long"), repo.input);
    const directory = join(repo.root, "分段截图");
    const result = repo.run(["report-check", repo.input, "--chromium", browser!, "--out", directory], {
      PATH: `${repo.bin}${delimiter}${process.env.PATH}`,
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assertBrowserSite(result.stdout, repo.temporary);
    assert.equal(results(result.stdout).length, 4, result.stdout);
    assert.ok(results(result.stdout).every((item) => item.passed), result.stdout);
    assert.match(result.stdout, /已展开折叠=1\/1/);
    assert.deepEqual(readdirSync(repo.temporary), [], "截图读取前确认临时用户目录已删除");
    assertScreenshots(result.stdout, directory, [
      ["light-1280", 1280, [800, 800, 132]],
      ["dark-1280", 1280, [800, 800, 132]],
      ["mobile-360", 360, [800, 800, 800, 800, 800, 132]],
    ]);
  } finally {
    rmSync(repo.root, { recursive: true, force: true });
  }
});

for (const absent of [false, true]) {
  test(`report-check 时间线${absent ? "缺失" : "局部横向滚动"}单独失败`, { skip }, () => {
    const repo = repository();
    try {
      const source = readFileSync(repo.input, "utf8");
      writeFileSync(repo.input, absent
        ? source.replace('<div data-slot="timeline" aria-label="时间线"></div>', "")
        : source.replace('<div data-slot="timeline" aria-label="时间线"></div>', '<div data-slot="timeline" style="overflow-x:auto"><div style="width:2000px;height:20px"></div></div>'));
      const result = repo.run(["report-check", repo.input, "--chromium", browser!], {
        PATH: `${repo.bin}${delimiter}${process.env.PATH}`,
      });
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assertBrowserSite(result.stdout, repo.temporary);
      assert.deepEqual(results(result.stdout).filter((item) => !item.passed).map((item) => item.name), ["时间线不滚动"]);
      assert.match(result.stdout, absent ? /浅色区域=0，深色区域=0/ : /"scrollWidth":2000/);
      assert.deepEqual(readdirSync(repo.temporary), []);
    } finally {
      rmSync(repo.root, { recursive: true, force: true });
    }
  });
}

test("report-check 多页签驾驶舱正常样本巡检恢复初始态，360px 展开全部面板分段通过", { skip }, () => {
  const repo = repository();
  try {
    copyFileSync(fixture("tabs-ok"), repo.input);
    const directory = join(repo.root, "多页签正常截图");
    const result = repo.run(["report-check", repo.input, "--chromium", browser!, "--out", directory], {
      PATH: `${repo.bin}${delimiter}${process.env.PATH}`,
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assertBrowserSite(result.stdout, repo.temporary);
    assert.equal(results(result.stdout).length, 4, result.stdout);
    assert.ok(results(result.stdout).every((item) => item.passed), result.stdout);
    assert.match(result.stdout, /已展开折叠=1\/1/);
    assertScreenshots(result.stdout, directory, [
      ["light-1280", 1280, [800]],
      ["dark-1280", 1280, [800]],
      ["mobile-360", 360, [800, 800, undefined]],
    ]);
    assert.deepEqual(readdirSync(repo.temporary), []);
  } finally {
    rmSync(repo.root, { recursive: true, force: true });
  }
});

test("report-check 隐藏 tabpanel 含宽元素时在 360px 仅窄屏检查失败", { skip }, () => {
  const repo = repository();
  try {
    copyFileSync(fixture("tabs-hidden-overflow"), repo.input);
    const directory = join(repo.root, "隐藏面板溢出截图");
    const result = repo.run(["report-check", repo.input, "--chromium", browser!, "--out", directory], {
      PATH: `${repo.bin}${delimiter}${process.env.PATH}`,
    });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assertBrowserSite(result.stdout, repo.temporary);
    assert.deepEqual(results(result.stdout).filter((item) => !item.passed).map((item) => item.name), ["窄屏不横向滚动"]);
    const sizes = /scrollWidth=(\d+)，设定宽度=360/.exec(result.stdout);
    assert.ok(sizes && Number(sizes[1]) >= 620, result.stdout);
    assertScreenshots(result.stdout, directory, [
      ["light-1280", 1280, [800]],
      ["dark-1280", 1280, [800]],
      ["mobile-360", 360, [800, undefined]],
    ]);
    assert.deepEqual(readdirSync(repo.temporary), []);
  } finally {
    rmSync(repo.root, { recursive: true, force: true });
  }
});

test("report-check 点击非默认页签抛错或时间线溢出时仅对应检查失败", { skip }, () => {
  const repo = repository();
  try {
    copyFileSync(fixture("tabs-error"), repo.input);
    const errorOut = join(repo.root, "页签报错截图");
    const errorResult = repo.run(["report-check", repo.input, "--chromium", browser!, "--out", errorOut], {
      PATH: `${repo.bin}${delimiter}${process.env.PATH}`,
    });
    assert.equal(errorResult.status, 1, errorResult.stdout + errorResult.stderr);
    assertBrowserSite(errorResult.stdout, repo.temporary);
    assert.deepEqual(results(errorResult.stdout).filter((item) => !item.passed).map((item) => item.name), ["控制台零报错"]);
    assert.match(errorResult.stdout, /console\.error=2，未捕获异常=2/);
    assert.match(errorResult.stdout, /页签切换控制台错误/);
    assert.match(errorResult.stdout, /页签切换未捕获异常/);
    assertScreenshots(errorResult.stdout, errorOut, [
      ["light-1280", 1280, [800]],
      ["dark-1280", 1280, [800]],
      ["mobile-360", 360, [800]],
    ]);
    const timelineHtml = readFileSync(fixture("tabs-ok"), "utf8").replace(
      '<section id="panel-2" role="tabpanel" class="panel-mid" hidden><h2>耗时与模型</h2><p>第二视角内容。</p></section>',
      '<section id="panel-2" role="tabpanel" class="panel-mid" hidden><div data-slot="timeline" style="overflow-x:auto"><div style="width:2000px;height:20px"></div></div></section>',
    );
    writeFileSync(repo.input, timelineHtml);
    const timelineOut = join(repo.root, "页签时间线溢出截图");
    const timelineResult = repo.run(["report-check", repo.input, "--chromium", browser!, "--out", timelineOut], {
      PATH: `${repo.bin}${delimiter}${process.env.PATH}`,
    });
    assert.equal(timelineResult.status, 1, timelineResult.stdout + timelineResult.stderr);
    assertBrowserSite(timelineResult.stdout, repo.temporary);
    assert.deepEqual(results(timelineResult.stdout).filter((item) => !item.passed).map((item) => item.name), ["时间线不滚动"]);
    assert.match(timelineResult.stdout, /"scrollWidth":2000/);
    assert.deepEqual(readdirSync(repo.temporary), []);
  } finally {
    rmSync(repo.root, { recursive: true, force: true });
  }
});

test("report-check 仅深色配色点击非默认页签触发控制台错误或时间线横向溢出时均失败退出 1", { skip }, () => {
  const repo = repository();
  try {
    const base = readFileSync(fixture("tabs-ok"), "utf8");
    const darkErrorHtml = base.replace(
      "for (const panel of panels) panel.hidden = panel.id !== targetId;",
      'for (const panel of panels) panel.hidden = panel.id !== targetId; if (targetId === "panel-2" && matchMedia("(prefers-color-scheme: dark)").matches) { console.error("深色非默认页签控制台错误"); throw new Error("深色非默认页签未捕获异常"); }',
    );
    writeFileSync(repo.input, darkErrorHtml);
    const darkErrorOut = join(repo.root, "深色页签报错截图");
    const darkErrorResult = repo.run(["report-check", repo.input, "--chromium", browser!, "--out", darkErrorOut], {
      PATH: `${repo.bin}${delimiter}${process.env.PATH}`,
    });
    assert.equal(darkErrorResult.status, 1, darkErrorResult.stdout + darkErrorResult.stderr);
    assertBrowserSite(darkErrorResult.stdout, repo.temporary);
    assert.deepEqual(results(darkErrorResult.stdout).filter((item) => !item.passed).map((item) => item.name), ["控制台零报错"]);
    assert.match(darkErrorResult.stdout, /console\.error=1，未捕获异常=1/);
    assert.match(darkErrorResult.stdout, /深色非默认页签控制台错误/);
    assert.match(darkErrorResult.stdout, /深色非默认页签未捕获异常/);
    assertScreenshots(darkErrorResult.stdout, darkErrorOut, [
      ["light-1280", 1280, [800]],
      ["dark-1280", 1280, [800]],
      ["mobile-360", 360, [800, 800, undefined]],
    ]);
    const darkTimelineHtml = base
      .replace(
        "</style>",
        '[data-slot="timeline"] { overflow-x: auto; }\n@media (prefers-color-scheme: dark) { body[data-active-tab="panel-2"] .dark-only-wide { width: 2000px; height: 20px; } }\n</style>',
      )
      .replace(
        '<div data-slot="timeline" aria-label="时间线"></div>',
        '<div data-slot="timeline" aria-label="时间线"><div class="dark-only-wide"></div></div>',
      )
      .replace(
        "for (const panel of panels) panel.hidden = panel.id !== targetId;",
        "document.body.dataset.activeTab = targetId; for (const panel of panels) panel.hidden = panel.id !== targetId;",
      );
    writeFileSync(repo.input, darkTimelineHtml);
    const darkTimelineOut = join(repo.root, "深色页签时间线溢出截图");
    const darkTimelineResult = repo.run(["report-check", repo.input, "--chromium", browser!, "--out", darkTimelineOut], {
      PATH: `${repo.bin}${delimiter}${process.env.PATH}`,
    });
    assert.equal(darkTimelineResult.status, 1, darkTimelineResult.stdout + darkTimelineResult.stderr);
    assertBrowserSite(darkTimelineResult.stdout, repo.temporary);
    assert.deepEqual(results(darkTimelineResult.stdout).filter((item) => !item.passed).map((item) => item.name), ["时间线不滚动"]);
    assert.match(darkTimelineResult.stdout, /"scrollWidth":2000/);
    assertScreenshots(darkTimelineResult.stdout, darkTimelineOut, [
      ["light-1280", 1280, [800]],
      ["dark-1280", 1280, [800]],
      ["mobile-360", 360, [800, 800, undefined]],
    ]);
    assert.deepEqual(readdirSync(repo.temporary), []);
  } finally {
    rmSync(repo.root, { recursive: true, force: true });
  }
});

test("report-check 点击非默认页签后时间线被移除或 display:none 隐藏时失败退出 1，V5 单视图继续通过", { skip }, () => {
  const repo = repository();
  try {
    const base = readFileSync(fixture("tabs-ok"), "utf8");
    const removedHtml = base.replace(
      'const expandButton = document.querySelector(\'[data-action="expand-all"]\');',
      'const expandButton = document.querySelector(\'[data-action="expand-all"]\'); const mainEl = document.querySelector("main"); const timelineEl = document.querySelector(\'[data-slot="timeline"]\');',
    ).replace(
      "for (const panel of panels) panel.hidden = panel.id !== targetId;",
      'for (const panel of panels) panel.hidden = panel.id !== targetId; if (targetId === "panel-2") timelineEl.remove(); else if (!timelineEl.isConnected) mainEl.prepend(timelineEl);',
    );
    writeFileSync(repo.input, removedHtml);
    const removedOut = join(repo.root, "页签时间线移除截图");
    const removedResult = repo.run(["report-check", repo.input, "--chromium", browser!, "--out", removedOut], {
      PATH: `${repo.bin}${delimiter}${process.env.PATH}`,
    });
    assert.equal(removedResult.status, 1, removedResult.stdout + removedResult.stderr);
    assertBrowserSite(removedResult.stdout, repo.temporary);
    assert.deepEqual(results(removedResult.stdout).filter((item) => !item.passed).map((item) => item.name), ["时间线不滚动"]);
    assert.match(removedResult.stdout, /空区域步=2/);
    const hiddenHtml = base.replace(
      "for (const panel of panels) panel.hidden = panel.id !== targetId;",
      'for (const panel of panels) panel.hidden = panel.id !== targetId; document.querySelector(\'[data-slot="timeline"]\').style.display = targetId === "panel-2" ? "none" : "";',
    );
    writeFileSync(repo.input, hiddenHtml);
    const hiddenOut = join(repo.root, "页签时间线隐藏截图");
    const hiddenResult = repo.run(["report-check", repo.input, "--chromium", browser!, "--out", hiddenOut], {
      PATH: `${repo.bin}${delimiter}${process.env.PATH}`,
    });
    assert.equal(hiddenResult.status, 1, hiddenResult.stdout + hiddenResult.stderr);
    assertBrowserSite(hiddenResult.stdout, repo.temporary);
    assert.deepEqual(results(hiddenResult.stdout).filter((item) => !item.passed).map((item) => item.name), ["时间线不滚动"]);
    assert.match(hiddenResult.stdout, /空区域步=2/);
    const v5Report = resolve(import.meta.dirname, "../../../../docs/reports/spec-16-workflow-v5.html");
    if (existsSync(v5Report)) {
      copyFileSync(v5Report, repo.input);
      const v5Out = join(repo.root, "V5单视图截图");
      const v5Result = repo.run(["report-check", repo.input, "--chromium", browser!, "--out", v5Out], {
        PATH: `${repo.bin}${delimiter}${process.env.PATH}`,
      });
      assert.equal(v5Result.status, 0, v5Result.stdout + v5Result.stderr);
      assertBrowserSite(v5Result.stdout, repo.temporary);
      assert.ok(results(v5Result.stdout).every((item) => item.passed), v5Result.stdout);
    }
    assert.deepEqual(readdirSync(repo.temporary), []);
  } finally {
    rmSync(repo.root, { recursive: true, force: true });
  }
});

test("report-check 深色恢复初始页签时时间线移除、隐藏或撑宽至 2000px 均仅时间线不滚动以 1 失败，正常多页签退出 0（report.2、report.5）", { skip }, () => {
  const repo = repository();
  try {
    const base = readFileSync(fixture("tabs-ok"), "utf8");
    for (const mode of ["remove", "hide", "overflow"] as const) {
      const action = mode === "remove"
        ? "timelineEl.remove();"
        : mode === "hide"
          ? 'timelineEl.style.display = "none";'
          : 'timelineInner.style.width = "2000px";';
      const badHtml = base
        .replace(
          "</style>",
          '[data-slot="timeline"] { overflow-x: auto; }\n.restore-probe { width: 100%; height: 20px; }\n</style>',
        )
        .replace(
          '<div data-slot="timeline" aria-label="时间线"></div>',
          '<div data-slot="timeline" aria-label="时间线"><div class="restore-probe"></div></div>',
        )
        .replace(
          'const expandButton = document.querySelector(\'[data-action="expand-all"]\');',
          'const expandButton = document.querySelector(\'[data-action="expand-all"]\'); const timelineEl = document.querySelector(\'[data-slot="timeline"]\'); const timelineInner = document.querySelector(".restore-probe"); let sawDarkTab2 = false;',
        )
        .replace(
          "for (const panel of panels) panel.hidden = panel.id !== targetId;",
          `for (const panel of panels) panel.hidden = panel.id !== targetId; if (matchMedia("(prefers-color-scheme: dark)").matches) { if (targetId === "panel-2") sawDarkTab2 = true; else if (sawDarkTab2 && targetId === "panel-1") { ${action} } }`,
        );
      writeFileSync(repo.input, badHtml);
      const outDir = join(repo.root, `深色恢复步-${mode}`);
      const badResult = repo.run(["report-check", repo.input, "--chromium", browser!, "--out", outDir], {
        PATH: `${repo.bin}${delimiter}${process.env.PATH}`,
      });
      assert.equal(badResult.status, 1, badResult.stdout + badResult.stderr);
      assertBrowserSite(badResult.stdout, repo.temporary);
      const checks = results(badResult.stdout);
      assert.equal(checks.length, 4, badResult.stdout);
      assert.deepEqual(checks.filter((item) => !item.passed).map((item) => item.name), ["时间线不滚动"]);
      assert.match(badResult.stdout, /新增=0（基准=file:\/\/），名字=\[\]/);
      if (mode === "overflow") {
        assert.match(badResult.stdout, /巡检步=10（空区域步=0）/);
        assert.match(badResult.stdout, /"scrollWidth":2000/);
      } else {
        assert.match(badResult.stdout, /巡检步=10（空区域步=1）/);
      }
      assertScreenshots(badResult.stdout, outDir, [
        ["light-1280", 1280, [800]],
        ["dark-1280", 1280, [800]],
        ["mobile-360", 360, [800, 800, undefined]],
      ]);
    }
    copyFileSync(fixture("tabs-ok"), repo.input);
    const okOut = join(repo.root, "深色恢复步正常对照");
    const okResult = repo.run(["report-check", repo.input, "--chromium", browser!, "--out", okOut], {
      PATH: `${repo.bin}${delimiter}${process.env.PATH}`,
    });
    assert.equal(okResult.status, 0, okResult.stdout + okResult.stderr);
    assertBrowserSite(okResult.stdout, repo.temporary);
    assert.ok(results(okResult.stdout).every((item) => item.passed), okResult.stdout);
    assert.match(okResult.stdout, /巡检步=10（空区域步=0）/);
    assertScreenshots(okResult.stdout, okOut, [
      ["light-1280", 1280, [800]],
      ["dark-1280", 1280, [800]],
      ["mobile-360", 360, [800, 800, undefined]],
    ]);
    assert.deepEqual(readdirSync(repo.temporary), []);
  } finally {
    rmSync(repo.root, { recursive: true, force: true });
  }
});
