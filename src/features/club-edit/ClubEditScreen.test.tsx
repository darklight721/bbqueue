import { cleanup, render, screen, within } from "@testing-library/react";
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

describe("ClubEditScreen", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStoreForTests();
  });

  it("redirects unknown Club ids to the Clubs list", () => {
    const location = renderAt("/clubs/nope");
    expect(location.current()).toBe("/clubs");
    expect(screen.getByRole("heading", { level: 1, name: "Clubs" })).toBeInTheDocument();
  });

  it("shows players alphabetically on open", () => {
    setLocalClubs([riverside]);
    renderAt("/clubs/c1");
    expect(screen.getByRole("heading", { level: 1, name: "Edit club" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Club name" })).toHaveValue("Riverside");
    expect(names()).toEqual(["alice", "Bob", "Zed"]);
    expect(screen.getByRole("combobox", { name: "Skill level for Zed" })).toHaveValue("advanced");
  });

  it("appends an empty Intermediate row, focuses it and keeps it in place", async () => {
    setLocalClubs([riverside]);
    renderAt("/clubs/c1");
    await userEvent.click(screen.getByRole("button", { name: "Add player" }));
    const added = nameInputs().at(-1)!;
    expect(added).toHaveValue("");
    expect(added).toHaveFocus();
    expect(screen.getByRole("combobox", { name: "Skill level" })).toHaveValue("intermediate");
    await userEvent.type(added, "Aaron");
    expect(names()).toEqual(["alice", "Bob", "Zed", "Aaron"]);
  });

  it("Enter in the Club name dismisses the keyboard without saving", async () => {
    const location = renderAt("/clubs/new");
    const clubName = screen.getByRole("textbox", { name: "Club name" });
    await userEvent.type(clubName, "Beacon{Enter}");
    expect(clubName).not.toHaveFocus();
    expect(clubName).toHaveValue("Beacon");
    expect(location.current()).toBe("/clubs/new");
    expect(getClubs()).toEqual([]);
  });

  it("Enter in a player name adds the next row, or moves to it", async () => {
    setLocalClubs([riverside]);
    renderAt("/clubs/c1");
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

  it("blocks Save on empty or duplicate Club names", async () => {
    setLocalClubs([riverside]);
    const location = renderAt("/clubs/new");
    expect(screen.getByRole("heading", { level: 1, name: "New club" })).toBeInTheDocument();

    await save();
    const clubName = screen.getByRole("textbox", { name: "Club name" });
    expect(screen.getByText("Enter a name")).toBeInTheDocument();
    expect(clubName).toHaveAttribute("aria-invalid", "true");
    expect(clubName).toHaveFocus();

    await userEvent.type(clubName, " riverside ");
    expect(screen.getByText("Club name already used")).toBeInTheDocument();
    await save();
    expect(location.current()).toBe("/clubs/new");
    expect(getClubs()).toHaveLength(1);

    await userEvent.clear(clubName);
    await userEvent.type(clubName, "Mill Lane");
    expect(screen.queryByText("Club name already used")).not.toBeInTheDocument();
  });

  it("blocks Save on empty or duplicate player names", async () => {
    renderAt("/clubs/new");
    await userEvent.type(screen.getByRole("textbox", { name: "Club name" }), "Mill Lane");
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
    expect(getClubs()).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "Remove player" }));
    await userEvent.click(screen.getAllByRole("button", { name: "Remove SAM" })[0]!);
    expect(screen.queryByText("Name already used")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("saves normalised names and returns to the Clubs list", async () => {
    setLocalClubs([riverside]);
    const location = renderAt("/clubs/c1");
    const clubName = screen.getByRole("textbox", { name: "Club name" });
    await userEvent.clear(clubName);
    await userEvent.type(clubName, "  Riverside   Thursdays ");
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Skill level for alice" }),
      "advanced",
    );
    await userEvent.click(screen.getByRole("button", { name: "Remove Zed" }));
    await userEvent.click(screen.getByRole("button", { name: "Add player" }));
    await userEvent.type(nameInputs().at(-1)!, " Cara ");
    await save();

    expect(location.current()).toBe("/clubs");
    const [saved] = getClubs();
    expect(saved?.name).toBe("Riverside Thursdays");
    expect(saved?.players.map(({ name, skill }) => [name, skill])).toEqual([
      ["alice", "advanced"],
      ["Bob", "intermediate"],
      ["Cara", "intermediate"],
    ]);
    expect(saved?.players[0]?.id).toBe("p2");
    expect(screen.getByRole("link", { name: "Riverside Thursdays" })).toBeInTheDocument();
  });

  it("creates a Club with no players", async () => {
    const location = renderAt("/clubs/new");
    await userEvent.type(screen.getByRole("textbox", { name: "Club name" }), "Beacon");
    await save();
    expect(location.current()).toBe("/clubs");
    expect(getClubs()).toEqual([
      { id: expect.any(String), name: "Beacon", kind: "local", players: [] },
    ]);
  });

  it("hides Delete club on New club", () => {
    renderAt("/clubs/new");
    expect(screen.queryByRole("button", { name: "Delete club" })).not.toBeInTheDocument();
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

  it("leaves straight away when nothing changed", async () => {
    setLocalClubs([riverside]);
    const location = renderAt("/clubs/c1");
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(location.current()).toBe("/clubs");
  });

  it("asks before discarding changes", async () => {
    setLocalClubs([riverside]);
    const location = renderAt("/clubs/c1");
    await userEvent.type(nameInputs()[0]!, "!");

    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await userEvent.click(
      within(screen.getByRole("dialog", { name: "Discard changes?" })).getByRole("button", {
        name: "Keep editing",
      }),
    );
    expect(location.current()).toBe("/clubs/c1");
    expect(nameInputs()[0]).toHaveValue("alice!");

    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(location.current()).toBe("/clubs");
    expect(getClubs()).toEqual([riverside]);
  });

  it("treats undoing an edit as no change", async () => {
    renderAt("/clubs/new");
    const clubName = screen.getByRole("textbox", { name: "Club name" });
    await userEvent.type(clubName, "x");
    await userEvent.clear(clubName);
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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

describe("ClubEditScreen sessions link", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStoreForTests();
  });

  it("is hidden without Ended sessions of this Club and on New club", () => {
    setLocalClubs([riverside]);
    addEndedSession(endedFor("other", "c2"));
    renderAt("/clubs/c1");
    expect(screen.queryByRole("link", { name: "Sessions" })).not.toBeInTheDocument();
    cleanup();

    addEndedSession(endedFor("mine", "c1"));
    renderAt("/clubs/new");
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

  it("uses the singular for one session", () => {
    setLocalClubs([riverside]);
    addEndedSession(endedFor("a", "c1"));
    renderAt("/clubs/c1");
    expect(screen.getByRole("link", { name: "Sessions" })).toHaveAccessibleDescription(
      "1 past session",
    );
  });

  it("asks before discarding unsaved changes", async () => {
    setLocalClubs([riverside]);
    addEndedSession(endedFor("a", "c1"));
    const location = renderAt("/clubs/c1");
    await userEvent.type(nameInputs()[0]!, "!");

    await userEvent.click(screen.getByRole("link", { name: "Sessions" }));
    await userEvent.click(
      within(screen.getByRole("dialog", { name: "Discard changes?" })).getByRole("button", {
        name: "Keep editing",
      }),
    );
    expect(location.current()).toBe("/clubs/c1");
    expect(nameInputs()[0]).toHaveValue("alice!");

    await userEvent.click(screen.getByRole("link", { name: "Sessions" }));
    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(location.current()).toBe("/clubs/c1/sessions");
    expect(getClubs()).toEqual([riverside]);
  });

  it("goes straight there when nothing changed", async () => {
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

describe("ClubEditScreen session link", () => {
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

  it("is not shown on New club", () => {
    renderAt("/clubs/new");
    expect(screen.queryByRole("link", { name: "New session" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open active session" })).not.toBeInTheDocument();
  });

  it("asks before discarding unsaved changes", async () => {
    setLocalClubs([riverside]);
    const location = renderAt("/clubs/c1");
    await userEvent.type(nameInputs()[0]!, "!");
    await userEvent.click(screen.getByRole("link", { name: "New session" }));
    await userEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(location.current()).toBe("/clubs/c1");
    expect(nameInputs()[0]).toHaveValue("alice!");
  });
});
