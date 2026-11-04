import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : path.endsWith(".ts") ? [path] : [];
  });
}
describe("package boundaries", () => {
  it("keeps Node APIs out of all shipped runtime modules", () => {
    for (const directory of ["packages/engine/src", "packages/vscode/src", "packages/demo/src"]) {
      for (const file of sourceFiles(directory)) {
        expect(readFileSync(file, "utf8"), file).not.toMatch(/from\s+["'](?:node:|fs["'/]|path["']|os["']|child_process|crypto["'])/);
      }
    }
  });
  it("keeps the engine independent of VS Code, and the host independent of the demo", () => {
    for (const file of sourceFiles("packages/engine/src")) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/from\s+["']vscode["']/);
    }
    for (const file of sourceFiles("packages/vscode/src")) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/from\s+["'][^"']*(?:demo|game\.ts)/);
    }
  });
  it("limits shipped runtime dependencies and keeps browser/pack IDs consistent", () => {
    const read = (directory: string) => JSON.parse(readFileSync(`${directory}/package.json`, "utf8"));
    const engine = read("packages/engine");
    const core = read("packages/vscode");
    const demo = read("packages/demo");
    const pack = read("packages/extension-pack");
    expect(Object.keys(engine.dependencies)).toEqual(["@reduxjs/toolkit"]);
    expect(Object.keys(core.dependencies)).toEqual(["@vscge/engine"]);
    expect(Object.keys(demo.dependencies)).toEqual(["@vscge/engine"]);
    expect(demo.extensionDependencies).toEqual([`${core.publisher}.${core.name}`]);
    expect(pack.extensionPack).toEqual([`${core.publisher}.${core.name}`, `${demo.publisher}.${demo.name}`]);
    expect(core.extensionKind).toEqual(demo.extensionKind);
    expect(core.contributes.viewsContainers.activitybar).toEqual([
      { id: "vscge-games", title: "VSCGE", icon: "media/game.svg" },
    ]);
    expect(Object.keys(core.contributes.views)).toEqual(["vscge-games"]);
    expect(core.contributes.views["vscge-games"].map((view: { id: string }) => view.id)).toEqual([
      "vscge.details", "vscge.actionsView", "vscge.inspector",
    ]);
    expect(readFileSync("packages/vscode/media/game.svg", "utf8")).toContain("<svg");
    for (const manifest of [core, demo]) {
      expect(manifest.main).toBeTruthy();
      expect(manifest.browser).toBeTruthy();
      expect(manifest.license).toBe("UNLICENSED");
    }
    expect(core.contributes.keybindings.every((binding: { key: string; when: string }) =>
      binding.when.includes("vscge.documentFocused") && binding.when.includes("resourceScheme == vscge") &&
      !["up", "down", "left", "right"].includes(binding.key))).toBe(true);
  });
});
