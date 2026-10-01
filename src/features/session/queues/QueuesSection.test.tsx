import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { App } from "../../../app/App.tsx";
import {
  addQueue,
  createRng,
  createSession,
  endMatch,
  moveQueueToCourt,
  setQueueSlot,
  setSittingOut,
  startMatch,
} from "../../../domain/engine/index.ts";
import type { Session, SkillLevel } from "../../../domain/types.ts";
import { getSession, resetStoreForTests, setSession } from "../../../storage/store.ts";

const T0 = Date.UTC(2026, 9, 2, 18, 0, 0);
const NAMES = ["zoe", "Ben", "ana", "Dan", "Cat", "Eve", "Gus", "Fay", "Hal", "Ivy"];
const ctx = (now = T0) => ({ now, rng: createRng(11) });

type R = { ok: true; session: Session } | { ok: false; reason: string };
function ok(result: R): Session {
  if (!result.ok) throw new Error(result.reason);
  return result.session;
}

function makeSession(skills: Partial<Record<string, SkillLevel>> = {}): Session {
  let id = 0;
  return createSession(
    {
      name: "Thursday",
      clubId: null,
      pointSystem: 21,
      plannedHours: 2,
      courts: 2,
      players: NAMES.map((name) => ({ name, skill: skills[name] ?? "intermediate" })),
    },
    { now: T0, rng: createRng(5), newId: () => `p-${++id}` },
  );
}

const idOf = (session: Session, name: string) => session.players.find((p) => p.name === name)!.id;

/** Session with one Queue whose slots hold `names` (Team A then Team B; null = empty). */
function withQueue(session: Session, names: (string | null)[]): Session {
  let next = addQueue(session, ctx());
  const queueId = next.queues.at(-1)!.id;
  names.forEach((name, index) => {
    if (name === null) return;
    const team = index < 2 ? 0 : 1;
    const slot = index % 2;
    next = ok(setQueueSlot(next, queueId, team, slot as 0 | 1, idOf(next, name)));
  });
  return next;
}

function renderSession(session: Session) {
  setSession(session);
  const location = memoryLocation({ path: "/session", record: true });
  render(
    <Router hook={location.hook}>
      <App />
    </Router>,
  );
}

const queue = (n = 1) => within(screen.getByRole("region", { name: `Queue ${n}` }));
const pickerNames = () =>
  within(within(screen.getByRole("dialog")).getByRole("list", { name: "Players" }))
    .getAllByRole("button")
    .map((button) => button.getAttribute("aria-label"));

