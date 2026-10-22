# VSCGE

A small turn-based game framework for native VS Code surfaces, on Desktop and the Web. Games provide their own state, rules, and presentation. VSCGE provides atomic Redux-backed turns, a read-only game editor, generic sidebar views, action menus, inspection, logs, and explicit workspace saves.

| Package | Purpose |
| --- | --- |
| `packages/engine` | Headless TypeScript runtime, SDK contracts, optional grid/text helpers |
| `packages/vscode` | Shared IDE host and versioned extension API |
| `packages/demo` | Movement/combat dungeon demo inspired by VSCDC2 |
| `packages/extension-pack` | Installs the host and demo together |

## Develop and play

Requires Node 22+ and npm.

```sh
npm ci
npm run check
```

Open this repository in VS Code and launch **VSCGE + Dungeon Demo** with F5 (or its Web host variant). Run **VSCGE: Start Game** and choose Dungeon Demo. WASD moves or attacks adjacent enemies; arrows and mouse inspect cells. **Game Details**, **Game Actions**, and **Game Inspector** have their own **VSCGE** activity-bar container. Starting, restarting, or loading a game selects that sidebar and opens the VSCGE game log, with keyboard focus returned to the game editor. VSCGE commands provide restart, stop, action selection, save, and load.

Games run one at a time. Switching/restarting/loading prompts before discarding changed progress. Saves are explicit, one per game per workspace; open a folder/workspace to enable them. Unsupported or corrupt saves never reset the live game.

## Verify and package

```sh
npm run typecheck
npm test
npm run build
npm run test:desktop
npm run test:web
npm run test:desktop -- --core-only
npm run test:web -- --core-only
npm run package
```

Host tests download official VS Code builds. Web tests also require the Chromium build used by the approved test-web dependency; if missing, run `node node_modules/playwright/cli.js install chromium`. An existing VS Code executable can be selected with `VSCODE_EXECUTABLE_PATH`.

Artifacts go in `artifacts/`: three VSIX files and the SDK tarball. For local use, install **both** the core and demo VSIX files via **Extensions: Install from VSIX**. The pack alone cannot supply unpublished extensions: it refers to Marketplace IDs rather than embedding VSIX contents.

`vscge-dev` is a development publisher placeholder, not a claim of Marketplace ownership. Set consistent publisher IDs in all extension manifests and `CORE_EXTENSION_ID` before public distribution. Actual Marketplace publication is not included.

## Scope and dependencies

Only Redux Toolkit is a runtime dependency. The eight development dependencies are TypeScript, esbuild, Vitest, Node/VS Code type definitions, and Microsoft's VS Code desktop-test, web-test, and VSIX tools. Keep additions minimal, scoped, and explicitly justified; the lockfile records transitive dependencies. Runtime code uses no Node APIs, webviews, network access, workspace scripts, or dynamic code evaluation.

The demo is intentionally limited to movement, combat, and win/loss. No RPG assumptions are required by the engine. A test-only non-grid game exercises the same API. See [the architecture](DESIGN.md) and [game-author guide](docs/creating-a-game.md).

VSCDC2 was read-only design reference; this implementation does not copy its source. **No open-source license has been selected for this repository.** Package metadata is `UNLICENSED`; packaging skips license-file checks rather than inventing a license grant.
