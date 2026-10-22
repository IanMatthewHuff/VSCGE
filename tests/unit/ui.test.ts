import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  order: [] as string[],
  document: { name: "game document" },
}));

vi.mock("vscode", () => {
  const disposable = () => ({ dispose: vi.fn() });
  class EventEmitter {
    event = vi.fn();
    fire = vi.fn();
    dispose = vi.fn();
  }
  return {
    EventEmitter,
    Uri: { parse: (uri: string) => ({ toString: () => uri }) },
    ThemeColor: class { constructor(readonly id: string) {} },
    StatusBarAlignment: { Left: 1 },
    workspace: {
      registerTextDocumentContentProvider: vi.fn(disposable),
      onDidChangeTextDocument: vi.fn(disposable),
      openTextDocument: vi.fn(async () => { fake.order.push("document"); return fake.document; }),
    },
    window: {
      createStatusBarItem: vi.fn(() => ({ dispose: vi.fn() })),
      createOutputChannel: vi.fn(() => ({
        show: vi.fn((preserveFocus: boolean) => { fake.order.push(`log:${preserveFocus}`); }),
        dispose: vi.fn(),
      })),
      createTextEditorDecorationType: vi.fn(disposable),
      registerTreeDataProvider: vi.fn(disposable),
      onDidChangeActiveTextEditor: vi.fn(disposable),
      onDidChangeTextEditorSelection: vi.fn(disposable),
      onDidChangeVisibleTextEditors: vi.fn(disposable),
      showTextDocument: vi.fn(async () => { fake.order.push("editor"); }),
    },
    commands: {
      executeCommand: vi.fn(async () => { fake.order.push("container"); }),
    },
  };
});

import * as vscode from "vscode";
import { GAME_URI, GameUi } from "../../packages/vscode/src/ui";

describe("revealing game surfaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fake.order.length = 0;
  });
  it("selects the dedicated sidebar and opens the game log before focusing the editor", async () => {
    const ui = new GameUi(vi.fn());
    try {
      await ui.reveal();
      expect(vscode.workspace.openTextDocument).toHaveBeenCalledWith(GAME_URI);
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith("workbench.view.extension.vscge-games");
      expect(ui.log.show).toHaveBeenCalledWith(true);
      expect(vscode.window.showTextDocument).toHaveBeenCalledWith(fake.document, { preview: false, preserveFocus: false });
      expect(fake.order).toEqual(["document", "container", "log:true", "editor"]);
    } finally { ui.dispose(); }
  });
  it("propagates a reveal failure so the host can preserve the previous session", async () => {
    const ui = new GameUi(vi.fn());
    vi.mocked(vscode.commands.executeCommand).mockRejectedValueOnce(new Error("Sidebar failed"));
    try {
      await expect(ui.reveal()).rejects.toThrow("Sidebar failed");
      expect(ui.log.show).not.toHaveBeenCalled();
      expect(vscode.window.showTextDocument).not.toHaveBeenCalled();
    } finally { ui.dispose(); }
  });
});
