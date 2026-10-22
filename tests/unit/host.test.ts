import { describe, expect, it, vi } from "vitest";
import type { SaveEnvelope } from "@vscge/engine";
import { GameHost, type HostServices } from "../../packages/vscode/src/host";
import { discoverGames, requireCompatible } from "../../packages/vscode/src/discovery";
import { counter } from "../fixtures/counter";

function setup() {
  const saves = new Map<string, unknown>();
  const services: HostServices = {
    confirmDiscard: vi.fn(async () => true), reveal: vi.fn(async () => {}),
    render: vi.fn(), log: vi.fn(), hasWorkspace: () => true,
    readSave: key => saves.get(key), writeSave: vi.fn(async (key, value) => { saves.set(key, value); }),
  };
  const host = new GameHost(services);
  const registration = host.registerGame("test.owner", counter);
  return { host, services, saves, registration };
}
const id = "test.owner/counter";
function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

describe("game host lifecycle and storage", () => {
  it("runs without any games and rejects duplicate registrations", () => {
    const empty = new GameHost(setup().services);
    expect(empty.games()).toEqual([]);
    const { host } = setup();
    expect(() => host.registerGame("test.owner", counter)).toThrow("already registered");
    expect(() => host.registerGame("invalid", counter)).toThrow("extension ID");
  });
  it("cancels replacement, preserving live progress", async () => {
    const { host, services } = setup();
    await host.startGame(id);
    host.execute(host.ticket("take"));
    services.confirmDiscard = async () => false;
    expect(await host.restart()).toBe(false);
    expect(host.getActiveGame()).toMatchObject({ turn: 1, dirty: true });
    expect(await host.stopGame()).toBe(false);
  });
  it("validates replacements before discarding and preserves a game if reveal fails", async () => {
    const { host, services, saves } = setup();
    await host.startGame(id);
    host.execute(host.ticket("take"));
    saves.set(`vscge.save.${id}`, { nope: true });
    await expect(host.load(id)).rejects.toThrow();
    expect(services.confirmDiscard).not.toHaveBeenCalled();
    services.reveal = async () => { throw new Error("editor failed"); };
    await expect(host.restart()).rejects.toThrow("editor failed");
    expect(host.getActiveGame()?.turn).toBe(1);
  });
  it("rejects old action tickets and disposes old sessions on restart", async () => {
    const { host } = setup();
    await host.startGame(id);
    const ticket = host.ticket("take");
    const old = host.session;
    await host.restart();
    expect(host.execute(ticket).accepted).toBe(false);
    expect(old?.execute("take", 0).accepted).toBe(false);
    expect(host.execute(host.ticket("take")).accepted).toBe(true);
  });
  it("round trips saved state without initialization turns", async () => {
    const { host, saves } = setup();
    await host.startGame(id);
    host.execute(host.ticket("take"));
    await host.save();
    expect(saves.size).toBe(1);
    expect(host.getActiveGame()?.dirty).toBe(false);
    await host.restart();
    expect(host.getActiveGame()?.turn).toBe(0);
    await host.load(id);
    expect(host.getActiveGame()).toMatchObject({ turn: 1, revision: 0, dirty: false });
    expect(host.session?.getView().text).toBe("Tokens taken: 1");
  });
  it("does not mark newer progress clean when an older save finishes", async () => {
    const { host, services } = setup();
    const pending = deferred();
    services.writeSave = async () => pending.promise;
    await host.startGame(id);
    host.execute(host.ticket("take"));
    const save = host.save();
    host.execute(host.ticket("take"));
    await expect(host.save()).rejects.toThrow("already in progress");
    pending.resolve();
    await save;
    expect(host.getActiveGame()).toMatchObject({ turn: 2, dirty: true });
  });
  it("surfaces failed writes and missing slots without losing progress", async () => {
    const { host, services } = setup();
    await host.startGame(id);
    host.execute(host.ticket("take"));
    services.writeSave = async () => { throw new Error("storage full"); };
    await expect(host.save()).rejects.toThrow("storage full");
    expect(host.getActiveGame()?.dirty).toBe(true);
    await expect(host.load(id)).rejects.toThrow("No save");
    services.hasWorkspace = () => false;
    await expect(host.save()).rejects.toThrow("Open a folder");
    expect(host.getActiveGame()?.turn).toBe(1);
  });
  it("isolates slots by namespaced game ID and rejects cross-game payloads", async () => {
    const { host, saves } = setup();
    host.registerGame("other.owner", counter);
    await host.startGame(id);
    await host.save();
    const saved = saves.get(`vscge.save.${id}`) as SaveEnvelope;
    saves.set("vscge.save.other.owner/counter", saved);
    await expect(host.load("other.owner/counter")).rejects.toThrow();
    expect(host.getActiveGame()?.id).toBe(id);
  });
  it("blocks actions during pending discard decisions and unregisters safely", async () => {
    const { host, services, registration } = setup();
    const pending = deferred();
    await host.startGame(id);
    host.execute(host.ticket("take"));
    const ticket = host.ticket("take");
    services.confirmDiscard = async () => { await pending.promise; return true; };
    const restart = host.restart();
    expect(host.execute(ticket).accepted).toBe(false);
    registration.dispose();
    pending.resolve();
    await expect(restart).rejects.toThrow("unregistered");
    expect(host.getActiveGame()).toBeUndefined();
    expect(host.games()).toEqual([]);
    registration.dispose();
  });
  it("cleans subscriptions and logs exactly once across repeated restarts", async () => {
    const { host, services } = setup();
    for (let index = 0; index < 4; index++) {
      await host.startGame(id);
      host.execute(host.ticket("take"));
    }
    expect(vi.mocked(services.log).mock.calls.filter(([message]) => message.includes("Counted"))).toHaveLength(4);
    host.dispose();
    expect(host.getActiveGame()).toBeUndefined();
    await expect(host.startGame(id)).rejects.toThrow("stopped");
  });
});

describe("opt-in extension discovery", () => {
  it("ignores unrelated extensions and validates advertised games", () => {
    expect(discoverGames("test.owner", {})).toEqual([]);
    const [game] = discoverGames("test.owner", { vscge: { apiVersion: 1, games: [{ id: "counter", title: "Counter" }] } });
    expect(game).toEqual({ id, owner: "test.owner", title: "Counter", apiVersion: 1 });
    expect(() => discoverGames("test.owner", { vscge: {} })).toThrow("malformed");
    expect(() => requireCompatible({ id, title: "Counter", owner: "test.owner", apiVersion: 9 })).toThrow("API 9");
  });
});
