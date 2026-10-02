import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { App } from "../../app/App.tsx";
import {
  createRng,
  createSession,
  endMatch,
  setPointSystem,
  startMatch,
} from "../../domain/engine/index.ts";
import type { Session } from "../../domain/types.ts";
import { getSession, resetStoreForTests, setSession } from "../../storage/store.ts";
import { playingLine, suggestionLine } from "./pointSystemText.ts";

const T0 = Date.UTC(2026, 9, 1, 18, 0, 0);
const NAMES = ["Ana", "Ben", "Cat", "Dan", "Eve", "Fay", "Gus", "Hal", "Ivy", "Jon", "Kim", "Lou"];
const at = (now: number) => ({ now, rng: createRng(3) });

type R = { ok: true; session: Session } | { ok: false; reason: string };
function ok(result: R): Session {
  if (!result.ok) throw new Error(result.reason);
  return result.session;
}

/** 8 players, 2 courts, 2 hours, 21 points. */
function makeSession(players = 8): Session {
  let id = 0;
  return createSession(
    {
      name: "Thursday",
      clubId: null,
      pointSystem: 21,
      plannedHours: 2,
      courts: 2,
      players: NAMES.slice(0, players).map((name) => ({ name, skill: "intermediate" as const })),
    },
    { now: T0, rng: createRng(7), newId: () => `id-${++id}` },
  );
}

/** Court 1 Busy since T0, at 21 points. */
function busySession(): Session {
  const session = makeSession();
  return ok(startMatch(session, session.courts[0]!.id, at(T0)));
}

function renderSession(session: Session) {
  setSession(session);
  const location = memoryLocation({ path: `/sessions/${session.id}`, record: true });
  render(
    <Router hook={location.hook}>
      <App />
    </Router>,
  );
}

const court = (n: number) => within(screen.getByRole("region", { name: `Court ${n}` }));
const openDialog = async () => {
  await userEvent.click(screen.getByRole("button", { name: /change point system/ }));
  return within(screen.getByRole("dialog", { name: "Point system" }));
};

describe("Point system during a Session", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStoreForTests();
    // Half an hour in: 1.5 hours left.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0 + 30 * 60_000);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("the top-bar badge opens the dialog; one tap switches the point system", async () => {
    renderSession(makeSession());
    const badge = screen.getByRole("button", { name: "21 pts, change point system" });
    expect(badge).toHaveTextContent("21 pts");

    const dialog = await openDialog();
    expect(screen.getByRole("dialog")).toHaveAccessibleDescription(
      "For matches started from now on.",
    );
    expect(dialog.getByRole("radio", { name: "21 points" })).toBeChecked();
    // No court is playing, so nothing about matches being played.
    expect(dialog.queryByText(/being played/)).not.toBeInTheDocument();

    await userEvent.click(dialog.getByRole("radio", { name: "31 points" }));
    expect(getSession()!.pointSystem).toBe(31);
    expect(dialog.getByRole("radio", { name: "31 points" })).toBeChecked();
    expect(screen.getByRole("button", { name: "31 pts, change point system" })).toBeInTheDocument();

    await userEvent.click(dialog.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the suggestion for the time left", async () => {
    renderSession(makeSession());
    const dialog = await openDialog();
    // 8 players, 2 courts, 1.5 hours left → 31 points, 3 more games each.
    expect(dialog.getByText("Suggested: 31 — about 3 more games each")).toBeInTheDocument();
  });

  it("shows no suggestion once the planned time is up", async () => {
    vi.setSystemTime(T0 + 3 * 3_600_000);
    renderSession(makeSession());
    const dialog = await openDialog();
    expect(dialog.queryByText(/Suggested/)).not.toBeInTheDocument();
  });

  it("says matches being played keep their points", async () => {
    renderSession(busySession());
    const dialog = await openDialog();
    expect(dialog.getByText("The match being played stays at 21 points.")).toBeInTheDocument();
  });

  it("a match started before the switch keeps its points: tag and Score dialog", async () => {
    renderSession(busySession());
    expect(court(1).queryByText(/^to /)).not.toBeInTheDocument();

    const dialog = await openDialog();
    await userEvent.click(dialog.getByRole("radio", { name: "31 points" }));
    await userEvent.click(dialog.getByRole("button", { name: "Done" }));

    // Court 1 still plays to 21; the tag says so.
    expect(court(1).getByText("to 21")).toBeInTheDocument();
    await userEvent.click(court(1).getByRole("button", { name: "End match" }));
    const score = within(screen.getByRole("dialog", { name: "End match — Court 1" }));
    expect(score.getByText("Winner needs at least 21 points.")).toBeInTheDocument();
    const [a, b] = score.getAllByRole("textbox");
    await userEvent.type(a!, "21");
    await userEvent.type(b!, "15");
    await userEvent.click(score.getByRole("button", { name: "Save" }));
    expect(getSession()!.matches[0]!.score).toEqual([21, 15]);

    // A match started now plays to 31: no tag, and the Score dialog asks for 31.
    await userEvent.click(court(2).getByRole("button", { name: "Start match" }));
    expect(court(2).queryByText(/^to /)).not.toBeInTheDocument();
    await userEvent.click(court(2).getByRole("button", { name: "End match" }));
    expect(
      within(screen.getByRole("dialog", { name: "End match — Court 2" })).getByText(
        "Winner needs at least 31 points.",
      ),
    ).toBeInTheDocument();
  });
});

