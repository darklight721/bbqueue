import { describe, expect, it } from "vite-plus/test";
import { runBackendContract } from "./backend.contract.ts";
import { runSharedClubsContract } from "./backend.clubs.contract.ts";
import { runRolesContract } from "./backend.roles.contract.ts";
import { runSessionsContract } from "./backend.sessions.contract.ts";
import { createInMemoryBackend, createInMemoryServer } from "./inMemoryBackend.ts";

runBackendContract("in-memory", createInMemoryBackend);
runSharedClubsContract("in-memory", () => {
  const backend = createInMemoryBackend();
  return { backend, setOnline: (online) => backend.setOnline(online) };
});

runRolesContract("in-memory", () => {
  const server = createInMemoryServer();
  return {
    device() {
      const backend = createInMemoryBackend({ server });
      return { backend, setOnline: (online) => backend.setOnline(online) };
    },
  };
});

runSessionsContract("in-memory", () => {
  const server = createInMemoryServer();
  return {
    device() {
      const backend = createInMemoryBackend({ server });
      return { backend, setOnline: (online) => backend.setOnline(online) };
    },
  };
});

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
