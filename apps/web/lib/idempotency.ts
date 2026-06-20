export function createIdempotencyKey(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  const randomValues = new Uint32Array(4);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(randomValues);
  } else {
    randomValues.forEach((_, index) => {
      randomValues[index] = Math.floor(Math.random() * 0xffffffff);
    });
  }

  return `${prefix}-${Date.now().toString(36)}-${Array.from(randomValues)
    .map((value) => value.toString(36))
    .join("-")}`;
}
