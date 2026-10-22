import * as vscode from "vscode";
import { CORE_EXTENSION_ID, EngineError, errorMessage, isVscgeApi } from "@vscge/engine";
import { dungeon } from "./game";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const core = vscode.extensions.getExtension<unknown>(CORE_EXTENSION_ID);
  if (!core) throw new EngineError("Install the VSCGE core extension first");
  const api: unknown = await core.activate();
  if (!isVscgeApi(api)) throw new EngineError("This demo requires VSCGE API 1");
  context.subscriptions.push(api.registerGame(context.extension.id, dungeon));
  context.subscriptions.push(vscode.commands.registerCommand("vscgeDemo.start", async () => {
    try { return await api.startGame(`${context.extension.id.toLowerCase()}/${dungeon.id}`); }
    catch (error) { await vscode.window.showErrorMessage(`Dungeon Demo: ${errorMessage(error)}`); return false; }
  }));
}
