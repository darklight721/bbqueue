import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { setBackendForTests } from "../../backend/index.ts";
import { createInMemoryBackend } from "../../backend/inMemoryBackend.ts";
import type { Club } from "../../domain/types.ts";
import {
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

  it("shows the empty state with Add club", async () => {
    const location = renderScreen();
    expect(screen.getByRole("heading", { level: 2, name: "No clubs yet" })).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Add club" }));
    expect(location.history.at(-1)).toBe("/clubs/new");
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
    expect(screen.getAllByRole("link", { name: "Add club" })).toHaveLength(1);
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
