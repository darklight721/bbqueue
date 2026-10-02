import { expect, test } from "@playwright/test";
import { makeMidMatchSession, seedStorage } from "./fixtures.ts";
import { court, openScoreDialog, storedSession } from "./session-helpers.ts";

test.describe("Point system during a Session", () => {
  test("switching to 31 mid-session: the match being played stays at 21", async ({ page }) => {
    // Court 1 is playing (to 21) and Court 2 has a Lineup. Started 10 minutes ago.
    const session = makeMidMatchSession({ startedAt: Date.now() - 10 * 60_000 });
    session.startedAt = Date.now() - 10 * 60_000;
    await seedStorage(page, { session });
    await page.goto(`/sessions/${session.id}`);

    await page.getByRole("button", { name: "21 pts, change point system" }).click();
    const dialog = page.getByRole("dialog", { name: "Point system" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("The match being played stays at 21 points.")).toBeVisible();
    await expect(dialog.getByText(/^Suggested: (21|31) — /)).toBeVisible();

    await dialog.getByText("31", { exact: true }).click();
    await expect(dialog.getByRole("radio", { name: "31 points" })).toBeChecked();
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "31 pts, change point system" })).toBeVisible();
    expect((await storedSession(page)).pointSystem).toBe(31);

    // Court 1 keeps playing to 21, and its score is checked against 21.
    await expect(court(page, 1).getByText("to 21")).toBeVisible();
    const score = await openScoreDialog(page, 1);
    await expect(score.getByText("Winner needs at least 21 points.")).toBeVisible();
    const [a, b] = await score.getByRole("textbox").all();
    await a!.fill("21");
    await b!.fill("15");
    await score.getByRole("button", { name: "Save" }).click();
    await expect(score).toBeHidden();

    // A match started now plays to 31: no tag needed.
    await court(page, 2).getByRole("button", { name: "Start match" }).click();
    await expect(court(page, 2).getByText("Playing")).toBeVisible();
    await expect(court(page, 2).getByText(/^to \d+/)).toHaveCount(0);
    const next = await openScoreDialog(page, 2);
    await expect(next.getByText("Winner needs at least 31 points.")).toBeVisible();
    await next.getByRole("button", { name: "Cancel" }).click();

    const stored = await storedSession(page);
    expect(stored.matches.map((match) => [match.courtNumber, match.target, match.status])).toEqual([
      [1, 21, "ended"],
      [2, 31, "active"],
    ]);

    // Still 31 after a reload.
    await page.reload();
    await expect(page.getByRole("button", { name: "31 pts, change point system" })).toBeVisible();
  });
});
