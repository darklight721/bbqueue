import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { createRng, createSession } from "../../../domain/engine/index.ts";
import type { Session } from "../../../domain/types.ts";
import { resetStoreForTests } from "../../../storage/store.ts";
import { SessionViewContext, type SessionView } from "../context.ts";
import { SparePlayersNote } from "./SparePlayersNote.tsx";

const NAMES = ["Ana", "Ben", "Cat", "Dan", "Eve", "Fay", "Gus", "Hal", "Ivy", "Jon", "Kim", "Lou"];

function makeSession(players: number, courts: number, id = "s1"): Session {
  let n = 0;
  const session = createSession(
    {
      name: "Thursday",
      clubId: null,
      clubName: null,
      pointSystem: 21,
      plannedHours: 2,
      courts,
      players: NAMES.slice(0, players).map((name) => ({ name, skill: "intermediate" as const })),
    },
    { now: 0, rng: createRng(7), newId: () => `id-${++n}` },
  );
  return { ...session, id };
}

/** The same Session with the first `count` players Sitting out. */
function sittingOut(session: Session, count: number): Session {
  return {
    ...session,
    players: session.players.map((player, i) => ({ ...player, sittingOut: i < count })),
  };
}

function view(session: Session, readOnly = false): SessionView {
  return {
    session,
    stats: new Map(),
    playerById: new Map(),
    asOf: 0,
    readOnly,
    sharedClubId: null,
  };
}

function renderNote(session: Session, readOnly = false) {
  const result = render(
    <SessionViewContext.Provider value={view(session, readOnly)}>
      <SparePlayersNote />
    </SessionViewContext.Provider>,
  );
  return {
    rerender: (next: Session, nextReadOnly = readOnly) =>
      result.rerender(
        <SessionViewContext.Provider value={view(next, nextReadOnly)}>
          <SparePlayersNote />
        </SessionViewContext.Provider>,
      ),
  };
}

const note = () => screen.queryByRole("note", { name: "Few spare players" });

describe("SparePlayersNote", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStoreForTests();
  });
  afterEach(cleanup);

  it("tells the organiser what few Spare players means, in the engine's words", () => {
    renderNote(makeSession(10, 2));
    expect(note()).toHaveTextContent(
      "10 players on 2 courts: only 2 sit out while every court is playing",
    );
  });

  it("isn't shown with 3 or more Spare players, nor to someone watching", () => {
    const { rerender } = renderNote(makeSession(11, 2));
    expect(note()).toBeNull();
    rerender(makeSession(10, 2), true);
    expect(note()).toBeNull();
  });

  it("follows the Session live: Sitting out shows and hides it", () => {
    const session = makeSession(12, 2);
    const { rerender } = renderNote(session);
    expect(note()).toBeNull();
    rerender(sittingOut(session, 2));
    expect(note()).toHaveTextContent("10 players on 2 courts");
    rerender(session);
    expect(note()).toBeNull();
  });

  it("stays dismissed for the same count, also after a reload, and comes back for another", async () => {
    const user = userEvent.setup();
    const session = makeSession(10, 2);
    const { rerender } = renderNote(session);
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(note()).toBeNull();
    expect(JSON.parse(localStorage.getItem("bq:v1:spare-notice-dismissed:s1")!)).toEqual({
      version: 1,
      data: "10/2",
    });

    // Back to the same count after a detour: still dismissed.
    rerender(makeSession(12, 2));
    rerender(session);
    expect(note()).toBeNull();

    // A reload reads the dismissal from the device.
    cleanup();
    resetStoreForTests();
    const reloaded = renderNote(session);
    expect(note()).toBeNull();

    // Another count that shows the notice brings it back.
    reloaded.rerender(sittingOut(session, 1));
    expect(note()).toHaveTextContent("9 players on 2 courts: only 1 sits out");
  });

  it("remembers the dismissal per Session", async () => {
    const user = userEvent.setup();
    const { rerender } = renderNote(makeSession(10, 2, "s1"));
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    rerender(makeSession(10, 2, "s2"));
    expect(note()).toBeInTheDocument();
  });
});
