import { describe, expect, it } from "vite-plus/test";
import { firebaseConfigFromEnv } from "./firebaseBackendLazy.ts";

describe("firebaseConfigFromEnv", () => {
  it("needs the API key, project id and app id", () => {
    expect(firebaseConfigFromEnv({})).toBeNull();
    expect(
      firebaseConfigFromEnv({ VITE_FIREBASE_API_KEY: "k", VITE_FIREBASE_PROJECT_ID: "p" }),
    ).toBeNull();
  });

  it("builds the config, defaulting the auth domain from the project", () => {
    expect(
      firebaseConfigFromEnv({
        VITE_FIREBASE_API_KEY: "k",
        VITE_FIREBASE_PROJECT_ID: "p",
        VITE_FIREBASE_APP_ID: "a",
      }),
    ).toMatchObject({
      apiKey: "k",
      projectId: "p",
      appId: "a",
      authDomain: "p.firebaseapp.com",
    });
  });
});
