import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { App } from "../../app/App.tsx";
import type { Club, Session } from "../../domain/types.ts";
import {
  getClubs,
  getSession,
  resetStoreForTests,
  setClubs,
  setSession,
} from "../../storage/store.ts";
import { defaultSessionName } from "./newSession.ts";

const riverside: Club = {
  id: "c1",
  name: "Riverside",
  players: [
    { id: "p1", name: "Zed", skill: "advanced" },
    { id: "p2", name: "amy", skill: "beginner" },
    { id: "p3", name: "Bob", skill: "intermediate" },
    { id: "p4", name: "Cat", skill: "intermediate" },
  ],
};
const beacon: Club = {
  id: "c2",
  name: "Beacon",
  players: [{ id: "b1", name: "Kim", skill: "advanced" }],
};

const oldSession: Session = {
  id: "old",
  name: "Last week",
  clubId: null,
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

function renderScreen(path = "/sessions/new") {
  const location = memoryLocation({ path, record: true });
  render(
    <Router hook={location.hook}>
      <App />
    </Router>,
  );
  return { current: () => location.history.at(-1) };
}

const user = () => userEvent.setup();

describe("NewSessionScreen keyboard", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStoreForTests();
  });

  it("Enter in the session name dismisses the keyboard without starting", async () => {
    const location = renderScreen();
    const sessionName = screen.getByRole("textbox", { name: "Session name" });
    await user().type(sessionName, "{Enter}");
    expect(sessionName).not.toHaveFocus();
    expect(location.current()).toBe("/sessions/new");
    expect(getSession()).toBeNull();
  });
});
const clubSelect = () => screen.getByRole("combobox", { name: "Club" });
const startButton = () => screen.getByRole("button", { name: "Start session" });
const checkbox = (name: string) => screen.getByRole("checkbox", { name });

async function addGuest(name: string, options: { saveToClub?: boolean } = {}) {
  const u = user();
  await u.type(screen.getByRole("textbox", { name: "Player name" }), name);
  if (options.saveToClub) await u.click(checkbox("Save to club"));
  await u.click(screen.getByRole("button", { name: "Add guest" }));
}

