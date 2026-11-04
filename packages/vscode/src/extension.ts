import * as vscode from "vscode";
import { EngineError, errorMessage, isRecord, type LogicalInput, type VscgeApi } from "@vscge/engine";
import { discoverGames, requireCompatible, type DiscoveredGame } from "./discovery";
import { GameHost, type ActionTicket } from "./host";
import { GameUi } from "./ui";

export function activate(context: vscode.ExtensionContext): VscgeApi {
  const report = (error: unknown): void => {
    const message = errorMessage(error);
    ui.log.appendLine(`[Error] ${message}`);
    void vscode.window.showErrorMessage(`VSCGE: ${message}`);
  };
  const ui = new GameUi(report);
  const host = new GameHost({
    confirmDiscard: async () => (await vscode.window.showWarningMessage(
      "Discard unsaved game progress?", { modal: true }, "Discard",
    )) === "Discard",
    reveal: () => ui.reveal(),
    render: session => ui.render(session),
    log: message => ui.log.appendLine(message),
    hasWorkspace: () => !!vscode.workspace.workspaceFile || !!vscode.workspace.workspaceFolders?.length,
    readSave: key => context.workspaceState.get<unknown>(key),
    writeSave: async (key, value) => { await context.workspaceState.update(key, value); },
  });
  ui.host = host;
  context.subscriptions.push(host, ui);
  ui.render(undefined);

  const discovered = (): DiscoveredGame[] => vscode.extensions.all.flatMap(extension => {
    try { return discoverGames(extension.id, extension.packageJSON); }
    catch (error) { ui.log.appendLine(`[Discovery] ${errorMessage(error)}`); return []; }
  });
  const ensureGame = async (id: string): Promise<void> => {
    if (host.hasGame(id)) return;
    const game = discovered().find(entry => entry.id === id);
    if (!game) throw new EngineError(`No installed extension advertises ${id}`);
    requireCompatible(game);
    const extension = vscode.extensions.getExtension<unknown>(game.owner);
    if (!extension) throw new EngineError(`Game extension is no longer installed: ${game.owner}`);
    await extension.activate();
    if (!host.hasGame(id)) throw new EngineError(`${game.owner} activated without registering ${id}`);
  };
  const chooseGame = async (): Promise<string | undefined> => {
    const games = new Map(discovered().map(game => [game.id, { id: game.id, title: game.title }]));
    for (const game of host.games()) games.set(game.id, game);
    if (!games.size) {
      await vscode.window.showInformationMessage("No VSCGE games installed. Install a VSCGE game extension, such as the Dungeon Demo.");
      return undefined;
    }
    return (await vscode.window.showQuickPick([...games.values()].map(game => ({
      label: game.title, description: game.id, id: game.id,
    })), { title: "VSCGE Games" }))?.id;
  };
  const register = (command: string, handler: (...args: unknown[]) => unknown): void => {
    context.subscriptions.push(vscode.commands.registerCommand(command, async (...args: unknown[]) => {
      try { return await handler(...args); }
      catch (error) { report(error); return false; }
    }));
  };
  const perform = (ticket: ActionTicket): boolean => {
    const result = host.execute(ticket);
    if (!result.accepted) {
      ui.log.appendLine(`[Rejected] ${result.reason}`);
      vscode.window.setStatusBarMessage(result.reason, 2500);
    }
    return result.accepted;
  };
  register("vscge.start", async (argument?: unknown) => {
    const id = typeof argument === "string" ? argument : await chooseGame();
    if (!id) return false;
    await ensureGame(id);
    return host.startGame(id);
  });
  register("vscge.restart", () => host.restart());
  register("vscge.stop", () => host.stopGame());
  register("vscge.save", () => host.save());
  register("vscge.load", async (argument?: unknown) => {
    const id = typeof argument === "string" ? argument : host.getActiveGame()?.id ?? await chooseGame();
    if (!id) return false;
    await ensureGame(id);
    return host.load(id);
  });
  register("vscge.actions", async () => {
    const ticket = await ui.chooseAction();
    return ticket ? perform(ticket) : false;
  });
  register("vscge.execute", (argument: unknown) => {
    if (typeof argument === "string") return perform(host.ticket(argument));
    if (!isRecord(argument) || !Number.isSafeInteger(argument.session) || !Number.isSafeInteger(argument.revision) ||
        typeof argument.actionId !== "string") throw new EngineError("Invalid game action ticket");
    return perform({ session: Number(argument.session), revision: Number(argument.revision), actionId: argument.actionId });
  });
  for (const direction of ["up", "down", "left", "right"] satisfies LogicalInput[]) {
    register(`vscge.${direction}`, () => {
      if (!ui.focused) return false;
      const result = host.input(direction);
      if (!result.accepted) {
        ui.log.appendLine(`[Rejected] ${result.reason}`);
        vscode.window.setStatusBarMessage(result.reason, 2500);
      }
      return result.accepted;
    });
  }
  return host;
}
