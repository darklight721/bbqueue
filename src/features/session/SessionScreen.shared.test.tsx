import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { App } from "../../app/App.tsx";
import { createInMemoryBackend, type InMemoryBackend } from "../../backend/inMemoryBackend.ts";
import { setBackendForTests } from "../../backend/index.ts";
import {
  addQueue,
  createRng,
  createSession,
  setQueueSlot,
  startMatch,
} from "../../domain/engine/index.ts";
import type { ActiveSession, Session } from "../../domain/types.ts";
import { setFlash } from "../../storage/flash.ts";
import {
  applyActiveSessionsReport,
  getEndedSessions,
  getSession,
  getSharedSessions,
  resetStoreForTests,
  setAccount,
  setLocalClubs,
  setSession,
  setSharedClubs,
  setWelcomeDone,
} from "../../storage/store.ts";

const T0 = Date.UTC(2026, 9, 1, 18, 0, 0);
const NAMES = ["Ana", "Ben", "Cat", "Dan", "Eve", "Fay", "Gus", "Hal"];

/** Court 1 busy since T0, Court 2 idle with a Lineup, and a Queue with two places filled. */
function runningSession(): Session {
  let id = 0;
  const created = createSession(
    {
      name: "Thursday",
      clubId: "c1",
      clubName: "Riverside",
      pointSystem: 21,
      plannedHours: 2,
      courts: 2,
      players: NAMES.map((name) => ({ name, skill: "intermediate" as const })),
    },
    { now: T0, rng: createRng(7), newId: () => `id-${++id}` },
  );
  const started = startMatch(created, created.courts[0]!.id, { now: T0, rng: createRng(3) });
  if (!started.ok) throw new Error(started.reason);
  const withQueue = addQueue(started.session, { now: T0, rng: createRng(1), newId: () => "q-1" });
  const filled = setQueueSlot(withQueue, "q-1", 0, 0, withQueue.players[0]!.id);
  if (!filled.ok) throw new Error(filled.reason);
  return filled.session;
}

function sharedEntry(session: Session, overrides: Partial<ActiveSession> = {}): ActiveSession {
  return {
    clubId: "c1",
    session,
    hostAccountId: "roy-7k3f",
    hostName: "Roy",
    updatedAt: T0,
    ...overrides,
  };
}

function renderAt(path: string) {
  const location = memoryLocation({ path, record: true });
  render(
    <Router hook={location.hook}>
      <App />
    </Router>,
  );
  return { current: () => location.history.at(-1) };
}

const court = (n: number) => within(screen.getByRole("region", { name: `Court ${n}` }));

function viewAs(accountId: string, entry: ActiveSession) {
  setAccount({ accountId, name: accountId });
  applyActiveSessionsReport({ sessions: [entry], unknown: [] });
}

beforeEach(() => {
  localStorage.clear();
  resetStoreForTests();
  setFlash(null);
  setWelcomeDone();
  setSharedClubs([{ id: "c1", name: "Riverside", kind: "shared", players: [] }]);
});

afterEach(() => {
  vi.useRealTimers();
  setBackendForTests(null);
});

