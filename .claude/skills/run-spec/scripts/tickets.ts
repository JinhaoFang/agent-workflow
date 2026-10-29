/**
 * Designer-only ticket CLI: run `node .claude/skills/run-spec/scripts/tickets.ts
 * <frontier|link|accept|dispatch|land|cleanup|review|doctor|watch> --help` from a clone.
 * Register each command once; modules provide help, options, required/optional
 * numeric positional counts, optional raw `--` passthrough and a handler.
 * Shared helpers load optional configuration defaults/sources and run Claude
 * with restricted tools, no MCP/session persistence and JSON usage reporting.
 * Shared parsing and diagnostics dispatch commands locally so
 * copying this skill needs no repository helpers or dependencies.
 */
import { cleanupCommand } from "./cleanup.ts";
import { landCommand } from "./land.ts";
import { dispatchCommand } from "./dispatch.ts";
import { frontierCommand } from "./frontier.ts";
import { linkCommand } from "./link.ts";
import { acceptCommand } from "./accept.ts";
import { doctorCommand } from "./doctor.ts";
import { reviewCommand } from "./review.ts";
import { watchCommand } from "./watch.ts";
import { reportError, runCommands, type Command } from "./shared.ts";

const commands: Record<string, Command> = {
  doctor: doctorCommand,
  cleanup: cleanupCommand,
  land: landCommand,
  dispatch: dispatchCommand,
  frontier: frontierCommand,
  link: linkCommand,
  accept: acceptCommand,
  review: reviewCommand,
  watch: watchCommand,
};

try {
  runCommands(commands);
} catch (error) {
  reportError(error);
}
