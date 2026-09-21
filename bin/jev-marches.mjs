#!/usr/bin/env node
// Purpose: Expose the package's bounded command-line entry point.
import { runCli } from "../src/index.mjs";
runCli(process.argv.slice(2)).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
