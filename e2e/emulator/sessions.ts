import { expect, type Browser, type Page } from "@playwright/test";
import type { Club } from "../../src/domain/types.ts";
import { court, openScoreDialog } from "../session-helpers.ts";
import { seedSharedClub, signUp, uniqueId } from "./emulator.ts";

// Steps shared by the two-person specs about Shared Active sessions. Roy (Organizer, and Session
// host) is `page`; Ana is a second browser context. The Club is named "Thursday night" at Start.

/** Roy runs a new Shared club with Ana as a Player (or an Organizer) and three more on the roster. */
export async function twoPeople(
  page: Page,
  browser: Browser,
  baseURL: string | undefined,
  options: { anaRole?: "organizer" | "player" } = {},
) {
  const roy = await signUp(page, "Roy Smith");
  const anaPage = await (await browser.newContext({ baseURL })).newPage();
  const ana = await signUp(anaPage, "Ana Bell");
  const club: Club = {
    id: uniqueId("shared"),
    name: uniqueId("Riverside"),
    kind: "shared",
    players: [
      {
        id: "p-roy",
        name: "Roy Smith",
        skill: "intermediate",
        link: { accountId: roy.accountId, role: "organizer" },
      },
      {
        id: "p-ana",
        name: "Ana Bell",
        skill: "beginner",
        link: { accountId: ana.accountId, role: options.anaRole ?? "player" },
      },
      { id: "p-cat", name: "Cat", skill: "advanced" },
      { id: "p-dan", name: "Dan", skill: "intermediate" },
      { id: "p-eve", name: "Eve", skill: "beginner" },
    ],
  };
  await seedSharedClub(club);
  return { club, anaPage, roy, ana };
}

/** Roy starts a Session for the Club from its Club screen. */
export async function startSession(page: Page, club: Club) {
  await page.goto("/clubs");
  await page.getByRole("link", { name: new RegExp(club.name) }).click();
  await page.getByRole("link", { name: "New session" }).click();
  await page.getByRole("textbox", { name: "Session name" }).fill("Thursday night");
  await page.getByRole("button", { name: "Select all" }).click();
  await page.getByRole("button", { name: "Start session" }).click();
  // Starting a shared Session needs the server: either the Session opens, or an alert says why not.
  const heading = page.getByRole("heading", { level: 1, name: "Thursday night" });
  const alert = page.getByRole("alert");
  await expect(heading.or(alert).first()).toBeVisible();
  if ((await alert.count()) > 0) {
    throw new Error(`Starting the session failed: ${await alert.first().innerText()}`);
  }
  await expect(page).toHaveURL(/\/sessions\/(?!new)[^/]+$/);
  await expect(heading).toBeVisible();
}

/** Ana opens the Session from Home. */
export async function watchFromHome(anaPage: Page) {
  await anaPage.goto("/");
  const view = anaPage.getByRole("link", { name: "View session" });
  await expect(view).toBeVisible();
  await expect(view).toContainText("Host: Roy Smith");
  await view.click();
  await expect(anaPage.getByText("Watching. Roy Smith runs this session.")).toBeVisible();
}

export async function endMatchWithoutScore(page: Page) {
  const dialog = await openScoreDialog(page, 1);
  await dialog.getByRole("button", { name: "End without score" }).click();
  await expect(court(page, 1).getByText("Idle", { exact: true })).toBeVisible();
}
