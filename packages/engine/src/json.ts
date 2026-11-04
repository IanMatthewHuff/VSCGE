export class EngineError extends Error { override name = "EngineError"; }
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Reject data JSON.stringify would silently alter or omit. */
export function assertJson(value: unknown): void {
  const ancestors = new Set<object>();
  function visit(item: unknown, path: string): void {
    if (item === null || typeof item === "string" || typeof item === "boolean") return;
    if (typeof item === "number" && Number.isFinite(item)) return;
    if (typeof item !== "object" || item === null) throw new EngineError(`${path}: expected JSON data`);
    if (ancestors.has(item)) throw new EngineError(`${path}: cyclic data`);
    const array = Array.isArray(item);
    if (!array && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) {
      throw new EngineError(`${path}: class instances are not JSON data`);
    }
    ancestors.add(item);
    const keys = Reflect.ownKeys(item).filter(key => !(array && key === "length"));
    if (array && keys.length !== item.length) throw new EngineError(`${path}: sparse or extended array`);
    for (const key of keys) {
      const property = Object.getOwnPropertyDescriptor(item, key);
      if (typeof key !== "string" || !property?.enumerable || !("value" in property)) {
        throw new EngineError(`${path}: unsupported property`);
      }
      if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= item.length)) {
        throw new EngineError(`${path}: extended array`);
      }
      visit(property.value, `${path}.${key}`);
    }
    ancestors.delete(item);
  }
  visit(value, "data");
}

/** Clone before freezing; do not freeze objects owned by the caller. */
export function immutableJson<T>(value: T): T {
  assertJson(value);
  const copy: T = JSON.parse(JSON.stringify(value));
  function freeze(item: unknown): void {
    if (typeof item !== "object" || item === null) return;
    for (const child of Object.values(item)) freeze(child);
    Object.freeze(item);
  }
  freeze(copy);
  return copy;
}
