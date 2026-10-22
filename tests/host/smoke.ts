import * as vscode from "vscode";
import { CORE_EXTENSION_ID, isVscgeApi } from "@vscge/engine";
import { counter } from "../fixtures/counter";

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
async function waitFor(checkReady: () => boolean, description: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (checkReady()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out: ${description}`);
}

export async function run(): Promise<void> {
  const core = vscode.extensions.getExtension<unknown>(CORE_EXTENSION_ID);
  check(core, "Core extension is installed");
  const api: unknown = await core.activate();
  check(isVscgeApi(api), "Versioned core API is available");
  check(!api.getActiveGame(), "Core starts with no active game");
  const demo = vscode.extensions.getExtension("vscge-dev.vscdc-demo");
  if (demo) {
    check(!demo.isActive, "Game discovery should not eagerly activate the demo");
    const gameId = "vscge-dev.vscdc-demo/dungeon";
    check(await vscode.commands.executeCommand("vscge.start", gameId), "Start discovers and activates the game");
    check(demo.isActive, "Selected demo is now active");
    const document = await vscode.workspace.openTextDocument(vscode.Uri.parse("vscge://game/active"));
    await waitFor(() => document.getText().includes("Turn: 0"), "initial document");
    check(vscode.window.activeTextEditor?.document.uri.toString() === document.uri.toString(),
      "Revealing the game sidebar and log leaves the game editor focused");
    check(await vscode.commands.executeCommand("vscge.execute", "up"), "Movement is accepted");
    await waitFor(() => document.getText().includes("Turn: 1"), "updated document");
    check(api.getActiveGame()?.turn === 1, "Movement advances exactly one turn");
    check(await vscode.commands.executeCommand("vscge.save"), "Workspace save succeeds");
    check(await vscode.commands.executeCommand("vscge.restart"), "Clean restart succeeds");
    check(api.getActiveGame()?.turn === 0, "Restart begins at turn zero");
    check(await vscode.commands.executeCommand("vscge.load"), "Workspace load succeeds");
    check(api.getActiveGame()?.turn === 1, "Load restores saved turn");
    await waitFor(() => document.getText().includes("Turn: 1"), "loaded document");
    const editor = await vscode.window.showTextDocument(document);
    editor.selection = new vscode.Selection(6, 2, 6, 2);
    await vscode.commands.executeCommand("vscge.inspector.focus");
    const source = await vscode.workspace.openTextDocument({ content: "ordinary editor", language: "plaintext" });
    await vscode.window.showTextDocument(source);
    check(await vscode.commands.executeCommand("vscge.up") === false, "Movement is disabled outside the game document");
    check(api.getActiveGame()?.turn === 1, "Ordinary editors cannot advance the game");
    check(await api.stopGame(), "Stopping a clean game succeeds");
    await waitFor(() => document.getText().includes("No active game"), "stopped document");
  }
  const registration = api.registerGame("tests.fixture", counter);
  try {
    check(await api.startGame("tests.fixture/counter"), "A non-grid game runs in the same host");
    const document = await vscode.workspace.openTextDocument(vscode.Uri.parse("vscge://game/active"));
    await waitFor(() => document.getText().includes("Tokens taken: 0"), "non-grid presentation");
    check(await vscode.commands.executeCommand("vscge.execute", "take"), "Generic game action works");
    await waitFor(() => document.getText().includes("Tokens taken: 1"), "non-grid update");
    check(await vscode.commands.executeCommand("vscge.save"), "Generic state can be saved");
  } finally { registration.dispose(); }
  check(!api.getActiveGame(), "Unregistering the active game clears the session");
  console.log(demo
    ? "VSCGE smoke passed: activation, native documents, actions, restart, save/load, input isolation, non-grid game, disposal."
    : "VSCGE core-only smoke passed: activation, non-grid game, native documents, actions, save, disposal.");
}
