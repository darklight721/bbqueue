import { expect, test, type Page } from "@playwright/test";
import { makeClub, makeEndedSession, seedStorage } from "./fixtures.ts";

const DAY = 86_400_000;
const BASE = 1_760_000_000_000;

/** Two Clubs with Ended sessions, plus one guests-only Ended session. */
function seed() {
  const alpha = makeClub({ name: "Alpha Club" });
  const bravo = makeClub({ name: "Bravo Club" });
  const session = (name: string, club: typeof alpha | null, daysAgo: number) =>
    makeEndedSession({
      name,
      clubId: club?.id ?? null,
      clubName: club?.name ?? null,
      startedAt: BASE - daysAgo * DAY,
      endedAt: BASE - daysAgo * DAY + 7_200_000,
    });
  return {
    alpha,
    bravo,
    alphaOne: session("Alpha one", alpha, 1),
    alphaTwo: session("Alpha two", alpha, 2),
    bravoOne: session("Bravo one", bravo, 3),
    guestOne: session("Guest one", null, 4),
  };
}

const clubFilter = (page: Page) => page.getByRole("combobox", { name: "Club" });
const sessionLink = (page: Page, name: string) => page.getByRole("link", { name, exact: true });
const urlEnding = (suffix: string) => new RegExp(`${suffix.replace(/[?.]/g, "\\$&")}$`);

async function seedAll(page: Page) {
  const data = seed();
  await seedStorage(page, {
    clubs: [data.alpha, data.bravo],
    endedSessions: [data.alphaOne, data.alphaTwo, data.bravoOne, data.guestOne],
  });
  return data;
}

test.describe("Ended sessions filtered by Club", () => {
  test("the Club filter is hidden with Ended sessions from a single Club", async ({ page }) => {
    const { alpha, alphaOne, alphaTwo } = seed();
    await seedStorage(page, { clubs: [alpha], endedSessions: [alphaOne, alphaTwo] });
    await page.goto("/sessions");
    await expect(page.getByRole("heading", { level: 1, name: "Past sessions" })).toBeVisible();
    await expect(page.getByText("2 sessions")).toBeVisible();
    await expect(clubFilter(page)).toHaveCount(0);
  });

  test("choosing a Club narrows the list; the choice is in the URL and survives a reload", async ({
    page,
  }) => {
    const { alpha } = await seedAll(page);
    await page.goto("/sessions");
    await expect(page.getByText("4 sessions")).toBeVisible();
    await expect(clubFilter(page)).toHaveValue("");
    await expect(clubFilter(page).getByRole("option")).toHaveText([
      "All clubs",
      "Alpha Club",
      "Bravo Club",
      "No club",
    ]);

    await clubFilter(page).selectOption({ label: "Alpha Club" });
    await expect(page).toHaveURL(urlEnding(`/sessions?club=${alpha.id}`));
    await expect(page.getByText("2 sessions")).toBeVisible();
    await expect(sessionLink(page, "Alpha one")).toBeVisible();
    await expect(sessionLink(page, "Alpha two")).toBeVisible();
    await expect(sessionLink(page, "Bravo one")).toHaveCount(0);
    await expect(sessionLink(page, "Guest one")).toHaveCount(0);

    await page.reload();
    await expect(page).toHaveURL(urlEnding(`/sessions?club=${alpha.id}`));
    await expect(clubFilter(page)).toHaveValue(alpha.id);
    await expect(page.getByText("2 sessions")).toBeVisible();
    await expect(sessionLink(page, "Bravo one")).toHaveCount(0);

    await clubFilter(page).selectOption({ label: "All clubs" });
    await expect(page).toHaveURL(urlEnding("/sessions"));
    await expect(page.getByText("4 sessions")).toBeVisible();
  });

  test('"No club" shows the guest-only sessions (?club=none)', async ({ page }) => {
    await seedAll(page);
    await page.goto("/sessions");
    await clubFilter(page).selectOption({ label: "No club" });

    await expect(page).toHaveURL(urlEnding("/sessions?club=none"));
    await expect(page.getByText("1 session", { exact: true })).toBeVisible();
    await expect(sessionLink(page, "Guest one")).toBeVisible();
    await expect(sessionLink(page, "Alpha one")).toHaveCount(0);
    await expect(sessionLink(page, "Bravo one")).toHaveCount(0);

    await page.reload();
    await expect(clubFilter(page)).toHaveValue("none");
    await expect(sessionLink(page, "Guest one")).toBeVisible();
    await expect(sessionLink(page, "Alpha one")).toHaveCount(0);
  });

  test("opening a session from a filtered list and pressing Back returns to that list", async ({
    page,
  }) => {
    const { bravo, bravoOne } = await seedAll(page);
    await page.goto(`/sessions?club=${bravo.id}`);
    await expect(clubFilter(page)).toHaveValue(bravo.id);

    await sessionLink(page, "Bravo one").click();
    await expect(page).toHaveURL(urlEnding(`/sessions/${bravoOne.id}?club=${bravo.id}`));
    await expect(page.getByRole("heading", { level: 1, name: "Bravo one" })).toBeVisible();

    await page.getByRole("button", { name: "Back" }).click();
    await expect(page).toHaveURL(urlEnding(`/sessions?club=${bravo.id}`));
    await expect(clubFilter(page)).toHaveValue(bravo.id);
    await expect(page.getByText("1 session", { exact: true })).toBeVisible();
    await expect(sessionLink(page, "Bravo one")).toBeVisible();
    await expect(sessionLink(page, "Alpha one")).toHaveCount(0);
  });

  test("Back from a session opened in the unfiltered list returns to the full list", async ({
    page,
  }) => {
    const { guestOne } = await seedAll(page);
    await page.goto("/sessions");
    await sessionLink(page, "Guest one").click();
    await expect(page).toHaveURL(urlEnding(`/sessions/${guestOne.id}`));

    await page.getByRole("button", { name: "Back" }).click();
    await expect(page).toHaveURL(urlEnding("/sessions"));
    await expect(page.getByText("4 sessions")).toBeVisible();
  });
});

