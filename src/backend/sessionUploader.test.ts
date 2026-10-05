import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createCoalescingUploader } from "./sessionUploader.ts";

/** A connection the test switches on and off, and a send the test settles by hand. */
function setup(options: { online?: boolean; onError?: (e: unknown) => "retry" | "stop" } = {}) {
  let online = options.online ?? true;
  const listeners = new Set<(online: boolean) => void>();
  const sent: string[] = [];
  const pending: { resolve: () => void; reject: (e: unknown) => void }[] = [];
  const uploader = createCoalescingUploader<string>({
    send: (value) => {
      sent.push(value);
      return new Promise<void>((resolve, reject) => pending.push({ resolve, reject }));
    },
    isOnline: () => online,
    observeOnline: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    onError: options.onError,
  });
  return {
    uploader,
    sent,
    pending,
    setOnline(next: boolean) {
      online = next;
      for (const listener of [...listeners]) listener(next);
    },
    /** Let the in-flight send finish, then let promise callbacks run. */
    async finish() {
      pending.shift()!.resolve();
      await vi.advanceTimersByTimeAsync(0);
    },
  };
}

describe("coalescing uploader", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends the latest copy about a second after the last change, not each one", async () => {
    const t = setup();
    t.uploader.push("a");
    await vi.advanceTimersByTimeAsync(400);
    t.uploader.push("b");
    await vi.advanceTimersByTimeAsync(400);
    t.uploader.push("c");
    expect(t.sent).toEqual([]);

    await vi.advanceTimersByTimeAsync(1000);

    expect(t.sent).toEqual(["c"]);
  });

  it("never holds a steady stream of changes back longer than the maximum wait", async () => {
    const t = setup();
    for (let i = 0; i < 12; i++) {
      t.uploader.push(`v${i}`);
      await vi.advanceTimersByTimeAsync(600);
    }
    expect(t.sent.length).toBeGreaterThanOrEqual(1);
    expect(t.sent[0]).toMatch(/^v/);
  });

  it("has at most one write in flight: changes made meanwhile go out as one copy afterwards", async () => {
    const t = setup();
    t.uploader.push("a");
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.sent).toEqual(["a"]);

    t.uploader.push("b");
    t.uploader.push("c");
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.sent).toEqual(["a"]);

    await t.finish();
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.sent).toEqual(["a", "c"]);
  });

  it("sends nothing while offline, and the latest copy once when the connection is back", async () => {
    const t = setup({ online: false });
    t.uploader.push("a");
    t.uploader.push("b");
    t.uploader.push("c");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.sent).toEqual([]);

    t.setOnline(true);
    await vi.advanceTimersByTimeAsync(10);

    expect(t.sent).toEqual(["c"]);
  });

  it("stops a send that was due when the connection drops, and sends the latest copy on reconnect", async () => {
    const t = setup();
    t.uploader.push("a");
    await vi.advanceTimersByTimeAsync(500);
    t.setOnline(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.sent).toEqual([]);

    t.setOnline(true);
    await vi.advanceTimersByTimeAsync(10);
    expect(t.sent).toEqual(["a"]);
  });

  it("sends the latest copy again after a reconnect when the earlier send never answered", async () => {
    const t = setup();
    t.uploader.push("a");
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.sent).toEqual(["a"]);

    // The connection dropped before the answer came.
    t.setOnline(false);
    t.setOnline(true);
    await vi.advanceTimersByTimeAsync(10);

    expect(t.sent).toEqual(["a", "a"]);
    // The first send answering late changes nothing.
    t.pending[0]!.resolve();
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.sent).toEqual(["a", "a"]);
  });

  it("tries a failed send again with growing pauses, and sends the newest copy", async () => {
    const t = setup();
    t.uploader.push("a");
    await vi.advanceTimersByTimeAsync(1000);
    t.pending.shift()!.reject(new Error("boom"));
    await vi.advanceTimersByTimeAsync(0);
    t.uploader.push("b");

    await vi.advanceTimersByTimeAsync(1000);
    expect(t.sent).toEqual(["a"]);
    await vi.advanceTimersByTimeAsync(1100);
    expect(t.sent).toEqual(["a", "b"]);

    t.pending.shift()!.reject(new Error("boom again"));
    await vi.advanceTimersByTimeAsync(2000);
    expect(t.sent).toEqual(["a", "b"]);
    await vi.advanceTimersByTimeAsync(3100);
    expect(t.sent).toEqual(["a", "b", "b"]);
  });

  it("gives up when the error handler says sending can't help", async () => {
    const t = setup({ onError: () => "stop" });
    t.uploader.push("a");
    await vi.advanceTimersByTimeAsync(1000);
    t.pending.shift()!.reject(new Error("forbidden"));
    await vi.advanceTimersByTimeAsync(60_000);

    expect(t.sent).toEqual(["a"]);
    expect(t.uploader.isBusy()).toBe(false);
  });

  it("does nothing after it is stopped", async () => {
    const t = setup();
    t.uploader.push("a");
    t.uploader.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    t.uploader.push("b");
    await vi.advanceTimersByTimeAsync(10_000);

    expect(t.sent).toEqual([]);
  });
});
