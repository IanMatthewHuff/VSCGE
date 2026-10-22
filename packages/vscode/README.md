# VSCGE core

Shared native VS Code host for turn-based game extensions, on Desktop and the Web.

Run **VSCGE: Start Game**, choose an installed game, and use Game Details, Game Actions, and Game Inspector in the dedicated **VSCGE** activity-bar container. Starting, restarting, or loading a game selects that sidebar and opens the VSCGE output channel, then returns keyboard focus to the game editor. Other VSCGE commands provide action selection, restart, stop, and explicit workspace save/load.

The core has no built-in game. Install the Dungeon Demo alongside it for a small movement/combat example. Saves require an opened folder/workspace and are isolated per game. Replacing unsaved progress asks for confirmation.

This is a development build using a placeholder publisher. Install the individual local VSIX files together; a local extension pack does not embed unpublished dependencies. No open-source license has been selected.
