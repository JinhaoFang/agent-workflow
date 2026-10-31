/**
 * Shared Chinese CLI diagnostics. Usage errors include the command synopsis;
 * reportError prints one prefixed diagnostic and sets runtime/argument code 2.
 * Check failures use code 1 in their own handlers; help returns normally.
 */
export const usageError = (message: string, usage: string): Error =>
  new Error(`${message}\n用法：${usage}`);

export const errorMessage = (error: unknown): string => {
  const detail = error as NodeJS.ErrnoException;
  if (detail?.code === "ENOENT")
    return `文件或程序不存在：${detail.path ?? detail.syscall ?? "未知路径"}`;
  if (detail?.code === "EACCES" || detail?.code === "EPERM")
    return `没有访问权限：${detail.path ?? "请检查文件权限"}`;
  if (detail?.code === "EISDIR")
    return `需要文件，不能使用目录：${detail.path ?? "输入路径"}`;
  if (detail?.code)
    return `运行失败（${detail.code}）：${detail.path ?? "请检查输入和运行环境"}`;
  if (error instanceof SyntaxError)
    return "数据格式无效，请检查输入或外部程序返回的数据。";
  const message = error instanceof Error ? error.message : String(error);
  return /\p{Script=Han}/u.test(message)
    ? message
    : "运行失败，请检查输入和运行环境。";
};

export const reportError = (error: unknown): void => {
  console.error(`出错：${errorMessage(error)}`);
  process.exitCode = 2;
};
