import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createRng, createSession } from "../../../domain/engine/index.ts";
import type { Session } from "../../../domain/types.ts";
import { SessionActionsContext, SessionViewContext, type SessionActions } from "../context.ts";
import { CourtCard } from "./CourtCard.tsx";
import { alsoChangesText } from "./rehashBlockedText.ts";

// The engine decides whether Rehash is blocked; these tests only drive the sheet.
const block = vi.hoisted(() => ({
  value: null as {
    reason: "rest" | "fairness" | "waited" | "balance";
    newTeams: boolean;
  } | null,
}));
vi.mock("../../../domain/engine/index.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../domain/engine/index.ts")>()),
  rehashBlock: () => block.value,
}));

const NAMES = ["Ana", "Ben", "Cat", "Dan", "Eve", "Fay", "Gus", "Hal", "Ivy", "Jon", "Kim", "Lou"];

function makeSession(players: number, courts: number): Session {
  let n = 0;
  return createSession(
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
}

function fakeActions(): SessionActions {
  return {
    run: vi.fn(() => true),
    notify: vi.fn(),
    startMatch: vi.fn(() => true),
    endMatch: vi.fn(() => true),
    removeMatch: vi.fn(() => true),
    rehashCourt: vi.fn(() => true),
    rehashAll: vi.fn(() => true),
    addCourt: vi.fn(() => true),
    removeCourt: vi.fn(() => true),
    swapIntoLineup: vi.fn(() => true),
  };
}

function renderCourt(session: Session, options: { readOnly?: boolean; court?: number } = {}) {
  const actions = fakeActions();
  const court = session.courts.find((c) => c.number === (options.court ?? 1))!;
  render(
    <SessionViewContext.Provider
      value={{
        session,
        stats: new Map(),
        playerById: new Map(session.players.map((player) => [player.id, player])),
        asOf: 0,
        readOnly: options.readOnly ?? false,
        sharedClubId: null,
      }}
    >
      <SessionActionsContext.Provider value={actions}>
        <CourtCard court={court} />
      </SessionActionsContext.Provider>
    </SessionViewContext.Provider>,
  );
  return { actions, courtId: court.id };
}

const sheet = () => screen.queryByRole("dialog", { name: "No one else can come in" });

describe("alsoChangesText", () => {
  it("names the other Idle Courts with a Lineup", () => {
    expect(alsoChangesText([])).toBeNull();
    expect(alsoChangesText([2])).toBe("Also changes the Lineup on Court 2.");
    expect(alsoChangesText([2, 3])).toBe("Also changes Courts 2 and 3.");
    expect(alsoChangesText([2, 3, 4])).toBe("Also changes Courts 2, 3 and 4.");
  });
});

describe("Rehash on a Court", () => {
  beforeEach(() => {
    block.value = null;
  });

  it("rehashes straight away when someone else can come in", async () => {
    const { actions, courtId } = renderCourt(makeSession(10, 1));
    await userEvent.click(screen.getByRole("button", { name: "Rehash" }));
    expect(actions.rehashCourt).toHaveBeenCalledWith(courtId);
    expect(sheet()).toBeNull();
  });

  it("asks first when blocked by Rest, and changes nothing until a choice", async () => {
    block.value = { reason: "rest", newTeams: true };
    const { actions, courtId } = renderCourt(makeSession(5, 1));
    await userEvent.click(screen.getByRole("button", { name: "Rehash" }));
    const dialog = sheet()!;
    expect(dialog).toHaveAccessibleDescription("Anyone else would play a third match in a row.");
    expect(actions.rehashCourt).not.toHaveBeenCalled();
    // One Court: Rehash all isn't possible.
    expect(
      within(dialog).queryByRole("button", { name: "Rehash all idle courts" }),
    ).not.toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "New Teams" }));
    expect(actions.rehashCourt).toHaveBeenCalledWith(courtId);
    expect(sheet()).toBeNull();
  });

  it("explains Fairness, and Swap anyway swaps on purpose", async () => {
    block.value = { reason: "fairness", newTeams: true };
    const { actions, courtId } = renderCourt(makeSession(5, 1));
    await userEvent.click(screen.getByRole("button", { name: "Rehash" }));
    expect(sheet()).toHaveAccessibleDescription("The others have played more.");
    await userEvent.click(screen.getByRole("button", { name: "Swap anyway" }));
    expect(actions.swapIntoLineup).toHaveBeenCalledWith(courtId);
    expect(actions.rehashCourt).not.toHaveBeenCalled();
    expect(sheet()).toBeNull();
  });

  it("offers Rehash all idle courts, naming the other Courts it changes", async () => {
    block.value = { reason: "rest", newTeams: true };
    const { actions } = renderCourt(makeSession(10, 2));
    await userEvent.click(screen.getByRole("button", { name: "Rehash" }));
    const rehashAll = screen.getByRole("button", { name: "Rehash all idle courts" });
    expect(rehashAll).toHaveAccessibleDescription("Also changes the Lineup on Court 2.");
    await userEvent.click(rehashAll);
    expect(actions.rehashAll).toHaveBeenCalled();
    expect(sheet()).toBeNull();
  });

  it("Cancel, Escape and the backdrop close it without changing anything", async () => {
    block.value = { reason: "rest", newTeams: true };
    const { actions } = renderCourt(makeSession(5, 1));
    const open = () => userEvent.click(screen.getByRole("button", { name: "Rehash" }));

    await open();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(sheet()).toBeNull();

    await open();
    fireEvent(sheet()!, new Event("cancel", { cancelable: true }));
    expect(sheet()).toBeNull();

    await open();
    fireEvent.click(sheet()!.querySelector<HTMLButtonElement>(".modal-backdrop button")!);
    expect(sheet()).toBeNull();

    for (const action of Object.values(actions)) expect(action).not.toHaveBeenCalled();
  });

  it.each([
    ["rest", "Anyone else would play a third match in a row."],
    ["fairness", "The others have played more."],
    ["waited", "The players in this Lineup have sat out too long to wait again."],
    ["balance", "Anyone else would make unbalanced Teams."],
  ] as const)("says why for %s", async (reason, text) => {
    block.value = { reason, newTeams: true };
    renderCourt(makeSession(5, 1));
    await userEvent.click(screen.getByRole("button", { name: "Rehash" }));
    expect(sheet()).toHaveAccessibleDescription(text);
    expect(screen.getByRole("button", { name: "New Teams" })).toHaveFocus();
  });

  it("without another balanced split: no New Teams, says so, Rehash all leads", async () => {
    block.value = { reason: "balance", newTeams: false };
    renderCourt(makeSession(10, 2));
    await userEvent.click(screen.getByRole("button", { name: "Rehash" }));
    const dialog = sheet()!;
    expect(dialog).toHaveAccessibleDescription(
      "Anyone else would make unbalanced Teams. No other balanced Teams for these four.",
    );
    expect(within(dialog).getByText("No other balanced Teams for these four.")).toBeVisible();
    expect(within(dialog).queryByRole("button", { name: "New Teams" })).not.toBeInTheDocument();
    const rehashAll = within(dialog).getByRole("button", { name: "Rehash all idle courts" });
    expect(rehashAll).toHaveClass("btn-primary");
    expect(rehashAll).toHaveFocus();
  });

  it("without another balanced split or Rehash all: nothing looks primary, Cancel has focus", async () => {
    block.value = { reason: "rest", newTeams: false };
    const { actions } = renderCourt(makeSession(5, 1));
    await userEvent.click(screen.getByRole("button", { name: "Rehash" }));
    const dialog = sheet()!;
    expect(within(dialog).getByText("No other balanced Teams for these four.")).toBeVisible();
    expect(within(dialog).queryByRole("button", { name: "New Teams" })).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Rehash all idle courts" }),
    ).not.toBeInTheDocument();
    expect(dialog.querySelector(".btn-primary")).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(sheet()).toBeNull();
    expect(actions.swapIntoLineup).not.toHaveBeenCalled();
  });

  it("isn't there for someone watching", () => {
    block.value = { reason: "rest", newTeams: true };
    renderCourt(makeSession(5, 1), { readOnly: true });
    expect(screen.queryByRole("button", { name: "Rehash" })).not.toBeInTheDocument();
  });
});
