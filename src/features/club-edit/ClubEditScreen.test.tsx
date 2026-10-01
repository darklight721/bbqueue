import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { App } from "../../app/App.tsx";
import type { Club } from "../../domain/types.ts";
import { getClubs, resetStoreForTests, setClubs } from "../../storage/store.ts";

const riverside: Club = {
  id: "c1",
  name: "Riverside",
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
    setClubs([riverside]);
    renderAt("/clubs/c1");
    expect(screen.getByRole("heading", { level: 1, name: "Edit club" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Club name" })).toHaveValue("Riverside");
    expect(names()).toEqual(["alice", "Bob", "Zed"]);
    expect(screen.getByRole("combobox", { name: "Skill level for Zed" })).toHaveValue("advanced");
  });

  it("appends an empty Intermediate row, focuses it and keeps it in place", async () => {
    setClubs([riverside]);
    renderAt("/clubs/c1");
    await userEvent.click(screen.getByRole("button", { name: "Add player" }));
    const added = nameInputs().at(-1)!;
    expect(added).toHaveValue("");
    expect(added).toHaveFocus();
    expect(screen.getByRole("combobox", { name: "Skill level" })).toHaveValue("intermediate");
    await userEvent.type(added, "Aaron");
    expect(names()).toEqual(["alice", "Bob", "Zed", "Aaron"]);
  });

  it("blocks Save on empty or duplicate Club names", async () => {
    setClubs([riverside]);
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
    setClubs([riverside]);
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
    expect(getClubs()).toEqual([{ id: expect.any(String), name: "Beacon", players: [] }]);
  });

  it("hides Delete club on New club", () => {
    renderAt("/clubs/new");
    expect(screen.queryByRole("button", { name: "Delete club" })).not.toBeInTheDocument();
  });

  it("deletes after confirming", async () => {
    setClubs([riverside]);
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
    setClubs([riverside]);
    const location = renderAt("/clubs/c1");
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(location.current()).toBe("/clubs");
  });

  it("asks before discarding changes", async () => {
    setClubs([riverside]);
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
