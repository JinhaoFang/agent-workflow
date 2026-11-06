/**
 * 汇报浏览器检查：tickets.ts report-check <文件> [--out <目录>] [--chromium <路径>]。
 * 只用 Node 内置 WebSocket 和 CDP；依次查参数、RUN_SPEC_CHROMIUM、Playwright 缓存、PATH。
 * 用 file:// 空白页比较全局名，收集各配色/尺寸的控制台错误和未捕获异常；
 * 手机展开全部 details，以固定 360 比 scrollWidth；桌面检查模板的时间线容器。
 * 视口、配色或折叠变化后，等待至少 250 毫秒及连续三帧尺寸稳定，再测量并截图；
 * 浅色、深色、手机按 800 像素高度分段编号。
 * 不输出整页长图；启动后立即打印浏览器 PID 和临时用户目录的绝对路径，便于中断后精确清理。
 * 结束时关闭自建浏览器并删除临时用户目录，保留截图。
 * 四项通过退出 0，检查失败退出 1，参数、环境或 CDP 运行错误退出 2；无需仓库配置。
 */
import { spawn, type ChildProcess } from "node:child_process";
import { accessSync, constants, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, delimiter, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CheckFailure, entry, type Command, type Values } from "./shared.ts";

const timelineSelector = '[data-slot="timeline"]';
const timeout = 15000;
type Data = Record<string, unknown>;
type Pending = {
  resolve: (data: Data) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const executable = (file: string): boolean => {
  try {
    accessSync(file, process.platform === "win32" ? constants.F_OK : constants.X_OK);
    return statSync(file).isFile();
  } catch {
    return false;
  }
};

const onPath = (name: string): string | undefined => {
  const extensions = process.platform === "win32"
    ? ["", ...(process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";")]
    : [""];
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    for (const extension of extensions) {
      const file = resolve(directory, name + extension);
      if (executable(file)) return file;
    }
  }
  return undefined;
};

const chromium = (override: string | undefined): string => {
  const selected = override ?? process.env.RUN_SPEC_CHROMIUM;
  if (selected !== undefined) {
    const file = resolve(selected);
    if (selected && executable(file)) return file;
    throw new Error(`Chromium 路径不可执行：${selected || "空路径"}。请用 --chromium 指定可执行文件，或安装 Playwright 的 chromium-headless-shell。`);
  }
  const home = homedir();
  const cache = process.platform === "darwin"
    ? join(home, "Library", "Caches", "ms-playwright")
    : process.platform === "win32"
      ? join(process.env.LOCALAPPDATA ?? join(home, "AppData", "Local"), "ms-playwright")
      : join(process.env.XDG_CACHE_HOME ?? join(home, ".cache"), "ms-playwright");
  const directories = (root: string): string[] => {
    try {
      return readdirSync(root);
    } catch (error) {
      if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) return [];
      throw new Error(`无法读取 Chromium 缓存目录：${root}`);
    }
  };
  const names = new Set(["headless_shell", "chrome-headless-shell", "chrome", "Chromium", "Google Chrome for Testing", "chrome.exe", "chrome-headless-shell.exe"]);
  const find = (root: string, depth: number): string | undefined => {
    for (const name of directories(root).sort()) {
      const file = join(root, name);
      if (names.has(name) && executable(file)) return file;
      if (depth > 0 && statSync(file).isDirectory()) {
        const found = find(file, depth - 1);
        if (found) return found;
      }
    }
    return undefined;
  };
  const versions = directories(cache).sort((a, b) => b.localeCompare(a, "en", { numeric: true }));
  for (const prefix of ["chromium_headless_shell-", "chromium-"]) {
    for (const version of versions.filter((name) => name.startsWith(prefix))) {
      const found = find(join(cache, version), 5);
      if (found) return found;
    }
  }
  for (const name of ["chromium", "chromium-browser", "google-chrome"]) {
    const found = onPath(name);
    if (found) return found;
  }
  throw new Error("找不到 Chromium。请用 --chromium 指定可执行文件，或设置 RUN_SPEC_CHROMIUM，或安装 Playwright 的 chromium-headless-shell。");
};

