// Starts the Firebase emulators (Auth + Firestore) and stops them cleanly when asked to.
//
// Playwright stops its web servers with SIGTERM, which `firebase emulators:start` does not
// answer by stopping the Java Firestore emulator, leaving it running and blocking the next run.
// This wrapper turns SIGTERM into the SIGINT the Firebase CLI does handle.
//
// Needs Java on PATH (see the README).
import { spawn } from "node:child_process";

const child = spawn(
  "pnpm",
  ["exec", "firebase", "emulators:start", "--only", "auth,firestore", "--project", "demo-bbqueue"],
  { stdio: "inherit" },
);

for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) {
  process.on(signal, () => child.kill("SIGINT"));
}
child.on("exit", (code) => process.exit(code ?? 0));
