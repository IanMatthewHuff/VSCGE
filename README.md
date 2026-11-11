# VSCGE

A small turn-based game framework for native VS Code surfaces, on Desktop and the Web. Games provide their own state, rules, and presentation. VSCGE provides atomic Redux-backed turns, a read-only game editor, generic sidebar views, action menus, inspection, logs, and explicit workspace saves.

| Package | Purpose |
| --- | --- |
| `packages/engine` | Headless TypeScript runtime, SDK contracts, optional grid/text helpers |
| `packages/vscode` | Shared IDE host and versioned extension API |
| `packages/demo` | Movement/combat dungeon demo inspired by VSCDC2 |
| `packages/extension-pack` | Installs the host and demo together |

## Develop and play

Requires Node 22.12+ within the 22.x release line, or Node 24+, and npm.

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

### Test layers and CI

| Layer | Tests | What they exercise |
| --- | --- | --- |
| Engine | `tests/unit/engine.test.ts` | Atomic turns, immutable state/views, action validation and revisions, notifications, disposal, saves, JSON and grid helpers |
| Dungeon sample | `tests/unit/demo.test.ts` | Movement, combat and enemy responses, victory/defeat, valid game state and presentation coordinates |
| Host and native UI | `tests/unit/host.test.ts`, `ui.test.ts`, `boundaries.test.ts` | Host lifecycle, persistence and discovery; mocked sidebar/log reveal; package and manifest boundaries |
| Real VS Code | `tests/host/smoke.ts` | Desktop and browser activation, lazy game discovery, virtual documents, actions, save/restart/load, editor input isolation, non-grid games and disposal |

`npm run check` runs typechecking, the unit tests and the build; it does **not** run the real VS Code tests. After `npm ci` and `npm run build`, run all four host variants shown above. Full runs require the demo to be installed; `--core-only` runs require it to be absent, so a missing demo cannot silently skip game coverage.

On headless Linux, run desktop tests with `xvfb-run -a npm run test:desktop` (append `-- --core-only` for core-only). Before web tests, run `node node_modules/playwright/cli.js install --with-deps chromium` to install the matching browser and Linux system dependencies.

The [CI workflow](.github/workflows/ci.yml) runs on pull requests, pushes to `main`, and manual dispatch. Ubuntu jobs run `npm run check` on Node 22 and 24, plus desktop/full, desktop/core-only, web/full and web/core-only integration on Node 24. A final **CI** check succeeds only when every matrix passes; failed host runs upload their console log.

Coverage is behavior-focused, not exhaustive: the mocked UI tests currently assert reveal ordering and failures, not tree contents, decorations or inspector output. The real smoke test checks document and command behavior, but does not assert inspector contents or simulate physical keystrokes. There is no numerical coverage gate, pixel-level UI automation, minimum-supported-VS-Code matrix or cross-OS CI matrix. Host tests use the current stable VS Code release.

### Require CI before merging

The workflow runs tests, but **does not by itself prevent merging**. After its first run makes the status check available, open **Settings > Rules > Rulesets > Protect main**, enable **Require status checks to pass**, and select the aggregate **CI** check from GitHub Actions. Keep the existing rules and review the ruleset's bypass permissions. Repository settings are intentionally not changed by this setup.

### Package artifacts

Artifacts go in `artifacts/`: three VSIX files and the SDK tarball. For local use, install **both** the core and demo VSIX files via **Extensions: Install from VSIX**. The pack alone cannot supply unpublished extensions: it refers to Marketplace IDs rather than embedding VSIX contents.

`vscge-dev` is a development publisher placeholder, not a claim of Marketplace ownership. Set consistent publisher IDs in all extension manifests and `CORE_EXTENSION_ID` before public distribution. Actual Marketplace publication is not included.

## Scope and dependencies

Only Redux Toolkit is a runtime dependency. The eight development dependencies are TypeScript, esbuild, Vitest, Node/VS Code type definitions, and Microsoft's VS Code desktop-test, web-test, and VSIX tools. Keep additions minimal, scoped, and explicitly justified; the lockfile records transitive dependencies. Runtime code uses no Node APIs, webviews, network access, workspace scripts, or dynamic code evaluation.

The demo is intentionally limited to movement, combat, and win/loss. No RPG assumptions are required by the engine. A test-only non-grid game exercises the same API. See [the architecture](DESIGN.md) and [game-author guide](docs/creating-a-game.md).

VSCDC2 was read-only design reference; this implementation does not copy its source. **No open-source license has been selected for this repository.** Package metadata is `UNLICENSED`; packaging skips license-file checks rather than inventing a license grant.
