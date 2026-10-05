import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { App } from "../../app/App.tsx";
import { BackendError } from "../../backend/backend.ts";
import {
  createInMemoryBackend,
  createInMemoryServer,
  type InMemoryBackend,
} from "../../backend/inMemoryBackend.ts";
import {
  setBackendForTests,
  startAccountSync,
  startActiveSessionSync,
  startSharedClubSync,
} from "../../backend/index.ts";
import { createRng, createSession } from "../../domain/engine/index.ts";
import type { Account, Club, EndedSession } from "../../domain/types.ts";
import {
  addEndedSession,
  getAccount,
  getClubs,
  getEndedSessions,
  getLocalClubs,
  getSession,
  getSharedClubs,
  getSharedSessions,
  resetStoreForTests,
  setAccount,
  setLocalClubs,
  setSession,
  setWelcomeDone,
} from "../../storage/store.ts";

let roy: InMemoryBackend;
let ana: InMemoryBackend;
let royAccount: Account;
let anaAccount: Account;
let stops: (() => void)[] = [];

const garage: Club = {
  id: "garage",
  name: "Garage",
  kind: "local",
  players: [{ id: "g1", name: "Gus", skill: "beginner" }],
};

function renderAt(path: string) {
  const location = memoryLocation({ path, record: true });
  render(
    <Router hook={location.hook}>
      <App />
    </Router>,
  );
  return { current: () => location.history.at(-1) };
}

/** Roy is signed in on this device, with a Local club "Garage". Ana is somebody else on the server. */
async function setup() {
  const server = createInMemoryServer();
  roy = createInMemoryBackend({ server });
  ana = createInMemoryBackend({ server });
  royAccount = await roy.createAccount("Roy Smith");
  anaAccount = await ana.createAccount("Ana Bell");
  setBackendForTests(roy);
  setWelcomeDone();
  setAccount(royAccount);
  setLocalClubs([garage]);
}

function sync() {
  stops = [startAccountSync(roy), startSharedClubSync(roy), startActiveSessionSync(roy)];
}

beforeEach(() => {
  localStorage.clear();
  resetStoreForTests();
});

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  setBackendForTests(null);
  vi.restoreAllMocks();
});

const deleteButton = () => screen.getByRole("button", { name: "Delete Account" });

async function confirmDelete() {
  await userEvent.click(deleteButton());
  const dialog = screen.getByRole("dialog", { name: "Delete your Account?" });
  await userEvent.click(within(dialog).getByRole("button", { name: "Delete Account" }));
}

