import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { App } from "../../app/App.tsx";
import { BackendError } from "../../backend/backend.ts";
import { createInMemoryBackend, type InMemoryBackend } from "../../backend/inMemoryBackend.ts";
import { setBackendForTests, startAccountSync, startSharedClubSync } from "../../backend/index.ts";
import type { Club } from "../../domain/types.ts";
import { createRng, createSession } from "../../domain/engine/index.ts";
import type { Session } from "../../domain/types.ts";
import {
  applyActiveSessionsReport,
  getClubs,
  resetStoreForTests,
  setAccount,
  setSession,
  setWelcomeDone,
} from "../../storage/store.ts";

function renderAt(path: string) {
  const location = memoryLocation({ path, record: true });
  render(
    <Router hook={location.hook}>
      <App />
    </Router>,
  );
}

let backend: InMemoryBackend;
let stops: (() => void)[] = [];

async function startWith(options: { signedIn: boolean }) {
  backend = createInMemoryBackend();
  setBackendForTests(backend);
  setWelcomeDone();
  if (options.signedIn) setAccount(await backend.createAccount("Roy Smith"));
  stops = [startAccountSync(backend), startSharedClubSync(backend)];
}

beforeEach(() => {
  localStorage.clear();
  resetStoreForTests();
});

afterEach(() => {
  for (const stop of stops) stop();
  stops = [];
  setBackendForTests(null);
});

/** A Session on this device with no Club. */
function deviceSession(): Session {
  return createSession(
    {
      name: "Local night",
      clubId: null,
      clubName: null,
      pointSystem: 21,
      plannedHours: 1,
      courts: 1,
      players: ["A", "B", "C", "D"].map((name) => ({ name, skill: "intermediate" as const })),
    },
    { now: 1, rng: createRng(1) },
  );
}

const nameInputs = () => screen.getAllByRole("textbox", { name: "Player name" });

const names = () => nameInputs().map((input) => (input as HTMLInputElement).value);

/** Clubs → Add club → name → Create club: Edit players for the new Club. */
async function createFromSheet(user: ReturnType<typeof userEvent.setup>, name: string) {
  renderAt("/clubs");
  await user.click(screen.getByRole("button", { name: "Add club" }));
  const sheet = screen.getByRole("dialog", { name: "New club" });
  await user.type(within(sheet).getByRole("textbox", { name: "Club name" }), name);
  await user.click(within(sheet).getByRole("button", { name: "Create club" }));
  await screen.findByRole("heading", { level: 1, name: "Edit players" });
}