test.describe("Club sessions list", () => {
  test("Edit club links to the Club's sessions, with a count; clubs without sessions have no link", async ({
    page,
  }) => {
    const { alpha, bravo, alphaOne, alphaTwo, bravoOne, guestOne } = seed();
    const empty = makeClub({ name: "Charlie Club" });
    await seedStorage(page, {
      clubs: [alpha, bravo, empty],
      endedSessions: [alphaOne, alphaTwo, bravoOne, guestOne],
    });
    await page.goto(`/clubs/${alpha.id}`);
    const link = page.getByRole("link", { name: "Sessions", exact: true });
    await expect(link).toHaveAccessibleDescription("2 past sessions");
    await link.click();
    await expect(page).toHaveURL(urlEnding(`/clubs/${alpha.id}/sessions`));

    await page.goto(`/clubs/${empty.id}`);
    await expect(page.getByRole("textbox", { name: "Club name" })).toHaveValue("Charlie Club");
    await expect(page.getByRole("link", { name: "Sessions", exact: true })).toHaveCount(0);
  });

  test("lists only that Club's Ended sessions, titled with the Club name", async ({ page }) => {
    const { alpha } = await seedAll(page);
    await page.goto(`/clubs/${alpha.id}/sessions`);

    await expect(page.getByRole("heading", { level: 1, name: "Alpha Club" })).toBeVisible();
    await expect(page.getByRole("banner").getByText("Sessions", { exact: true })).toBeVisible();
    await expect(page.getByText("2 sessions")).toBeVisible();
    await expect(sessionLink(page, "Alpha one")).toBeVisible();
    await expect(sessionLink(page, "Alpha two")).toBeVisible();
    await expect(sessionLink(page, "Bravo one")).toHaveCount(0);
    await expect(sessionLink(page, "Guest one")).toHaveCount(0);
    await expect(clubFilter(page)).toHaveCount(0);
  });

  test("Edit club → Sessions → session → Back → Back returns to each previous screen", async ({
    page,
  }) => {
    const { alpha, alphaTwo } = await seedAll(page);
    await page.goto(`/clubs/${alpha.id}`);
    await page.getByRole("link", { name: "Sessions", exact: true }).click();
    await expect(page).toHaveURL(urlEnding(`/clubs/${alpha.id}/sessions`));

    await sessionLink(page, "Alpha two").click();
    await expect(page).toHaveURL(urlEnding(`/sessions/${alphaTwo.id}?fromClub=${alpha.id}`));
    await expect(page.getByRole("heading", { level: 1, name: "Alpha two" })).toBeVisible();

    await page.getByRole("button", { name: "Back" }).click();
    await expect(page).toHaveURL(urlEnding(`/clubs/${alpha.id}/sessions`));
    await expect(page.getByRole("heading", { level: 1, name: "Alpha Club" })).toBeVisible();
    await expect(page.getByText("2 sessions")).toBeVisible();

    await page.getByRole("button", { name: "Back" }).click();
    await expect(page).toHaveURL(urlEnding(`/clubs/${alpha.id}`));
    await expect(page.getByRole("heading", { level: 1, name: "Edit club" })).toBeVisible();
  });

  test("the summary opened from a Club's session returns Back to the details, then the list", async ({
    page,
  }) => {
    const { alpha, alphaOne } = await seedAll(page);
    await page.goto(`/clubs/${alpha.id}/sessions`);
    await sessionLink(page, "Alpha one").click();
    await page.getByRole("link", { name: "View summary" }).click();
    await expect(page).toHaveURL(
      urlEnding(`/sessions/${alphaOne.id}/summary?from=details&fromClub=${alpha.id}`),
    );

    await page.getByRole("link", { name: "Back" }).click();
    await expect(page).toHaveURL(urlEnding(`/sessions/${alphaOne.id}?fromClub=${alpha.id}`));
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page).toHaveURL(urlEnding(`/clubs/${alpha.id}/sessions`));
  });

  test("an unknown club id redirects to the Clubs list", async ({ page }) => {
    await seedAll(page);
    await page.goto("/clubs/does-not-exist/sessions");
    await expect(page).toHaveURL(urlEnding("/clubs"));
    await expect(page.getByRole("heading", { level: 1, name: "Clubs" })).toBeVisible();
  });
});

