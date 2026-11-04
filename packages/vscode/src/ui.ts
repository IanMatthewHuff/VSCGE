import * as vscode from "vscode";
import type { Detail, SessionPort, Style } from "@vscge/engine";
import type { ActionTicket, GameHost } from "./host";

export const GAME_URI = vscode.Uri.parse("vscge://game/active");
type Row = Detail & { command?: vscode.Command; children?: readonly Row[] };

class Rows implements vscode.TreeDataProvider<Row>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private rows: readonly Row[] = [];
  set(rows: readonly Row[]): void {
    const qualify = (entries: readonly Row[], parent: string): Row[] => entries.map(entry => {
      const id = `${parent}/${encodeURIComponent(entry.id)}`;
      return { ...entry, id, ...(entry.children ? { children: qualify(entry.children, id) } : {}) };
    });
    this.rows = qualify(rows, "");
    this.emitter.fire();
  }
  getChildren(row?: Row): Row[] { return [...(row ? row.children ?? [] : this.rows)]; }
  getTreeItem(row: Row): vscode.TreeItem {
    const item = new vscode.TreeItem(row.label, row.children?.length ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
    item.id = row.id;
    item.description = row.value;
    item.command = row.command;
    return item;
  }
  dispose(): void { this.emitter.dispose(); }
}

export class GameUi implements vscode.TextDocumentContentProvider, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.emitter.event;
  private readonly details = new Rows();
  private readonly actions = new Rows();
  private readonly inspector = new Rows();
  private readonly status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
  readonly log = vscode.window.createOutputChannel("VSCGE");
  private readonly decorations: Record<Style, vscode.TextEditorDecorationType> = {
    emphasis: vscode.window.createTextEditorDecorationType({ fontWeight: "bold", color: new vscode.ThemeColor("editorInfo.foreground") }),
    danger: vscode.window.createTextEditorDecorationType({ color: new vscode.ThemeColor("editorError.foreground") }),
    muted: vscode.window.createTextEditorDecorationType({ color: new vscode.ThemeColor("descriptionForeground") }),
  };
  private readonly disposables: vscode.Disposable[] = [];
  private session: SessionPort | undefined;
  private disposed = false;
  private contextUpdates = Promise.resolve();
  host?: GameHost;

  constructor(private readonly report: (error: unknown) => void) {
    this.disposables.push(
      vscode.workspace.registerTextDocumentContentProvider("vscge", this),
      vscode.window.registerTreeDataProvider("vscge.details", this.details),
      vscode.window.registerTreeDataProvider("vscge.actionsView", this.actions),
      vscode.window.registerTreeDataProvider("vscge.inspector", this.inspector),
      vscode.window.onDidChangeActiveTextEditor(() => { this.contexts(); this.inspect(); }),
      vscode.window.onDidChangeTextEditorSelection(() => this.inspect()),
      vscode.window.onDidChangeVisibleTextEditors(() => this.decorate()),
      vscode.workspace.onDidChangeTextDocument(event => {
        if (this.isGame(event.document.uri)) { this.decorate(); this.inspect(); }
      }),
    );
    this.status.command = "vscge.actions";
  }
  get focused(): boolean {
    const uri = vscode.window.activeTextEditor?.document.uri;
    return !!this.session && !!uri && this.isGame(uri);
  }
  provideTextDocumentContent(): string {
    return this.session?.getView().text ?? "No active game. Run VSCGE: Start Game.";
  }
  async reveal(): Promise<void> {
    const document = await vscode.workspace.openTextDocument(GAME_URI);
    await vscode.commands.executeCommand("workbench.view.extension.vscge-games");
    this.log.show(true);
    await vscode.window.showTextDocument(document, { preview: false, preserveFocus: false });
  }
  render(session: SessionPort | undefined): void {
    if (this.disposed) return;
    this.session = session;
    const view = session?.getView();
    this.details.set(view?.details ?? [{ id: "empty", label: "Run VSCGE: Start Game" }]);
    this.actions.set(view?.actions.map(action => ({
      id: action.id, label: action.title,
      ...(action.disabledReason ? { value: action.disabledReason } : {
        command: { command: "vscge.execute", title: action.title, arguments: [this.host?.ticket(action.id)] },
      }),
    })) ?? []);
    this.status.text = session ? `$(game) ${session.title}: ${view?.status}` : "";
    if (session) this.status.show(); else this.status.hide();
    this.emitter.fire(GAME_URI);
    this.contexts();
    this.decorate();
    this.inspect();
  }
  async chooseAction(): Promise<ActionTicket | undefined> {
    const session = this.session;
    if (!session || !this.host) return undefined;
    const host = this.host;
    const options = session.getView().actions.map(action => ({
      label: action.title, description: action.disabledReason ?? "",
      ticket: host.ticket(action.id),
    }));
    return (await vscode.window.showQuickPick(options, { title: session.title, placeHolder: "Choose a game action" }))?.ticket;
  }
  private isGame(uri: vscode.Uri): boolean { return uri.toString() === GAME_URI.toString(); }
  private contexts(): void {
    this.contextUpdates = this.contextUpdates.then(async () => {
      if (this.disposed) return;
      await vscode.commands.executeCommand("setContext", "vscge.documentFocused", this.focused);
      const view = this.session?.getView();
      for (const direction of ["up", "down", "left", "right"] as const) {
        const action = view?.actions.find(entry => entry.id === view.inputs?.[direction]);
        await vscode.commands.executeCommand("setContext", `vscge.input.${direction}`, !!action && !action.disabledReason);
      }
    }).catch(this.report);
  }
  private inspect(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.isGame(editor.document.uri)) { this.inspector.set([]); return; }
    const { line, character } = editor.selection.active;
    const inspection = this.session?.getView().inspections?.find(({ range }) =>
      range.line === line && character >= range.start && character < range.end);
    this.inspector.set(inspection?.details ?? []);
  }
  private decorate(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      if (!this.isGame(editor.document.uri)) continue;
      for (const style of ["emphasis", "danger", "muted"] as const) {
        editor.setDecorations(this.decorations[style], (this.session?.getView().annotations ?? [])
          .filter(entry => entry.style === style)
          .map(({ range }) => new vscode.Range(range.line, range.start, range.line, range.end)));
      }
    }
  }
  dispose(): void {
    this.disposed = true;
    this.session = undefined;
    for (const disposable of [...this.disposables, this.emitter, this.details, this.actions, this.inspector, this.status, this.log, ...Object.values(this.decorations)]) disposable.dispose();
  }
}
