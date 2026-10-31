/**
 * Table-driven coverage of commit rules, caller-controlled cleanup and merge handling.
 * Test the public pure function's violation list, including simultaneous failures.
 * Run with `node --test tools/check-commit-message.test.ts` or `pnpm verify`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkCommitMessage } from "./check-commit-message.ts";
import type {
  CommitMessageOptions,
  CommitViolation,
} from "./check-commit-message.ts";

const valid =
  "feat(tools): 检查提交信息\n\n- 增加护栏，已运行 pnpm verify。\n\nRefs: #6\nRole: engineering";
const cases: {
  name: string;
  message: string;
  branch?: string;
  options?: CommitMessageOptions;
  rules: CommitViolation["rule"][];
  diagnostic?: RegExp;
}[] = [
  {
    name: "g allows refs on ticket",
    message: valid,
    branch: "ticket/12-review-rework",
    rules: [],
  },
  {
    name: "g rejects missing refs on ticket",
    message: valid.replace("Refs: #6\n", ""),
    branch: "ticket/12-review-rework",
    rules: ["g"],
  },
  {
    name: "g matches ticket slash only",
    message: valid.replace("Refs: #6\n", ""),
    branch: "ticket-other",
    rules: [],
  },
  { name: "all required fields on spec", message: valid, rules: [] },
  ...["feat", "fix", "docs", "refactor", "test", "build", "chore"].map(
    (type) => ({
      name: `a allows type ${type}`,
      message: valid.replace("feat(", `${type}(`),
      rules: [],
    }),
  ),
  {
    name: "a rejects unknown type",
    message: valid.replace("feat(", "perf("),
    rules: ["a"],
  },
  {
    name: "a rejects Chinese colon",
    message: valid.replace("): ", ")： "),
    rules: ["a"],
  },
  {
    name: "a rejects missing separator space",
    message: valid.replace("): ", "):"),
    rules: ["a"],
  },
  {
    name: "a rejects extra separator space",
    message: valid.replace("): ", "):  "),
    rules: ["a"],
  },
  {
    name: "a rejects tab separator",
    message: valid.replace("): ", "):\t"),
    rules: ["a"],
  },
  {
    name: "b allows repo",
    message: valid.replace("(tools)", "(repo)"),
    rules: [],
  },
  {
    name: "b allows new scopes",
    message: valid.replace("(tools)", "(nasa-ep04)"),
    rules: [],
  },
  ...["", "Tools", "tools/qa", "my_scope", "工单", "has space"].map(
    (scope) => ({
      name: `b rejects scope ${JSON.stringify(scope)}`,
      message: valid.replace("(tools)", `(${scope})`),
      rules: ["b"] as CommitViolation["rule"][],
    }),
  ),
  {
    name: "b rejects omitted scope",
    message: valid.replace("(tools)", ""),
    rules: ["a", "b"],
  },
  {
    name: "c allows mixed language",
    message: valid.replace("检查提交信息", "Validate 提交"),
    rules: [],
  },
  {
    name: "c allows traditional Chinese",
    message: valid.replace("检查提交信息", "檢查提交資訊"),
    rules: [],
  },
  {
    name: "c rejects English summary even with Chinese body",
    message: valid.replace("检查提交信息", "Validate commits"),
    rules: ["c"],
  },
  {
    name: "c rejects Chinese only in scope",
    message: valid.replace("(tools): 检查提交信息", "(工具): Validate commits"),
    rules: ["b", "c"],
  },
  {
    name: "d allows multiple body paragraphs",
    message: valid.replace("- 增加护栏", "原因：需要统一检查。\n\n- 增加护栏"),
    rules: [],
  },
  {
    name: "d allows labeled body paragraph",
    message: valid.replace("- 增加护栏", "Validation: 增加护栏"),
    rules: [],
  },
  {
    name: "d rejects missing blank after subject",
    message: valid.replace("信息\n\n-", "信息\n-"),
    rules: ["d"],
  },
  {
    name: "d rejects only trailers",
    message: "feat(tools): 检查提交信息\n\nRefs: #6\nRole: engineering",
    rules: ["d"],
  },
  {
    name: "e allows design role and reversed trailers",
    message: valid.replace(
      "Refs: #6\nRole: engineering",
      "Role: design\nRefs: #6",
    ),
    rules: [],
  },
  {
    name: "e rejects missing role",
    message: valid.replace("\nRole: engineering", ""),
    rules: ["e"],
  },
  {
    name: "e rejects unknown role",
    message: valid.replace("Role: engineering", "Role: developer"),
    rules: ["e"],
  },
  {
    name: "e rejects extra trailer",
    message: `${valid}\nReviewed: yes`,
    rules: ["e"],
  },
  {
    name: "e rejects duplicate role",
    message: `${valid}\nRole: design`,
    rules: ["e"],
  },
  {
    name: "e allows multiple refs",
    message: `${valid}\nRefs: #1`,
    rules: [],
  },
  {
    name: "e rejects malformed refs",
    message: valid.replace("Refs: #6", "Refs: six"),
    rules: ["e", "g"],
  },
  {
    name: "e rejects Chinese trailer colon",
    message: valid.replace("Role: engineering", "Role： engineering"),
    rules: ["e"],
  },
  {
    name: "e rejects prose appended to footer",
    message: `${valid}\n更多说明`,
    rules: ["e"],
  },
  {
    name: "e requires role in final footer",
    message: `${valid}\n\n更多说明`,
    rules: ["e"],
    diagnostic:
      /Refs 和 Role 要放在最后同一段，用换行分隔；用 -m 提交时放在同一个 -m 里/,
  },
  {
    name: "e explains refs and role split across paragraphs",
    message: valid.replace("Refs: #6\nRole", "Refs: #6\n\nRole"),
    rules: ["e"],
    diagnostic:
      /Refs 和 Role 要放在最后同一段，用换行分隔；用 -m 提交时放在同一个 -m 里/,
  },
  {
    name: "e explains role before final refs",
    message: valid.replace(
      "Refs: #6\nRole: engineering",
      "Role: engineering\n\nRefs: #6",
    ),
    rules: ["e"],
    diagnostic: /Refs 和 Role 要放在最后同一段/,
  },
  {
    name: "d does not mistake mixed Cause paragraph for footer",
    message: "feat(tools): 检查提交信息\n\nCause: 修复失败\n运行验证通过",
    rules: ["e", "g"],
  },
  {
    name: "e recognizes a paragraph entirely made of trailers",
    message: "feat(tools): 检查提交信息\n\nCause: 修复失败",
    rules: ["d", "e", "g"],
  },
  {
    name: "d allows ordinary final paragraph containing a colon",
    message: "feat(tools): 检查提交信息\n\n修复失败\nCause: 输入错误",
    rules: ["e", "g"],
  },
  { name: "f allows ordinary body", message: valid, rules: [] },
  ...[
    "Co-Authored-By",
    "sIgNeD-oFf-bY",
    "Authored-by",
    "Reviewed-by",
    "Custom-by",
  ].map((name) => ({
    name: `f rejects signature trailer ${name}`,
    message: `${valid}\n${name}: Agent`,
    rules: ["e", "f"] as CommitViolation["rule"][],
  })),
  ...[
    "Generated with",
    "generated BY",
    "Co-Authored-By:",
    "Signed-off-by:",
    "Custom-by:",
  ].map((name) => ({
    name: `f rejects signature inside prose ${name}`,
    message: valid.replace("- 增加护栏", `- ${name} Agent；增加护栏`),
    rules: ["f"] as CommitViolation["rule"][],
  })),
  {
    name: "f allows signature words in middle of subject",
    message: valid.replace("检查提交信息", "检查提交信息 Generated with Agent"),
    rules: [],
  },
  ...[
    "Generated with",
    "gEnErAtEd BY",
    "Unexpected-by:",
    "sIgNeD-oFf-bY:",
  ].flatMap((marker) =>
    ["", "  ", "> * ", "🤖 ✨ ", "👩‍💻 ⚙️ "].map((prefix) => ({
      name: `f rejects line-start signature ${JSON.stringify(prefix + marker)}`,
      message: valid.replace(
        "- 增加护栏",
        `${prefix}${marker} Agent；增加护栏`,
      ),
      rules: ["f"] as CommitViolation["rule"][],
    })),
  ),
  {
    name: "f allows generated by in middle of sentence",
    message: valid.replace(
      "- 增加护栏",
      "- 样例 generated by ffmpeg lavfi；增加护栏",
    ),
    rules: [],
  },
  {
    name: "f allows by marker in middle of sentence",
    message: valid.replace(
      "- 增加护栏",
      "- 说明 Custom-by: 属于待检查输入；增加护栏",
    ),
    rules: [],
  },
  {
    name: "f requires colon for by marker",
    message: valid.replace("- 增加护栏", "- Custom-by Agent；增加护栏"),
    rules: [],
  },
  {
    name: "g allows no refs outside spec",
    message: valid.replace("Refs: #6\n", ""),
    branch: "main",
    rules: [],
  },
  {
    name: "g allows no refs in detached HEAD",
    message: valid.replace("Refs: #6\n", ""),
    branch: "",
    rules: [],
  },
  {
    name: "g matches spec slash only",
    message: valid.replace("Refs: #6\n", ""),
    branch: "spec-other",
    rules: [],
  },
  {
    name: "g rejects missing refs on spec",
    message: valid.replace("Refs: #6\n", ""),
    rules: ["g"],
  },
  {
    name: "h checks ordinary commit with merge subject",
    message: "Merge branch 'main' into spec/1-guardrails",
    rules: ["a", "b", "c", "d", "e", "g"],
  },
  {
    name: "h leaves pull request merge exemption to caller",
    message: "Merge pull request #2 from owner/topic",
    rules: ["a", "b", "c", "d", "e", "g"],
  },
  {
    name: "h does not bypass invalid body for merge subject",
    message:
      "Merge remote-tracking branch 'origin/main'\n\nSigned-off-by: Agent",
    rules: ["a", "b", "c", "d", "e", "f", "g"],
  },
  {
    name: "h does not skip merge-like word",
    message: "Mergeable",
    rules: ["a", "b", "c", "d", "e", "g"],
  },
  {
    name: "a rejects default revert subject without exemption",
    message: `Revert "feat(tools): 检查提交信息"\n\nThis reverts commit abcdef.\n\nRefs: #6\nRole: engineering`,
    rules: ["a", "b"],
  },
  {
    name: "comments ignore invalid content before and after message",
    message: `# bad\n# Signed-off-by: Agent\n${valid}\n# More comments`,
    options: { stripComments: true },
    rules: [],
  },
  {
    name: "comments cannot serve as body",
    options: { stripComments: true },
    message: valid.replace("- 增加护栏，已运行 pnpm verify。", "# 增加护栏"),
    rules: ["d"],
  },
  {
    name: "comments cannot serve as refs",
    options: { stripComments: true },
    message: valid.replace("Refs: #6", "# Refs: #6"),
    rules: ["g"],
  },
  {
    name: "comments cannot serve as role",
    options: { stripComments: true },
    message: valid.replace("Role: engineering", "# Role: engineering"),
    rules: ["e"],
  },
  {
    name: "comments only ignore lines starting with hash",
    options: { stripComments: true },
    message: valid.replace("- 增加护栏", " # Generated with Agent；增加护栏"),
    rules: ["f"],
  },
  {
    name: "comments remain by default and expose signatures to CI",
    message: valid.replace("- 增加护栏", "# Signed-off-by: Agent；增加护栏"),
    rules: ["f"],
  },
  {
    name: "comments remain with explicit false",
    message: valid.replace("- 增加护栏", "# Generated by Agent；增加护栏"),
    options: { stripComments: false },
    rules: ["f"],
  },
  {
    name: "comments may serve as final message body",
    message: valid.replace("- 增加护栏，已运行 pnpm verify。", "# 增加护栏"),
    rules: [],
  },
  {
    name: "comments truncate scissors content in hook mode",
    message: `${valid}\n# ------------------------ >8 ------------------------\nSigned-off-by: Agent\n\ndiff --git a/a b/a`,
    options: { stripComments: true },
    rules: [],
  },
  {
    name: "comments keep scissors content in CI mode",
    message: `${valid}\n# ------------------------ >8 ------------------------\nSigned-off-by: Agent\n\ndiff --git a/a b/a`,
    rules: ["e", "f"],
  },
  {
    name: "comments before scissors cannot supply missing body",
    message:
      "feat(tools): 检查提交信息\n\nRefs: #6\nRole: engineering\n# ------------------------ >8 ------------------------\n这是 diff 内容",
    options: { stripComments: true },
    rules: ["d"],
  },
  {
    name: "normalizes CRLF and surrounding blank lines",
    message: `\n${valid}\n\n`.replaceAll("\n", "\r\n"),
    rules: [],
  },
  {
    name: "collects all applicable failures for bad",
    message: "bad",
    rules: ["a", "b", "c", "d", "e", "g"],
  },
  {
    name: "collects all seven rule failures",
    message: "perf(Tools)： English\nSigned-off-by: Agent",
    rules: ["a", "b", "c", "d", "e", "f", "g"],
  },
  {
    name: "empty message",
    options: { stripComments: true },
    message: "# comment only\n",
    rules: ["a", "b", "c", "d", "e", "g"],
  },
];

for (const item of cases) {
  test(item.name, () => {
    const result = checkCommitMessage(
      item.message,
      item.branch ?? "spec/1-guardrails",
      item.options,
    );
    assert.deepEqual(
      result.map((violation) => violation.rule),
      item.rules,
    );
    for (const violation of result)
      assert.match(violation.message, /\p{Script=Han}/u);
    if (item.name === "a rejects Chinese colon") {
      assert.match(result[0].message, /中文冒号.*英文冒号/);
    }
    if (item.diagnostic) {
      assert.ok(
        result.some((violation) => item.diagnostic!.test(violation.message)),
      );
    }
  });
}
