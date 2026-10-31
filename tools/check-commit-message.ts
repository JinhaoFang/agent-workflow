/**
 * Validate a commit message and branch without reading Git or changing state.
 * Import checkCommitMessage(message, branch, options?); an empty list passes.
 * Hooks use stripComments to remove # lines and truncate at Git's scissors line.
 * CI checks final messages without stripping; git commit -m preserves # lines.
 * Callers skip merges using MERGE_HEAD (hook) or parent count (CI), never subjects.
 * Detached HEAD uses ""; a footer paragraph must consist entirely of trailers.
 */
export type CommitViolation = {
  rule: "a" | "b" | "c" | "d" | "e" | "f" | "g";
  message: string;
};

export type CommitMessageOptions = {
  stripComments?: boolean;
};

const trailer = /^[A-Za-z][A-Za-z0-9-]*:[ \t]+\S.*$/;
const signature =
  /^[\s\p{P}\p{S}\p{M}\u200d]*(?:[\p{L}\p{N}_]+(?:-[\p{L}\p{N}_]+)*-by:|generated[ \t]+(?:with|by)\b)/iu;

export const checkCommitMessage = (
  message: string,
  branch: string,
  options: CommitMessageOptions = {},
): CommitViolation[] => {
  let lines = message.replaceAll("\r\n", "\n").split("\n");
  if (options.stripComments) {
    const scissors = lines.findIndex(
      (line) =>
        line.trimEnd() ===
        "# ------------------------ >8 ------------------------",
    );
    if (scissors !== -1) lines = lines.slice(0, scissors);
    lines = lines.filter((line) => !line.startsWith("#"));
  }
  lines = lines.map((line) => line.trimEnd());
  while (lines[0] === "") lines.shift();
  while (lines.at(-1) === "") lines.pop();
  const subject = lines[0] ?? "";

  const violations: CommitViolation[] = [];
  const title = /^([^\s(]+)\(([^)]*)\)([:：])([ \t]*)(.*)$/.exec(subject);
  if (
    !title ||
    !/^(feat|fix|docs|refactor|test|build|chore)$/.test(title[1]) ||
    title[3] !== ":" ||
    title[4] !== " " ||
    !title[5].trim()
  ) {
    violations.push({
      rule: "a",
      message: subject.includes("：")
        ? "标题须为 <类型>(<范围>): <摘要>；请把中文冒号改成英文冒号，后接一个空格。"
        : "标题须为 <类型>(<范围>): <摘要>；类型只能是 feat/fix/docs/refactor/test/build/chore，冒号后接一个空格。",
    });
  }
  if (!title || !/^[a-z0-9-]+$/.test(title[2])) {
    violations.push({
      rule: "b",
      message: "范围必写，只能包含小写字母、数字和连字符；整仓改动用 repo。",
    });
  }
  if (!/\p{Script=Han}/u.test(title?.[5] ?? subject)) {
    violations.push({ rule: "c", message: "摘要至少包含一个中文字符。" });
  }

  const paragraphs = lines
    .slice(1)
    .join("\n")
    .trim()
    .split(/\n\s*\n/);
  const last = paragraphs.at(-1) ?? "";
  const footer = last.split("\n").every((line) => trailer.test(line))
    ? paragraphs.pop()!.split("\n")
    : [];
  if (lines[1] !== "" || !paragraphs.some((paragraph) => paragraph.trim())) {
    violations.push({
      rule: "d",
      message: "正文必写：标题后须有空行，并至少有一段不是尾注的内容。",
    });
  }
  const roles = footer.filter((line) =>
    /^Role: (design|engineering)$/.test(line),
  );
  const refs = footer.filter((line) => /^Refs: #[1-9][0-9]*$/.test(line));
  const misplacedTrailers = paragraphs.some((paragraph) =>
    /^(?:Role|Refs)\s*[:：]/m.test(paragraph),
  );
  if (
    roles.length !== 1 ||
    footer.some(
      (line) => !/^Role: (design|engineering)$|^Refs: #[1-9][0-9]*$/.test(line),
    ) ||
    misplacedTrailers
  ) {
    violations.push({
      rule: "e",
      message: misplacedTrailers
        ? "Refs 和 Role 要放在最后同一段，用换行分隔；用 -m 提交时放在同一个 -m 里。"
        : "最后的尾注段只允许 Refs: #<号> 和 Role: design|engineering；Refs 可写多行，Role 必写且只能写一项。",
    });
  }
  if (lines.some((line) => signature.test(line))) {
    violations.push({
      rule: "f",
      message:
        "任何行首都不能出现署名形状 <单词>-by: 或 Generated with/by，前面有空白、符号或 emoji 也不允许（不区分大小写）。",
    });
  }
  if (
    /^(spec|ticket)\//.test(branch) &&
    refs.length === 0 &&
    !misplacedTrailers
  ) {
    violations.push({
      rule: "g",
      message: "spec/* 和 ticket/* 分支必须在尾注写 Refs: #<号>。",
    });
  }
  return violations;
};
