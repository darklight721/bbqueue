import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { App } from "../../../app/App.tsx";
import { createInMemoryBackend } from "../../../backend/inMemoryBackend.ts";
import {
  setBackendForTests,
  startAccountSync,
  startSharedClubSync,
} from "../../../backend/index.ts";
import { createRng, createSession } from "../../../domain/engine/index.ts";
import {
  getSession,
  resetStoreForTests,
  setAccount,
  setSession,
  setWelcomeDone,
} from "../../../storage/store.ts";

let stops: (() => void)[] = [];

beforeEach(() => {
  localStorage.clear();
  resetStoreForTests();
});

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  setBackendForTests(null);
});

describe("Adding a player to a running Session of a Shared club", () => {
  async function start(online: boolean) {
    const backend = createInMemoryBackend({ online });
    // The Account is created while online, then the connection goes (or not).
    backend.setOnline(true);
    const account = await backend.createAccount("Roy");
    await backend.createSharedClub({ id: "club-1", name: "Riverside", players: [] });
    backend.setOnline(online);
    setBackendForTests(backend);
    setWelcomeDone();
    setAccount(account);
    stops = [startAccountSync(backend), startSharedClubSync(backend)];

    const session = createSession(
      {
        name: "Thursday",
        clubId: "club-1",
        clubName: "Riverside",
        pointSystem: 21,
        plannedHours: 2,
        courts: 1,
        players: ["Ana", "Ben", "Cat", "Dan"].map((name) => ({
          name,
          skill: "intermediate" as const,
        })),
      },
      { now: 1, rng: createRng(5) },
    );
    setSession(session);
    render(
      <Router hook={memoryLocation({ path: `/sessions/${session.id}`, record: true }).hook}>
        <App />
      </Router>,
    );
    return backend;
  }

  async function addKimToClub() {
    await userEvent.type(screen.getByRole("textbox", { name: "Player name" }), "Kim");
    await userEvent.click(screen.getByRole("checkbox", { name: "Save to club" }));
    await userEvent.click(screen.getByRole("button", { name: "Add player" }));
  }

  it("online: Kim joins and is saved to the Club", async () => {
    const backend = await start(true);

    await addKimToClub();

    expect(getSession()!.players.some((p) => p.name === "Kim")).toBe(true);
    const clubs = await new Promise<{ players: { name: string }[] }[]>((resolve) =>
      backend.observeSharedClubs(resolve)(),
    );
    expect(clubs[0]?.players.map((p) => p.name)).toContain("Kim");
    expect(screen.queryByText(/wasn't saved to Riverside/)).not.toBeInTheDocument();
  });

  it("offline: Kim still joins, and a notice says she wasn't saved to the Club", async () => {
    await start(false);

    await addKimToClub();

    expect(getSession()!.players.some((p) => p.name === "Kim")).toBe(true);
    expect(
      await screen.findByText(
        "Kim joined, but wasn't saved to Riverside: that needs a connection.",
      ),
    ).toBeInTheDocument();
  });
});