describe("Club screens with Accounts", () => {
  it("signed in: a new Club is a Shared club with me on the roster as Organizer", async () => {
    await startWith({ signedIn: true });
    const user = userEvent.setup();
    await createFromSheet(user, "Tuesday");

    const [club] = getClubs();
    expect(club).toMatchObject({ name: "Tuesday", kind: "shared" });
    expect(club?.players).toEqual([
      expect.objectContaining({
        name: "Roy Smith",
        skill: "intermediate",
        link: { accountId: expect.stringMatching(/^roy-/), role: "organizer" },
      }),
    ]);
    // Edit players, with an empty row after mine.
    expect(names()).toEqual(["Roy Smith", ""]);
    expect(nameInputs()[1]).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Remove Roy Smith" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Shared club · You're an Organizer")).toBeInTheDocument();

    // Shared clubs aren't "this device only".
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("link", { name: /Tuesday/ })).not.toHaveTextContent("This device only");
  });

  it("signed out: a new Club is a Local club labelled This device only, and stays Local after signing up", async () => {
    await startWith({ signedIn: false });
    const user = userEvent.setup();
    await createFromSheet(user, "Tuesday");

    expect(getClubs()).toEqual([
      { id: expect.any(String), name: "Tuesday", kind: "local", players: [] },
    ]);
    expect(names()).toEqual([""]);

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("This device only")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("link", { name: /Tuesday/ })).toHaveTextContent("This device only");

    await act(async () => setAccount(await backend.createAccount("Roy")));

    expect(getClubs().map((club) => club.kind)).toEqual(["local"]);
    await user.click(screen.getByRole("link", { name: /Tuesday/ }));
    expect(screen.getByText("This device only")).toBeInTheDocument();
  });

  it("without a backend nothing says This device only", async () => {
    setWelcomeDone();
    const user = userEvent.setup();
    await createFromSheet(user, "Tuesday");
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.queryByText("This device only")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("link", { name: /Tuesday/ })).not.toHaveTextContent("This device only");
    expect(getClubs()[0]?.kind).toBe("local");
  });

  it("a Shared club the server refuses to create keeps the sheet open with the reason", async () => {
    await startWith({ signedIn: true });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    vi.spyOn(backend, "createSharedClub").mockRejectedValue(new BackendError("offline"));
    renderAt("/clubs");
    await user.click(screen.getByRole("button", { name: "Add club" }));
    const sheet = screen.getByRole("dialog", { name: "New club" });
    await user.type(within(sheet).getByRole("textbox", { name: "Club name" }), "Tuesday");
    await user.click(within(sheet).getByRole("button", { name: "Create club" }));

    expect(
      await within(sheet).findByText("You're offline. Connect to make this change."),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "New club" })).toBeInTheDocument();
    expect(getClubs()).toEqual([]);
    vi.restoreAllMocks();
  });

  describe("editing a Shared club", () => {
    let club: Club;

    beforeEach(async () => {
      await startWith({ signedIn: true });
      club = await backend.createSharedClub({
        id: "c1",
        name: "Tuesday",
        players: [{ id: "p-ana", name: "Ana", skill: "beginner" }],
      });
    });

    it("renames the Club from the card with one rename, and nothing else", async () => {
      const rename = vi.spyOn(backend, "renameSharedClub");
      const update = vi.spyOn(backend, "updateClubPlayer");
      const user = userEvent.setup();
      renderAt("/clubs/c1");
      expect(screen.getByText("Shared club · You're an Organizer")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Edit club name" }));
      await user.clear(screen.getByRole("textbox", { name: "Club name" }));
      await user.type(screen.getByRole("textbox", { name: "Club name" }), "Friday{Enter}");

      expect(rename).toHaveBeenCalledExactlyOnceWith("c1", "Friday");
      expect(update).not.toHaveBeenCalled();
      expect(getClubs()[0]?.name).toBe("Friday");
      expect(screen.getByRole("heading", { level: 2, name: "Friday" })).toBeInTheDocument();
    });

    it("a rename the server refuses keeps the sheet open with the reason", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(backend, "renameSharedClub").mockRejectedValue(new BackendError("forbidden"));
      const user = userEvent.setup();
      renderAt("/clubs/c1");

      await user.click(screen.getByRole("button", { name: "Edit club name" }));
      await user.type(screen.getByRole("textbox", { name: "Club name" }), " Night{Enter}");

      expect(
        await screen.findByText("You can't change this Club. Only Organizers can."),
      ).toBeInTheDocument();
      expect(screen.getByRole("dialog", { name: "Edit club name" })).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Club name" })).toHaveValue("Tuesday Night");
      expect(getClubs()[0]?.name).toBe("Tuesday");
      vi.restoreAllMocks();
    });

    it("sends Skill level changes through the Backend", async () => {
      const user = userEvent.setup();
      renderAt("/clubs/c1");
      await user.click(screen.getByRole("link", { name: "Edit players" }));

      await user.selectOptions(
        screen.getByRole("combobox", { name: "Skill level for Ana" }),
        "advanced",
      );
      await user.click(screen.getByRole("button", { name: "Save" }));

      const [saved] = getClubs();
      expect(saved?.name).toBe("Tuesday");
      expect(saved?.players.find((p) => p.id === "p-ana")?.skill).toBe("advanced");
      expect(saved?.players.find((p) => p.id === club.players[0]!.id)).toBeDefined();
      expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    });

    it("adds a row through the Backend", async () => {
      const user = userEvent.setup();
      renderAt("/clubs/c1");
      await user.click(screen.getByRole("link", { name: "Edit players" }));

      await user.click(screen.getByRole("button", { name: "Add player" }));
      await user.type(nameInputs().at(-1)!, "Ben");
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(getClubs()[0]?.players.map((p) => p.name)).toContain("Ben");
    });

    it("offline: Skill level changes still save, adding a row is turned off with the reason", async () => {
      const user = userEvent.setup();
      renderAt("/clubs/c1");
      await user.click(screen.getByRole("link", { name: "Edit players" }));

      act(() => backend.setOnline(false));
      expect(screen.getByRole("button", { name: "Add player" })).toBeDisabled();
      expect(
        screen.getByText("You're offline. Adding players needs a connection."),
      ).toBeInTheDocument();

      await user.selectOptions(
        screen.getByRole("combobox", { name: "Skill level for Ana" }),
        "advanced",
      );
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(getClubs()[0]?.players.find((p) => p.id === "p-ana")?.skill).toBe("advanced");
    });

    it("removes a row but never the Organizer's own", async () => {
      const user = userEvent.setup();
      renderAt("/clubs/c1");
      await user.click(screen.getByRole("link", { name: "Edit players" }));

      await user.click(screen.getByRole("button", { name: "Remove Ana" }));
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(getClubs()[0]?.players.map((p) => p.name)).toEqual(["Roy Smith"]);
    });

    it("offers New session, which doesn't replace the device's own Session", () => {
      setSession(deviceSession());
      renderAt("/clubs/c1");

      const link = screen.getByRole("link", { name: "New session" });
      expect(link).toHaveAttribute("href", "/sessions/new?club=c1");
      expect(link).toHaveTextContent("Pick players and courts");
    });

    it("offers Open active session instead once the Club has one, whoever hosts it", () => {
      const running = { ...deviceSession(), id: "shared-1", name: "Thursday", clubId: "c1" };
      applyActiveSessionsReport({
        sessions: [
          {
            clubId: "c1",
            session: running,
            hostAccountId: "ana-2222",
            hostName: "Ana",
            updatedAt: 1,
          },
        ],
        unknown: [],
      });
      renderAt("/clubs/c1");

      expect(screen.queryByRole("link", { name: "New session" })).not.toBeInTheDocument();
      const link = screen.getByRole("link", { name: "Open active session" });
      expect(link).toHaveAttribute("href", "/sessions/shared-1");
      expect(link).toHaveAccessibleDescription("Thursday · Host: Ana");
    });

    it("deletes the Club", async () => {
      const user = userEvent.setup();
      renderAt("/clubs/c1");

      await user.click(screen.getByRole("button", { name: "Delete club" }));
      await user.click(screen.getByRole("button", { name: "Delete" }));

      expect(getClubs()).toEqual([]);
    });

    describe("while the server answers", () => {
      beforeEach(() => {
        vi.spyOn(console, "error").mockImplementation(() => {});
      });
      afterEach(() => vi.restoreAllMocks());

      it("Save shows it's busy, locks the form and Back, and after a failure is normal again", async () => {
        let fail!: (error: unknown) => void;
        vi.spyOn(backend, "updateClubPlayer").mockReturnValue(
          new Promise((_, reject) => (fail = reject)),
        );
        const user = userEvent.setup();
        renderAt("/clubs/c1");
        await user.click(screen.getByRole("link", { name: "Edit players" }));

        await user.selectOptions(
          screen.getByRole("combobox", { name: "Skill level for Ana" }),
          "advanced",
        );
        await user.click(screen.getByRole("button", { name: "Save" }));

        const busy = screen.getByRole("button", { name: "Saving…" });
        expect(busy).toBeDisabled();
        expect(busy).toHaveAttribute("aria-busy", "true");
        expect(busy.querySelector(".loading-spinner")).toHaveAttribute("aria-hidden", "true");
        expect(screen.getByRole("button", { name: "Add player" })).toBeDisabled();
        for (const input of nameInputs()) expect(input).toBeDisabled();

        // Back does nothing, not even the discard question.
        await user.click(screen.getByRole("button", { name: "Back" }));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(screen.getByRole("heading", { level: 1, name: "Edit players" })).toBeInTheDocument();

        await act(async () => fail(new BackendError("failed")));

        // Still on Edit players, with the message.
        expect(screen.getByRole("alert")).toHaveTextContent(
          "Couldn't save your changes. Try again.",
        );
        const save = screen.getByRole("button", { name: "Save" });
        expect(save).toBeEnabled();
        expect(save).not.toHaveAttribute("aria-busy");
        expect(screen.getByRole("button", { name: "Add player" })).toBeEnabled();
        for (const input of nameInputs()) expect(input).toBeEnabled();
      });

      it("Delete club keeps its dialog open and busy, then closes it with the error on failure", async () => {
        let fail!: (error: unknown) => void;
        const remove = vi
          .spyOn(backend, "deleteSharedClub")
          .mockReturnValue(new Promise((_, reject) => (fail = reject)));
        const user = userEvent.setup();
        renderAt("/clubs/c1");

        await user.click(screen.getByRole("button", { name: "Delete club" }));
        const dialog = screen.getByRole("dialog", { name: "Delete Tuesday?" });
        await user.click(within(dialog).getByRole("button", { name: "Delete" }));

        const busy = within(dialog).getByRole("button", { name: "Deleting…" });
        expect(busy).toHaveAttribute("aria-busy", "true");
        expect(busy).toHaveAttribute("aria-disabled", "true");
        expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
        await user.click(busy); // no second delete
        await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
        expect(remove).toHaveBeenCalledOnce();
        expect(screen.getByRole("dialog", { name: "Delete Tuesday?" })).toBeInTheDocument();

        // Back does nothing while it runs.
        fireEvent.click(screen.getByRole("button", { name: "Back", hidden: true }));

        await act(async () => fail(new BackendError("failed")));

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(screen.getByRole("alert")).toHaveTextContent(
          "Couldn't save your changes. Try again.",
        );
        expect(screen.getByRole("heading", { level: 1, name: "Club" })).toBeInTheDocument();
        expect(getClubs()).toHaveLength(1);

        // The next try starts from the normal dialog.
        await user.click(screen.getByRole("button", { name: "Delete club" }));
        expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();
      });
    });
  });
});
