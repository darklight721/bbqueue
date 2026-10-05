import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { App } from "../../app/App.tsx";
import { createInMemoryBackend, type InMemoryBackend } from "../../backend/inMemoryBackend.ts";
import { setBackendForTests, startAccountSync, startSharedClubSync } from "../../backend/index.ts";
import { createRng, createSession } from "../../domain/engine/index.ts";
import {
  applyActiveSessionsReport,
  getSession,
  getSharedSessions,
  resetStoreForTests,
  setAccount,
  setSession,
  setWelcomeDone,
} from "../../storage/store.ts";

let backend: InMemoryBackend;
let stops: (() => void)[] = [];

beforeEach(async () => {
  localStorage.clear();
  resetStoreForTests();
  backend = createInMemoryBackend();
  const account = await backend.createAccount("Roy");
  await backend.createSharedClub({ id: "c1", name: "Riverside", players: [] });
  setBackendForTests(backend);
  setWelcomeDone();
  setAccount(account);
  stops = [startAccountSync(backend), startSharedClubSync(backend)];
  render(
    <Router hook={memoryLocation({ path: "/sessions/new", record: true }).hook}>
      <App />
    </Router>,
  );
});

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  setBackendForTests(null);
});

describe("New session with a Shared club", () => {
  async function addGuestToSave() {
    await userEvent.type(screen.getByRole("textbox", { name: "Player name" }), "Kim");
    await userEvent.click(screen.getByRole("checkbox", { name: "Save to club" }));
    await userEvent.click(screen.getByRole("button", { name: "Add guest" }));
  }

  it("offers the Club to an Organizer", () => {
    expect(screen.getByRole("option", { name: /Riverside/ })).toBeInTheDocument();
  });

  it("warns, while offline, that guests marked Save to club won't be saved to the Club", async () => {
    await addGuestToSave();
    expect(screen.queryByText(/won't be saved to Riverside/)).not.toBeInTheDocument();

    act(() => backend.setOnline(false));

    expect(screen.getByRole("status")).toHaveTextContent(
      "You're offline. Guests still join, but won't be saved to Riverside.",
    );
  });
});

describe("New session with a Shared club: starting", () => {
  async function chooseRiversideWithFour() {
    for (const name of ["Ana", "Ben", "Cat", "Dan"]) {
      await backend.addClubPlayer("c1", { id: `p-${name}`, name, skill: "intermediate" });
    }
    await userEvent.click(await screen.findByRole("button", { name: "Select all" }));
  }

  it("makes this Account the Session host, uploads nothing else, and leaves the device's own Session alone", async () => {
    const own = createSession(
      {
        name: "Local night",
        clubId: null,
        clubName: null,
        pointSystem: 21,
        plannedHours: 1,
        courts: 1,
        players: ["A", "B", "C", "D"].map((name) => ({ name, skill: "intermediate" as const })),
      },
      { now: 1, rng: createRng(1) },
    );
    setSession(own);
    await chooseRiversideWithFour();

    await userEvent.click(screen.getByRole("button", { name: "Start session" }));

    // No "End the current session?" dialog: nothing of the device's is replaced.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(getSession()).toBe(own);
    const hosted = getSharedSessions();
    expect(hosted).toHaveLength(1);
    expect(hosted[0]).toMatchObject({ clubId: "c1", hostName: "Roy" });
    expect(hosted[0]?.hostAccountId).toMatch(/^roy-/);
    // The server has it too, and the Session players kept their link back to the Club.
    let report: { sessions: { clubId: string }[] } | null = null;
    backend.observeActiveSessions((r) => (report = r))();
    expect(report!.sessions.map((s) => s.clubId)).toEqual(["c1"]);
    const players = hosted[0]!.session.players;
    expect(players.map((p) => p.clubPlayerId)).toEqual(
      expect.arrayContaining(["p-Ana", "p-Ben", "p-Cat", "p-Dan"]),
    );
    // Roy's own roster row is linked to his Account, and the Session player keeps that link.
    expect(players.find((p) => p.name === "Roy")?.accountId).toBe(hosted[0]?.hostAccountId);
    expect(players.find((p) => p.name === "Ana")).not.toHaveProperty("accountId");
  });

  it("needs a connection: the Start button is off and says why", async () => {
    await chooseRiversideWithFour();

    act(() => backend.setOnline(false));

    expect(screen.getByRole("button", { name: "Start session" })).toBeDisabled();
    expect(
      screen.getByText(/You're offline\. A shared club's session needs a connection/),
    ).toBeInTheDocument();
  });

  it("offers Open active session instead of a second Start when the Club already has one", async () => {
    await chooseRiversideWithFour();
    const running = createSession(
      {
        name: "Already going",
        clubId: "c1",
        clubName: "Riverside",
        pointSystem: 21,
        plannedHours: 1,
        courts: 1,
        players: ["A", "B", "C", "D"].map((name) => ({ name, skill: "intermediate" as const })),
      },
      { now: 1, rng: createRng(1) },
    );

    act(() =>
      applyActiveSessionsReport({
        sessions: [
          {
            clubId: "c1",
            session: running,
            hostAccountId: "ana-2222",
            hostName: "Ana",
            updatedAt: 1,
          },
        ],
        unknown: [],
      }),
    );

    expect(screen.queryByRole("button", { name: "Start session" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open active session" })).toHaveAttribute(
      "href",
      `/sessions/${running.id}`,
    );
    expect(screen.getByText("This club already has an active session")).toBeInTheDocument();
  });

  it("says so when the server turns the start down because the Club's session started meanwhile", async () => {
    await chooseRiversideWithFour();
    // Somebody starts it on the server, and this device hasn't heard of it yet.
    const taken = createSession(
      {
        name: "Theirs",
        clubId: "c1",
        clubName: "Riverside",
        pointSystem: 21,
        plannedHours: 1,
        courts: 1,
        players: ["A", "B", "C", "D"].map((name) => ({ name, skill: "intermediate" as const })),
      },
      { now: 1, rng: createRng(1) },
    );
    await backend.startSharedSession("c1", taken);

    await userEvent.click(screen.getByRole("button", { name: "Start session" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This club already has an active session.",
    );
    expect(getSharedSessions()).toEqual([]);
  });
});