test.describe("Club name on the Ended session details", () => {
  test("shows the Club name", async ({ page }) => {
    const { alpha, alphaOne } = await seedAll(page);
    await page.goto(`/sessions/${alphaOne.id}`);
    await expect(page.getByRole("heading", { level: 1, name: "Alpha one" })).toBeVisible();
    await expect(page.getByText(alpha.name, { exact: true })).toBeVisible();
  });

  test("a guests-only session shows no Club line, even with a stale saved name", async ({
    page,
  }) => {
    const ended = makeEndedSession({ name: "Guests only", clubId: null, clubName: "Stale Club" });
    await seedStorage(page, { endedSessions: [ended] });
    await page.goto(`/sessions/${ended.id}`);
    await expect(page.getByRole("heading", { level: 1, name: "Guests only" })).toBeVisible();
    await expect(page.getByText("Ended session", { exact: true })).toBeVisible();
    await expect(page.getByText("Stale Club")).toHaveCount(0);
  });

  test("a renamed Club shows its current name", async ({ page }) => {
    const club = makeClub({ name: "Fresh Name" });
    const ended = makeEndedSession({ name: "Old night", clubId: club.id, clubName: "Old Name" });
    await seedStorage(page, { clubs: [club], endedSessions: [ended] });
    await page.goto(`/sessions/${ended.id}`);
    await expect(page.getByText("Fresh Name", { exact: true })).toBeVisible();
    await expect(page.getByText("Old Name")).toHaveCount(0);
  });

  test("a deleted Club shows the name saved with the session", async ({ page }) => {
    const ended = makeEndedSession({
      name: "Orphan night",
      clubId: "deleted-club",
      clubName: "Saved Name",
    });
    await seedStorage(page, { clubs: [], endedSessions: [ended] });
    await page.goto(`/sessions/${ended.id}`);
    await expect(page.getByText("Saved Name", { exact: true })).toBeVisible();
  });
});

