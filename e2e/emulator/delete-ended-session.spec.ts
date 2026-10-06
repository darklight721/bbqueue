import { expect, test, type Page } from "@playwright/test";
import { makeEndedSessionFromMatches } from "../fixtures.ts";
import { adminGetDoc, seedSharedEndedSession, uniqueId } from "./emulator.ts";
import { twoPeople } from "./sessions.ts";

// Roy is an Organizer of a Shared club and Ana a Player. The Club has one Ended session on the
// server; only an Organizer may delete it, and then it is gone for everyone on the Club.

async function withEndedSession(
  page: Page,
  browser: Parameters<typeof twoPeople>[1],
  baseURL?: string,
) {
  const people = await twoPeople(page, browser, baseURL);
  const ended = makeEndedSessionFromMatches(
    [{ a: ["Roy Smith", "Ana Bell"], b: ["Cat", "Dan"], score: [21, 15] }],
    {
      id: uniqueId("ended"),
      name: "Thursday night",
      clubId: people.club.id,
      clubName: people.club.name,
      startedAt: Date.now() - 3 * 3_600_000,
      endedAt: Date.now() - 3_600_000,
    },
  );
  await seedSharedEndedSession(people.club.id, ended, people.roy.accountId);
  return { ...people, ended };
}

/** Past sessions → the session, once the server's copy has reached the device. */
async function openFromList(page: Page) {
  await page.goto("/sessions");
  await page.getByRole("link", { name: /Thursday night/ }).click();
  await expect(heading(page)).toBeVisible();
}

const deleteButton = (page: Page) => page.getByRole("button", { name: "Delete session" });
const heading = (page: Page) => page.getByRole("heading", { level: 1, name: "Thursday night" });

test.describe("Deleting an Ended session of a Shared club", () => {
  test("the Organizer deletes it: it disappears for the Player too, also after a reload; the Player has no Delete", async ({
    page,
    browser,
    baseURL,
  }) => {
    const { club, anaPage, ended } = await withEndedSession(page, browser, baseURL);

    // Ana, a Player, can look but not delete.
    await openFromList(anaPage);
    await expect(deleteButton(anaPage)).toHaveCount(0);

    await openFromList(page);
    await deleteButton(page).click();
    const dialog = page.getByRole("dialog", { name: "Delete this session?" });
    await expect(dialog).toContainText(
      `'Thursday night' and its matches will be gone for good. Everyone on ${club.name} loses it too.`,
    );
    await dialog.getByRole("button", { name: "Delete" }).click();

    await expect(page).toHaveURL(/\/sessions$/);
    await expect(page.getByRole("link", { name: /Thursday night/ })).toHaveCount(0);
    await expect.poll(() => adminGetDoc(`clubs/${club.id}/endedSessions/${ended.id}`)).toBeNull();

    // Ana was on its details: she lands on Past sessions, where it's gone.
    await expect(anaPage).toHaveURL(/\/sessions$/);
    await expect(anaPage.getByRole("link", { name: /Thursday night/ })).toHaveCount(0);
    await anaPage.reload();
    await expect(anaPage.getByText("No past sessions yet")).toBeVisible();
    await anaPage.goto(`/sessions/${ended.id}`);
    await expect(anaPage).toHaveURL(/\/sessions$/);

    await page.reload();
    await expect(page.getByText("No past sessions yet")).toBeVisible();

    await anaPage.context().close();
  });

  test("offline, the Organizer's Delete session is off and says it needs a connection", async ({
    page,
    context,
    browser,
    baseURL,
  }) => {
    const { anaPage } = await withEndedSession(page, browser, baseURL);
    await anaPage.context().close();

    await openFromList(page);
    await expect(deleteButton(page)).toBeEnabled();

    await context.setOffline(true);
    await expect(deleteButton(page)).toBeDisabled();
    await expect(deleteButton(page)).toHaveAccessibleDescription("Deleting needs a connection.");

    await context.setOffline(false);
    await expect(deleteButton(page)).toBeEnabled();
    await expect(page.getByText("Deleting needs a connection.")).toHaveCount(0);
  });
});