const connect = async (url: string, event: (method: string, params: Data, session?: string) => void) => {
  const socket = new WebSocket(url);
  let id = 0;
  let closed = false;
  const pending = new Map<number, Pending>();
  const waiting = new Map<string, Set<Pending>>();
  const fail = (): void => {
    closed = true;
    for (const item of [...pending.values(), ...[...waiting.values()].flatMap((items) => [...items])]) {
      clearTimeout(item.timer);
      item.reject(new Error("Chromium 调试连接已断开。"));
    }
    pending.clear();
    waiting.clear();
  };
  socket.addEventListener("close", fail);
  socket.addEventListener("error", fail);
  socket.addEventListener("message", (message) => {
    const data = JSON.parse(String(message.data)) as {
      id?: number; method?: string; params?: Data; result?: Data;
      error?: { message: string }; sessionId?: string;
    };
    if (data.id !== undefined) {
      const item = pending.get(data.id);
      if (!item) return;
      clearTimeout(item.timer);
      pending.delete(data.id);
      if (data.error) item.reject(new Error(`Chromium 调试命令失败：${data.error.message}`));
      else item.resolve(data.result ?? {});
    } else if (data.method) {
      event(data.method, data.params ?? {}, data.sessionId);
      const key = `${data.sessionId ?? ""}:${data.method}`;
      for (const item of waiting.get(key) ?? []) {
        clearTimeout(item.timer);
        item.resolve(data.params ?? {});
      }
      waiting.delete(key);
    }
  });
  await new Promise<void>((resolveOpen, reject) => {
    const timer = setTimeout(() => reject(new Error("连接 Chromium 调试端口超时。")), timeout);
    socket.addEventListener("open", () => { clearTimeout(timer); resolveOpen(); }, { once: true });
    socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("无法连接 Chromium 调试端口。")); }, { once: true });
  });
  const send = <T = Data>(method: string, params: Data = {}, sessionId?: string): Promise<T> =>
    new Promise((resolveResult, reject) => {
      if (closed) return reject(new Error("Chromium 调试连接已断开。"));
      const current = ++id;
      const timer = setTimeout(() => {
        pending.delete(current);
        reject(new Error(`Chromium 调试命令超时：${method}`));
      }, timeout);
      pending.set(current, { resolve: (result) => resolveResult(result as T), reject, timer });
      socket.send(JSON.stringify({ id: current, method, params, sessionId }));
    });
  const waitFor = (method: string, sessionId: string): Promise<Data> => new Promise((resolveEvent, reject) => {
    const key = `${sessionId}:${method}`;
    const items = waiting.get(key) ?? new Set<Pending>();
    const item: Pending = {
      resolve: resolveEvent, reject,
      timer: setTimeout(() => {
        items.delete(item);
        if (!items.size) waiting.delete(key);
        reject(new Error(`等待 Chromium 事件超时：${method}`));
      }, timeout),
    };
    items.add(item);
    waiting.set(key, items);
  });
  return { send, waitFor, close: () => { fail(); socket.close(); } };
};

const launch = (browser: ChildProcess): Promise<string> => new Promise((resolveEndpoint, reject) => {
  let output = "";
  const timer = setTimeout(() => finish(new Error("Chromium 启动超时。")), timeout);
  const finish = (error?: Error, endpoint?: string): void => {
    clearTimeout(timer);
    browser.stderr?.off("data", onData);
    browser.off("error", onError);
    browser.off("exit", onExit);
    if (error) reject(error);
    else resolveEndpoint(endpoint!);
  };
  const onData = (chunk: Buffer): void => {
    output = (output + chunk.toString()).slice(-65536);
    const endpoint = /DevTools listening on (ws:\/\/[^\s]+)/.exec(output)?.[1];
    if (endpoint) finish(undefined, endpoint);
  };
  const onError = (): void => finish(new Error("Chromium 无法启动，请检查 --chromium 路径和执行权限。"));
  const onExit = (code: number | null): void => finish(new Error(`Chromium 启动失败（退出码 ${code}）：${output.trim()}`));
  browser.stderr?.on("data", onData);
  browser.once("error", onError);
  browser.once("exit", onExit);
});

type Timeline = { clientWidth: number; scrollWidth: number };
type Measurements = {
  globals: string[]; scrollWidth: number; innerWidth: number;
  details: number; openDetails: number; timeline: Timeline[];
};

