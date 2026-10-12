/**
 * JSON with object keys in sorted order at every level, so two equal values
 * give the same string whatever order a store handed their keys back in.
 * Firestore returns map keys sorted; code builds objects in declaration order.
 * Plain JSON.stringify tells those apart, which is never what a comparison wants.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, sortKeys(record[key])]),
    );
  }
  return value;
}
