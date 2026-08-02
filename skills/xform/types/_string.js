/** Declarative `_string` encode/decode (identity). */

export function from__string_string(v) {
  if (typeof v !== "string") {
    throw new Error("expected string");
  }
  return v;
}

export function to__string_string(v) {
  return from__string_string(v);
}
