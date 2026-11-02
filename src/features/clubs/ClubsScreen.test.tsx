import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { setBackendForTests } from "../../backend/index.ts";
import { createInMemoryBackend } from "../../backend/inMemoryBackend.ts";
import type { Club } from "../../domain/types.ts";
import {
  getClubs,
  resetStoreForTests,
  setAccount,
  setLocalClubs,
  setSharedClubs,
} from "../../storage/store.ts";
import { ClubsScreen } from "./ClubsScreen.tsx";

function player(id: string) {
  return { id, name: id, skill: "intermediate" as const };
}

function renderScreen() {
  const location = memoryLocation({ path: "/clubs", record: true });
  render(
    <Router hook={location.hook}>
      <ClubsScreen />
    </Router>,
  );
  return location;
}

describe("ClubsScreen", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStoreForTests();
  });

  afterEach(() => {
    setBackendForTests(null);
  });

  it("shows the empty state with Add club, which opens the New club sheet", async () => {
    renderScreen();
    expect(screen.getByRole("heading", { level: 2, name: "No clubs yet" })).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add club" }));
    const sheet = screen.getByRole("dialog", { name: "New club" });
    expect(within(sheet).getByRole("heading", { name: "New club" })).toHaveFocus();
  });

  it("New club: Create club makes the Club and opens its page in Players Edit mode", async () => {
    setLocalClubs([{ id: "c1", name: "Riverside", kind: "local", players: [] }]);
    const location = renderScreen();
    await userEvent.click(screen.getByRole("button", { name: "Add club" }));
    const sheet = screen.getByRole("dialog", { name: "New club" });
    await userEvent.type(
      within(sheet).getByRole("textbox", { name: "Club name" }),
      "  Mill   Lane {Enter}",
    );

    const created = getClubs().find((club) => club.name === "Mill Lane");
    expect(created).toEqual({
      id: expect.any(String),
      name: "Mill Lane",
      kind: "local",
      players: [],
    });
    expect(location.history.at(-1)).toBe(`/clubs/${created!.id}?new=1`);
  });

  it("New club: an empty, too long or duplicate name blocks Create with a message", async () => {
    setLocalClubs([{ id: "c1", name: "Riverside", kind: "local", players: [] }]);
    const location = renderScreen();
    await userEvent.click(screen.getByRole("button", { name: "Add club" }));
    const sheet = screen.getByRole("dialog", { name: "New club" });
    const field = within(sheet).getByRole("textbox", { name: "Club name" });
    const create = () =>
      userEvent.click(within(sheet).getByRole("button", { name: "Create club" }));

    await create();
    expect(within(sheet).getByText("Enter a name")).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription("Enter a name");

    await userEvent.type(field, "x".repeat(41));
    expect(within(sheet).getByText("Name is too long (at most 40 characters)")).toBeInTheDocument();

    await userEvent.clear(field);
    await userEvent.type(field, " RIVERSIDE ");
    await create();
    expect(within(sheet).getByText("Club name already used")).toBeInTheDocument();

    expect(getClubs()).toHaveLength(1);
    expect(location.history.at(-1)).toBe("/clubs");
  });

  it("New club: the × closes the sheet and nothing is created", async () => {
    renderScreen();
    await userEvent.click(screen.getByRole("button", { name: "Add club" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Club name" }), "Draft");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(getClubs()).toEqual([]);

    // It opens empty again.
    await userEvent.click(screen.getByRole("button", { name: "Add club" }));
    expect(screen.getByRole("textbox", { name: "Club name" })).toHaveValue("");
  });

  it("lists Clubs alphabetically (ignoring case) with player counts", () => {
    const clubs: Club[] = [
      { id: "c1", name: "riverside", kind: "local", players: [player("a"), player("b")] },
      { id: "c2", name: "Abbey Road", kind: "local", players: [player("c")] },
      { id: "c3", name: "Mill Lane", kind: "local", players: [] },
      { id: "c4", name: "BEACON", kind: "local", players: [player("d"), player("e"), player("f")] },
    ];
    setLocalClubs(clubs);
    renderScreen();

    const links = within(screen.getByRole("list")).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "AAbbey Road1 player",
      "BBEACON3 players",
      "MMill LaneNo players",
      "Rriverside2 players",
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/clubs/c2",
      "/clubs/c4",
      "/clubs/c3",
      "/clubs/c1",
    ]);
    expect(screen.getByRole("link", { name: "Abbey Road" })).toHaveAccessibleDescription(
      "1 player",
    );
    expect(screen.getByRole("link", { name: "BEACON" })).toHaveAttribute("href", "/clubs/c4");
    expect(screen.queryByText("No clubs yet")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Add club" })).toHaveLength(1);
  });

  it("opens a Club when its row is tapped, and Back goes Home", async () => {
    setLocalClubs([{ id: "c9", name: "Riverside", kind: "local", players: [] }]);
    const location = renderScreen();
    await userEvent.click(screen.getByRole("link", { name: "Riverside" }));
    expect(location.history.at(-1)).toBe("/clubs/c9");

    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(location.history.at(-1)).toBe("/");
  });

  it("badges a Local club This device only when there is a Backend, next to the player count", () => {
    setBackendForTests(createInMemoryBackend());
    setLocalClubs([{ id: "c1", name: "Riverside", kind: "local", players: [player("a")] }]);
    renderScreen();

    const row = screen.getByRole("link", { name: "Riverside" });
    expect(within(row).getByText("This device only")).toHaveClass("badge");
    expect(row).toHaveAccessibleDescription("1 player This device only");
  });

  it("badges a Shared club where the Account is a Player; Organizer and Local rows get no Role badge", () => {
    setBackendForTests(createInMemoryBackend());
    setAccount({ accountId: "roy-7k3f", name: "Roy" });
    setSharedClubs([
      {
        id: "s1",
        name: "Riverside",
        kind: "shared",
        players: [
          player("a"),
          { ...player("roy"), link: { accountId: "roy-7k3f", role: "player" } },
        ],
      },
      {
        id: "s2",
        name: "Beacon",
        kind: "shared",
        players: [{ ...player("roy"), link: { accountId: "roy-7k3f", role: "organizer" } }],
      },
    ]);
    setLocalClubs([{ id: "c1", name: "Mill Lane", kind: "local", players: [] }]);
    renderScreen();

    const riverside = screen.getByRole("link", { name: "Riverside" });
    expect(within(riverside).getByText("Player")).toHaveClass("badge");
    expect(riverside).toHaveAccessibleDescription("2 players Player");

    const beacon = screen.getByRole("link", { name: "Beacon" });
    expect(within(beacon).queryByText("Player")).not.toBeInTheDocument();
    expect(beacon).toHaveAccessibleDescription("1 player");

    const mill = screen.getByRole("link", { name: "Mill Lane" });
    expect(within(mill).queryByText("Player")).not.toBeInTheDocument();
    expect(mill).toHaveAccessibleDescription("No players This device only");
  });
});
