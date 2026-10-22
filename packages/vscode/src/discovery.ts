import { API_VERSION, EngineError, isRecord } from "@vscge/engine";

export interface DiscoveredGame { id: string; title: string; owner: string; apiVersion: number }

export function discoverGames(owner: string, manifest: unknown): DiscoveredGame[] {
  if (!isRecord(manifest) || manifest.vscge === undefined) return [];
  const metadata = manifest.vscge;
  if (!isRecord(metadata) || !Number.isSafeInteger(metadata.apiVersion) || !Array.isArray(metadata.games)) {
    throw new EngineError(`${owner}: malformed vscge discovery metadata`);
  }
  const seen = new Set<string>();
  return metadata.games.map((game: unknown) => {
    if (!isRecord(game) || typeof game.id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(game.id) ||
        typeof game.title !== "string" || !game.title || seen.has(game.id)) {
      throw new EngineError(`${owner}: invalid or duplicate discoverable game`);
    }
    seen.add(game.id);
    return {
      id: `${owner.toLowerCase()}/${game.id}`, title: game.title, owner,
      apiVersion: Number(metadata.apiVersion),
    };
  });
}

export function requireCompatible(game: DiscoveredGame): void {
  if (game.apiVersion !== API_VERSION) throw new EngineError(`${game.title} requires VSCGE API ${game.apiVersion}; this host provides ${API_VERSION}`);
}
