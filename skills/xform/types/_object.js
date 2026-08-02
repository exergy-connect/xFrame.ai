/** Declarative `_object` — unstructured mapping. */

export function from__object_string(v) {
  if (v !== null && typeof v === "object" && !Array.isArray(v)) {
    return v;
  }
  if (typeof v === "string") {
    // YAML parse is done by the compiler when needed; accept JSON objects here.
    try {
      const parsed = JSON.parse(v);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // fall through
    }
  }
  throw new Error("expected object");
}

export function to__object_string(v) {
  return JSON.stringify(from__object_string(v));
}
