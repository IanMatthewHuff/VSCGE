import {
  API_VERSION, EngineError, GameSession, validateDefinition,
  type ActiveGame, type ActionResult, type GameDefinition, type GameEvent, type LogicalInput,
  type SaveEnvelope, type SessionPort, type VscgeApi,
} from "@vscge/engine";

export interface HostServices {
  confirmDiscard(): Promise<boolean>;
  reveal(): Promise<void>;
  render(session: SessionPort | undefined): void;
  log(message: string): void;
  hasWorkspace(): boolean;
  readSave(key: string): unknown;
  writeSave(key: string, value: SaveEnvelope): Promise<void>;
}
export interface ActionTicket { session: number; revision: number; actionId: string }
interface Registration { id: string; title: string; create(saved?: unknown): SessionPort }

export class GameHost implements VscgeApi {
  readonly apiVersion = API_VERSION;
  private readonly registry = new Map<string, Registration>();
  private active: SessionPort | undefined;
  private generation = 0;
  private savedRevision = 0;
  private changing = false;
  private saving = false;
  private disposed = false;

  constructor(private readonly services: HostServices) {}
  get session(): SessionPort | undefined { return this.active; }
  games(): { id: string; title: string }[] {
    return [...this.registry.values()].map(({ id, title }) => ({ id, title }));
  }
  hasGame(id: string): boolean { return this.registry.has(id); }
  registerGame<S, A, E extends GameEvent>(owner: string, game: GameDefinition<S, A, E>) {
    this.assertLive();
    validateDefinition(game);
    if (!/^[a-z0-9-]+\.[a-z0-9-]+$/i.test(owner)) throw new EngineError("Owner must be a VS Code extension ID");
    const id = `${owner.toLowerCase()}/${game.id}`;
    if (this.registry.has(id)) throw new EngineError(`Game already registered: ${id}`);
    const entry = { id, title: game.title, create: (saved?: unknown) => new GameSession(game, id, saved) };
    this.registry.set(id, entry);
    return { dispose: () => {
      if (this.registry.get(id) !== entry) return;
      this.registry.delete(id);
      if (this.active?.gameId === id) {
        this.clear();
        this.services.log(`Game unregistered: ${id}. Its active session was stopped.`);
      }
    } };
  }
  getActiveGame(): ActiveGame | undefined {
    const session = this.active;
    return session && {
      id: session.gameId, turn: session.turn, revision: session.revision,
      dirty: session.revision !== this.savedRevision,
    };
  }
  ticket(actionId: string): ActionTicket {
    const session = this.requireSession();
    return { session: this.generation, revision: session.revision, actionId };
  }
  execute(ticket: ActionTicket): ActionResult {
    if (this.changing) return { accepted: false, reason: "A session change is in progress" };
    if (ticket.session !== this.generation || !this.active) return { accepted: false, reason: "This session has changed" };
    return this.reportNotifications(this.active.execute(ticket.actionId, ticket.revision));
  }
  input(input: LogicalInput): ActionResult {
    if (this.changing) return { accepted: false, reason: "A session change is in progress" };
    const session = this.requireSession();
    return this.reportNotifications(session.input(input, session.revision));
  }
  async startGame(id: string): Promise<boolean> { return this.replace(id); }
  async restart(): Promise<boolean> { return this.replace(this.requireSession().gameId); }
  async stopGame(): Promise<boolean> {
    return this.lifecycle(async () => {
      if (!(await this.mayDiscard())) return false;
      this.assertLive();
      this.clear();
      return true;
    });
  }
  async save(): Promise<boolean> {
    this.assertWorkspace();
    if (this.saving) throw new EngineError("A save is already in progress");
    const session = this.requireSession();
    const revision = session.revision;
    const envelope = session.serialize();
    this.saving = true;
    try {
      await this.services.writeSave(this.saveKey(session.gameId), envelope);
      if (this.active === session) this.savedRevision = revision;
      this.services.log(`Saved ${session.title} at turn ${envelope.snapshot.turn}.`);
      return true;
    } finally { this.saving = false; }
  }
  async load(id: string): Promise<boolean> {
    this.assertWorkspace();
    const saved = this.services.readSave(this.saveKey(id));
    if (saved === undefined) throw new EngineError("No save exists for this game in this workspace");
    return this.replace(id, saved);
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
    this.registry.clear();
  }
  private async replace(id: string, saved?: unknown): Promise<boolean> {
    return this.lifecycle(async () => {
      const entry = this.registry.get(id);
      if (!entry) throw new EngineError(`Game is not registered: ${id}`);
      const candidate = entry.create(saved);
      let installed = false;
      try {
        if (!(await this.mayDiscard())) return false;
        await this.services.reveal();
        this.assertLive();
        if (this.registry.get(id) !== entry) throw new EngineError("Game was unregistered while starting");
        this.active?.dispose();
        this.active = candidate;
        this.generation++;
        this.savedRevision = candidate.revision;
        installed = true;
        candidate.subscribe(({ events }) => {
          if (this.active !== candidate) return;
          for (const event of events) this.services.log(`[${event.category ?? event.type}] ${event.message}`);
          this.services.render(candidate);
        });
        this.services.render(candidate);
        this.services.log(`${saved === undefined ? "Started" : "Loaded"} ${candidate.title}.`);
        return true;
      } finally { if (!installed) candidate.dispose(); }
    });
  }
  private async mayDiscard(): Promise<boolean> {
    return !this.getActiveGame()?.dirty || this.services.confirmDiscard();
  }
  private async lifecycle<T>(operation: () => Promise<T>): Promise<T> {
    this.assertLive();
    if (this.changing) throw new EngineError("A session change is already in progress");
    this.changing = true;
    try { return await operation(); }
    finally { this.changing = false; }
  }
  private clear(): void {
    this.active?.dispose();
    this.active = undefined;
    this.generation++;
    this.services.render(undefined);
  }
  private requireSession(): SessionPort {
    this.assertLive();
    if (!this.active) throw new EngineError("Start a game first");
    return this.active;
  }
  private assertLive(): void { if (this.disposed) throw new EngineError("VSCGE has stopped"); }
  private assertWorkspace(): void {
    this.assertLive();
    if (!this.services.hasWorkspace()) throw new EngineError("Open a folder or workspace to use workspace save/load");
  }
  private saveKey(id: string): string { return `vscge.save.${id}`; }
  private reportNotifications(result: ActionResult): ActionResult {
    if (result.accepted && result.notificationErrors.length) {
      throw new EngineError(`Action committed, but a UI subscriber failed: ${result.notificationErrors.join("; ")}`);
    }
    return result;
  }
}