test.describe("Delete session", () => {
  const deleteButton = (page: Page) => page.getByRole("button", { name: "Delete session" });
  const dialog = (page: Page) => page.getByRole("dialog", { name: "Delete this session?" });

  test("a guests-only session: Delete → confirm → back on Past sessions, gone, still gone after a reload", async ({
    page,
  }) => {
    const { guestOne } = await seedAll(page);
    await page.goto("/sessions");
    await sessionLink(page, "Guest one").click();
    await expect(page).toHaveURL(urlEnding(`/sessions/${guestOne.id}`));

    await deleteButton(page).click();
    await expect(dialog(page)).toContainText("'Guest one' and its matches will be gone for good.");
    await dialog(page).getByRole("button", { name: "Delete" }).click();

    await expect(page).toHaveURL(urlEnding("/sessions"));
    await expect(page.getByRole("heading", { level: 1, name: "Past sessions" })).toBeVisible();
    await expect(page.getByText("3 sessions")).toBeVisible();
    await expect(sessionLink(page, "Guest one")).toHaveCount(0);

    await page.reload();
    await expect(page.getByText("3 sessions")).toBeVisible();
    await expect(sessionLink(page, "Guest one")).toHaveCount(0);
    // Its old address now just lands on the list.
    await page.goto(`/sessions/${guestOne.id}`);
    await expect(page).toHaveURL(urlEnding("/sessions"));
  });

  test("Keep leaves it where it was", async ({ page }) => {
    const { guestOne } = await seedAll(page);
    await page.goto(`/sessions/${guestOne.id}`);
    await deleteButton(page).click();
    await dialog(page).getByRole("button", { name: "Keep" }).click();

    await expect(dialog(page)).toHaveCount(0);
    await expect(page).toHaveURL(urlEnding(`/sessions/${guestOne.id}`));
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Guest one" })).toBeVisible();
  });

  test("deleting from a Club's filtered list goes back to that list", async ({ page }) => {
    const { alpha } = await seedAll(page);
    await page.goto(`/sessions?club=${alpha.id}`);
    await sessionLink(page, "Alpha one").click();

    await deleteButton(page).click();
    await dialog(page).getByRole("button", { name: "Delete" }).click();

    await expect(page).toHaveURL(urlEnding(`/sessions?club=${alpha.id}`));
    await expect(clubFilter(page)).toHaveValue(alpha.id);
    await expect(sessionLink(page, "Alpha one")).toHaveCount(0);
    await expect(sessionLink(page, "Alpha two")).toBeVisible();
    await expect(sessionLink(page, "Bravo one")).toHaveCount(0);
  });

  test("Back after deleting doesn't return to the deleted session", async ({ page }) => {
    const { alpha } = await seedAll(page);
    await page.goto("/");
    await page.goto(`/clubs/${alpha.id}/sessions`);
    await sessionLink(page, "Alpha two").click();
    await deleteButton(page).click();
    await dialog(page).getByRole("button", { name: "Delete" }).click();
    await expect(page).toHaveURL(urlEnding(`/clubs/${alpha.id}/sessions`));
    await expect(sessionLink(page, "Alpha two")).toHaveCount(0);

    await page.goBack();
    await expect(page).not.toHaveURL(/\/sessions\/[^/?]+$/);
  });
});
