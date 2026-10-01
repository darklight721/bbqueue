import { afterEach, describe, expect, it } from "vite-plus/test";
import { newId } from "./ids.ts";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("newId", () => {
  afterEach(() => {
    Reflect.deleteProperty(crypto, "randomUUID");
  });

  it("returns a v4 UUID", () => {
    expect(newId()).toMatch(UUID_V4);
  });

  // Phones opening the app over plain http on the LAN aren't a secure context,
  // so crypto.randomUUID is undefined there (crypto.getRandomValues still works).
  it("still works when crypto.randomUUID is unavailable (insecure context)", () => {
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
    expect(typeof crypto.randomUUID).toBe("undefined");
    const a = newId();
    const b = newId();
    expect(a).toMatch(UUID_V4);
    expect(b).toMatch(UUID_V4);
    expect(a).not.toBe(b);
  });
});