describe("The Session screen for somebody who isn't the Session host", () => {
  it("opens a Shared club's Active session by its id, with the host named", () => {
    const session = runningSession();
    viewAs("ana-2222", sharedEntry(session));

    renderAt(`/sessions/${session.id}`);

    expect(screen.getByRole("heading", { level: 1, name: "Thursday" })).toBeInTheDocument();
    expect(screen.getByText("Watching. Roy runs this session.")).toBeInTheDocument();
    // Courts, Lineups, Queues and Players are all there to look at.
    expect(court(1).getByText("Playing")).toBeInTheDocument();
    expect(court(2).getByText("Lineup")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Queue 1" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Session players" })).toBeInTheDocument();
  });

  it("hides or turns off every control that changes the Session", () => {
    const session = runningSession();
    viewAs("ana-2222", sharedEntry(session));
    renderAt(`/sessions/${session.id}`);

    const buttons = screen
      .queryAllByRole("button")
      .map((b) => b.getAttribute("aria-label") ?? b.textContent);
    const forbidden = [
      /Start match/,
      /Rehash/,
      /End match/,
      /Remove match/,
      /Add court/,
      /Remove court/,
      /Add queue/,
      /Remove queue/,
      /Pick player/,
      /Clear /,
      /Move to court|Court \d · /,
      /Sit out|Back in/,
      /^Remove /,
      /Add player/,
      /End session/,
      /change point system/,
    ];
    for (const pattern of forbidden) {
      expect(buttons.filter((label) => pattern.test(label ?? ""))).toEqual([]);
    }
    expect(screen.queryByRole("textbox", { name: "Player name" })).not.toBeInTheDocument();
    // The Point system is shown, but can't be opened.
    expect(screen.getByText("21 pts")).toBeInTheDocument();
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /pts/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "End session" })).not.toBeInTheDocument();
  });

  it("keeps the match timers ticking", () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0 + 65_000);
    const session = runningSession();
    viewAs("ana-2222", sharedEntry(session));
    renderAt(`/sessions/${session.id}`);
    expect(court(1).getByText("01:05")).toBeInTheDocument();

    act(() => void vi.advanceTimersByTime(5000));

    expect(court(1).getByText("01:10")).toBeInTheDocument();
  });

  it("follows the host's changes live", () => {
    const session = runningSession();
    viewAs("ana-2222", sharedEntry(session));
    renderAt(`/sessions/${session.id}`);
    expect(screen.getByRole("heading", { level: 3, name: "Court 1" })).toBeInTheDocument();

    const ended = {
      ...session,
      matches: [],
      courts: session.courts.map((c) => ({ ...c, activeMatchId: null })),
    };
    act(() =>
      applyActiveSessionsReport({
        sessions: [sharedEntry(ended, { updatedAt: T0 + 1 })],
        unknown: [],
      }),
    );

    expect(court(1).queryByText("Playing")).not.toBeInTheDocument();
    expect(court(1).getByText("Idle")).toBeInTheDocument();
  });

  it("says how old the copy is when it has been a while since the host's last upload", () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0 + 7 * 60_000);
    const session = runningSession();
    viewAs("ana-2222", sharedEntry(session, { updatedAt: T0 + 60_000 }));

    renderAt(`/sessions/${session.id}`);

    expect(screen.getByText("Last update 6 min ago.")).toBeInTheDocument();
  });

  it("says it is the last copy, and how old, while the device is offline", () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0 + 30_000);
    const backend = createInMemoryBackend({ online: false });
    setBackendForTests(backend);
    const session = runningSession();
    viewAs("ana-2222", sharedEntry(session));

    renderAt(`/sessions/${session.id}`);

    expect(
      screen.getByText("You're offline. Showing the last copy, updated just now."),
    ).toBeInTheDocument();
    expect(screen.getByText("Offline")).toBeInTheDocument();
    expect(screen.queryByText("Live")).not.toBeInTheDocument();
  });

  it("sends the person Home with a notice when the host ends the session", () => {
    const session = runningSession();
    viewAs("ana-2222", sharedEntry(session));
    const location = renderAt(`/sessions/${session.id}`);

    act(() => applyActiveSessionsReport({ sessions: [], unknown: [] }));

    expect(location.current()).toBe("/");
    expect(screen.getByRole("status")).toHaveTextContent("'Thursday' has ended.");
  });

  it("goes to the past sessions list for an id nobody knows", () => {
    setAccount({ accountId: "ana-2222", name: "Ana" });
    const location = renderAt("/sessions/unknown");
    expect(location.current()).toBe("/sessions");
  });
});

describe("The Session screen for the Session host of a Shared club", () => {
  it("shows every control, and saves changes to the Shared club's copy, not the device's own Session", async () => {
    const session = runningSession();
    const own = { ...runningSession(), id: "device-session", name: "Local night", clubId: null };
    setLocalClubs([]);
    setSession(own);
    viewAs("roy-7k3f", sharedEntry(session));
    renderAt(`/sessions/${session.id}`);
    expect(screen.queryByText(/Watching\./)).not.toBeInTheDocument();

    await userEvent.click(court(2).getByRole("button", { name: "Start match" }));

    const hosted = getSharedSessions().find((e) => e.clubId === "c1")!;
    expect(hosted.session.matches).toHaveLength(2);
    expect(court(2).getByText("Playing")).toBeInTheDocument();
    // The device's own Session is untouched.
    expect(getSession()).toBe(own);
  });

  it("goes read-only when somebody else becomes the host", () => {
    const session = runningSession();
    viewAs("roy-7k3f", sharedEntry(session));
    renderAt(`/sessions/${session.id}`);
    expect(screen.getByRole("button", { name: "End session" })).toBeInTheDocument();

    act(() =>
      applyActiveSessionsReport({
        sessions: [sharedEntry(session, { hostAccountId: "ana-2222", hostName: "Ana" })],
        unknown: [],
      }),
    );

    expect(screen.getByText("Watching. Ana runs this session.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "End session" })).not.toBeInTheDocument();
  });

  it("ending it removes the Shared club's copy, deletes the record, and keeps the Ended session", async () => {
    const backend: InMemoryBackend = createInMemoryBackend();
    const roy = await backend.createAccount("Roy");
    await backend.createSharedClub({ id: "c1", name: "Riverside", players: [] });
    setBackendForTests(backend);
    setAccount(roy);
    const session = runningSession();
    const started = await backend.startSharedSession("c1", session);
    applyActiveSessionsReport({ sessions: [started], unknown: [] });
    const location = renderAt(`/sessions/${session.id}`);

    await userEvent.click(screen.getByRole("button", { name: "End session" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "End session" }),
    );

    expect(getSharedSessions()).toEqual([]);
    expect(location.current()).toBe(`/sessions/${session.id}/summary`);
    let report: ActiveSession[] | null = null;
    backend.observeActiveSessions((r) => (report = r.sessions))();
    expect(report).toEqual([]);
    // The Ended session was published to the Club too, and is still on this device.
    let published: { id: string; clubId: string | null }[] = [];
    backend.observeEndedSessions((r) => (published = r.sessions))();
    expect(published.map((e) => [e.id, e.clubId])).toEqual([[session.id, "c1"]]);
    expect(getEndedSessions().map((e) => e.id)).toEqual([session.id]);
  });
});
