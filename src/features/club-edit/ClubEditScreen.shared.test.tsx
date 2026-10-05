import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { App } from "../../app/App.tsx";
import { createInMemoryBackend, type InMemoryBackend } from "../../backend/inMemoryBackend.ts";
import { setBackendForTests, startAccountSync, startSharedClubSync } from "../../backend/index.ts";
import type { Club } from "../../domain/types.ts";
import { createRng, createSession } from "../../domain/engine/index.ts";
import type { Session } from "../../domain/types.ts";
import {
  applyActiveSessionsReport,
  getClubs,
  resetStoreForTests,
  setAccount,
  setSession,
  setWelcomeDone,
} from "../../storage/store.ts";

function renderAt(path: string) {
  const location = memoryLocation({ path, record: true });
  render(
    <Router hook={location.hook}>
      <App />
    </Router>,
  );
}

let backend: InMemoryBackend;
let stops: (() => void)[] = [];

async function startWith(options: { signedIn: boolean }) {
  backend = createInMemoryBackend();
  setBackendForTests(backend);
  setWelcomeDone();
  if (options.signedIn) setAccount(await backend.createAccount("Roy Smith"));
  stops = [startAccountSync(backend), startSharedClubSync(backend)];
}

beforeEach(() => {
  localStorage.clear();
  resetStoreForTests();
});

afterEach(() => {
  for (const stop of stops) stop();
  stops = [];
  setBackendForTests(null);
});

/** A Session on this device with no Club. */
function deviceSession(): Session {
  return createSession(
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
}

const nameInputs = () => screen.getAllByRole("textbox", { name: "Player name" });

describe("Club screens with Accounts", () => {
  it("signed in: a new Club is a Shared club with me on the roster as Organizer", async () => {
    await startWith({ signedIn: true });
    const user = userEvent.setup();
    renderAt("/clubs/new");

    await user.type(screen.getByRole("textbox", { name: "Club name" }), "Tuesday");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("heading", { level: 1, name: "Clubs" })).toBeInTheDocument();
    const [club] = getClubs();
    expect(club).toMatchObject({ name: "Tuesday", kind: "shared" });
    expect(club?.players).toEqual([
      expect.objectContaining({
        name: "Roy Smith",
        skill: "intermediate",
        link: { accountId: expect.stringMatching(/^roy-/), role: "organizer" },
      }),
    ]);
    // Shared clubs aren't "this device only".
    expect(screen.getByRole("link", { name: /Tuesday/ })).not.toHaveTextContent("This device only");

    await user.click(screen.getByRole("link", { name: /Tuesday/ }));
    expect(nameInputs().map((input) => (input as HTMLInputElement).value)).toEqual(["Roy Smith"]);
    expect(screen.queryByRole("button", { name: "Remove Roy Smith" })).not.toBeInTheDocument();
  });

  it("signed out: a new Club is a Local club labelled This device only, and stays Local after signing up", async () => {
    await startWith({ signedIn: false });
    const user = userEvent.setup();
    renderAt("/clubs/new");

    await user.type(screen.getByRole("textbox", { name: "Club name" }), "Tuesday");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(getClubs()).toEqual([
      { id: expect.any(String), name: "Tuesday", kind: "local", players: [] },
    ]);
    expect(screen.getByRole("link", { name: /Tuesday/ })).toHaveTextContent("This device only");

    await act(async () => setAccount(await backend.createAccount("Roy")));

    expect(getClubs().map((club) => club.kind)).toEqual(["local"]);
    await user.click(screen.getByRole("link", { name: /Tuesday/ }));
    expect(screen.getByText("This device only")).toBeInTheDocument();
  });

  it("without a backend nothing says This device only", async () => {
    setWelcomeDone();
    const user = userEvent.setup();
    renderAt("/clubs/new");
    await user.type(screen.getByRole("textbox", { name: "Club name" }), "Tuesday");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("link", { name: /Tuesday/ })).not.toHaveTextContent("This device only");
    expect(getClubs()[0]?.kind).toBe("local");
  });

  describe("editing a Shared club", () => {
    let club: Club;

    beforeEach(async () => {
      await startWith({ signedIn: true });
      club = await backend.createSharedClub({
        id: "c1",
        name: "Tuesday",
        players: [{ id: "p-ana", name: "Ana", skill: "beginner" }],
      });
    });

    it("sends name and Skill level changes through the Backend", async () => {
      const user = userEvent.setup();
      renderAt("/clubs/c1");

      await user.selectOptions(
        screen.getByRole("combobox", { name: "Skill level for Ana" }),
        "advanced",
      );
      await user.clear(screen.getByRole("textbox", { name: "Club name" }));
      await user.type(screen.getByRole("textbox", { name: "Club name" }), "Friday");
      await user.click(screen.getByRole("button", { name: "Save" }));

      const [saved] = getClubs();
      expect(saved?.name).toBe("Friday");
      expect(saved?.players.find((p) => p.id === "p-ana")?.skill).toBe("advanced");
      expect(saved?.players.find((p) => p.id === club.players[0]!.id)).toBeDefined();
    });

    it("adds a row through the Backend", async () => {
      const user = userEvent.setup();
      renderAt("/clubs/c1");

      await user.click(screen.getByRole("button", { name: "Add player" }));
      await user.type(nameInputs().at(-1)!, "Ben");
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(getClubs()[0]?.players.map((p) => p.name)).toContain("Ben");
    });

    it("offline: Skill level changes still save, adding a row is turned off with the reason", async () => {
      const user = userEvent.setup();
      renderAt("/clubs/c1");

      act(() => backend.setOnline(false));
      expect(screen.getByRole("link", { name: "New session" })).toHaveAccessibleDescription(
        "Needs a connection to start",
      );
      expect(screen.getByRole("button", { name: "Add player" })).toBeDisabled();
      expect(
        screen.getByText("You're offline. Adding players needs a connection."),
      ).toBeInTheDocument();

      await user.selectOptions(
        screen.getByRole("combobox", { name: "Skill level for Ana" }),
        "advanced",
      );
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(getClubs()[0]?.players.find((p) => p.id === "p-ana")?.skill).toBe("advanced");
    });

    it("removes a row but never the Organizer's own", async () => {
      const user = userEvent.setup();
      renderAt("/clubs/c1");

      await user.click(screen.getByRole("button", { name: "Remove Ana" }));
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(getClubs()[0]?.players.map((p) => p.name)).toEqual(["Roy Smith"]);
    });

    it("offers New session, which doesn't replace the device's own Session", () => {
      setSession(deviceSession());
      renderAt("/clubs/c1");

      const link = screen.getByRole("link", { name: "New session" });
      expect(link).toHaveAttribute("href", "/sessions/new?club=c1");
      expect(link).toHaveTextContent("Pick players and courts");
    });

    it("offers Open active session instead once the Club has one, whoever hosts it", () => {
      const running = { ...deviceSession(), id: "shared-1", name: "Thursday", clubId: "c1" };
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
      });
      renderAt("/clubs/c1");

      expect(screen.queryByRole("link", { name: "New session" })).not.toBeInTheDocument();
      const link = screen.getByRole("link", { name: "Open active session" });
      expect(link).toHaveAttribute("href", "/sessions/shared-1");
      expect(link).toHaveAccessibleDescription("Thursday · Host: Ana");
    });

    it("deletes the Club", async () => {
      const user = userEvent.setup();
      renderAt("/clubs/c1");

      await user.click(screen.getByRole("button", { name: "Delete club" }));
      await user.click(screen.getByRole("button", { name: "Delete" }));

      expect(getClubs()).toEqual([]);
    });
  });
});
