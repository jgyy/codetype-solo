import { rmSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const HANDLER_DIR = join(import.meta.dir, "src", "handlers");
const OUT_DIR = join(import.meta.dir, "dist");

// Spec 009 cold-start budget:
//   - minify and tree-shake aggressively (`minify: true`)
//   - lock NODE_ENV at build time so any guard branches drop dead code
//   - keep @aws-sdk/* external so the Lambda layer / runtime provides it.
//     Set BUNDLE_AWS_SDK=1 to inline (fallback for runtimes without v3).
const bundleAwsSdk = process.env.BUNDLE_AWS_SDK === "1";

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

const entries = readdirSync(HANDLER_DIR).filter((f) => f.endsWith(".ts"));

const result = await Bun.build({
  entrypoints: entries.map((f) => join(HANDLER_DIR, f)),
  outdir: OUT_DIR,
  root: HANDLER_DIR,
  target: "node",
  format: "esm",
  minify: true,
  sourcemap: "external",
  external: bundleAwsSdk ? [] : ["@aws-sdk/*"],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});

if (!result.success) {
  for (const m of result.logs) console.error(m);
  process.exit(1);
}

// Lambda's Node runtime treats .js as CommonJS by default. Our bundle is ESM,
// so emit a marker package.json so the runtime loads it as a module.
writeFileSync(join(OUT_DIR, "package.json"), JSON.stringify({ type: "module" }) + "\n");
console.log(
  `built ${entries.length} handlers → ${OUT_DIR}${bundleAwsSdk ? " (sdk bundled)" : ""}`,
);
