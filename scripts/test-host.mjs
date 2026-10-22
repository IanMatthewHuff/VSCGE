import { fileURLToPath } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { tmpdir } from "node:os";

const root = fileURLToPath(new URL("../", import.meta.url));
const coreOnly = process.argv.includes("--core-only");
const extensions = [`${root}/packages/vscode`, ...(!coreOnly ? [`${root}/packages/demo`] : [])];
const extensionTestsPath = `${root}/packages/vscode/dist/smoke.js`;
const workspace = `${root}/tests/workspace`;

if (process.argv[2] === "desktop") {
  const { runTests, downloadAndUnzipVSCode } = await import("@vscode/test-electron");
  const data = await mkdtemp(join(tmpdir(), "vscge-"));
  let executable = process.env.VSCODE_EXECUTABLE_PATH ?? await downloadAndUnzipVSCode();
  // Recent macOS builds renamed Electron to Code; the test runner still returns Electron.
  if (process.platform === "darwin" && basename(executable) === "Electron" && !existsSync(executable)) {
    const renamed = join(dirname(executable), "Code");
    if (existsSync(renamed)) {
      console.log("Using the renamed macOS Code executable.");
      executable = renamed;
    }
  }
  try {
    await runTests({
      extensionDevelopmentPath: extensions,
      extensionTestsPath,
      vscodeExecutablePath: executable,
      launchArgs: [workspace, "--user-data-dir", data, "--disable-workspace-trust", "--skip-welcome", "--skip-release-notes", "--disable-extensions"],
    });
  } finally { await rm(data, { recursive: true, force: true }); }
} else if (process.argv[2] === "web") {
  const { runTests } = await import("@vscode/test-web");
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const address = probe.address();
  if (!address || typeof address === "string") throw new Error("Could not reserve a test port");
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  await runTests({
    browserType: "chromium", quality: "stable", headless: true,
    extensionDevelopmentPath: extensions[0],
    extensionPaths: extensions.slice(1),
    extensionTestsPath, folderPath: workspace, port: address.port,
    testRunnerDataDir: `${root}/.vscode-test-web`,
  });
} else {
  throw new Error("Expected desktop or web");
}
