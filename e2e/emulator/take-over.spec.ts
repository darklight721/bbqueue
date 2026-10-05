import { expect, test, type Page } from "@playwright/test";
import { court } from "../session-helpers.ts";
import { startSession, twoPeople } from "./sessions.ts";

// Two Organizers on the Firebase emulators: Roy hosts, Ana takes over.

/** Ana opens the Session Roy hosts, from Home. */
async function openAsViewer(anaPage: Page) {
  await anaPage.goto("/");
  const view = anaPage.getByRole("link", { name: "View session" });
  await expect(view).toBeVisible({ timeout: 20_000 });
  await view.click();
  await expect(anaPage.getByText("Watching. Roy Smith runs this session.")).toBeVisible();
}

test.describe("Taking over as Session host", () => {
  test("Ana takes over after confirming; Roy turns read-only with an explanation; Ana starts a Match and Roy sees it live", async ({
    page,
    browser,
    baseURL,
  }) => {
    const { club, anaPage } = await twoPeople(page, browser, baseURL, { anaRole: "organizer" });
    await startSession(page, club);
    await openAsViewer(anaPage);
    await expect(anaPage.getByRole("button", { name: "Start match" })).toHaveCount(0);

    await anaPage.getByRole("button", { name: "Take over" }).click();
    const dialog = anaPage.getByRole("dialog", { name: "Take over as host?" });
    await expect(dialog).toContainText("Changes Roy Smith made but never uploaded will be lost");
    await dialog.getByRole("button", { name: "Take over" }).click();

    // Ana runs it now.
    await expect(court(anaPage, 1).getByRole("button", { name: "Start match" })).toBeVisible();
    await expect(anaPage.getByText(/Watching\./)).toHaveCount(0);

    // Roy's device notices and turns read-only, saying why.
    await expect(page.getByText("Watching. Ana Bell runs this session.")).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByText("Ana Bell took over. Changes you hadn't uploaded were dropped."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "End session" })).toHaveCount(0);
    await expect(court(page, 1).getByRole("button", { name: "Start match" })).toHaveCount(0);
    // He is an Organizer, so he can take it back.
    await expect(page.getByRole("button", { name: "Take over" })).toBeVisible();

    // Ana starts a Match; Roy sees it live.
    await court(anaPage, 1).getByRole("button", { name: "Start match" }).click();
    await expect(court(page, 1).getByText("Playing", { exact: true })).toBeVisible({
      timeout: 20_000,
    });

    await anaPage.context().close();
  });

  test("the host plays offline while somebody takes over: back online, the unsent change is dropped and the old host is read-only", async ({
    page,
    context,
    browser,
    baseURL,
  }) => {
    const { club, anaPage } = await twoPeople(page, browser, baseURL, { anaRole: "organizer" });
    await startSession(page, club);
    await openAsViewer(anaPage);

    // Roy goes offline and starts a Match that never reaches the server.
    await context.setOffline(true);
    await court(page, 1).getByRole("button", { name: "Start match" }).click();
    await expect(court(page, 1).getByText("Playing", { exact: true })).toBeVisible();

    // Ana takes over while he is away.
    await anaPage.getByRole("button", { name: "Take over" }).click();
    await anaPage.getByRole("dialog").getByRole("button", { name: "Take over" }).click();
    await expect(court(anaPage, 1).getByRole("button", { name: "Start match" })).toBeVisible();
    await expect(court(anaPage, 1).getByText("Idle", { exact: true })).toBeVisible();

    // Roy comes back: his copy is replaced by Ana's, his Match is gone, and he is read-only.
    await context.setOffline(false);
    await expect(page.getByText("Watching. Ana Bell runs this session.")).toBeVisible({
      timeout: 45_000,
    });
    await expect(court(page, 1).getByText("Idle", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Ana Bell took over. Changes you hadn't uploaded were dropped."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "End session" })).toHaveCount(0);
    // Ana's copy was not overwritten by the stale upload.
    await page.waitForTimeout(2500);
    await expect(court(anaPage, 1).getByText("Idle", { exact: true })).toBeVisible();

    await anaPage.context().close();
  });

  test("a Player can't take over", async ({ page, browser, baseURL }) => {
    const { club, anaPage } = await twoPeople(page, browser, baseURL);
    await startSession(page, club);
    await openAsViewer(anaPage);

    await expect(anaPage.getByRole("button", { name: "Take over" })).toHaveCount(0);

    await anaPage.context().close();
  });
});
