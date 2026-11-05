/**
 * 独立审查与巡检的受限席位调用：默认 Claude 参数保持原样，工具仅文件读取或空集。
 * pi 使用相同适配器的检测、事件与成败用量；受限调用不添加技能隔离参数。
 * Codex 现有适配器未提供等价的受限工具档，不能保证本调用的工具约定时明确拒绝。
 * TODO(design)：确认受限席位配置 Codex 时的拒绝策略，或另行实现等价工具裁剪。
 */
import { spawnSync } from "node:child_process";
import { adapterFor } from "./dispatch/adapters.ts";
import type { SeatSettings } from "./dispatch/adapter.ts";
import { loadSeatConfiguration, resolveSeat } from "./dispatch/settings.ts";
import { runClaude, type ClaudeResult } from "./shared.ts";

export const restrictedSeat = (seat: "spec-review" | "watch", cwd: string): SeatSettings =>
  resolveSeat(loadSeatConfiguration(cwd), seat)[0];

export const callSeat = async (options: { settings: SeatSettings; prompt: string; tools: string[]; cwd: string }): Promise<ClaudeResult & { framework: string; actualModel: string | null }> => {
  const { settings, prompt, tools, cwd } = options;
  const adapter = adapterFor(settings.agent);
  if (settings.agent === "claude") {
    const detection = settings.path ? await adapter.detect({ env: process.env, settings }) : undefined;
    if (detection && !detection.installed) throw new Error(detection.error ?? "找不到可用的 Claude CLI");
    const result = runClaude({ prompt, tools, cwd, model: settings.model ?? undefined, effort: settings.effort ?? undefined, launcher: detection?.launcher });
    const models = Object.keys(result.modelUsage ?? {});
    return { ...result, framework: settings.agent, actualModel: models.length === 1 ? models[0] : null };
  }
  if (!adapter.restrictedCommand) throw new Error(`席位 ${settings.seat} 的 ${settings.agent} 适配器不能保证只给文件读取工具或空工具集，拒绝启动；请使用 Claude 或 pi。`);
  const detection = await adapter.detect({ env: process.env, settings });
  if (!detection.installed) throw new Error(detection.error ?? "找不到可用的 pi CLI");
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
    error: outcome.success ? undefined : `pi 调用失败：${result.error?.message || result.stderr?.trim() || "模型未成功结束"}`,
    usage: outcome.usage ? { input_tokens: outcome.usage.input - outcome.usage.cached, cache_read_input_tokens: outcome.usage.cached, output_tokens: outcome.usage.output } : null,
    usageUnavailableReason: outcome.usage ? undefined : "pi 未返回完整用量。",
  };
};
