import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
await mkdir(`${root}/.vscode-test`, { recursive: true });
const directory = await mkdtemp(`${root}/.vscode-test/sdk-`);
try {
  execFileSync("tar", ["-xf", `${root}/artifacts/vscge-engine-0.1.0.tgz`, "-C", directory]);
  const require = createRequire(import.meta.url);
  const sdk = require(join(directory, "package"));
  const definition = {
    id: "consumer", title: "SDK consumer", stateVersion: 1, initialState: () => 0,
    decodeState: input => typeof input === "number" ? sdk.valid(input) : sdk.invalid("number required"),
    decodeAction: input => input === "take" ? sdk.valid(input) : sdk.invalid("unknown action"),
    transition: state => ({ accepted: true, state: state + 1, consumesTurn: true, events: [] }),
    present: ({ state }) => ({ text: String(state), details: [], actions: [], status: "Ready" }),
  };
  const session = new sdk.GameSession(definition);
  if (!session.dispatch("take").accepted || session.serialize().snapshot.state !== 1) {
    throw new Error("Packed SDK runtime did not execute correctly");
  }
  const filename = join(directory, "consumer.ts");
  const source = `
    import { GameSession, valid, invalid, type GameDefinition } from "./package";
    const game: GameDefinition<number, "take"> = {
      id: "consumer", title: "Consumer", stateVersion: 1, initialState: () => 0,
      decodeState: input => typeof input === "number" ? valid(input) : invalid("number"),
      decodeAction: input => input === "take" ? valid(input) : invalid("action"),
      transition: state => ({ accepted: true, state: state + 1, consumesTurn: true, events: [] }),
      present: ({ state }) => ({ text: String(state), details: [], actions: [], status: "Ready" })
    };
    const count: number = new GameSession(game).getSnapshot().state;
    void count;
  `;
  const options = {
    strict: true, noEmit: true, types: [],
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.Node16, moduleResolution: ts.ModuleResolutionKind.Node16,
  };
  const host = ts.createCompilerHost(options);
  const originalGetSource = host.getSourceFile.bind(host);
  host.getSourceFile = (file, language, ...rest) => file === filename
    ? ts.createSourceFile(file, source, language) : originalGetSource(file, language, ...rest);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([filename], options, host));
  if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => root, getCanonicalFileName: file => file, getNewLine: () => "\n",
  }));
  console.log("Verified packed SDK runtime and public types without workspace aliases.");
} finally { await rm(directory, { recursive: true, force: true }); }