const reportCheck = async (values: Values, _numbers: number[], args: string[]): Promise<void> => {
  const file = resolve(args[0]);
  if (!statSync(file).isFile()) throw new Error(`汇报路径不是文件：${file}`);
  const program = chromium(values.chromium as string | undefined);
  const out = resolve(values.out as string ?? join("out", "report-check", basename(file, extname(file))));
  if (values["dry-run"]) {
    console.log(`汇报：${file}\nChromium：${program}\n截图目录：${out}`);
    return;
  }
  mkdirSync(out, { recursive: true });
  const profile = mkdtempSync(join(resolve(tmpdir()), "run-spec-report-check-"));
  let browser: ChildProcess | undefined;
  let client: Awaited<ReturnType<typeof connect>> | undefined;
  let exited: Promise<void> = Promise.resolve();
  const interrupt = (): void => { browser?.kill("SIGTERM"); client?.close(); };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  try {
    const blank = join(profile, "blank.html");
    writeFileSync(blank, '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
    browser = spawn(program, [
      "--headless", "--no-sandbox", "--disable-dev-shm-usage", "--no-first-run",
      "--no-default-browser-check", "--disable-background-networking",
      "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0",
      `--user-data-dir=${profile}`, "about:blank",
    ], { stdio: ["ignore", "ignore", "pipe"] });
    if (browser.pid) console.log(`浏览器现场：PID=${browser.pid}，用户目录=${profile}`);
    exited = new Promise((resolveExit) => {
      browser!.once("exit", () => resolveExit());
      browser!.once("error", () => resolveExit());
    });
    const endpoint = await launch(browser);
    let session = "";
    const errors: string[] = [];
    const exceptions: string[] = [];
    client = await connect(endpoint, (method, params, eventSession) => {
      if (eventSession !== session) return;
      if (method === "Runtime.consoleAPICalled" && params.type === "error") {
        const parts = params.args as { value?: unknown; description?: string; type?: string }[];
        errors.push(parts.map((part) => String(part.value ?? part.description ?? part.type)).join(" "));
      }
      if (method === "Runtime.exceptionThrown") {
        const detail = params.exceptionDetails as { text: string; exception?: { description?: string } };
        exceptions.push(detail.exception?.description ?? detail.text);
      }
    });
    const cdp = client;
    const target = await cdp.send<{ targetId: string }>("Target.createTarget", { url: "about:blank" });
    session = (await cdp.send<{ sessionId: string }>("Target.attachToTarget", { targetId: target.targetId, flatten: true })).sessionId;
    await cdp.send("Page.enable", {}, session);
    await cdp.send("Runtime.enable", {}, session);
    const evaluate = async <T>(expression: string): Promise<T> => {
      const result = await cdp.send<{ result: { value: T }; exceptionDetails?: unknown }>("Runtime.evaluate", {
        expression, returnByValue: true, awaitPromise: true,
      }, session);
      if (result.exceptionDetails) throw new Error("读取汇报页面数据失败。请检查页面是否可正常加载。");
      return result.result.value;
    };
    const navigate = async (url: string): Promise<void> => {
      const [, result] = await Promise.all([
        cdp.waitFor("Page.loadEventFired", session),
        cdp.send<{ errorText?: string }>("Page.navigate", { url }, session),
      ]);
      if (result.errorText) throw new Error(`汇报页面加载失败：${result.errorText}`);
    };
    const viewport = async (width: number, dark: boolean): Promise<void> => {
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width, height: 800, deviceScaleFactor: 1, mobile: width === 360,
        screenWidth: width, screenHeight: 800,
      }, session);
      await cdp.send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-color-scheme", value: dark ? "dark" : "light" }],
      }, session);
    };
    const measure = (): Promise<Measurements> => evaluate(`(async () => {
      await document.fonts.ready;
      await new Promise(resolve => setTimeout(resolve, 250));
      await new Promise(resolve => {
        let previous = '';
        let stableFrames = 0;
        const sample = () => {
          const root = document.documentElement;
          const current = JSON.stringify([
            root.scrollWidth, root.scrollHeight,
            [...document.querySelectorAll(${JSON.stringify(timelineSelector)})].map(element => [element.clientWidth, element.scrollWidth])
          ]);
          stableFrames = current === previous ? stableFrames + 1 : 1;
          previous = current;
          if (stableFrames >= 3) resolve();
          else requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      return {
        globals: Object.keys(window), scrollWidth: document.documentElement.scrollWidth,
        innerWidth, details: document.querySelectorAll('details').length,
        openDetails: document.querySelectorAll('details[open]').length,
        timeline: [...document.querySelectorAll(${JSON.stringify(timelineSelector)})].map(element => ({
          clientWidth: element.clientWidth, scrollWidth: element.scrollWidth
        }))
      };
    })()`);
    const screenshot = async (group: string, width: number): Promise<void> => {
      const metrics = await cdp.send<{ cssContentSize: { height: number } }>("Page.getLayoutMetrics", {}, session);
      const height = Math.max(800, Math.ceil(metrics.cssContentSize.height));
      const count = Math.ceil(height / 800);
      for (let index = 0; index < count; index++) {
        const y = index * 800;
        const result = await cdp.send<{ data: string }>("Page.captureScreenshot", {
          format: "png", captureBeyondViewport: true,
          clip: { x: 0, y, width, height: Math.min(800, height - y), scale: 1 },
        }, session);
        const output = join(out, `${group}-${String(index + 1).padStart(2, "0")}.png`);
        writeFileSync(output, Buffer.from(result.data, "base64"));
        console.log(`截图：${output}`);
      }
      console.log(`截图组 ${group}：${count} 张，目录：${out}`);
    };
    console.log(`汇报：${file}\nChromium：${program}`);
    await viewport(1280, false);
    await navigate(pathToFileURL(blank).href);
    const baseline = new Set((await measure()).globals);
    await navigate(pathToFileURL(file).href);
    const light = await measure();
    await screenshot("light-1280", 1280);
    await viewport(1280, true);
    const dark = await measure();
    await screenshot("dark-1280", 1280);
    await viewport(360, false);
    await evaluate("(() => { for (const element of document.querySelectorAll('details')) element.open = true; })()");
    const mobile = await measure();
    await screenshot("mobile-360", 360);
    const added = [...new Set([...light.globals, ...dark.globals, ...mobile.globals])].filter((key) => !baseline.has(key)).sort();
    const timeline = [...light.timeline, ...dark.timeline];
    const checks = [
      { name: "控制台零报错", passed: errors.length === 0 && exceptions.length === 0, detail: `console.error=${errors.length}，未捕获异常=${exceptions.length}` },
      { name: "无新增全局名", passed: added.length === 0, detail: `新增=${added.length}（基准=file://），名字=${JSON.stringify(added)}` },
      { name: "窄屏不横向滚动", passed: mobile.scrollWidth <= 360, detail: `scrollWidth=${mobile.scrollWidth}，设定宽度=360，innerWidth=${mobile.innerWidth}，已展开折叠=${mobile.openDetails}/${mobile.details}` },
      { name: "时间线不滚动", passed: light.timeline.length > 0 && dark.timeline.length > 0 && timeline.every((item) => item.clientWidth > 0 && item.scrollWidth <= item.clientWidth), detail: `选择器=${timelineSelector}，浅色区域=${light.timeline.length}，深色区域=${dark.timeline.length}，尺寸=${JSON.stringify(timeline)}（1280×800）` },
    ];
    for (const check of checks) console.log(`[${check.passed ? "通过" : "失败"}] ${check.name}：${check.detail}`);
    for (const error of errors) console.log(`控制台错误：${error}`);
    for (const exception of exceptions) console.log(`未捕获异常：${exception}`);
    if (checks.some((check) => !check.passed)) throw new CheckFailure("汇报浏览器检查未通过。");
  } finally {
    if (client) {
      await client.send("Browser.close").catch(() => {});
      client.close();
    }
    if (browser && browser.exitCode === null && browser.signalCode === null) {
      browser.kill("SIGTERM");
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([exited, new Promise<void>((resolveExit) => {
        timer = setTimeout(() => { browser?.kill("SIGKILL"); resolveExit(); }, 3000);
      })]);
      clearTimeout(timer);
      await exited;
    }
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
    rmSync(profile, { recursive: true, force: true });
  }
};

