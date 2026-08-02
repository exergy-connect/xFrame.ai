/** Declarative `_integer` encode/decode. */

export function from__integer_string(v) {
  if (typeof v === "number") {
    if (!Number.isInteger(v)) {
      throw new Error("expected integer");
    }
    return v;
  }
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (trimmed === "" || !/^-?\d+$/.test(trimmed)) {
      throw new Error("expected integer");
    }
    const n = Number(trimmed);
    if (!Number.isInteger(n)) {
      throw new Error("expected integer");
    }
    return n;
  }
  throw new Error("expected integer");
}

export function to__integer_string(v) {
  return String(from__integer_string(v));
}
