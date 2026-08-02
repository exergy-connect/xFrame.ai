/** Declarative `_enum` — membership checked by applicator with `_of` tokens. */

export function from__enum_string(v, allowed) {
  if (!Array.isArray(allowed) || allowed.length === 0) {
    throw new Error("_enum requires allowed values");
  }
  for (const item of allowed) {
    if (item === v || String(item) === String(v)) {
      return v;
    }
  }
  throw new Error(
    `expected one of [${allowed.map(String).join(", ")}]`,
  );
}

export function to__enum_string(v) {
  return String(v);
}