export const reportCheckCommand: Command = {
  options: { out: { type: "string" }, chromium: { type: "string" } },
  positionals: 1,
  textPositionals: true,
  execute: reportCheck,
  help: `${entry} report-check <汇报文件> [--out <截图目录>] [--chromium <路径>]
用本机 Chromium 无头检查单个 HTML 汇报，不发布到外部服务，不增加依赖。
依次查找：--chromium、RUN_SPEC_CHROMIUM、Playwright 缓存、PATH 中的
chromium、chromium-browser、google-chrome；显式指定的路径无效时直接报错。
缓存：Linux ~/.cache/ms-playwright（支持 XDG_CACHE_HOME），macOS ~/Library/Caches/ms-playwright，
Windows %LOCALAPPDATA%/ms-playwright；先查 chromium_headless_shell-*，再查 chromium-*。
找不到时可用 --chromium 指定，或安装 Playwright 的 chromium-headless-shell。
四项均输出通过/失败和数值：控制台 console.error 与未捕获异常为零；
和 file:// 空白页的 Object.keys(window) 比无新增全局名；
360 像素、展开全部 <details> 后 document.documentElement.scrollWidth <= 360（不与 innerWidth 比）；
1280×800 下时间线 ${timelineSelector} 的 scrollWidth <= clientWidth（区域缺失也失败）。
检查浅色和深色桌面以及浅色手机；等待页面加载、字体完成。
视口、配色切换或展开折叠后，至少等 250 毫秒，再确认页面和时间线尺寸连续三帧不变后测量并截图。
按视口高度 800 像素分段截图：浅色 1280×800、深色 1280×800、手机 360×800（已展开全部折叠）。
每组从上到下编号：light-1280-01.png、dark-1280-01.png、mobile-360-01.png 等，末段高度不超过 800。
短页面保留一张视口截图；不输出整页长图。逐张输出绝对路径，并列出每组张数和目录，截图要亲自看。
--out 默认 out/report-check/<文件名（不含扩展名）>/；输出绝对路径。
启动浏览器后立即输出一行“浏览器现场：PID=<进程号>，用户目录=<绝对路径>”，中断后按此精确清理。
结束时只关闭自建浏览器、删除临时用户目录，保留截图。
--dry-run 只显示文件、浏览器和截图目录；--help 以 0 退出。
四项全通过退出 0；有失败退出 1；文件不存在、找不到 Chromium、运行出错退出 2。`,
};
