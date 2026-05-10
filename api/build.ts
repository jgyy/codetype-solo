import { cpSync, rmSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const HANDLER_DIR = join(import.meta.dir, "src", "handlers");
const OUT_DIR = join(import.meta.dir, "dist");
const DRILLS_SRC = join(import.meta.dir, "..", "data", "drills");

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

writeFileSync(join(OUT_DIR, "package.json"), JSON.stringify({ type: "module" }) + "\n");

// Spec 013: drill .tmpl files are read at Lambda init via fsDrillTemplates.
// Copy them into the asset so /var/task/data/drills exists at runtime.
cpSync(DRILLS_SRC, join(OUT_DIR, "data", "drills"), { recursive: true });

console.log(
    `built ${entries.length} handlers → ${OUT_DIR}${bundleAwsSdk ? " (sdk bundled)" : ""}`,
);
