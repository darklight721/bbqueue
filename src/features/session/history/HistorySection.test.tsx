import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { App } from "../../../app/App.tsx";
import {
  createRng,
  createSession,
  endMatch,
  removePlayer,
  startMatch,
} from "../../../domain/engine/index.ts";
import type { Session, Team } from "../../../domain/types.ts";
import {
  getEndedSessions,
  getSession,
  resetStoreForTests,
  setSession,
} from "../../../storage/store.ts";

const T0 = Date.UTC(2026, 9, 2, 18, 0, 0);
const NAMES = ["Ana", "Ben", "Cat", "Dan", "Eve", "Fay", "Gus", "Hal", "Ivy", "Jon"];
const at = (now: number) => ({ now, rng: createRng(3) });

type R = { ok: true; session: Session } | { ok: false; reason: string };
function ok(result: R): Session {
  if (!result.ok) throw new Error(result.reason);
  return result.session;
}

function fresh(): Session {
  let id = 0;
  return createSession(
    {
      name: "Thursday",
      clubId: null,
      pointSystem: 21,
      plannedHours: 2,
      courts: 2,
      players: NAMES.map((name, i) => ({
        name,
        skill: (["beginner", "intermediate", "advanced"] as const)[i % 3]!,
      })),
    },
    { now: T0, rng: createRng(5), newId: () => `p-${++id}` },
  );
}

/**
 * Match #1 on Court 1: 21–15 in 12:34. Match #2 on Court 2: no score, 08:05.
 * Then a third match is in progress on Court 1.
 */
function playedSession(): Session {
  let s = fresh();
  s = ok(startMatch(s, s.courts[0]!.id, at(T0)));
  s = ok(startMatch(s, s.courts[1]!.id, at(T0 + 400_000)));
  const [m1, m2] = s.matches;
  s = ok(endMatch(s, m1!.id, [21, 15], at(T0 + 754_000)));
  s = ok(endMatch(s, m2!.id, null, at(T0 + 400_000 + 485_000)));
  s = ok(startMatch(s, s.courts[0]!.id, at(T0 + 900_000)));
  return s;
}

function renderSession(session: Session) {
  setSession(session);
  const location = memoryLocation({ path: `/sessions/${session.id}`, record: true });
  render(
    <Router hook={location.hook}>
      <App />
    </Router>,
  );
  return { current: () => location.history.at(-1) };
}

const names = (session: Session, team: Team) =>
  team.map((id) => session.players.find((p) => p.id === id)!.name);

