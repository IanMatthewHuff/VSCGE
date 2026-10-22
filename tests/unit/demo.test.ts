import { describe, expect, it } from "vitest";
import { GameSession } from "@vscge/engine";
import { decodeDungeon, dungeon, type DungeonState } from "../../packages/demo/src/game";

function create(state: DungeonState) { return new GameSession({ ...dungeon, initialState: () => state }); }
const adjacent = (): DungeonState => ({
  player: { position: { x: 2, y: 3 }, hp: 8 },
  enemies: [{ id: "goblin", position: { x: 3, y: 3 }, hp: 3 }], outcome: "playing",
});

describe("minimal dungeon", () => {
  it("starts at turn zero and supports one-cell movement with complete enemy response", () => {
    const session = new GameSession(dungeon);
    expect(session.turn).toBe(0);
    session.dispatch({ direction: "up" });
    expect(session.turn).toBe(1);
    expect(session.getSnapshot().state.player.position).toEqual({ x: 2, y: 2 });
    expect(session.getSnapshot().state.enemies[0]?.position).toEqual({ x: 5, y: 2 });
  });
  it("has a complete winning route from the default start", () => {
    const session = new GameSession(dungeon);
    for (const direction of ["right", "right", "right", "right", "down", "down"]) {
      expect(session.dispatch({ direction }).accepted).toBe(true);
    }
    expect(session.getSnapshot()).toMatchObject({
      turn: 6, state: { outcome: "victory", enemies: [], player: { hp: 4 } },
    });
  });
  it("rejects invalid movement and wall bumps without consuming a turn", () => {
    const state = adjacent();
    state.player.position = { x: 1, y: 1 };
    const session = create(state);
    expect(session.dispatch({ direction: "left" }).accepted).toBe(false);
    expect(session.dispatch({ dx: 5, dy: 5 }).accepted).toBe(false);
    expect(session.turn).toBe(0);
  });
  it("bump-attacks without moving, then removes a defeated enemy before response", () => {
    const session = create(adjacent());
    const changes: string[][] = [];
    session.subscribe(change => changes.push(change.events.map(event => event.type)));
    session.dispatch({ direction: "right" });
    expect(session.getSnapshot().state.player).toEqual({ position: { x: 2, y: 3 }, hp: 7 });
    expect(session.getSnapshot().state.enemies[0]?.hp).toBe(1);
    session.dispatch({ direction: "right" });
    expect(session.getSnapshot().state).toMatchObject({ player: { hp: 7 }, enemies: [], outcome: "victory" });
    expect(changes).toEqual([["attack", "attack"], ["attack", "defeated", "outcome"]]);
    expect(session.dispatch({ direction: "up" }).accepted).toBe(false);
    expect(session.turn).toBe(2);
  });
  it("stops enemy responses immediately on player death", () => {
    const state = adjacent();
    state.player.hp = 1;
    state.enemies.push({ id: "second", position: { x: 2, y: 2 }, hp: 3 });
    const session = create(state);
    const events: string[] = [];
    session.subscribe(change => events.push(...change.events.map(event => event.message)));
    session.dispatch({ direction: "right" });
    expect(session.getSnapshot().state).toMatchObject({ player: { hp: 0 }, outcome: "defeat" });
    expect(events.filter(message => message.includes("hits you"))).toHaveLength(1);
    expect(session.dispatch({ direction: "down" }).accepted).toBe(false);
  });
  it("validates save invariants and never permits overlapping or off-map fighters", () => {
    const state = adjacent();
    expect(decodeDungeon({ ...state, outcome: "victory" }).ok).toBe(false);
    expect(decodeDungeon({ ...state, player: { position: { x: 0, y: 0 }, hp: 8 } }).ok).toBe(false);
    expect(decodeDungeon({ ...state, enemies: [...state.enemies, ...state.enemies] }).ok).toBe(false);
    const session = new GameSession(dungeon);
    for (const direction of ["left", "up", "right", "down", "right", "up", "down", "left"]) {
      session.dispatch({ direction });
      expect(decodeDungeon(session.getSnapshot().state).ok).toBe(true);
    }
  });
  it("shares text, style and inspection coordinates without a host header constant", () => {
    const session = create(adjacent());
    const view = session.getView();
    const player = view.annotations?.find(entry => entry.style === "emphasis");
    expect(player?.range).toEqual({ line: 7, start: 2, end: 3 });
    expect(view.text.split("\n")[7]?.[2]).toBe("@");
    expect(view.inspections?.find(entry => entry.range.line === 7 && entry.range.start === 2)?.details)
      .toContainEqual({ id: "hp", label: "Player HP", value: "8" });
  });
});
