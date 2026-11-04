# Creating a VSCGE game extension

Consume `@vscge/engine` from its SDK tarball for local development (or the future published package). No Redux knowledge or direct dependency is required. Both core and game must use matching API major versions.

## Define the game

A definition supplies:

- A local lowercase slug `id`, `title`, and positive integer `stateVersion`.
- `initialState()` returning plain JSON data.
- `decodeState(unknown)` and `decodeAction(unknown)` returning `valid(value)` or `invalid(reason)`. Validate domain invariants, not only property types.
- `transition(state, action)` returning a rejection or `{ accepted: true, state, consumesTurn, events }`. Include the entire world response in this pure function. Do not mutate the frozen old state or use clocks/randomness.
- `present({state, turn})` returning `{text, details, actions, status}`. Actions have IDs, titles, and typed action payloads. Optional logical-input bindings map directions to these IDs. Inspection and annotation ranges use zero-based lines and UTF-16 character offsets.

See `packages/demo/src/game.ts` for a complete example. The counter in `tests/fixtures/counter.ts` shows a game without a map or player. `renderGrid` is optional and accepts single-cell ASCII glyphs.

Presentation data must also be JSON. Omit optional properties instead of setting them to `undefined`. IDs must be stable and unique within their lists. Use `disabledReason` on unavailable actions. The engine validates data and ranges before committing a turn.

## Register with the installed core

```ts
import * as vscode from "vscode";
import { CORE_EXTENSION_ID, isVscgeApi } from "@vscge/engine";
import { myGame } from "./game";

export async function activate(context: vscode.ExtensionContext) {
  const extension = vscode.extensions.getExtension<unknown>(CORE_EXTENSION_ID);
  if (!extension) throw new Error("Install VSCGE first");
  const api: unknown = await extension.activate();
  if (!isVscgeApi(api)) throw new Error("VSCGE API 1 is required");
  context.subscriptions.push(api.registerGame(context.extension.id, myGame));
}
```

Add this to the game's extension manifest, replacing the local game metadata:

```json
{
  "extensionDependencies": ["vscge-dev.vscge"],
  "extensionKind": ["ui"],
  "main": "./dist/extension.js",
  "browser": "./dist/web/extension.js",
  "vscge": {
    "apiVersion": 1,
    "games": [{ "id": "my-game", "title": "My Game" }]
  }
}
```

The host names the game `publisher.extension-name/my-game`. Metadata is an opt-in discovery field, not executable code or a custom VS Code contribution point. The core activates the selected installed extension and checks that it registered the advertised game.

Bundle browser entry points into one file with only `vscode` external. Do not import the core extension implementation. Additional game-specific VS Code contributions are allowed, but shared views should use presentation data instead of duplicated controllers.

## Lifecycle and saved-state compatibility

Keep the registration in `context.subscriptions`. Disposing it stops an active session; do not unregister while intending to preserve unsaved progress. Use `api.startGame(namespacedId)` to start a registered game. Core activation returns its API without awaiting games, so dependency activation does not form a cycle.

Increment `stateVersion` whenever saved data or its interpretation becomes incompatible, including fixed-board changes. Version 1 rejects incompatible saves rather than migrating them. Include all mutable gameplay data in your state. Listeners, closures, functions, dates, Maps, non-finite numbers, and cyclic objects are not save data.

Only accepted actions change the session revision; `consumesTurn` controls the turn count separately. Subscriber errors mean the state was already committed. Keep transitions synchronous and side-effect-free.

For local development, run both core and game as development extensions or install their VSIX files together. Publisher IDs must agree with the core dependency and SDK constant; the development publisher is not a registered release identity.
