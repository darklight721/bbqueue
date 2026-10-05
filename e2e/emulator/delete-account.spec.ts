import { expect, test } from "@playwright/test";
import type { Club } from "../../src/domain/types.ts";
import {
  adminGetDoc,
  readServerClub,
  seedSharedClub,
  serverAccountFor,
  signUp,
  uniqueId,
} from "./emulator.ts";

// Roy deletes his Account; what Ana, who stays, sees afterwards.

test.describe("Deleting an Account, between two people", () => {
  test("a Club with another Organizer keeps Roy's row, unlinked; the Club he was alone on goes; the Account ID stays reserved", async ({
    page,
    browser,
    baseURL,
  }) => {
    const roy = await signUp(page, "Roy Smith");
    const anaPage = await (await browser.newContext({ baseURL })).newPage();
    const ana = await signUp(anaPage, "Ana Bell");
    const duo: Club = {
      id: uniqueId("duo"),
      name: uniqueId("Duo"),
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
          link: { accountId: ana.accountId, role: "organizer" },
        },
      ],
    };
    const solo: Club = {
      id: uniqueId("solo"),
      name: uniqueId("Solo"),
      kind: "shared",
      players: [
        {
          id: "p-roy",
          name: "Roy Smith",
          skill: "intermediate",
          link: { accountId: roy.accountId, role: "organizer" },
        },
        { id: "p-cat", name: "Cat", skill: "beginner" },
      ],
    };
    await seedSharedClub(duo);
    await seedSharedClub(solo);

    // Ana sees Roy linked.
    await anaPage.goto("/clubs");
    await anaPage.getByRole("link", { name: new RegExp(duo.name) }).click();
    await expect(anaPage.getByText(roy.accountId)).toBeVisible({ timeout: 20_000 });

    // Roy: the dialog lists both, then deletes.
    await page.goto("/clubs");
    await expect(page.getByRole("link", { name: new RegExp(solo.name) })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("link", { name: new RegExp(duo.name) })).toBeVisible();
    await page.goto("/account");
    await page.getByRole("button", { name: "Delete Account" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete your Account?" });
    await expect(dialog).toContainText(solo.name);
    await expect(
      dialog.getByRole("region", { name: "Clubs you'll be unlinked from" }),
    ).toContainText(duo.name);
    await dialog.getByRole("button", { name: "Delete Account" }).click();

    // Roy is signed out, with the default avatar, and the Shared clubs are gone from his device.
    await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
    await expect(page.getByRole("link", { name: "Account settings, no Account" })).toBeVisible();
    await page.goto("/clubs");
    await expect(
      page.getByRole("link", { name: new RegExp(`${solo.name}|${duo.name}`) }),
    ).toHaveCount(0);

    // On the server: Solo is gone, Duo stays with Roy's row unlinked, the Account is gone, the ID reserved.
    await expect.poll(async () => await readServerClub(solo.id)).toBeNull();
    const stays = await readServerClub(duo.id);
    expect(
      stays?.players
        .map((p) => [p.name, p.link?.role ?? null])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ).toEqual([
      ["Ana Bell", "organizer"],
      ["Roy Smith", null],
    ]);
    expect(await serverAccountFor(roy.accountId)).toBeNull();
    expect(await adminGetDoc(`accountIds/${roy.accountId.toLowerCase()}`)).not.toBeNull();

    // Ana sees Roy's row stay on the roster, no longer linked.
    await expect(anaPage.getByRole("button", { name: "Link Account for Roy Smith" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(anaPage.getByText(roy.accountId)).toHaveCount(0);

    await anaPage.context().close();
  });

  test("a Session Roy hosted stays for Ana, an Organizer, to take over", async ({
    page,
    browser,
    baseURL,
  }) => {
    const roy = await signUp(page, "Roy Smith");
    const anaPage = await (await browser.newContext({ baseURL })).newPage();
    const ana = await signUp(anaPage, "Ana Bell");
    const duo: Club = {
      id: uniqueId("duo"),
      name: uniqueId("Duo"),
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
          link: { accountId: ana.accountId, role: "organizer" },
        },
        { id: "p-cat", name: "Cat", skill: "advanced" },
        { id: "p-dan", name: "Dan", skill: "advanced" },
      ],
    };
    await seedSharedClub(duo);
    await page.goto("/clubs");
    await page.getByRole("link", { name: new RegExp(duo.name) }).click();
    await page.getByRole("link", { name: "New session" }).click();
    await page.getByRole("textbox", { name: "Session name" }).fill("Thursday night");
    await page.getByRole("button", { name: "Select all" }).click();
    await page.getByRole("button", { name: "Start session" }).click();
    await expect(page).toHaveURL(/\/sessions\/(?!new)[^/]+$/);

    await page.goto("/account");
    await page.getByRole("button", { name: "Delete Account" }).click();
    await expect(
      page.getByRole("dialog").getByRole("region", { name: "Sessions you host" }),
    ).toContainText(duo.name);
    await page.getByRole("dialog").getByRole("button", { name: "Delete Account" }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
    // The Session stays on Roy's device, on its own.
    await expect(page.getByRole("link", { name: "Resume session" })).toContainText(
      "Thursday night",
    );

    await anaPage.goto("/");
    const view = anaPage.getByRole("link", { name: "View session" });
    await expect(view).toBeVisible({ timeout: 30_000 });
    await view.click();
    await anaPage.getByRole("button", { name: "Take over" }).click();
    await anaPage.getByRole("dialog").getByRole("button", { name: "Take over" }).click();
    await expect(anaPage.getByRole("button", { name: "End session" })).toBeVisible();

    await anaPage.context().close();
  });
});
