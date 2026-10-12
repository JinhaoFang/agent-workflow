/**
 * Designer-only ticket CLI: run `node .claude/skills/run-spec/scripts/tickets.ts
 * <frontier|link|accept|dispatch|land|cleanup|doctor> --help` from a clone.
 * Register each command once; modules provide help, options, positional count
 * and handler. Shared parsing and diagnostics dispatch commands locally so
 * copying this skill needs no repository helpers or dependencies.
 */
import { cleanupCommand } from "./cleanup.ts";
import { landCommand } from "./land.ts";
import { dispatchCommand } from "./dispatch.ts";
import { frontierCommand } from "./frontier.ts";
import { linkCommand } from "./link.ts";
import { acceptCommand } from "./accept.ts";
import { doctorCommand } from "./doctor.ts";
import { reportError, runCommands, type Command } from "./shared.ts";

const commands: Record<string, Command> = {
  doctor: doctorCommand,
  cleanup: cleanupCommand,
  land: landCommand,
  dispatch: dispatchCommand,
  frontier: frontierCommand,
  link: linkCommand,
  accept: acceptCommand,
};

try {
  runCommands(commands);
} catch (error) {
  reportError(error);
}
