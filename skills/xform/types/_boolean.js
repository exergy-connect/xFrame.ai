/** Declarative `_boolean` encode/decode. */

export function from__boolean_string(v) {
  if (typeof v === "boolean") {
    return v;
  }
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (trimmed === "true" || trimmed === "_true") {
      return true;
    }
    if (trimmed === "false" || trimmed === "_false") {
      return false;
    }
  }
  throw new Error("expected boolean");
}

export function to__boolean_string(v) {
  return from__boolean_string(v) ? "true" : "false";
}
