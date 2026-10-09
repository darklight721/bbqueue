import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { App } from "../../app/App.tsx";
import { BackendError } from "../../backend/backend.ts";
import { createInMemoryBackend, type InMemoryBackend } from "../../backend/inMemoryBackend.ts";
import { setBackendForTests } from "../../backend/index.ts";
import type { Club, EndedSession, Role } from "../../domain/types.ts";
import {
  addEndedSession,
  applyEndedSessionsReport,
  getEndedSessions,
  resetStoreForTests,
  setAccount,
  setLocalClubs,
  setSharedClubs,
  setWelcomeDone,
} from "../../storage/store.ts";

function ended(
  id: string,
  name: string,
  endedAt: number,
  clubId: string | null = null,
): EndedSession {
  return {
    id,
    name,
    clubId,
    clubName: null,
    pointSystem: 21,
    startedAt: endedAt - 3_600_000,
    endedAt,
    players: ["a", "b", "c", "d"].map((p) => ({
      id: p,
      name: p.toUpperCase(),
      skill: "beginner",
      clubPlayerId: null,
    })),
    matches: [
      {
        number: 1,
        courtNumber: 1,
        teams: [
          ["a", "b"],
          ["c", "d"],
        ],
        target: 21,
        startedAt: endedAt - 3_000_000,
        endedAt: endedAt - 2_000_000,
        score: [21, 10],
      },
    ],
  };
}

function renderAt(path: string) {
  const location = memoryLocation({ path, record: true });
  render(
    <Router hook={location.hook}>
      <App />
    </Router>,
  );
  return { history: () => [...location.history] };
}

const deleteButton = () => screen.getByRole("button", { name: "Delete session" });
const dialog = () => screen.getByRole("dialog", { name: "Delete this session?" });
const ids = () => getEndedSessions().map((session) => session.id);

const T = 2_000_000_000_000;
const garage: Club = { id: "c2", name: "Garage", kind: "local", players: [] };