describe("NewSessionScreen", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStoreForTests();
  });

  it("defaults the Session name to today", () => {
    renderScreen();
    expect(screen.getByRole("heading", { level: 1, name: "New session" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Session name" })).toHaveValue(
      defaultSessionName(new Date()),
    );
  });

  it("pre-selects guests only when there are no Clubs", () => {
    renderScreen();
    expect(clubSelect()).toHaveValue("none");
    expect(screen.queryByRole("heading", { name: "Club players" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Save to club" })).not.toBeInTheDocument();
  });

  it("pre-selects the only Club and lists its players alphabetically, unchecked", () => {
    setClubs([riverside]);
    renderScreen();
    expect(clubSelect()).toHaveValue("c1");
    const list = within(screen.getByRole("region", { name: "Club players" }));
    const boxes = list.getAllByRole("checkbox");
    // Each tile: full name (tooltip) and Skill level (screen-reader text behind BEG / INT / ADV).
    const tiles = boxes.map((box) => {
      const tile = box.closest("label")!;
      const skill = within(tile).getByText(/^(Beginner|Intermediate|Advanced)$/).textContent;
      return `${tile.title} · ${skill}`;
    });
    expect(tiles).toEqual([
      "amy · Beginner",
      "Bob · Intermediate",
      "Cat · Intermediate",
      "Zed · Advanced",
    ]);
    expect(boxes.every((box) => !(box as HTMLInputElement).checked)).toBe(true);
  });

  it("asks to choose when there are several Clubs", async () => {
    setClubs([riverside, beacon]);
    renderScreen();
    expect(clubSelect()).toHaveValue("");
    expect(
      within(clubSelect())
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Choose a club", "Beacon", "Riverside", "No club (guests only)"]);
    expect(screen.getByText("Choose a club to see its players.")).toBeInTheDocument();
    await user().selectOptions(clubSelect(), "c2");
    expect(checkbox("Kim")).not.toBeChecked();
  });

  it("blocks Start until a Club (or No club) is chosen when there are several Clubs", async () => {
    setClubs([riverside, beacon]);
    renderScreen();
    const u = user();
    for (const name of ["Ann", "Bo", "Cy", "Di"]) await addGuest(name);
    expect(startButton()).toBeDisabled();
    expect(screen.getByText("Choose a club", { selector: "p" })).toBeInTheDocument();
    expect(screen.queryByText("Add at least 4 players")).not.toBeInTheDocument();

    await u.selectOptions(clubSelect(), "none");
    expect(startButton()).toBeEnabled();
    expect(screen.queryByText("Choose a club", { selector: "p" })).not.toBeInTheDocument();
  });

  it("selects all / none and shows the count", async () => {
    setClubs([riverside]);
    renderScreen();
    const u = user();
    await u.click(checkbox("Bob"));
    expect(screen.getByText("1 player selected")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Select all" }));
    expect(screen.getByText("4 players selected")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Select none" }));
    expect(screen.getByText("No players selected")).toBeInTheDocument();
  });

  it("clears ticks when the Club changes, keeping Guests", async () => {
    setClubs([riverside, beacon]);
    renderScreen();
    const u = user();
    await u.selectOptions(clubSelect(), "c1");
    await u.click(checkbox("Bob"));
    await addGuest("Dana", { saveToClub: true });
    expect(screen.getByText("Saves to club")).toBeInTheDocument();

    await u.selectOptions(clubSelect(), "c2");
    expect(checkbox("Kim")).not.toBeChecked();
    expect(screen.getByText("1 player selected")).toBeInTheDocument();

    await u.selectOptions(clubSelect(), "none");
    expect(screen.getByText("Dana")).toBeInTheDocument();
    expect(screen.queryByText("Saves to club")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Save to club" })).not.toBeInTheDocument();
  });

  it("offers Save to club, unchecked, when a Club is selected; blocks duplicate names", async () => {
    setClubs([riverside]);
    renderScreen();
    expect(checkbox("Save to club")).not.toBeChecked();
    await addGuest("ZED");
    expect(screen.getByText("Name already used")).toBeInTheDocument();
    await user().clear(screen.getByRole("textbox", { name: "Player name" }));
    await addGuest("Dana");
    await addGuest("dana");
    expect(screen.getByText("Name already used")).toBeInTheDocument();
    await user().click(screen.getByRole("button", { name: "Remove Dana" }));
    expect(screen.queryByText("Dana")).not.toBeInTheDocument();
  });

  it("flags a Guest whose name matches a Club player as 'Name taken' and blocks Start", async () => {
    setClubs([riverside]);
    renderScreen();
    const u = user();
    await u.selectOptions(clubSelect(), "none");
    await addGuest("Bob");
    expect(screen.queryByText("Name taken")).not.toBeInTheDocument();

    await u.selectOptions(clubSelect(), "c1");
    expect(screen.getByText("Name taken")).toBeInTheDocument();
    expect(screen.getByText("Name already used by a Club player")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Select all" }));
    expect(screen.getByText("Two players have the same name")).toBeInTheDocument();
    expect(startButton()).toBeDisabled();
  });

  it("keeps Courts and Hours within bounds", async () => {
    renderScreen();
    const u = user();
    const courts = screen.getByRole("spinbutton", { name: "Courts" });
    const hours = screen.getByRole("spinbutton", { name: "Hours" });
    expect(courts).toHaveValue(1);
    expect(hours).toHaveValue(1);
    expect(screen.getByRole("button", { name: "Decrease Courts" })).toBeDisabled();

    const moreCourts = screen.getByRole("button", { name: "Increase Courts" });
    for (let i = 0; i < 9; i++) await u.click(moreCourts);
    expect(courts).toHaveValue(10);
    expect(moreCourts).toBeDisabled();

    expect(screen.getByRole("button", { name: "Decrease Hours" })).toBeDisabled();
    await u.click(screen.getByRole("button", { name: "Increase Hours" }));
    expect(hours).toHaveValue(2);
    await u.click(screen.getByRole("button", { name: "Increase Hours" }));
    expect(hours).toHaveValue(3);
    await u.click(screen.getByRole("button", { name: "Decrease Hours" }));
    await u.click(screen.getByRole("button", { name: "Decrease Hours" }));
    expect(hours).toHaveValue(1);
    expect(screen.getByRole("button", { name: "Decrease Hours" })).toBeDisabled();

    await u.clear(hours);
    await u.type(hours, "2.5");
    await u.tab();
    expect(hours).toHaveValue(3);
  });

  it("follows the suggestion until the Point system is changed by hand", async () => {
    setClubs([riverside]);
    renderScreen();
    const u = user();
    await u.click(checkbox("amy"));
    await u.click(checkbox("Bob"));
    await u.click(checkbox("Cat"));
    expect(screen.queryByText(/Suggested:/)).not.toBeInTheDocument();

    await u.click(checkbox("Zed"));
    expect(screen.getByText("Suggested: 21 — about 4 games each")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "21 points" })).toBeChecked();

    await u.click(screen.getByRole("button", { name: "Increase Hours" }));
    expect(screen.getByText("Suggested: 31 — about 4 games each")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "31 points" })).toBeChecked();

    await u.click(screen.getByRole("radio", { name: "21 points" }));
    await u.click(screen.getByRole("button", { name: "Increase Hours" }));
    expect(screen.getByText("Suggested: 31 — about 6 games each")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "21 points" })).toBeChecked();

    await u.click(screen.getByRole("button", { name: "Use suggestion" }));
    expect(screen.getByRole("radio", { name: "31 points" })).toBeChecked();
  });

  it("needs a name and at least 4 players to start", async () => {
    setClubs([riverside]);
    renderScreen();
    const u = user();
    expect(startButton()).toBeDisabled();
    expect(screen.getByText("Add at least 4 players")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Select all" }));
    expect(startButton()).toBeEnabled();
    await u.clear(screen.getByRole("textbox", { name: "Session name" }));
    expect(startButton()).toBeDisabled();
    expect(screen.getByText("Enter a session name")).toBeInTheDocument();
  });

  it("asks before replacing a saved Session", async () => {
    setSession(oldSession);
    renderScreen();
    for (const name of ["A", "B", "C", "D"]) await addGuest(name);
    const u = user();

    await u.click(startButton());
    const dialog = screen.getByRole("dialog", { name: "End the current session 'Last week'?" });
    expect(dialog).toHaveAccessibleDescription("It will be discarded.");
    await u.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(getSession()?.id).toBe("old");

    await u.click(startButton());
    await u.click(screen.getByRole("button", { name: "Discard and start" }));
    expect(getSession()?.id).not.toBe("old");
  });

  it("creates the Session, saves chosen Guests to the Club and opens it", async () => {
    setClubs([riverside, beacon]);
    const location = renderScreen();
    const u = user();
    await u.selectOptions(clubSelect(), "c1");
    const name = screen.getByRole("textbox", { name: "Session name" });
    await u.clear(name);
    await u.type(name, "Thursday");
    await u.click(checkbox("amy"));
    await u.click(checkbox("Zed"));
    await addGuest("Dana", { saveToClub: true });
    await addGuest("Eve");
    await u.click(screen.getByRole("button", { name: "Increase Courts" }));
    await u.click(startButton());

    const session = getSession()!;
    expect(location.current()).toBe(`/sessions/${session.id}`);
    expect(session.name).toBe("Thursday");
    expect(session.clubId).toBe("c1");
    expect(session.courts.map((court) => court.number)).toEqual([1, 2]);
    expect(session.players.map((p) => [p.name, p.skill])).toEqual([
      ["amy", "beginner"],
      ["Zed", "advanced"],
      ["Dana", "intermediate"],
      ["Eve", "intermediate"],
    ]);
    const saved = getClubs().find((club) => club.id === "c1")!;
    const dana = saved.players.find((player) => player.name === "Dana");
    expect(dana).toBeDefined();
    expect(saved.players.some((player) => player.name === "Eve")).toBe(false);
    expect(session.players[2]?.clubPlayerId).toBe(dana?.id);
    expect(session.players[3]?.clubPlayerId).toBeNull();
    expect(session.players[0]?.clubPlayerId).toBe("p2");
  });
});

describe("NewSessionScreen opened from a Club", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStoreForTests();
  });

  it("locks the Club from ?club=: shown as a fixed value, its players listed", () => {
    setClubs([riverside, beacon]);
    renderScreen("/sessions/new?club=c2");
    expect(screen.queryByRole("combobox", { name: "Club" })).not.toBeInTheDocument();
    const locked = screen.getByRole("textbox", { name: "Club" });
    expect(locked).toHaveValue("Beacon");
    expect(locked).toHaveAttribute("readonly");
    expect(checkbox("Kim")).not.toBeChecked();
    expect(screen.queryByRole("checkbox", { name: "Zed" })).not.toBeInTheDocument();
    expect(screen.queryByText("Choose a club")).not.toBeInTheDocument();
  });

  it("starts the Session for the locked Club", async () => {
    setClubs([riverside, beacon]);
    renderScreen("/sessions/new?club=c1");
    for (const name of ["amy", "Bob", "Cat", "Zed"]) await user().click(checkbox(name));
    await user().click(startButton());
    expect(getSession()?.clubId).toBe("c1");
  });

  it("Back returns to the Club screen", async () => {
    setClubs([riverside, beacon]);
    const location = renderScreen("/sessions/new?club=c1");
    await user().click(screen.getByRole("button", { name: "Back" }));
    expect(location.current()).toBe("/clubs/c1");
  });

  it("an unknown Club falls back to the normal picker, and Back goes Home", async () => {
    setClubs([riverside, beacon]);
    const location = renderScreen("/sessions/new?club=nope");
    expect(clubSelect()).toHaveValue("");
    expect(screen.queryByRole("textbox", { name: "Club" })).not.toBeInTheDocument();
    await user().click(screen.getByRole("button", { name: "Back" }));
    expect(location.current()).toBe("/");
  });
});
