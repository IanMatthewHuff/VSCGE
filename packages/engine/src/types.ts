export type Validation<T> = { ok: true; value: T } | { ok: false; reason: string };
export const valid = <T>(value: T): Validation<T> => ({ ok: true, value });
export const invalid = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

export interface Disposable { dispose(): void }
export interface Snapshot<S> { readonly turn: number; readonly state: S }
export interface GameEvent { type: string; message: string; category?: string }
export type Transition<S, E extends GameEvent = GameEvent> =
  | { accepted: false; reason: string }
  | { accepted: true; state: S; consumesTurn: boolean; events: readonly E[] };

export interface TextRange { line: number; start: number; end: number }
export interface Detail {
  id: string;
  label: string;
  value?: string;
  children?: readonly Detail[];
}
export interface Inspection { range: TextRange; details: readonly Detail[] }
export type Style = "emphasis" | "danger" | "muted";
export type LogicalInput = "up" | "down" | "left" | "right";
export interface ActionView { id: string; title: string; disabledReason?: string }
export interface Presentation<A> {
  text: string;
  details: readonly Detail[];
  actions: readonly (ActionView & { action: A })[];
  status: string;
  inputs?: Partial<Record<LogicalInput, string>>;
  inspections?: readonly Inspection[];
  annotations?: readonly { range: TextRange; style: Style }[];
}
export type SessionView = Omit<Presentation<unknown>, "actions"> & { actions: readonly ActionView[] };

export interface GameDefinition<S, A, E extends GameEvent = GameEvent> {
  /** Local slug, namespaced by the owning extension during registration. */
  id: string;
  title: string;
  stateVersion: number;
  initialState(): S;
  decodeState(input: unknown): Validation<S>;
  decodeAction(input: unknown): Validation<A>;
  transition(state: Readonly<S>, action: Readonly<A>): Transition<S, E>;
  present(snapshot: Snapshot<S>): Presentation<A>;
}
export interface SaveEnvelope {
  formatVersion: 1;
  gameId: string;
  stateVersion: number;
  snapshot: Snapshot<unknown>;
}
export type ActionResult =
  | { accepted: false; reason: string }
  | { accepted: true; turn: number; revision: number; notificationErrors: readonly string[] };
export interface SessionChange { view: SessionView; events: readonly GameEvent[] }

/** Typed state/actions stay in the session; hosts use stable action IDs. */
export interface SessionPort extends Disposable {
  readonly gameId: string;
  readonly title: string;
  readonly revision: number;
  readonly turn: number;
  getView(): SessionView;
  execute(actionId: string, expectedRevision: number): ActionResult;
  input(input: LogicalInput, expectedRevision: number): ActionResult;
  serialize(): SaveEnvelope;
  subscribe(listener: (change: SessionChange) => void): () => void;
}
export interface ActiveGame { id: string; turn: number; revision: number; dirty: boolean }
export interface VscgeApi {
  readonly apiVersion: 1;
  registerGame<S, A, E extends GameEvent>(owner: string, game: GameDefinition<S, A, E>): Disposable;
  startGame(gameId: string): Promise<boolean>;
  stopGame(): Promise<boolean>;
  getActiveGame(): ActiveGame | undefined;
}
export const API_VERSION = 1;
export const CORE_EXTENSION_ID = "vscge-dev.vscge";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function isVscgeApi(value: unknown): value is VscgeApi {
  return isRecord(value) && value.apiVersion === API_VERSION &&
    typeof value.registerGame === "function" && typeof value.startGame === "function" &&
    typeof value.stopGame === "function" && typeof value.getActiveGame === "function";
}
