import {
  DIRECTIONS, at, inBounds, invalid, isRecord, neighbors, renderGrid, valid,
  type GameDefinition, type GameEvent, type Inspection, type LogicalInput, type Position,
  type Presentation, type Validation,
} from "@vscge/engine";

export const MAP = [
  "#########", "#.......#", "#.......#", "#.......#", "#.......#", "#.......#", "#########",
] as const;
const tiles = MAP.map(row => [...row]);
export interface Fighter { position: Position; hp: number }
export interface Enemy extends Fighter { id: string }
export interface DungeonState {
  player: Fighter;
  enemies: Enemy[];
  outcome: "playing" | "victory" | "defeat";
}
export interface Move { direction: LogicalInput }
const equal = (a: Position, b: Position) => a.x === b.x && a.y === b.y;
const distance = (a: Position, b: Position) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const walkable = (position: Position) => at(tiles, position) === ".";

function decodeFighter(input: unknown, maxHp: number, canBeDead: boolean): Validation<Fighter> {
  if (!isRecord(input) || !isRecord(input.position) || typeof input.position.x !== "number" ||
      typeof input.position.y !== "number" || typeof input.hp !== "number" ||
      !Number.isSafeInteger(input.hp) || input.hp < (canBeDead ? 0 : 1) || input.hp > maxHp) {
    return invalid("Invalid fighter");
  }
  const position = { x: input.position.x, y: input.position.y };
  return inBounds(MAP[0].length, MAP.length, position) && walkable(position)
    ? valid({ position, hp: input.hp }) : invalid("Fighter must occupy a floor cell");
}

export function decodeDungeon(input: unknown): Validation<DungeonState> {
  if (!isRecord(input) || !Array.isArray(input.enemies) ||
      (input.outcome !== "playing" && input.outcome !== "victory" && input.outcome !== "defeat")) {
    return invalid("Invalid dungeon state");
  }
  const player = decodeFighter(input.player, 8, true);
  if (!player.ok) return player;
  const enemies: Enemy[] = [];
  const ids = new Set<string>();
  const positions = new Set([`${player.value.position.x},${player.value.position.y}`]);
  for (const candidate of input.enemies) {
    const fighter = decodeFighter(candidate, 3, false);
    if (!fighter.ok || !isRecord(candidate) || typeof candidate.id !== "string" || !candidate.id || ids.has(candidate.id)) {
      return invalid("Invalid or duplicate enemy");
    }
    const key = `${fighter.value.position.x},${fighter.value.position.y}`;
    if (positions.has(key)) return invalid("Fighters cannot overlap");
    positions.add(key);
    ids.add(candidate.id);
    enemies.push({ ...fighter.value, id: candidate.id });
  }
  const expected = player.value.hp === 0 ? "defeat" : enemies.length === 0 ? "victory" : "playing";
  if (input.outcome !== expected) return invalid("Outcome does not match the fighters");
  return valid({ player: player.value, enemies, outcome: expected });
}

