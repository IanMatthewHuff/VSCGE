import { describe, expect, it, vi } from "vitest";
import { assertJson, GameSession, renderGrid, type ActionResult } from "@vscge/engine";
import { counter } from "../fixtures/counter";

describe("genre-neutral atomic sessions", () => {
  it("supports a non-grid game without RPG state or movement bindings", () => {
    const session = new GameSession(counter);
    expect(session.turn).toBe(0);
    expect(session.getView().text).toBe("Tokens taken: 0");
    expect(session.getView().inputs).toBeUndefined();
    expect(session.input("up", 0).accepted).toBe(false);
    expect(session.execute("take", 0).accepted).toBe(true);
    expect(session.getSnapshot()).toEqual({ turn: 1, state: { count: 1 } });
    expect(session.getView().text).toBe("Tokens taken: 1");
    expect(session.getView().actions[0]).not.toHaveProperty("action");
  });
  it("reuses a frozen public view until an accepted action changes the presentation", () => {
    const session = new GameSession(counter);
    const before = session.getView();
    expect(session.getView()).toBe(before);
    expect(Object.isFrozen(before)).toBe(true);
    expect(Object.isFrozen(before.details)).toBe(true);
    expect(Object.isFrozen(before.details[0])).toBe(true);
    expect(Object.isFrozen(before.actions)).toBe(true);
    const action = before.actions[0];
    if (!action) throw new Error("Expected a public action");
    expect(() => { action.title = "Changed"; }).toThrow();
    expect(action).not.toHaveProperty("action");
    const listener = vi.fn();
    session.subscribe(listener);
    session.dispatch({ type: "take" });
    const after = session.getView();
    expect(after).not.toBe(before);
    expect(after.text).toBe("Tokens taken: 1");
    expect(before.text).toBe("Tokens taken: 0");
    expect(session.getView()).toBe(after);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0].view).toBe(after);
  });
  it("notifies once with the final state and ordered events", () => {
    const session = new GameSession(counter);
    const listener = vi.fn(change => {
      expect(session.turn).toBe(1);
      expect(change.view.text).toBe("Tokens taken: 1");
      expect(change.events.map((event: { type: string }) => event.type)).toEqual(["count", "done"]);
    });
    session.subscribe(listener);
    session.dispatch({ type: "take" });
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it("leaves rejected actions and invalid inputs unchanged", () => {
    const session = new GameSession(counter);
    const before = session.getSnapshot();
    const view = session.getView();
    const listener = vi.fn();
    session.subscribe(listener);
    expect(session.dispatch({ type: "reject" })).toEqual({ accepted: false, reason: "Not allowed" });
    expect(session.dispatch({ type: "unknown" }).accepted).toBe(false);
    expect(session.getSnapshot()).toBe(before);
    expect(session.getView()).toBe(view);
    expect(session.revision).toBe(0);
    expect(listener).not.toHaveBeenCalled();
  });
  it("supports accepted non-turn actions and rejects stale revisions", () => {
    const session = new GameSession(counter);
    const before = session.getView();
    session.dispatch({ type: "peek" });
    expect(session.turn).toBe(0);
    expect(session.revision).toBe(1);
    const after = session.getView();
    expect(after).not.toBe(before);
    expect(after.text).toBe("Tokens taken: 1");
    expect(session.execute("take", 0).accepted).toBe(false);
    expect(session.getView()).toBe(after);
  });
  it("never commits failed rules, invalid next state, or invalid presentation", () => {
    for (const definition of [
      { ...counter, transition: () => { throw new Error("rules failed"); } },
      { ...counter, transition: () => ({ accepted: true as const, consumesTurn: true, state: { count: -1 }, events: [] }) },
      { ...counter, present: (snapshot: { state: { count: number } }) => {
        if (snapshot.state.count) throw new Error("presentation failed");
        return counter.present({ ...snapshot, turn: 0 });
      } },
    ]) {
      const session = new GameSession(definition);
      const before = session.getSnapshot();
      const view = session.getView();
      expect(() => session.dispatch({ type: "take" })).toThrow();
      expect(session.getSnapshot()).toBe(before);
      expect(session.getView()).toBe(view);
      expect(session.revision).toBe(0);
    }
  });
  it("protects snapshots, prevents reentrant dispatch, and distinguishes subscriber errors", () => {
    const session = new GameSession(counter);
    expect(() => { session.getSnapshot().state.count = 8; }).toThrow();
    let nested: ActionResult | undefined;
    session.subscribe(() => { nested = session.dispatch({ type: "take" }); });
    session.subscribe(() => { throw new Error("subscriber failed"); });
    const result = session.dispatch({ type: "take" });
    expect(nested?.accepted).toBe(false);
    expect(result).toMatchObject({ accepted: true, notificationErrors: ["subscriber failed"] });
    expect(session.turn).toBe(1);
  });
  it("isolates instances and cleans up disposed listeners", () => {
    const first = new GameSession(counter);
    const second = new GameSession(counter);
    const listener = vi.fn();
    first.subscribe(listener);
    second.dispatch({ type: "take" });
    expect(first.turn).toBe(0);
    first.dispose();
    expect(first.dispatch({ type: "take" }).accepted).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    expect(() => first.serialize()).toThrow("stopped");
  });
  it("round trips complete snapshots and reproduces deterministic play", () => {
    const first = new GameSession(counter, "test.owner/counter");
    first.dispatch({ type: "take" });
    first.dispatch({ type: "peek" });
    const restored = new GameSession(counter, first.gameId, JSON.parse(JSON.stringify(first.serialize())));
    expect(restored.getSnapshot()).toEqual(first.getSnapshot());
    for (let index = 0; index < 5; index++) {
      first.dispatch({ type: "take" });
      restored.dispatch({ type: "take" });
    }
    expect(restored.serialize()).toEqual(first.serialize());
  });
  it("rejects malformed, cross-game and unsupported saves", () => {
    const session = new GameSession(counter);
    const saved = session.serialize();
    for (const bad of [
      null, {}, { ...saved, gameId: "other" }, { ...saved, stateVersion: 9 },
      { ...saved, formatVersion: 2 }, { ...saved, snapshot: { turn: -1, state: { count: 0 } } },
      { ...saved, snapshot: { turn: 0, state: { count: -1 } } },
    ]) expect(() => new GameSession(counter, counter.id, bad)).toThrow();
  });
  it("validates action IDs, bindings, ranges, and detail identities", () => {
    const base = counter.present({ turn: 0, state: { count: 0 } });
    for (const bad of [
      { ...base, actions: [...base.actions, ...base.actions] },
      { ...base, inputs: { up: "missing" } },
      { ...base, annotations: [{ range: { line: 99, start: 0, end: 1 }, style: "danger" as const }] },
      { ...base, details: [{ id: "x", label: "X" }, { id: "x", label: "Y" }] },
    ]) expect(() => new GameSession({ ...counter, present: () => bad })).toThrow();
  });
});

describe("JSON and optional text-grid helpers", () => {
  it("rejects lossy JSON values", () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    for (const bad of [undefined, NaN, Infinity, new Date(), new Map(), { missing: undefined },
      () => 1, BigInt(1), cyclic, Array(2), { [Symbol("x")]: 1 }]) expect(() => assertJson(bad)).toThrow();
    expect(() => assertJson({ value: [null, 1, "x", true] })).not.toThrow();
  });
  it("derives ranges from the actual header and enforces ASCII rectangular cells", () => {
    const grid = renderGrid(["#.", ".#"], ["Title", "", "More", ""]);
    expect(grid.range({ x: 1, y: 1 })).toEqual({ line: 5, start: 1, end: 2 });
    expect(grid.text.split("\n")[5]?.[1]).toBe("#");
    expect(() => grid.range({ x: 0.5, y: 0 })).toThrow();
    expect(() => renderGrid(["##", "#"])).toThrow();
    expect(() => renderGrid(["\u{1f600}"])).toThrow();
  });
});
