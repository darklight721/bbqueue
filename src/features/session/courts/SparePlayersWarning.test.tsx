import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createRng, createSession } from "../../../domain/engine/index.ts";
import type { Session } from "../../../domain/types.ts";
import { SessionViewContext, type SessionView } from "../context.ts";
import { SparePlayersWarning } from "./SparePlayersWarning.tsx";

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

function renderWarning(session: Session, readOnly = false) {
  const result = render(
    <>
      <p>Elsewhere on the screen</p>
      <SessionViewContext.Provider value={view(session, readOnly)}>
        <SparePlayersWarning />
      </SessionViewContext.Provider>
    </>,
  );
  return {
    rerender: (next: Session, nextReadOnly = readOnly) =>
      result.rerender(
        <>
          <p>Elsewhere on the screen</p>
          <SessionViewContext.Provider value={view(next, nextReadOnly)}>
            <SparePlayersWarning />
          </SessionViewContext.Provider>
        </>,
      ),
  };
}

const icon = () => screen.queryByRole("button", { name: "Few spare players" });
const popover = () => screen.queryByRole("note", { name: "Few spare players" });

describe("SparePlayersWarning", () => {
  afterEach(cleanup);

  it("is a closed icon until tapped; the popover tells what few Spare players means", async () => {
    const user = userEvent.setup();
    renderWarning(makeSession(10, 2));
    expect(icon()).toHaveAttribute("aria-expanded", "false");
    expect(popover()).toBeNull();

    await user.click(icon()!);
    expect(icon()).toHaveAttribute("aria-expanded", "true");
    expect(popover()).toHaveTextContent(
      "10 players on 2 courts: only 2 sit out while every court is playing",
    );
    expect(icon()).toHaveAttribute("aria-controls", popover()!.id);
  });

  it("closes on a second tap, a tap outside and Escape", async () => {
    const user = userEvent.setup();
    renderWarning(makeSession(10, 2));

    await user.click(icon()!);
    await user.click(icon()!);
    expect(popover()).toBeNull();
    expect(icon()).toHaveAttribute("aria-expanded", "false");

    await user.click(icon()!);
    // A tap on the popover itself keeps it open.
    await user.click(popover()!);
    expect(popover()).toBeInTheDocument();
    await user.click(screen.getByText("Elsewhere on the screen"));
    expect(popover()).toBeNull();

    await user.click(icon()!);
    await user.keyboard("{Escape}");
    expect(popover()).toBeNull();
    expect(icon()).toHaveAttribute("aria-expanded", "false");
  });

  it("isn't shown with 3 or more Spare players, nor to someone watching", () => {
    const { rerender } = renderWarning(makeSession(11, 2));
    expect(icon()).toBeNull();
    rerender(makeSession(10, 2), true);
    expect(icon()).toBeNull();
    rerender(makeSession(10, 2), false);
    expect(icon()).toBeInTheDocument();
  });

  it("follows the Session live: Sitting out shows and hides it, and it comes back closed", async () => {
    const user = userEvent.setup();
    const session = makeSession(12, 2);
    const { rerender } = renderWarning(session);
    expect(icon()).toBeNull();
    rerender(sittingOut(session, 2));
    expect(icon()).toBeInTheDocument();

    await user.click(icon()!);
    rerender(session);
    expect(icon()).toBeNull();
    expect(popover()).toBeNull();

    rerender(sittingOut(session, 2));
    expect(icon()).toHaveAttribute("aria-expanded", "false");
    expect(popover()).toBeNull();
  });

  it("keeps an open popover in step with a new count", async () => {
    const user = userEvent.setup();
    const session = makeSession(10, 2);
    const { rerender } = renderWarning(session);
    await user.click(icon()!);
    rerender(sittingOut(session, 1));
    expect(popover()).toHaveTextContent("9 players on 2 courts: only 1 sits out");
  });

  it("never opens by itself when the count changes", () => {
    const session = makeSession(10, 2);
    const { rerender } = renderWarning(session);
    rerender(sittingOut(session, 1));
    expect(popover()).toBeNull();
    expect(icon()).toHaveAttribute("aria-expanded", "false");
  });
});
