import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const shared = {
  absWorkingDir: root,
  bundle: true,
  format: "cjs",
  target: "es2022",
  external: ["vscode"],
  sourcemap: true,
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "@vscge/engine": `${root}/packages/engine/src/index.ts` },
};
await Promise.all(["vscode", "demo"].flatMap(name => ["node", "browser"].map(platform =>
  build({
    ...shared, platform,
    entryPoints: [`packages/${name}/src/extension.ts`],
    outfile: `packages/${name}/dist/${platform === "browser" ? "web/" : ""}extension.js`,
  }),
)));
await build({
  ...shared, platform: "browser", entryPoints: ["tests/host/smoke.ts"],
  outfile: "packages/vscode/dist/smoke.js",
});
console.log("Built core, demo, and extension-host smoke tests (desktop + browser).");
