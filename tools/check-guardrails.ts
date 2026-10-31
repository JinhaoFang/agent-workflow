/**
 * Run `node tools/check-guardrails.ts comments [repository-root]` to check
 * comment placement in tracked and non-ignored untracked code files.
 * TypeScript syntax trees protect strings, regexps, templates and JSX text.
 * Explanatory comments belong before the first statement; tool directives pass.
 * Failures print file:line, rule and explanation, and exit with code 1.
 */
import { readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import ts from "typescript";
import { reportError, usageError } from "./cli.ts";
import { listCodeFiles } from "./code-files.ts";

const main = (): void => {
  const usage =
    "node tools/check-guardrails.ts <comments> [仓库根目录]";
  const [mode, rootArg, ...extra] = process.argv.slice(2);
  if (mode === "--help") {
    console.log(
      `用法：${usage}\ncomments 检查注释位置。`,
    );
    return;
  }
  if (mode !== "comments" || extra.length)
    throw usageError(
      "请选择 comments，最多提供一个仓库根目录。",
      usage,
    );

  const root = resolve(rootArg ?? process.cwd());
  let failures = 0;

  const report = (
    source: ts.SourceFile,
    position: number,
    rule: string,
    message: string,
  ): void => {
    const line = source.getLineAndCharacterOfPosition(position).line + 1;
    console.error(
      `出错：${relative(root, source.fileName).split(sep).join("/")}:${line} ${rule} ${message}`,
    );
    failures += 1;
  };

  const visit = (node: ts.Node, callback: (node: ts.Node) => void): void => {
    callback(node);
    ts.forEachChild(node, (child) => visit(child, callback));
  };

  const checkComments = (source: ts.SourceFile): void => {
    const spans: { start: number; end: number }[] = [];
    visit(source, (node) => {
      if (
        ts.isStringLiteralLike(node) ||
        ts.isRegularExpressionLiteral(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node) ||
        ts.isJsxText(node)
      ) {
        spans.push({
          start: ts.isJsxText(node) ? node.pos : node.getStart(source),
          end: node.end,
        });
      }
    });
    spans.sort((a, b) => a.start - b.start);
    const headerEnd = source.statements[0]?.getStart(source) ?? source.end;
    const scanner = ts.createScanner(
      ts.ScriptTarget.Latest,
      false,
      ts.LanguageVariant.Standard,
      source.text,
    );
    let spanIndex = 0;

    for (
      let token = scanner.scan();
      token !== ts.SyntaxKind.EndOfFileToken;
      token = scanner.scan()
    ) {
      const start = scanner.getTokenPos();
      while (spans[spanIndex] && spans[spanIndex].end <= start) {
        spanIndex += 1;
      }
      const span = spans[spanIndex];
      if (span && start >= span.start && start < span.end) {
        scanner.setTextPos(span.end);
        continue;
      }
      if (
        start < headerEnd ||
        (token !== ts.SyntaxKind.SingleLineCommentTrivia &&
          token !== ts.SyntaxKind.MultiLineCommentTrivia)
      ) {
        continue;
      }
      const text = scanner.getTokenText();
      const content = (
        token === ts.SyntaxKind.SingleLineCommentTrivia
          ? text.slice(2)
          : text.slice(2, -2)
      ).trim();
      const singleLine = token === ts.SyntaxKind.SingleLineCommentTrivia;
      const eslintDirectiveSyntax = singleLine
        ? /^eslint-disable-(?:next-)?line(?:\s|$)/.test(content)
        : /^eslint-(?:disable(?:-next-line|-line)?|enable)(?:\s|$)/.test(
            content,
          );
      const eslintDirective =
        eslintDirectiveSyntax &&
        !(
          /^eslint-disable-line(?:\s|$)/.test(content) &&
          /[\r\n\u2028\u2029]/.test(text)
        );
      const tsDirective = singleLine
        ? /^\/\/\/?\s*@ts-expect-error/.test(text)
        : /^(?:\/|\*)*\s*@ts-expect-error/.test(
            text
              .split(/\r\n|[\r\n\u2028\u2029]/)
              .at(-1)!
              .trimStart(),
          );
      if (eslintDirective || tsDirective) {
        continue;
      }
      report(
        source,
        start,
        "comment-position",
        "说明性注释只能放在第一句代码之前。",
      );
    }
  };

  for (const path of listCodeFiles(root)) {
    const absolute = resolve(root, path);
    const source = ts.createSourceFile(
      absolute,
      readFileSync(absolute, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    checkComments(source);
  }

  if (failures > 0) {
    process.exitCode = 1;
  }
};

try {
  main();
} catch (error) {
  reportError(error);
}
