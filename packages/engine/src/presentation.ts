import { EngineError, immutableJson } from "./json";
import type { Detail, Presentation, SessionView, TextRange } from "./types";

export function validatePresentation<A>(input: Presentation<A>): Presentation<A> {
  const view = immutableJson(input);
  if (typeof view.text !== "string" || typeof view.status !== "string" ||
      !Array.isArray(view.actions) || !Array.isArray(view.details) ||
      (view.inspections !== undefined && !Array.isArray(view.inspections)) ||
      (view.annotations !== undefined && !Array.isArray(view.annotations)) ||
      (view.inputs !== undefined && (typeof view.inputs !== "object" || view.inputs === null || Array.isArray(view.inputs)))) {
    throw new EngineError("Invalid presentation");
  }
  const lines = view.text.split("\n");
  const checkRange = (range: TextRange): void => {
    if (!range || !Number.isSafeInteger(range.line) || !Number.isSafeInteger(range.start) ||
        !Number.isSafeInteger(range.end) || range.line < 0 || range.start < 0 ||
        range.end <= range.start || range.end > (lines[range.line]?.length ?? -1)) {
      throw new EngineError("Presentation range is outside the document");
    }
  };
  const checkDetails = (details: readonly Detail[]): void => {
    if (!Array.isArray(details)) throw new EngineError("Details must be an array");
    const ids = new Set<string>();
    for (const detail of details) {
      if (typeof detail.id !== "string" || !detail.id || ids.has(detail.id) ||
          typeof detail.label !== "string" || (detail.value !== undefined && typeof detail.value !== "string")) {
        throw new EngineError("Invalid or duplicate detail");
      }
      ids.add(detail.id);
      if (detail.children) checkDetails(detail.children);
    }
  };
  checkDetails(view.details);
  const ids = new Set<string>();
  for (const action of view.actions) {
    if (typeof action.id !== "string" || !action.id || typeof action.title !== "string" || !action.title ||
        ids.has(action.id) || (action.disabledReason !== undefined &&
          (typeof action.disabledReason !== "string" || !action.disabledReason))) {
      throw new EngineError("Invalid or duplicate action");
    }
    ids.add(action.id);
  }
  for (const [input, id] of Object.entries(view.inputs ?? {})) {
    if (!["up", "down", "left", "right"].includes(input) || !ids.has(id)) throw new EngineError("Invalid input binding");
  }
  for (const inspection of view.inspections ?? []) {
    checkRange(inspection.range);
    checkDetails(inspection.details);
  }
  for (const annotation of view.annotations ?? []) {
    checkRange(annotation.range);
    if (!["emphasis", "danger", "muted"].includes(annotation.style)) throw new EngineError("Unknown annotation style");
  }
  return view;
}

export function publicView<A>(view: Presentation<A>): SessionView {
  return immutableJson({
    ...view,
    actions: view.actions.map(({ action: _action, ...metadata }) => metadata),
  });
}
