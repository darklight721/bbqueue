import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { App } from "../../app/App.tsx";
import type { Club, EndedSession, Session } from "../../domain/types.ts";
import {
  addEndedSession,
  getClubs,
  resetStoreForTests,
  setLocalClubs,
  setSession,
} from "../../storage/store.ts";

const riverside: Club = {
  id: "c1",
  name: "Riverside",
  kind: "local",
  players: [
    { id: "p1", name: "Zed", skill: "advanced" },
    { id: "p2", name: "alice", skill: "beginner" },
    { id: "p3", name: "Bob", skill: "intermediate" },
  ],
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

const nameInputs = () => screen.getAllByRole("textbox", { name: "Player name" });
const names = () => nameInputs().map((input) => (input as HTMLInputElement).value);
const save = () => userEvent.click(screen.getByRole("button", { name: "Save" }));

const nameSheet = () => screen.queryByRole("dialog", { name: "Edit club name" });
const editPlayers = () => userEvent.click(screen.getByRole("link", { name: "Edit players" }));

describe("Club page", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStoreForTests();
  });

  it("redirects unknown Club ids to the Clubs list", () => {
    const location = renderAt("/clubs/nope");
    expect(location.current()).toBe("/clubs");
    expect(screen.getByRole("heading", { level: 1, name: "Clubs" })).toBeInTheDocument();
  });

  it("opens on the Club card and a roster to read, sorted by name, with no form", () => {
    setLocalClubs([riverside]);
    renderAt("/clubs/c1");
    expect(screen.getByRole("heading", { level: 1, name: "Club" })).toBeInTheDocument();
    const card = screen.getByRole("region", { name: "Club" });
    expect(within(card).getByRole("heading", { level: 2, name: "Riverside" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Edit club name" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add player" })).not.toBeInTheDocument();
    const rows = screen.getAllByRole("link", { name: /^(alice|Bob|Zed)$/ });
    expect(rows.map((row) => row.getAttribute("href"))).toEqual([
      "/clubs/c1/players/p2/stats?clubPage=1",
      "/clubs/c1/players/p3/stats?clubPage=1",
      "/clubs/c1/players/p1/stats?clubPage=1",
    ]);
    expect(rows[2]).toHaveAccessibleDescription("Advanced");
  });

  it("shows Ended matches and Win rate on rows of Club players who played, nothing on the others", () => {
    setLocalClubs([riverside]);
    addEndedSession({
      ...endedFor("night", "c1"),
      players: [
        { id: "s1", name: "Zed", skill: "advanced", clubPlayerId: "p1" },
        { id: "s2", name: "alice", skill: "beginner", clubPlayerId: "p2" },
        { id: "s3", name: "Guest", skill: "intermediate", clubPlayerId: null },
        { id: "s4", name: "Guest 2", skill: "intermediate", clubPlayerId: null },
      ],
      matches: [
        {
          number: 1,
          courtNumber: 1,
          teams: [
            ["s1", "s3"],
            ["s2", "s4"],
          ],
          target: 21,
          startedAt: 1,
          endedAt: 2,
          score: [21, 15],
        },
        {
          number: 2,
          courtNumber: 1,
          teams: [
            ["s1", "s4"],
            ["s2", "s3"],
          ],
          target: 21,
          startedAt: 3,
          endedAt: 4,
          score: null,
        },
      ],
    });
    renderAt("/clubs/c1");
    expect(screen.getByRole("link", { name: "Zed" })).toHaveAccessibleDescription(
      "2 matches · 100%, Advanced",
    );
    expect(screen.getByRole("link", { name: "alice" })).toHaveAccessibleDescription(
      "2 matches · 0%, Beginner",
    );
    expect(screen.getByRole("link", { name: "Bob" })).toHaveAccessibleDescription("Intermediate");
    expect(screen.getByText("2 matches · 100%")).toBeInTheDocument();
  });

  it("renames the Club in a sheet from the card, and nothing else", async () => {
    setLocalClubs([riverside]);
    renderAt("/clubs/c1");
    await userEvent.click(screen.getByRole("button", { name: "Edit club name" }));
    expect(nameSheet()).toBeInTheDocument();
    const field = within(nameSheet()!).getByRole("textbox", { name: "Club name" });
    expect(field).toHaveValue("Riverside");
    expect(within(nameSheet()!).getByRole("heading", { name: "Edit club name" })).toHaveFocus();
    await userEvent.clear(field);
    await userEvent.type(field, "  Riverside   Thursdays {Enter}");

    expect(
      screen.getByRole("heading", { level: 2, name: "Riverside Thursdays" }),
    ).toBeInTheDocument();
    expect(nameSheet()).toBeNull();
    expect(screen.getByRole("button", { name: "Edit club name" })).toHaveFocus();
    expect(
      within(screen.getByRole("region", { name: "Club" })).getByRole("status"),
    ).toHaveTextContent("Club renamed");
    expect(getClubs()).toEqual([{ ...riverside, name: "Riverside Thursdays" }]);
  });

  it("checks the name in the sheet: required, at most 40 characters, not another Club's", async () => {
    setLocalClubs([riverside, { id: "c2", name: "Mill Lane", kind: "local", players: [] }]);
    renderAt("/clubs/c1");
    await userEvent.click(screen.getByRole("button", { name: "Edit club name" }));
    const field = screen.getByRole("textbox", { name: "Club name" });
    const saveName = () => userEvent.click(screen.getByRole("button", { name: "Save" }));

    await userEvent.clear(field);
    await saveName();
    expect(screen.getByText("Enter a name")).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");

    await userEvent.type(field, "x".repeat(41));
    expect(screen.getByText("Name is too long (at most 40 characters)")).toBeInTheDocument();

    await userEvent.clear(field);
    await userEvent.type(field, " mill LANE ");
    expect(screen.getByText("Club name already used")).toBeInTheDocument();
    await saveName();
    expect(getClubs().find((club) => club.id === "c1")?.name).toBe("Riverside");

    // Its own name in a different case is fine.
    await userEvent.clear(field);
    await userEvent.type(field, "RIVERSIDE");
    await saveName();
    expect(nameSheet()).toBeNull();
    expect(getClubs().find((club) => club.id === "c1")?.name).toBe("RIVERSIDE");
  });

  it("×, Escape or the backdrop keeps the old name", async () => {
    setLocalClubs([riverside]);
    renderAt("/clubs/c1");
    await userEvent.click(screen.getByRole("button", { name: "Edit club name" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Club name" }), " Two");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(nameSheet()).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Riverside" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit club name" })).toHaveFocus();

    await userEvent.click(screen.getByRole("button", { name: "Edit club name" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Club name" }), " Two");
    fireEvent(nameSheet()!, new Event("cancel", { cancelable: true })); // Escape
    expect(nameSheet()).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Edit club name" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Club name" }), " Two");
    fireEvent.click(nameSheet()!.querySelector<HTMLButtonElement>(".modal-backdrop button")!);
    expect(nameSheet()).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Riverside" })).toBeInTheDocument();
    expect(getClubs()).toEqual([riverside]);
  });

  it("Edit on Players opens Edit players, with the roster form and nothing else; Back returns to Edit", async () => {
    setLocalClubs([riverside]);
    const location = renderAt("/clubs/c1");
    await editPlayers();
    expect(location.current()).toBe("/clubs/c1/players");
    expect(screen.getByRole("heading", { level: 1, name: "Edit players" })).toBeInTheDocument();
    expect(screen.getByText("Riverside · 3 players")).toBeInTheDocument();
    expect(names()).toEqual(["alice", "Bob", "Zed"]);
    expect(screen.getByRole("combobox", { name: "Skill level for Zed" })).toHaveValue("advanced");
    // No Club card, session cards, Danger zone or Cancel: Back is the cancel.
    expect(screen.queryByRole("region", { name: "Club" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "New session" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete club" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(location.current()).toBe("/clubs/c1");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit players" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Delete club" })).toBeInTheDocument();
  });

  it("Edit players: unknown Club ids go to the Clubs list", () => {
    const location = renderAt("/clubs/nope/players");
    expect(location.current()).toBe("/clubs");
  });

  it("appends an empty Intermediate row, focuses it and keeps it in place", async () => {
    setLocalClubs([riverside]);
    renderAt("/clubs/c1");
    await editPlayers();
    await userEvent.click(screen.getByRole("button", { name: "Add player" }));
    const added = nameInputs().at(-1)!;
    expect(added).toHaveValue("");
    expect(added).toHaveFocus();
    expect(screen.getByRole("combobox", { name: "Skill level" })).toHaveValue("intermediate");
    await userEvent.type(added, "Aaron");
    expect(names()).toEqual(["alice", "Bob", "Zed", "Aaron"]);
  });

  it("Enter in a player name adds the next row, or moves to it", async () => {
    setLocalClubs([riverside]);
    renderAt("/clubs/c1");
    await editPlayers();
    await userEvent.type(nameInputs()[0]!, "{Enter}");
    expect(nameInputs()[1]).toHaveFocus();

    await userEvent.type(nameInputs()[2]!, "{Enter}");
    expect(nameInputs()).toHaveLength(4);
    expect(nameInputs()[3]).toHaveFocus();

    await userEvent.type(nameInputs()[3]!, "{Enter}");
    expect(nameInputs()).toHaveLength(4);

    await userEvent.type(nameInputs()[3]!, "Aaron{Enter}");
    expect(names()).toEqual(["alice", "Bob", "Zed", "Aaron", ""]);
    expect(nameInputs()[4]).toHaveFocus();
  });

  it("blocks Save on empty or duplicate player names", async () => {
    setLocalClubs([{ ...riverside, players: [] }]);
    renderAt("/clubs/c1");
    await editPlayers();
    const add = screen.getByRole("button", { name: "Add player" });
    await userEvent.click(add);
    await userEvent.type(nameInputs()[0]!, "Sam");
    await userEvent.click(add);
    await userEvent.type(nameInputs()[1]!, "SAM");
    await userEvent.click(add);

    await save();
    expect(screen.getAllByText("Name already used")).toHaveLength(2);
    expect(screen.getByText("Enter a name")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Fix the highlighted fields to save.");
    expect(getClubs()[0]?.players).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "Remove player" }));
    await userEvent.click(screen.getAllByRole("button", { name: "Remove SAM" })[0]!);
    expect(screen.queryByText("Name already used")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("saves normalised names and returns to the Club page, saying so", async () => {
    setLocalClubs([riverside]);
    const location = renderAt("/clubs/c1");
    await editPlayers();
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Skill level for alice" }),
      "advanced",
    );
    await userEvent.click(screen.getByRole("button", { name: "Remove Zed" }));
    await userEvent.click(screen.getByRole("button", { name: "Add player" }));
    await userEvent.type(nameInputs().at(-1)!, " Cara ");
    await save();

    expect(location.current()).toBe("/clubs/c1");
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit players" })).toHaveFocus();
    expect(
      within(screen.getByRole("region", { name: /^Players/ })).getByRole("status"),
    ).toHaveTextContent("Players saved");
    const [saved] = getClubs();
    expect(saved?.name).toBe("Riverside");
    expect(saved?.players.map(({ name, skill }) => [name, skill])).toEqual([
      ["alice", "advanced"],
      ["Bob", "intermediate"],
      ["Cara", "intermediate"],
    ]);
    expect(saved?.players[0]?.id).toBe("p2");
    expect(screen.getByRole("link", { name: "Cara" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Zed" })).not.toBeInTheDocument();
  });

  it("Save with nothing changed returns to the Club page", async () => {
    setLocalClubs([riverside]);
    const location = renderAt("/clubs/c1");
    await editPlayers();
    await save();
    expect(location.current()).toBe("/clubs/c1");
    expect(getClubs()).toEqual([riverside]);
  });

  it("deletes after confirming", async () => {
    setLocalClubs([riverside]);
    const location = renderAt("/clubs/c1");
    await userEvent.click(screen.getByRole("button", { name: "Delete club" }));
    const dialog = screen.getByRole("dialog", { name: "Delete Riverside?" });
    expect(dialog).toHaveAccessibleDescription("This can't be undone.");

    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(getClubs()).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "Delete club" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(getClubs()).toEqual([]);
    expect(location.current()).toBe("/clubs");
  });

  it("Back leaves straight away from the Club page, and from Edit players with nothing changed", async () => {
    setLocalClubs([riverside]);
    let location = renderAt("/clubs/c1");
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(location.current()).toBe("/clubs");
    cleanup();

    location = renderAt("/clubs/c1/players");
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(location.current()).toBe("/clubs/c1");
  });

  it("asks before discarding roster changes", async () => {
    setLocalClubs([riverside]);
    const location = renderAt("/clubs/c1");
    await editPlayers();
    await userEvent.type(nameInputs()[0]!, "!");

    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await userEvent.click(
      within(screen.getByRole("dialog", { name: "Discard changes?" })).getByRole("button", {
        name: "Keep editing",
      }),
    );
    expect(location.current()).toBe("/clubs/c1/players");
    expect(nameInputs()[0]).toHaveValue("alice!");

    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(location.current()).toBe("/clubs/c1");
    expect(getClubs()).toEqual([riverside]);
  });

  it("treats @ as an ordinary character in a Local club's names", async () => {
    setLocalClubs([riverside]);
    renderAt("/clubs/c1");
    await editPlayers();
    expect(nameInputs()[0]).toHaveAttribute("placeholder", "Name");

    await userEvent.clear(nameInputs()[0]!);
    await userEvent.type(nameInputs()[0]!, "@alice");
    // No link line on the row.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await save();

    expect(getClubs()[0]?.players.find((p) => p.id === "p2")?.name).toBe("@alice");
  });

  it("treats undoing an edit as no change", async () => {
    setLocalClubs([riverside]);
    renderAt("/clubs/c1");
    await editPlayers();
    await userEvent.type(nameInputs()[0]!, "x");
    await userEvent.type(nameInputs()[0]!, "{Backspace}");
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Edit players for a Club that was just created has an empty row focused, and drops the flag from the URL", () => {
    setLocalClubs([riverside]);
    const location = renderAt("/clubs/c1/players?new=1");
    expect(names()).toEqual(["alice", "Bob", "Zed", ""]);
    expect(nameInputs()[3]).toHaveFocus();
    expect(location.current()).toBe("/clubs/c1/players");
  });
});

function endedFor(id: string, clubId: string | null): EndedSession {
  return {
    id,
    name: id,
    clubId,
    clubName: null,
    pointSystem: 21,
    startedAt: 1_000,
    endedAt: 2_000 + Number(id.length),
    players: [],
    matches: [],
  };
}

describe("Club page Sessions card", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStoreForTests();
  });

  it("is hidden without Ended sessions of this Club", () => {
    setLocalClubs([riverside]);
    addEndedSession(endedFor("other", "c2"));
    renderAt("/clubs/c1");
    expect(screen.queryByRole("link", { name: "Sessions" })).not.toBeInTheDocument();
  });

  it("shows the count and opens the Club's sessions", async () => {
    setLocalClubs([riverside]);
    addEndedSession(endedFor("a", "c1"));
    addEndedSession(endedFor("bb", "c1"));
    addEndedSession(endedFor("other", "c2"));
    const location = renderAt("/clubs/c1");
    const link = screen.getByRole("link", { name: "Sessions" });
    expect(link).toHaveAccessibleDescription("2 past sessions");
    expect(link).toHaveAttribute("href", "/clubs/c1/sessions");
    await userEvent.click(link);
    expect(location.current()).toBe("/clubs/c1/sessions");
    expect(screen.getByRole("heading", { level: 1, name: "Riverside" })).toBeInTheDocument();
  });

  it("sits next to New session in one row; a card on its own takes the whole row", () => {
    setLocalClubs([riverside]);
    renderAt("/clubs/c1");
    expect(screen.getByRole("link", { name: "New session" })).toHaveClass("col-span-2");
    cleanup();

    addEndedSession(endedFor("a", "c1"));
    renderAt("/clubs/c1");
    const nav = screen.getByRole("navigation", { name: "Club sessions" });
    expect(nav).toHaveClass("grid-cols-2");
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/sessions/new?club=c1",
      "/clubs/c1/sessions",
    ]);
    for (const link of links) expect(link).not.toHaveClass("col-span-2");
  });

  it("uses the singular for one session", () => {
    setLocalClubs([riverside]);
    addEndedSession(endedFor("a", "c1"));
    renderAt("/clubs/c1");
    expect(screen.getByRole("link", { name: "Sessions" })).toHaveAccessibleDescription(
      "1 past session",
    );
  });

  it("goes straight there", async () => {
    setLocalClubs([riverside]);
    addEndedSession(endedFor("a", "c1"));
    const location = renderAt("/clubs/c1");
    await userEvent.click(screen.getByRole("link", { name: "Sessions" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(location.current()).toBe("/clubs/c1/sessions");
  });
});

function activeFor(clubId: string | null): Session {
  return {
    id: "live",
    name: "Tuesday night",
    clubId,
    clubName: null,
    pointSystem: 21,
    plannedHours: 1,
    startedAt: 1,
    players: [],
    courts: [],
    matches: [],
    queues: [],
    streakResetAt: {},
  };
}

describe("Club page New session card", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStoreForTests();
  });

  it("reads 'New session' and opens New session for this Club", async () => {
    setLocalClubs([riverside]);
    const location = renderAt("/clubs/c1");
    const link = screen.getByRole("link", { name: "New session" });
    expect(link).toHaveAccessibleDescription("Pick players and courts");
    expect(link).toHaveAttribute("href", "/sessions/new?club=c1");
    expect(screen.queryByRole("link", { name: "Open active session" })).not.toBeInTheDocument();
    await userEvent.click(link);
    expect(location.current()).toBe("/sessions/new?club=c1");
  });

  it("warns that New session replaces another Club's Active session", () => {
    setLocalClubs([riverside]);
    setSession(activeFor("c2"));
    renderAt("/clubs/c1");
    expect(screen.getByRole("link", { name: "New session" })).toHaveAccessibleDescription(
      "Replaces the current session",
    );
  });

  it("reads 'Open active session' when this Club has the Active session", async () => {
    setLocalClubs([riverside]);
    setSession(activeFor("c1"));
    const location = renderAt("/clubs/c1");
    expect(screen.queryByRole("link", { name: "New session" })).not.toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Open active session" });
    expect(link).toHaveAccessibleDescription("Tuesday night");
    expect(link).toHaveAttribute("href", "/sessions/live");
    await userEvent.click(link);
    expect(location.current()).toBe("/sessions/live");
  });
});