describe("playingLine", () => {
  it("is null when no court is playing", () => {
    expect(playingLine(makeSession())).toBeNull();
  });

  it("uses one number when every match being played has the same points", () => {
    let session = busySession();
    session = ok(startMatch(session, session.courts[1]!.id, at(T0 + 1000)));
    expect(playingLine(session)).toBe("Matches being played stay at 21 points.");
  });

  it("lists the courts when matches being played have different points", () => {
    let session = busySession();
    session = ok(setPointSystem(session, 31, at(T0 + 1000)));
    session = ok(startMatch(session, session.courts[1]!.id, at(T0 + 2000)));
    expect(playingLine(session)).toBe(
      "Matches being played keep their points: court 1 at 21, court 2 at 31.",
    );
  });
});

describe("suggestionLine", () => {
  it("phrases the number of more games", () => {
    expect(suggestionLine({ pointSystem: 21, gamesEach: 2 })).toBe(
      "Suggested: 21 — about 2 more games each",
    );
    expect(suggestionLine({ pointSystem: 21, gamesEach: 1 })).toBe(
      "Suggested: 21 — about 1 more game each",
    );
    expect(suggestionLine({ pointSystem: 21, gamesEach: 0 })).toBe(
      "Suggested: 21 — less than one more game each",
    );
  });
});

describe("History with both 21 and 31", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStoreForTests();
  });

  it("shows no points when every ended match had the same", async () => {
    let session = busySession();
    session = ok(endMatch(session, session.matches[0]!.id, [21, 10], at(T0 + 600_000)));
    session = ok(startMatch(session, session.courts[1]!.id, at(T0 + 601_000)));
    session = ok(endMatch(session, session.matches[1]!.id, [21, 19], at(T0 + 1_200_000)));
    // Two ended matches, both at 21: no points shown.
    renderSession(session);
    const history = () => within(screen.getByRole("region", { name: "History" }));
    await userEvent.click(history().getByRole("button", { name: "Show history" }));
    expect(history().getAllByRole("listitem")).toHaveLength(2);
    expect(history().queryByText(/points$/)).not.toBeInTheDocument();
  });

  it("labels every entry when the Session has 21- and 31-point matches", async () => {
    let session = busySession();
    session = ok(endMatch(session, session.matches[0]!.id, [21, 10], at(T0 + 600_000)));
    session = ok(setPointSystem(session, 31, at(T0 + 600_500)));
    session = ok(startMatch(session, session.courts[1]!.id, at(T0 + 601_000)));
    session = ok(endMatch(session, session.matches[1]!.id, [31, 20], at(T0 + 1_800_000)));
    renderSession(session);

    const history = within(screen.getByRole("region", { name: "History" }));
    await userEvent.click(history.getByRole("button", { name: "Show history" }));
    const entries = within(history.getByRole("list", { name: "Match history" })).getAllByRole(
      "listitem",
    );
    // Newest first.
    expect(entries[0]).toHaveTextContent("31 points");
    expect(entries[1]).toHaveTextContent("21 points");
  });
});