describe("QueuesSection", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStoreForTests();
  });

  it("adds a queue and fills it from the picker", async () => {
    renderSession(makeSession());
    expect(
      screen.getByText("Pick the next four players by hand, then move them onto a free court."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add queue" }));
    expect(queue().getByText("0 of 4")).toBeInTheDocument();
    expect(queue().getByText("Fill all 4 spots")).toBeInTheDocument();

    await userEvent.click(queue().getByRole("button", { name: "Pick player for Team A, spot 1" }));
    const dialog = screen.getByRole("dialog", { name: "Pick a player" });
    expect(dialog).toHaveAccessibleDescription("Team A · spot 1");
    expect(pickerNames()).toEqual([
      "ana",
      "Ben",
      "Cat",
      "Dan",
      "Eve",
      "Fay",
      "Gus",
      "Hal",
      "Ivy",
      "zoe",
    ]);
    expect(within(dialog).getByRole("button", { name: "ana" })).toHaveAccessibleDescription(
      /^(Free|In lineup · court \d)$/,
    );

    const filter = within(dialog).getByRole("searchbox", { name: "Filter players" });
    await userEvent.type(filter, "A");
    expect(pickerNames()).toEqual(["ana", "Cat", "Dan", "Fay", "Hal"]);
    await userEvent.type(filter, "l");
    expect(pickerNames()).toEqual(["Hal"]);
    await userEvent.type(filter, "x");
    expect(within(dialog).getByText("No players match.")).toBeInTheDocument();
    await userEvent.clear(filter);
    await userEvent.type(filter, "hal");
    await userEvent.click(within(dialog).getByRole("button", { name: "Hal" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(queue().getByRole("button", { name: "Clear Hal" })).toBeInTheDocument();
    expect(queue().getByText("1 of 4")).toBeInTheDocument();

    await userEvent.click(queue().getByRole("button", { name: "Pick player for Team B, spot 2" }));
    expect(pickerNames()).not.toContain("Hal");
    expect(pickerNames()).toHaveLength(9);
  });

  it("clears a filled spot", async () => {
    renderSession(withQueue(makeSession(), ["ana", null, null, null]));
    await userEvent.click(queue().getByRole("button", { name: "Clear ana" }));
    expect(
      queue().getByRole("button", { name: "Pick player for Team A, spot 1" }),
    ).toBeInTheDocument();
    expect(getSession()!.queues[0]!.slots[0][0]).toBeNull();
  });

  it("shows non-blocking warnings", async () => {
    let session = makeSession({
      ana: "advanced",
      Ben: "advanced",
      Cat: "beginner",
      Dan: "beginner",
    });
    session = ok(setSittingOut(session, idOf(session, "Cat"), true, ctx()));
    renderSession(withQueue(session, ["ana", "Ben", "Cat", "Dan"]));

    const warnings = queue().getByRole("list", { name: "Warnings" });
    expect(within(warnings).getByText("Unbalanced")).toBeInTheDocument();
    expect(within(warnings).getByText("Sitting out: Cat")).toBeInTheDocument();
    // Warnings don't block moving.
    expect(queue().getAllByRole("button", { name: /^Court \d · Idle$/ })[0]).toBeEnabled();
  });

  it("warns about repeat partners and a 3rd match in a row", () => {
    let session = makeSession();
    // ana, Ben, Cat and Dan play two matches back to back on Court 1.
    for (let round = 0; round < 2; round++) {
      session = withQueue(session, ["ana", "Ben", "Cat", "Dan"]);
      const start = T0 + round * 20 * 60_000;
      session = ok(
        moveQueueToCourt(session, session.queues[0]!.id, session.courts[0]!.id, ctx(start)),
      );
      const match = session.matches.at(-1)!;
      session = ok(endMatch(session, match.id, [21, 10], ctx(start + 15 * 60_000)));
    }
    renderSession(withQueue(session, ["ana", "Ben", "Eve", "Fay"]));
    const warnings = within(queue().getByRole("list", { name: "Warnings" }));
    expect(warnings.getByText("Repeat partners: ana & Ben")).toBeInTheDocument();
    expect(warnings.getByText("3rd in a row: ana")).toBeInTheDocument();
    expect(warnings.getByText("3rd in a row: Ben")).toBeInTheDocument();
    expect(warnings.queryByText("3rd in a row: Eve")).not.toBeInTheDocument();
  });

  it("explains why Move to court is disabled", () => {
    let session = makeSession();
    session = ok(startMatch(session, session.courts[0]!.id, ctx()));
    const free = session.players
      .filter((p) => !session.matches[0]!.teams.flat().includes(p.id))
      .map((p) => p.name);

    // Incomplete queue + a busy court.
    renderSession(withQueue(session, [free[0]!, null, null, null]));
    const busy = queue().getByRole("button", { name: "Court 1 · Playing" });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAccessibleDescription("Court in use");
    const idle = queue().getByRole("button", { name: "Court 2 · Idle" });
    expect(idle).toBeDisabled();
    expect(idle).toHaveAccessibleDescription("Fill all 4 spots");
  });

  it("blocks Move when a queued player is on court", () => {
    let session = makeSession();
    session = ok(startMatch(session, session.courts[0]!.id, ctx()));
    const match = session.matches[0]!;
    const onCourt = session.players.find((p) => p.id === match.teams[0][0])!.name;
    const free = session.players
      .filter((p) => !match.teams.flat().includes(p.id))
      .map((p) => p.name);
    renderSession(withQueue(session, [onCourt, free[0]!, free[1]!, free[2]!]));

    const idle = queue().getByRole("button", { name: "Court 2 · Idle" });
    expect(idle).toBeDisabled();
    expect(idle).toHaveAccessibleDescription(`${onCourt} is on court 1`);
  });

  it("moves a full queue onto a court: the match starts with those Teams", async () => {
    const session = makeSession();
    const lineupOne = session.courts[0]!.lineup!.teams.flat();
    const lineupTwo = session.courts[1]!.lineup!.teams.flat();
    // One player from Court 1's Lineup plus three from Court 2's.
    const moved = lineupOne[0]!;
    const queued = [moved, lineupTwo[0]!, lineupTwo[1]!, lineupTwo[2]!];
    const names = queued.map((id) => session.players.find((p) => p.id === id)!.name);
    renderSession(withQueue(session, names));

    await userEvent.click(queue().getByRole("button", { name: "Court 2 · Idle" }));

    expect(screen.getByRole("status")).toHaveTextContent("Match started on court 2");
    expect(screen.queryByRole("region", { name: "Queue 1" })).not.toBeInTheDocument();
    const after = getSession()!;
    expect(after.queues).toEqual([]);
    const match = after.matches.find((m) => m.status === "active")!;
    expect(match.courtNumber).toBe(2);
    expect(match.teams).toEqual([
      [queued[0], queued[1]],
      [queued[2], queued[3]],
    ]);
    expect(
      within(screen.getByRole("region", { name: "Court 2" })).getByText("Playing"),
    ).toBeInTheDocument();

    // Court 1's Lineup only lost the queued player.
    const newOne = after.courts.find((c) => c.number === 1)!.lineup!.teams.flat();
    expect(newOne).toHaveLength(4);
    expect(newOne).not.toContain(moved);
    // (The engine may re-split the Teams, so compare as sets.)
    expect(newOne.filter((id) => lineupOne.includes(id)).sort()).toEqual(lineupOne.slice(1).sort());
  });

  it("removes a queue without asking", async () => {
    renderSession(withQueue(makeSession(), ["ana", "Ben", null, null]));
    await userEvent.click(queue().getByRole("button", { name: "Remove queue" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Queue 1" })).not.toBeInTheDocument();
    expect(getSession()!.queues).toEqual([]);
    expect(screen.getByRole("button", { name: "Add queue" })).toBeInTheDocument();
  });
});
