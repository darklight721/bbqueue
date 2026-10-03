import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { requestPersistentStorage } from "./persistentStorage.ts";

function stubStorage(storage: unknown) {
  Object.defineProperty(navigator, "storage", { value: storage, configurable: true });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "storage");
  vi.restoreAllMocks();
});

describe("requestPersistentStorage", () => {
  it("asks the browser to keep the data", async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    stubStorage({ persist });

    expect(await requestPersistentStorage()).toBe(true);
    expect(persist).toHaveBeenCalledOnce();
  });

  it("passes on a refusal", async () => {
    stubStorage({ persist: () => Promise.resolve(false) });
    expect(await requestPersistentStorage()).toBe(false);
  });

  it("is fine when the browser can't do it", async () => {
    stubStorage(undefined);
    expect(await requestPersistentStorage()).toBe(false);
  });

  it("is fine when asking fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    stubStorage({ persist: () => Promise.reject(new Error("nope")) });
    expect(await requestPersistentStorage()).toBe(false);
  });
});
