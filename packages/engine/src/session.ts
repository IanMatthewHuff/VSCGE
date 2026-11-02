import { configureStore, createAction, type Store } from "@reduxjs/toolkit";
import { EngineError, errorMessage, immutableJson } from "./json";
import { publicView, validatePresentation } from "./presentation";
import {
  isRecord, type ActionResult, type GameDefinition, type GameEvent, type LogicalInput,
  type Presentation, type SaveEnvelope, type SessionChange, type SessionPort, type SessionView, type Snapshot,
} from "./types";

export function validateDefinition<S, A, E extends GameEvent>(game: GameDefinition<S, A, E>): void {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(game.id) || !game.title ||
      !Number.isSafeInteger(game.stateVersion) || game.stateVersion < 1) {
    throw new EngineError("A game needs a slug ID, title, and positive stateVersion");
  }
}

export class GameSession<S, A, E extends GameEvent = GameEvent> implements SessionPort {
  private readonly store: Store<Snapshot<S>>;
  private readonly commit = createAction<Snapshot<S>>("vscge/commit");
  private presentation: Presentation<A>;
  private view: SessionView;
  private readonly listeners = new Set<(change: SessionChange) => void>();
  private disposed = false;
  private busy = false;
  private currentRevision = 0;

  constructor(
    private readonly game: GameDefinition<S, A, E>,
    readonly gameId: string = game.id,
    saved?: unknown,
  ) {
    validateDefinition(game);
    const snapshot = immutableJson(saved === undefined
      ? { turn: 0, state: this.decodeState(game.initialState()) } : this.restore(saved));
    this.presentation = validatePresentation(game.present(snapshot));
    this.view = publicView(this.presentation);
    this.store = configureStore({
      reducer: (state: Snapshot<S> = snapshot, action) => this.commit.match(action) ? action.payload : state,
      devTools: false,
    });
  }
  get title(): string { return this.game.title; }
  get revision(): number { return this.currentRevision; }
  get turn(): number { return this.store.getState().turn; }
  getSnapshot(): Snapshot<S> { return this.store.getState(); }
  getView(): SessionView { return this.view; }

  subscribe(listener: (change: SessionChange) => void): () => void {
    this.assertLive();
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  execute(actionId: string, expectedRevision: number): ActionResult {
    if (expectedRevision !== this.revision) return { accepted: false, reason: "This action is stale. Choose it again." };
    const action = this.presentation.actions.find(entry => entry.id === actionId);
    if (!action) return { accepted: false, reason: `Unknown action: ${actionId}` };
    if (action.disabledReason) return { accepted: false, reason: action.disabledReason };
    return this.dispatch(action.action);
  }
  input(input: LogicalInput, expectedRevision: number): ActionResult {
    const id = this.presentation.inputs?.[input];
    return id ? this.execute(id, expectedRevision) : { accepted: false, reason: `This game does not support ${input}` };
  }
  dispatch(input: unknown): ActionResult {
    if (this.disposed) return { accepted: false, reason: "This session has stopped" };
    if (this.busy) return { accepted: false, reason: "An action is already being processed" };
    this.busy = true;
    try {
      const decoded = this.game.decodeAction(immutableJson(input));
      if (!decoded.ok) return { accepted: false, reason: decoded.reason };
      const result = this.game.transition(this.getSnapshot().state, immutableJson(decoded.value));
      if (!result.accepted) return result;
      if (typeof result.consumesTurn !== "boolean") throw new EngineError("A transition must specify consumesTurn");
      const turn = this.turn + Number(result.consumesTurn);
      if (!Number.isSafeInteger(turn)) throw new EngineError("Turn counter exceeded its supported range");
      const snapshot = immutableJson({ turn, state: this.decodeState(result.state) });
      const events = immutableJson(result.events);
      if (!Array.isArray(events) || events.some(event =>
        typeof event.type !== "string" || typeof event.message !== "string")) throw new EngineError("Invalid game event");
      const presentation = validatePresentation(this.game.present(snapshot));
      const view = publicView(presentation);
      this.store.dispatch(this.commit(snapshot));
      this.presentation = presentation;
      this.view = view;
      this.currentRevision++;
      const notificationErrors: string[] = [];
      const change = { view: this.getView(), events };
      for (const listener of [...this.listeners]) {
        if (this.disposed) break;
        try { listener(change); }
        catch (error) { notificationErrors.push(errorMessage(error)); }
      }
      return { accepted: true, turn, revision: this.revision, notificationErrors };
    } finally {
      this.busy = false;
    }
  }
  serialize(): SaveEnvelope {
    this.assertLive();
    return immutableJson({
      formatVersion: 1, gameId: this.gameId, stateVersion: this.game.stateVersion, snapshot: this.getSnapshot(),
    });
  }
  dispose(): void { this.disposed = true; this.listeners.clear(); }
  private assertLive(): void { if (this.disposed) throw new EngineError("This session has stopped"); }
  private decodeState(input: unknown): S {
    const result = this.game.decodeState(immutableJson(input));
    if (!result.ok) throw new EngineError(`Invalid game state: ${result.reason}`);
    return immutableJson(result.value);
  }
  private restore(input: unknown): Snapshot<S> {
    const saved = immutableJson(input);
    if (!isRecord(saved) || saved.formatVersion !== 1 || saved.gameId !== this.gameId ||
        saved.stateVersion !== this.game.stateVersion || !isRecord(saved.snapshot) ||
        typeof saved.snapshot.turn !== "number" || !Number.isSafeInteger(saved.snapshot.turn) || saved.snapshot.turn < 0) {
      throw new EngineError("Save belongs to another game, has an unsupported version, or is malformed");
    }
    return { turn: saved.snapshot.turn, state: this.decodeState(saved.snapshot.state) };
  }
}
