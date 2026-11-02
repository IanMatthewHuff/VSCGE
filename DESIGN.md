# Architecture

## Boundaries

The headless engine has no VS Code imports or mandatory entity/map/player types. `GameDefinition<S, A, E>` describes initial state, runtime decoders, a pure transition, and a presentation adapter. Games may share the optional ASCII-grid helpers, but can just as easily present a board, cards, or narrative choices as arbitrary text and details.

Redux Toolkit is private implementation detail. A session validates immutable JSON state, computes the complete next state and presentation, and commits once. Player actions and enemy responses belong to the same game transition. Rejections and pre-commit failures preserve the old snapshot. Ordered explicit events are published after commit; subscriber errors are reported separately because the action already happened.

Each presentation has one cached, frozen public view with action payloads removed. Repeated UI reads reuse that view without cloning inspection data; accepted transitions prepare the replacement before committing, while rejected actions leave the cached view unchanged.

Session-local listeners, reentrancy guards, frozen snapshots, revision-checked action IDs, and disposal prevent cross-game interference. There is no global event queue, shared player slice, ECS, timer loop, or plugin framework.

## Shared IDE host

The core extension owns one active session. Registered games close over their generic types and expose an opaque `SessionPort`; the UI never casts between games. Presentations supply text, details, action metadata, logical inputs, optional theme-aware annotations, and inspection ranges. Grid text and hit ranges come from the same helper, not duplicated header offsets.

The host uses a native virtual document, three views in a dedicated VSCGE activity-bar container, Quick Picks, an output channel, and status bar. Starting, restarting, or loading a game reveals the container and game log before focusing the game editor. Ordinary turns do not reopen the sidebar or log. WASD bindings are limited to the exact active game document and advertised, enabled inputs. Arrows remain ordinary editor cursor controls.

`vscge` manifest metadata permits discovery before activation. Only the selected extension is activated. Games declare a core extension dependency and register through exported API major 1. Core and game use matching UI-host preferences and browser entry points. The host never imports the demo.

## Persistence and lifecycle

`workspaceState` stores one envelope per namespaced game ID. Format version, state version, game identity, nonnegative turn counter, JSON compatibility, and the game's decoder are checked before replacement. Initial state is turn zero; load restores the counter without running rules or initialization.

Save commands capture a specific session revision; a later completed write cannot mark newer progress clean. Overlapping saves are rejected. Restart/start/load prepare candidates before asking to discard and revealing the document. Failures before installation preserve the old session. Lifecycle prompts block concurrent actions; cancelled prompts do not lose progress. Removing an active registration disposes it immediately.

Saves are explicit; no autosave, migration, global fallback, or remote synchronization is implemented.

## Distribution

Core and demo each bundle their runtime dependencies into desktop and web entry points. `vscode` is the only external browser import. The SDK is independently packable with built declarations. The extension pack is declarative and references separately distributed extension IDs; it cannot embed unpublished games.

The demo independently reimplements a small fixed dungeon's movement/combat concepts. No VSCDC2 source was copied or modified. No open-source license has been selected.
