import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { App } from "../../app/App.tsx";
import { createInMemoryBackend, type InMemoryBackend } from "../../backend/inMemoryBackend.ts";
import { setBackendForTests, startAccountSync, startSharedClubSync } from "../../backend/index.ts";
import { resetStoreForTests, setAccount, setWelcomeDone } from "../../storage/store.ts";

let backend: InMemoryBackend;
let stops: (() => void)[] = [];

beforeEach(async () => {
  localStorage.clear();
  resetStoreForTests();
  backend = createInMemoryBackend();
  const account = await backend.createAccount("Roy");
  await backend.createSharedClub({ id: "c1", name: "Riverside", players: [] });
  setBackendForTests(backend);
  setWelcomeDone();
  setAccount(account);
  stops = [startAccountSync(backend), startSharedClubSync(backend)];
  render(
    <Router hook={memoryLocation({ path: "/sessions/new", record: true }).hook}>
      <App />
    </Router>,
  );
});

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  setBackendForTests(null);
});

describe("New session with a Shared club", () => {
  async function addGuestToSave() {
    await userEvent.type(screen.getByRole("textbox", { name: "Player name" }), "Kim");
    await userEvent.click(screen.getByRole("checkbox", { name: "Save to club" }));
    await userEvent.click(screen.getByRole("button", { name: "Add guest" }));
  }

  it("offers the Club to an Organizer", () => {
    expect(screen.getByRole("option", { name: /Riverside/ })).toBeInTheDocument();
  });

  it("warns, while offline, that guests marked Save to club won't be saved to the Club", async () => {
    await addGuestToSave();
    expect(screen.queryByText(/won't be saved to Riverside/)).not.toBeInTheDocument();

    act(() => backend.setOnline(false));

    expect(screen.getByRole("status")).toHaveTextContent(
      "You're offline. Guests still join, but won't be saved to Riverside.",
    );
  });
});
