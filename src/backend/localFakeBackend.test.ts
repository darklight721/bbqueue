import { beforeEach, describe, expect, it } from "vite-plus/test";
import { runBackendContract } from "./backend.contract.ts";
import { FAKE_BACKEND_KEYS, createLocalFakeBackend } from "./localFakeBackend.ts";

beforeEach(() => {
  localStorage.clear();
});

runBackendContract("local fake", ({ online, ...options }) =>
  createLocalFakeBackend({
    ...options,
    online: { get: () => online, subscribe: () => () => {} },
  }),
);

describe("local fake Backend", () => {
  it("keeps the Account in localStorage, so it survives a reload", async () => {
    const account = await createLocalFakeBackend().createAccount("Roy");

    expect(JSON.parse(localStorage.getItem(FAKE_BACKEND_KEYS.account)!)).toEqual(account);
    expect(await createLocalFakeBackend().getCurrentAccount()).toEqual(account);
  });

  it("keeps Account IDs reserved across reloads", async () => {
    const { accountId } = await createLocalFakeBackend().createAccount("Roy");

    expect(JSON.parse(localStorage.getItem(FAKE_BACKEND_KEYS.accountIds)!)).toEqual([accountId]);
  });

  it("follows navigator.onLine by default", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    try {
      const backend = createLocalFakeBackend();
      expect(backend.isOnline()).toBe(false);
      await expect(backend.createAccount("Roy")).rejects.toMatchObject({ code: "offline" });
    } finally {
      Reflect.deleteProperty(navigator, "onLine");
    }
    expect(createLocalFakeBackend().isOnline()).toBe(true);
  });
});
