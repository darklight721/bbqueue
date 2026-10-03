import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { Club } from "../../domain/types.ts";
import { resetStoreForTests, setLocalClubs } from "../../storage/store.ts";
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
});
