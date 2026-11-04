import { mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = `${root}/artifacts`;
await mkdir(output, { recursive: true });
for (const [directory, name] of [["vscode", "vscge"], ["demo", "vscdc-demo"], ["extension-pack", "vscge-pack"]]) {
  execFileSync(process.execPath, [
    `${root}/node_modules/@vscode/vsce/vsce`, "package",
    "--no-dependencies", "--skip-license", "--out", `${output}/${name}-0.1.0.vsix`,
  ], { cwd: `${root}/packages/${directory}`, stdio: "inherit" });
}
if (!process.env.npm_execpath) throw new Error("Run this script through npm run package");
execFileSync(process.execPath, [process.env.npm_execpath, "pack", "-w", "@vscge/engine", "--pack-destination", output], {
  cwd: root, stdio: "inherit",
});
execFileSync(process.execPath, [`${root}/scripts/verify-sdk.mjs`], { cwd: root, stdio: "inherit" });