describe("Delete session: no Club or a Local club", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStoreForTests();
    setWelcomeDone();
    setLocalClubs([garage]);
    addEndedSession(ended("n", "Guest night", T));
    addEndedSession(ended("g1", "Garage one", T - 2_000));
    addEndedSession(ended("g2", "Garage two", T - 1_000, "c2"));
    addEndedSession(ended("g3", "Garage three", T - 3_000, "c2"));
  });

  it("asks first; Keep leaves it alone", async () => {
    const { history } = renderAt("/sessions/n");
    await userEvent.click(deleteButton());
    expect(dialog()).toHaveAccessibleDescription(
      "'Guest night' and its matches will be gone for good.",
    );
    await userEvent.click(within(dialog()).getByRole("button", { name: "Keep" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(ids()).toContain("n");
    expect(history().at(-1)).toBe("/sessions/n");
  });

  it("deletes it and goes back to the plain list, in place of the details", async () => {
    const { history } = renderAt("/sessions/n");
    await userEvent.click(deleteButton());
    await userEvent.click(within(dialog()).getByRole("button", { name: "Delete" }));

    expect(ids()).not.toContain("n");
    expect(history()).toEqual(["/sessions"]);
    expect(screen.getByRole("heading", { level: 1, name: "Past sessions" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Guest night" })).not.toBeInTheDocument();
  });

  it("goes back to the filtered list it was opened from", async () => {
    const { history } = renderAt("/sessions?club=c2");
    await userEvent.click(screen.getByRole("link", { name: "Garage two" }));
    await userEvent.click(deleteButton());
    await userEvent.click(within(dialog()).getByRole("button", { name: "Delete" }));

    // The details' entry is replaced, so Back doesn't land on the deleted session.
    expect(history()).toEqual(["/sessions?club=c2", "/sessions?club=c2"]);
    expect(screen.getByRole("combobox", { name: "Club" })).toHaveValue("c2");
    expect(screen.queryByRole("link", { name: "Garage two" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Garage three" })).toBeInTheDocument();
  });

  it("goes back to the Club's own list it was opened from", async () => {
    const { history } = renderAt("/clubs/c2/sessions");
    await userEvent.click(screen.getByRole("link", { name: "Garage two" }));
    await userEvent.click(deleteButton());
    await userEvent.click(within(dialog()).getByRole("button", { name: "Delete" }));

    expect(history()).toEqual(["/clubs/c2/sessions", "/clubs/c2/sessions"]);
    expect(screen.queryByRole("link", { name: "Garage two" })).not.toBeInTheDocument();
  });

  it("works offline: a Local club's session never needs the server", async () => {
    const backend = createInMemoryBackend();
    setBackendForTests(backend);
    backend.setOnline(false);
    try {
      renderAt("/sessions/g2");
      expect(deleteButton()).toBeEnabled();
      expect(screen.queryByText("Deleting needs a connection.")).not.toBeInTheDocument();
      await userEvent.click(deleteButton());
      await userEvent.click(within(dialog()).getByRole("button", { name: "Delete" }));
      expect(ids()).not.toContain("g2");
    } finally {
      setBackendForTests(null);
    }
  });
});

describe("Delete session: a Shared club", () => {
  let backend: InMemoryBackend;
  const ana = { accountId: "ana-2222", name: "Ana" };
  const riverside = (role: Role): Club => ({
    id: "c1",
    name: "Riverside",
    kind: "shared",
    players: [{ id: "p-ana", name: "Ana", skill: "beginner", link: { ...ana, role } }],
  });

  function seed(role: Role) {
    setSharedClubs([riverside(role)]);
    applyEndedSessionsReport({
      sessions: [ended("s1", "Thursday at Riverside", T, "c1")],
      clubIds: ["c1"],
    });
  }

  beforeEach(() => {
    localStorage.clear();
    resetStoreForTests();
    backend = createInMemoryBackend();
    setBackendForTests(backend);
    setWelcomeDone();
    setAccount(ana);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setBackendForTests(null);
  });

  it("isn't offered to a Player", () => {
    seed("player");
    renderAt("/sessions/s1");
    expect(screen.getByRole("heading", { level: 1, name: "Thursday at Riverside" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Delete session" })).not.toBeInTheDocument();
  });

  it("tells an Organizer everyone on the Club loses it, deletes it on the server, then here", async () => {
    seed("organizer");
    const remove = vi.spyOn(backend, "deleteEndedSession").mockResolvedValue(undefined);
    const { history } = renderAt("/sessions/s1");

    await userEvent.click(deleteButton());
    expect(dialog()).toHaveAccessibleDescription(
      "'Thursday at Riverside' and its matches will be gone for good. Everyone on Riverside loses it too.",
    );
    await userEvent.click(within(dialog()).getByRole("button", { name: "Delete" }));

    expect(remove).toHaveBeenCalledWith("c1", "s1");
    await vi.waitFor(() => expect(history()).toEqual(["/sessions"]));
    expect(ids()).not.toContain("s1");
  });

  it("shows it's busy while the server answers, and on failure stays with an error and keeps it", async () => {
    seed("organizer");
    let fail!: (error: unknown) => void;
    vi.spyOn(backend, "deleteEndedSession").mockReturnValue(
      new Promise((_, reject) => (fail = reject)),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { history } = renderAt("/sessions/s1");

    await userEvent.click(deleteButton());
    await userEvent.click(within(dialog()).getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("button", { name: "Deleting…" })).toBeDisabled();

    await act(async () => fail(new BackendError("failed")));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't delete the session. Please try again.",
    );
    expect(deleteButton()).toBeEnabled();
    expect(ids()).toContain("s1");
    expect(history()).toEqual(["/sessions/s1"]);
  });

  it("says why when the server refuses", async () => {
    seed("organizer");
    vi.spyOn(backend, "deleteEndedSession").mockRejectedValue(new BackendError("forbidden"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderAt("/sessions/s1");

    await userEvent.click(deleteButton());
    await userEvent.click(within(dialog()).getByRole("button", { name: "Delete" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Only Organizers can delete this club's sessions.",
    );
    expect(ids()).toContain("s1");
  });

  it("needs a connection: offline, the button is off and says why", () => {
    seed("organizer");
    renderAt("/sessions/s1");
    expect(deleteButton()).toBeEnabled();

    act(() => backend.setOnline(false));

    expect(deleteButton()).toBeDisabled();
    expect(deleteButton()).toHaveAccessibleDescription("Deleting needs a connection.");

    act(() => backend.setOnline(true));
    expect(deleteButton()).toBeEnabled();
  });
});