describe("Delete Account", () => {
  it("lists what will be deleted and what will be unlinked before asking", async () => {
    await setup();
    // Solo: only Roy. Duo: Roy and Ana, both Organizers. A past session in Solo.
    await roy.createSharedClub({
      id: "solo",
      name: "Solo",
      players: [{ id: "c", name: "Cat", skill: "beginner" }],
    });
    await roy.createSharedClub({
      id: "duo",
      name: "Duo",
      players: [{ id: "a", name: "Ana", skill: "beginner" }],
    });
    await roy.linkClubPlayer("duo", "a", anaAccount.accountId, "organizer");
    sync();
    const ended: EndedSession = {
      id: "e1",
      name: "Night",
      clubId: "solo",
      clubName: "Solo",
      pointSystem: 21,
      startedAt: 1,
      endedAt: 2,
      players: [],
      matches: [],
    };
    addEndedSession(ended);
    renderAt("/account");

    await userEvent.click(deleteButton());

    const dialog = screen.getByRole("dialog", { name: "Delete your Account?" });
    const deleted = within(dialog).getByRole("region", {
      name: "Shared clubs that will be deleted",
    });
    expect(deleted).toHaveTextContent("Solo");
    expect(deleted).toHaveTextContent("1 past session");
    expect(
      within(dialog).getByRole("region", { name: "Clubs you'll be unlinked from" }),
    ).toHaveTextContent("Duo");
    expect(dialog).toHaveTextContent("Your local clubs and the sessions on this device stay.");
    // Cancel changes nothing.
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(getAccount()).toEqual(royAccount);
  });

  it("with nothing shared: signs the device out, keeps Local clubs, and the avatar is the default again", async () => {
    await setup();
    sync();
    const own = createSession(
      {
        name: "Garage night",
        clubId: "garage",
        clubName: "Garage",
        pointSystem: 21,
        plannedHours: 1,
        courts: 1,
        players: ["A", "B", "C", "D"].map((name) => ({ name, skill: "intermediate" as const })),
      },
      { now: 1, rng: createRng(1) },
    );
    setSession(own);
    const location = renderAt("/account");

    await userEvent.click(deleteButton());
    expect(screen.getByRole("dialog")).toHaveTextContent("No shared clubs are affected.");
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Delete Account" }),
    );

    await vi.waitFor(() => expect(getAccount()).toBeNull());
    expect(location.current()).toBe("/");
    expect(screen.getByRole("link", { name: "Account settings, no Account" })).toBeInTheDocument();
    expect(getLocalClubs()).toEqual([garage]);
    expect(getSession()).toBe(own);
    expect(await roy.getCurrentAccount()).toBeNull();
  });

  it("deletes the Shared clubs it is alone on, unlinks elsewhere and clears Shared club data from the device", async () => {
    await setup();
    await roy.createSharedClub({ id: "solo", name: "Solo", players: [] });
    await roy.createSharedClub({
      id: "duo",
      name: "Duo",
      players: [{ id: "a", name: "Ana", skill: "beginner" }],
    });
    await roy.linkClubPlayer("duo", "a", anaAccount.accountId, "organizer");
    sync();
    const ended = (id: string, clubId: string | null): EndedSession => ({
      id,
      name: id,
      clubId,
      clubName: null,
      pointSystem: 21,
      startedAt: 1,
      endedAt: 2,
      players: [],
      matches: [],
    });
    addEndedSession(ended("mine", null));
    addEndedSession(ended("hosted", "solo"));
    renderAt("/account");
    await vi.waitFor(() => expect(getSharedClubs()).toHaveLength(2));

    await confirmDelete();

    await vi.waitFor(() => expect(getAccount()).toBeNull());
    expect(getSharedClubs()).toEqual([]);
    expect(getClubs().map((club) => club.id)).toEqual(["garage"]);
    // The device's own Ended sessions stay, including one it hosted for a Club that is gone.
    expect(
      getEndedSessions()
        .map((e) => e.id)
        .sort(),
    ).toEqual(["hosted", "mine"]);
    // On the server: Solo is gone and Roy's row in Duo is unlinked, on the roster.
    let seen: Club[] = [];
    ana.observeSharedClubs((clubs) => (seen = clubs))();
    expect(seen.map((club) => club.id)).toEqual(["duo"]);
    expect(seen[0]?.players).toHaveLength(2);
    expect(seen[0]?.players.flatMap((row) => (row.link ? [row.link.accountId] : []))).toEqual([
      anaAccount.accountId,
    ]);
  });

  it("is blocked while this Account is the only Organizer of a Club with other people, naming the Club", async () => {
    await setup();
    await roy.createSharedClub({
      id: "stuck",
      name: "Stuck",
      players: [{ id: "a", name: "Ana", skill: "beginner" }],
    });
    await roy.linkClubPlayer("stuck", "a", anaAccount.accountId, "player");
    sync();
    renderAt("/account");
    await vi.waitFor(() => expect(getSharedClubs()).toHaveLength(1));

    expect(deleteButton()).toBeDisabled();
    expect(screen.getByText("You're the only Organizer of:")).toBeInTheDocument();
    expect(screen.getByText("Stuck")).toBeInTheDocument();
    expect(screen.getByText("Make someone else an Organizer first.")).toBeInTheDocument();
  });

  it("is turned off offline, with the reason", async () => {
    await setup();
    sync();
    renderAt("/account");

    act(() => roy.setOnline(false));

    expect(deleteButton()).toBeDisabled();
    expect(
      screen.getByText("You're offline. Deleting your Account needs a connection."),
    ).toBeInTheDocument();
  });

  it("a failed deletion changes nothing on the device and says so", async () => {
    await setup();
    await roy.createSharedClub({ id: "solo", name: "Solo", players: [] });
    sync();
    renderAt("/account");
    await vi.waitFor(() => expect(getSharedClubs()).toHaveLength(1));
    vi.spyOn(roy, "deleteAccount").mockRejectedValue(new BackendError("failed"));

    await confirmDelete();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't delete your Account. Nothing on this device changed. Try again.",
    );
    expect(getAccount()).toEqual(royAccount);
    expect(getSharedClubs()).toHaveLength(1);
  });

  it("keeps a Session this Account hosted in the device's empty Session slot, and leaves it on the server for somebody to take over", async () => {
    await setup();
    await roy.createSharedClub({
      id: "duo",
      name: "Duo",
      players: [{ id: "a", name: "Ana", skill: "beginner" }],
    });
    await roy.linkClubPlayer("duo", "a", anaAccount.accountId, "organizer");
    const running = createSession(
      {
        name: "Duo night",
        clubId: "duo",
        clubName: "Duo",
        pointSystem: 21,
        plannedHours: 1,
        courts: 1,
        players: ["A", "B", "C", "D"].map((name) => ({ name, skill: "intermediate" as const })),
      },
      { now: 1, rng: createRng(1) },
    );
    await roy.startSharedSession("duo", running);
    sync();
    renderAt("/account");
    await vi.waitFor(() => expect(getSharedSessions()).toHaveLength(1));

    await userEvent.click(deleteButton());
    expect(
      within(screen.getByRole("dialog")).getByRole("region", { name: "Sessions you host" }),
    ).toHaveTextContent("Duo");
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Delete Account" }),
    );

    await vi.waitFor(() => expect(getAccount()).toBeNull());
    expect(getSession()?.id).toBe(running.id);
    expect(getSharedSessions()).toEqual([]);
    expect((await ana.getActiveSession("duo"))?.session.id).toBe(running.id);
    expect((await ana.takeOverSession("duo")).hostAccountId).toBe(anaAccount.accountId);
  });
});
