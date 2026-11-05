/**
 * report-check 的 CLI 测试：真实临时 git 仓库、入库 HTML 样本、实际 Chromium。
 * 从命令行核对四项结果、退出码、固定 360 的量法、分段 PNG 和临时目录清理；
 * 长页覆盖按序分段、每段不高于视口、手机展开折叠和延迟重排、清理后保留全部截图。
 * 延迟溢出样本覆盖视口切换后 150 毫秒才出现的窄屏失败；分段 PNG 共用一处断言。
 * 另测时间线溢出/缺失、路径优先级、Playwright 缓存/PATH 查找、参数和启动失败。
 * 不访问 GitHub；隔离 HOME、缓存和 PATH 证明缺少 Chromium 时明确以 2 退出。
 * 浏览器测试仅在自动查找明确报告“找不到 Chromium”时跳过，输出具体原因；
 * 找到后启动失败或 CDP 出错仍使测试失败。本机 ci:local 沿用同一环境和跳过口径。
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
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
    for (const text of ["RUN_SPEC_CHROMIUM", "file://", "<= 360", '[data-slot="timeline"]', "--out", "--chromium", "chromium-headless-shell", "light-1280-01.png", "dark-1280-01.png", "mobile-360-01.png", "1280×800", "360×800", "不输出整页长图", "每组张数和目录"]) {
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
      assert.deepEqual(results(result.stdout).filter((item) => !item.passed).map((item) => item.name), ["时间线不滚动"]);
      assert.match(result.stdout, absent ? /浅色区域=0，深色区域=0/ : /"scrollWidth":2000/);
      assert.deepEqual(readdirSync(repo.temporary), []);
    } finally {
      rmSync(repo.root, { recursive: true, force: true });
    }
  });
}
