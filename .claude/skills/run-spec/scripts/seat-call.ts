/**
 * 独立审查与巡检的受限席位调用：默认 Claude 参数保持原样，工具仅文件读取或空集。
 * pi 使用相同适配器的检测、事件与成败用量；受限调用不添加技能隔离参数。
 * 受限席位配了未提供受限调用的适配器时拒绝启动；可用框架与提示取自适配器登记。
 */
import { spawnSync } from "node:child_process";
import { adapters, adapterFor } from "./dispatch/adapters.ts";
import type { SeatSettings } from "./dispatch/adapter.ts";
import { loadSeatConfiguration, resolveSeat } from "./dispatch/settings.ts";
import { runClaude, type ClaudeResult } from "./shared.ts";

export const restrictedSeat = (seat: "spec-review" | "watch", cwd: string): SeatSettings =>
  resolveSeat(loadSeatConfiguration(cwd), seat)[0];

export const callSeat = async (options: { settings: SeatSettings; prompt: string; tools: string[]; cwd: string }): Promise<ClaudeResult & { framework: string; actualModel: string | null }> => {
  const { settings, prompt, tools, cwd } = options;
  const adapter = adapterFor(settings.agent);
  if (!adapter.restrictedCommand) {
    const available = Object.values(adapters).filter(item => item.restrictedCommand).map(item => item.label);
    throw new Error(`席位 ${settings.seat} 的 ${adapter.label} 适配器不能保证只给文件读取工具或空工具集，拒绝启动；${available.length ? `请使用 ${available.join(" 或 ")}` : "当前没有支持受限调用的适配器"}。`);
  }
  if (settings.agent === "claude") {
    const detection = settings.path ? await adapter.detect({ env: process.env, settings }) : undefined;
    if (detection && !detection.installed) throw new Error(detection.error ?? `找不到可用的 ${adapter.label} CLI`);
    const command = adapter.restrictedCommand({ root: cwd, prompt, settings, detection: detection ?? { installed: true, version: null }, env: process.env, tools: tools.length ? "files" : "none" });
    const result = runClaude({ prompt, tools, cwd, command });
    const models = Object.keys(result.modelUsage ?? {});
    return { ...result, framework: settings.agent, actualModel: models.length === 1 ? models[0] : null };
  }
  const detection = await adapter.detect({ env: process.env, settings });
  if (!detection.installed) throw new Error(detection.error ?? `找不到可用的 ${adapter.label} CLI`);
  const command = adapter.restrictedCommand({ root: cwd, prompt, settings, detection, env: process.env, tools: tools.length ? "files" : "none" });
  const result = spawnSync(command.executable, command.args, { cwd, input: command.stdin, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, shell: false });
  const events = (result.stdout ?? "").split(/\r?\n/).flatMap(line => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
  let text = "";
  for (const line of (result.stdout ?? "").split(/\r?\n/))
    for (const event of adapter.mapLine(line, { root: cwd })) if (event.kind === "say") text = event.text;
  const outcome = adapter.outcome({ code: result.status, failed: Boolean(result.error || result.signal), events, settings, root: cwd });
  return {
    framework: settings.agent, actualModel: outcome.actualModel, text, exitCode: outcome.success ? 0 : result.status || 2, stderr: result.stderr ?? "",
    error: outcome.success ? undefined : `${adapter.label} 调用失败：${result.error?.message || result.stderr?.trim() || "模型未成功结束"}`,
    usage: outcome.usage ? { input_tokens: outcome.usage.input - outcome.usage.cached, cache_read_input_tokens: outcome.usage.cached, output_tokens: outcome.usage.output } : null,
    usageUnavailableReason: outcome.usage ? undefined : `${adapter.label} 未返回完整用量。`,
  };
};