export const dungeon: GameDefinition<DungeonState, Move> = {
  id: "dungeon",
  title: "Dungeon Demo",
  stateVersion: 1,
  initialState: () => ({
    player: { position: { x: 2, y: 3 }, hp: 8 },
    enemies: [
      { id: "goblin-1", position: { x: 6, y: 2 }, hp: 3 },
      { id: "goblin-2", position: { x: 6, y: 4 }, hp: 3 },
    ],
    outcome: "playing",
  }),
  decodeState: decodeDungeon,
  decodeAction: input => {
    if (!isRecord(input) || (input.direction !== "up" && input.direction !== "down" &&
        input.direction !== "left" && input.direction !== "right")) return invalid("Choose one cardinal direction");
    return valid({ direction: input.direction });
  },
  transition: (state, action) => {
    if (state.outcome !== "playing") return { accepted: false, reason: "Game over. Restart to play again." };
    const delta = DIRECTIONS[action.direction];
    const target = { x: state.player.position.x + delta.x, y: state.player.position.y + delta.y };
    if (!walkable(target)) return { accepted: false, reason: "A wall blocks that direction" };
    const player = { ...state.player, position: { ...state.player.position } };
    let enemies = state.enemies.map(enemy => ({ ...enemy, position: { ...enemy.position } }));
    const events: GameEvent[] = [];
    const targetEnemy = enemies.find(enemy => equal(enemy.position, target));
    if (targetEnemy) {
      targetEnemy.hp = Math.max(0, targetEnemy.hp - 2);
      events.push({ type: "attack", message: `You hit ${targetEnemy.id} for 2 damage.`, category: "Combat" });
      if (!targetEnemy.hp) {
        enemies = enemies.filter(enemy => enemy.id !== targetEnemy.id);
        events.push({ type: "defeated", message: `${targetEnemy.id} was defeated.`, category: "Combat" });
      }
    } else {
      player.position = target;
      events.push({ type: "move", message: `Moved ${action.direction}.` });
    }
    for (const enemy of enemies) {
      if (player.hp === 0) break;
      if (distance(enemy.position, player.position) === 1) {
        player.hp--;
        events.push({ type: "attack", message: `${enemy.id} hits you for 1 damage.`, category: "Combat" });
      } else {
        const next = neighbors(enemy.position)
          .filter(position => walkable(position) && !equal(position, player.position) &&
            !enemies.some(other => equal(other.position, position)))
          .sort((a, b) => distance(a, player.position) - distance(b, player.position))[0];
        if (next && distance(next, player.position) < distance(enemy.position, player.position)) enemy.position = next;
      }
    }
    const outcome = player.hp === 0 ? "defeat" : enemies.length === 0 ? "victory" : "playing";
    if (outcome !== "playing") events.push({ type: "outcome", message: outcome === "victory" ? "Victory! All enemies defeated." : "You have fallen. Restart to try again." });
    return { accepted: true, consumesTurn: true, state: { player, enemies, outcome }, events };
  },
  present: ({ state, turn }) => {
    const rows = tiles.map((row, y) => row.map((tile, x) => {
      const pos = { x, y };
      return equal(state.player.position, pos) ? "@" : state.enemies.some(enemy => equal(enemy.position, pos)) ? "g" : tile;
    }).join(""));
    const layout = renderGrid(rows, ["Dungeon Demo", `Turn: ${turn} | ${state.outcome}`, "", ""]);
    const inspections: Inspection[] = tiles.flatMap((row, y) => row.map((tile, x) => {
      const position = { x, y };
      const fighter = equal(state.player.position, position) ? state.player : state.enemies.find(enemy => equal(enemy.position, position));
      return {
        range: layout.range(position),
        details: [
          { id: "position", label: "Position", value: `${x}, ${y}` },
          { id: "terrain", label: "Terrain", value: tile === "#" ? "Wall" : "Floor" },
          ...(fighter ? [{ id: "hp", label: equal(state.player.position, position) ? "Player HP" : "Goblin HP", value: String(fighter.hp) }] : []),
        ],
      };
    }));
    const actions: Presentation<Move>["actions"] = (Object.keys(DIRECTIONS) as LogicalInput[]).map(direction => ({
      id: direction, title: `Move / attack ${direction}`, action: { direction },
      ...(state.outcome === "playing" ? {} : { disabledReason: "Game over. Restart to play again." }),
    }));
    return {
      text: `${layout.text}\n\nWASD: move / bump-to-attack | Arrows or mouse: inspect\nUse VSCGE commands to save, load, or restart.`,
      status: `HP ${state.player.hp}/8 | Enemies ${state.enemies.length} | ${state.outcome}`,
      details: [
        { id: "hp", label: "Player HP", value: `${state.player.hp}/8` },
        { id: "enemies", label: "Enemies remaining", value: String(state.enemies.length) },
        { id: "outcome", label: "Outcome", value: state.outcome },
      ],
      actions,
      inputs: { up: "up", down: "down", left: "left", right: "right" },
      inspections,
      annotations: [
        { range: layout.range(state.player.position), style: "emphasis" },
        ...state.enemies.map(enemy => ({ range: layout.range(enemy.position), style: "danger" as const })),
      ],
    };
  },
};
