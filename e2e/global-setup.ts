import { clearEmulator } from "../src/test/emulatorAdmin.ts";

/** Every run starts with an empty emulator (the web servers are already up by now). */
export default async function globalSetup() {
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      await clearEmulator();
      return;
    } catch (error) {
      if (Date.now() > deadline) {
        console.warn("Couldn't clear the Firebase emulator:", error);
        return;
      }
      // Auth and Firestore come up separately; give the slower one a moment.
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}
