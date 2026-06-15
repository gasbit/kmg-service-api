export function toBigIntId(value: unknown) {
  if (typeof value === "bigint") return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return BigInt(value);
  throw new Error("Invalid id parameter");
}