describe("HistorySection", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStoreForTests();
  });

  it("shows an empty state before any match has ended", () => {
    renderSession(fresh());
    const history = within(screen.getByRole("region", { name: "History" }));
    expect(history.getByText("No matches played yet.")).toBeInTheDocument();
    expect(history.getByText("0 matches")).toBeInTheDocument();
    expect(history.queryByRole("button", { name: "Show history" })).not.toBeInTheDocument();
  });

  it("is collapsed by default and expands", async () => {
    renderSession(playedSession());
    const history = within(screen.getByRole("region", { name: "History" }));
    expect(history.getByText("2 matches")).toBeInTheDocument();
    const toggle = history.getByRole("button", { name: "Show history" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(history.queryByRole("list", { name: "Match history" })).not.toBeInTheDocument();

    await userEvent.click(toggle);
    expect(history.getByRole("button", { name: "Hide history" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(history.getByRole("list", { name: "Match history" })).toBeInTheDocument();

    await userEvent.click(history.getByRole("button", { name: "Hide history" }));
    expect(history.queryByRole("list", { name: "Match history" })).not.toBeInTheDocument();
  });

  it("lists ended matches newest first with teams, score and duration", async () => {
    const session = playedSession();
    renderSession(session);
    await userEvent.click(screen.getByRole("button", { name: "Show history" }));
    const entries = within(screen.getByRole("list", { name: "Match history" })).getAllByRole(
      "listitem",
    );
    expect(entries).toHaveLength(2);

    const [second, first] = entries.map((entry) => within(entry));
    const m1 = session.matches.find((m) => m.number === 1)!;
    const m2 = session.matches.find((m) => m.number === 2)!;

    expect(second!.getByText("Match #2 · Court 2")).toBeInTheDocument();
    expect(second!.getByText("No score")).toBeInTheDocument();
    expect(second!.getByText("08:05")).toBeInTheDocument();
    for (const name of [...names(session, m2.teams[0]), ...names(session, m2.teams[1])]) {
      expect(second!.getByText(name)).toBeInTheDocument();
    }

    expect(first!.getByText("Match #1 · Court 1")).toBeInTheDocument();
    expect(first!.getByText("12:34")).toBeInTheDocument();
    expect(first!.queryByText("No score")).not.toBeInTheDocument();
    expect(first!.getByText("21")).toBeInTheDocument();
    expect(first!.getByText("15")).toBeInTheDocument();
    // Winners are emphasised.
    expect(first!.getByText("21").parentElement).toHaveTextContent("Won, 21");
    for (const name of names(session, m1.teams[0])) {
      expect(first!.getByText(name)).toHaveClass("font-bold");
    }
    for (const name of names(session, m1.teams[1])) {
      expect(first!.getByText(name)).not.toHaveClass("font-bold");
    }
    // Skill levels are shown for every player.
    expect(first!.getAllByText(/^(Beginner|Intermediate|Advanced)$/)).toHaveLength(4);
  });

  it("still shows removed players in History", async () => {
    let session = playedSession();
    const active = session.matches.find((m) => m.status === "active")!.teams.flat();
    const m1 = session.matches.find((m) => m.number === 1)!;
    const gone = m1.teams.flat().find((id) => !active.includes(id))!;
    const goneName = session.players.find((p) => p.id === gone)!.name;
    session = ok(removePlayer(session, gone, at(T0 + 950_000)));
    renderSession(session);

    const players = within(screen.getByRole("region", { name: "Players" }));
    expect(players.queryByRole("button", { name: `Sit out ${goneName}` })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Show history" }));
    const list = within(screen.getByRole("list", { name: "Match history" }));
    expect(list.getByText(goneName)).toBeInTheDocument();
  });
});

describe("EndSessionSection", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStoreForTests();
  });

  it("mentions matches in progress only when there are some", async () => {
    renderSession(fresh());
    await userEvent.click(screen.getByRole("button", { name: "End session" }));
    const dialog = screen.getByRole("dialog", { name: "End session?" });
    expect(dialog).not.toHaveAccessibleDescription(/in progress/);
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  });

  it("uses singular and plural for matches in progress", async () => {
    let session = playedSession();
    renderSession(session);
    await userEvent.click(screen.getByRole("button", { name: "End session" }));
    expect(screen.getByRole("dialog", { name: "End session?" })).toHaveAccessibleDescription(
      "1 match in progress will be ended without a score.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    session = ok(startMatch(getSession()!, getSession()!.courts[1]!.id, at(T0 + 950_000)));
    setSession(session);
    await userEvent.click(screen.getByRole("button", { name: "End session" }));
    expect(screen.getByRole("dialog", { name: "End session?" })).toHaveAccessibleDescription(
      "2 matches in progress will be ended without a score.",
    );
  });

  it("Cancel keeps everything", async () => {
    const session = playedSession();
    const location = renderSession(session);
    await userEvent.click(screen.getByRole("button", { name: "End session" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(getSession()).toEqual(session);
    expect(getEndedSessions()).toEqual([]);
    expect(location.current()).toBe(`/sessions/${session.id}`);
  });

  it("ends a session with no Ended matches without keeping it and goes Home", async () => {
    const location = renderSession(fresh());
    await userEvent.click(screen.getByRole("button", { name: "End session" }));
    const dialog = screen.getByRole("dialog", { name: "End session?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "End session" }));

    expect(location.current()).toBe("/");
    expect(getSession()).toBeNull();
    expect(getEndedSessions()).toEqual([]);
    expect(localStorage.getItem("bq:v1:ended-sessions")).toBeNull();
  });

  it("ends the session, keeps it as an Ended session and opens its summary", async () => {
    const played = playedSession();
    const location = renderSession(played);
    await userEvent.click(screen.getByRole("button", { name: "End session" }));
    const dialog = screen.getByRole("dialog", { name: "End session?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "End session" }));

    expect(location.current()).toBe(`/sessions/${played.id}/summary`);
    expect(screen.getByRole("heading", { level: 1, name: "Session summary" })).toBeInTheDocument();
    expect(getSession()).toBeNull();
    const [ended] = getEndedSessions();
    expect(ended).toMatchObject({ id: played.id, name: "Thursday" });
    // The match in progress was ended too (without a score).
    expect(ended!.matches).toHaveLength(3);
    expect(ended!.matches.map((match) => match.number)).toEqual([1, 2, 3]);
  });
});
