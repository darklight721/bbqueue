import { describe, expect, it } from "vite-plus/test";
import { runBackendContract } from "./backend.contract.ts";
import { createInMemoryBackend } from "./inMemoryBackend.ts";

runBackendContract("in-memory", createInMemoryBackend);

describe("in-memory Backend", () => {
  it("tells observers when the connection comes and goes", () => {
    const backend = createInMemoryBackend();
    const seen: boolean[] = [];
    backend.observeOnline((online) => seen.push(online));

    backend.setOnline(false);
    expect(backend.isOnline()).toBe(false);
    backend.setOnline(true);

    expect(seen).toEqual([false, true]);
  });
});
