import { rmSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const HANDLER_DIR = join(import.meta.dir, "src", "handlers");
const OUT_DIR = join(import.meta.dir, "dist");

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

const entries = readdirSync(HANDLER_DIR).filter((f) => f.endsWith(".ts"));

const result = await Bun.build({
  entrypoints: entries.map((f) => join(HANDLER_DIR, f)),
  outdir: OUT_DIR,
  target: "node",
  format: "esm",
  minify: true,
  sourcemap: "external",
  external: ["@aws-sdk/*"],
});

if (!result.success) {
  for (const m of result.logs) console.error(m);
  process.exit(1);
}
console.log(`built ${entries.length} handlers → ${OUT_DIR}`);
