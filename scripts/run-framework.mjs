import { fileURLToPath } from "node:url";

const [command, ...args] = process.argv.slice(2);
if (command !== "dev" && command !== "build") throw new Error("Expected dev or build.");

await import("./prepare-media.mjs");

const cli = new URL("../node_modules/vinext/dist/cli.js", import.meta.url);
process.argv = [process.execPath, fileURLToPath(cli), command, ...args];
await import(cli.href);
