/**
 * 派发适配器约定：席位可承载框架、模型、强度、权限和工作类型。
 * 公共层只处理统一事件与生命周期；成败、用量和实际模型均由适配器判定。
 * isConcurrencyLimit 判断滚动输出是否为可重排的并发超限，失败退出后才重排。
 * 已接入框架见 adapters.ts；框架实现与登记分开维护，新增框架由对应适配器工单接入。
 */
export type Event = Record<string, any>;
export type Permission = "read-only" | "workspace-write" | "full";
export type SeatSettings = {
  seat: string;
  workType: string;
  agent: string;
  model: string | null;
  effort: string | null;
  permission: Permission;
  tier: string | null;
  path: string | null;
  sources?: Record<string, string>;
  fallbackReason?: string | null;
};
export type Usage = { input: number; cached: number; output: number };
export type Outcome = { success: boolean; usage: Usage | null; actualModel: string | null; actualEffort: string | null };
export type Detection = { installed: boolean; version: string | null; launcher?: { executable: string; args: string[] }; error?: string };
export type Adapter = {
  id: string;
  label: string;
  writesReport: boolean;
  isConcurrencyLimit(output: string): boolean;
  detect(input: { env: NodeJS.ProcessEnv; settings: SeatSettings }): Detection | Promise<Detection>;
  command(input: { root: string; report: string; prompt: string; settings: SeatSettings; detection: Detection; env: NodeJS.ProcessEnv }): { executable: string; args: string[]; stdin: string };
  restrictedCommand?(input: { root: string; prompt: string; settings: SeatSettings; detection: Detection; env: NodeJS.ProcessEnv; tools: "files" | "none" }): { executable: string; args: string[]; stdin: string };
  mapLine(line: string, input: { root: string }): Event[];
  outcome(input: { code: number | null; failed: boolean; events: Event[]; settings: SeatSettings; root: string; recordsRoot?: string }): Outcome;
  isolationArgs(): string[];
  permissions: Record<Permission, { args: string[]; loss: string | null }>;
  failureHint?(stderr: string): string | null;
};
