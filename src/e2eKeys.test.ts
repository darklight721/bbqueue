import { describe, expect, it } from "vite-plus/test";
import { FAKE_BACKEND_KEYS } from "./backend/localFakeBackend.ts";
import { STORAGE_KEYS } from "./storage/storage.ts";
import {
  FAKE_BACKEND_KEYS as E2E_FAKE_BACKEND_KEYS,
  STORAGE_KEYS as E2E_STORAGE_KEYS,
} from "../e2e/fixtures.ts";

/** The e2e specs keep their own copy of the storage keys, so that they never import app code. */
describe("the storage keys the e2e specs use", () => {
  it("are the app's own", () => {
    expect(E2E_STORAGE_KEYS).toEqual(STORAGE_KEYS);
  });

  it("are the local fake Backend's own", () => {
    expect(E2E_FAKE_BACKEND_KEYS).toEqual(FAKE_BACKEND_KEYS);
  });
});
