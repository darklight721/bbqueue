/**
 * Where the Firebase emulators listen (see `firebase.json`) and the config the app uses against
 * them. No real project is needed: `demo-*` project ids never touch the cloud. Mirrored in the
 * e2e helpers (`e2e/emulator.ts`), which can't import app code.
 */
export const FIREBASE_EMULATOR = {
  projectId: "demo-bbqueue",
  authUrl: "http://127.0.0.1:9099",
  firestoreHost: "127.0.0.1",
  firestorePort: 8085,
} as const;

/** Firebase config for the emulators. The values only have to be present. */
export const FIREBASE_EMULATOR_CONFIG = {
  apiKey: "demo-api-key",
  appId: "demo-app-id",
  projectId: FIREBASE_EMULATOR.projectId,
  authDomain: `${FIREBASE_EMULATOR.projectId}.firebaseapp.com`,
} as const;
