import { invalid, isRecord, valid, type GameDefinition } from "@vscge/engine";

export interface Counter { count: number }
export interface CounterAction { type: "take" | "peek" | "reject" }
export const counter: GameDefinition<Counter, CounterAction> = {
  id: "counter", title: "Counter", stateVersion: 1,
  initialState: () => ({ count: 0 }),
  decodeState: input => isRecord(input) && typeof input.count === "number" &&
    Number.isSafeInteger(input.count) && input.count >= 0
    ? valid({ count: input.count }) : invalid("Count must be a nonnegative integer"),
  decodeAction: input => isRecord(input) && (input.type === "take" || input.type === "peek" || input.type === "reject")
    ? valid({ type: input.type }) : invalid("Unknown action"),
  transition: (state, action) => action.type === "reject" ? { accepted: false, reason: "Not allowed" } : {
    accepted: true, state: { count: state.count + 1 }, consumesTurn: action.type !== "peek",
    events: [{ type: "count", message: "Counted" }, { type: "done", message: "Done" }],
  },
  present: ({ state }) => ({
    text: `Tokens taken: ${state.count}`, details: [{ id: "tokens", label: "Tokens", value: String(state.count) }],
    status: String(state.count),
    actions: [{ id: "take", title: "Take a token", action: { type: "take" } }],
  }),
};
