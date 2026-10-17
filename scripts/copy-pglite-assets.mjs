#!/usr/bin/env node
// The node-server bundle inlines PGLite's JS but not its wasm/data files, which
// it loads from beside the bundled module at runtime. Copy them in.
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve("@electric-sql/pglite"));
const target = join(process.cwd(), ".output", "server", "_libs");
await mkdir(target, { recursive: true });
for (const file of ["pglite.data", "pglite.wasm", "initdb.wasm"]) {
  await copyFile(join(dist, file), join(target, file));
}
console.log(`[pglite] copied runtime assets to ${target}`);
