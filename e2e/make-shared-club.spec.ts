import { expect, test, type Page } from "@playwright/test";
import type { Account, Club } from "../src/domain/types.ts";
import {
  makeClub,
  makeEndedSessionFromMatches,
  makeMidMatchSession,
  readFakeActiveSessions,
  readFakeClubs,
  readFakeEndedSessions,
  readStoredData,
  seedStorage,
} from "./fixtures.ts";

const roy: Account = { accountId: "roy-7k3f", name: "Roy Smith" };
const ana: Account = { accountId: "ana-2222", name: "Ana Bell" };

const garage = (): Club =>
  makeClub({
    id: "club-garage",
    name: "Garage",
    kind: "local",
    players: [
      { id: "p-ana", name: "Ana", skill: "beginner" },
      { id: "p-roy", name: "Roy S.", skill: "advanced" },
      { id: "p-cat", name: "Cat", skill: "intermediate" },
      { id: "p-dan", name: "Dan", skill: "intermediate" },
    ],
  });

async function makeShared(page: Page, who: string | RegExp) {
  await page.getByRole("button", { name: "Make shared club" }).click();
  const sheet = page.getByRole("dialog", { name: "Which player are you?" });
  await expect(sheet.getByRole("button", { name: "Continue" })).toBeDisabled();
  await sheet.getByRole("radio", { name: who }).check();
  await sheet.getByRole("button", { name: "Continue" }).click();
  const confirm = page.getByRole("dialog", { name: "Make Garage a shared club?" });
  await expect(confirm).toContainText("This can't be undone.");
  await confirm.getByRole("button", { name: "Make shared club" }).click();
}

test.describe("Make shared club", () => {
  test("signed out: a Local club, then an Account is made, then the Club is shared and another Account can be linked", async ({
    page,
  }) => {
    await seedStorage(page, { clubs: [garage()], otherAccounts: [ana] });
    await page.goto("/clubs/club-garage");
    await expect(page.getByText("This device only")).toBeVisible();
    // No Account yet: the reason, not a button.
    await expect(page.getByRole("button", { name: "Make shared club" })).toHaveCount(0);
    await expect(
      page.getByText("Create an Account to share this club with other people."),
    ).toBeVisible();

    // Sign up from Account settings.
    await page.goto("/account");
    await page.getByLabel("Your name").fill("Roy Smith");
    await page.getByRole("button", { name: "Add your name" }).click();
    await expect(page.getByRole("region", { name: "Your Account", exact: true })).toContainText(
      "Roy Smith",
    );

    await page.goto("/clubs/club-garage");
    await expect(page.getByText("This device only")).toBeVisible();
    await makeShared(page, "Roy S.");

    await expect(page.getByText("This device only")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Make shared club" })).toHaveCount(0);
    expect(await readStoredData<Club[]>(page, "clubs")).toEqual([]);
    const [onServer] = await readFakeClubs(page);
    expect(onServer).toMatchObject({ id: "club-garage", name: "Garage" });
    expect(onServer?.players.map((p) => [p.id, p.link?.role ?? null])).toEqual([
      ["p-ana", null],
      ["p-roy", "organizer"],
      ["p-cat", null],
      ["p-dan", null],
    ]);

    // Account IDs link as for any Shared club.
    // Rows are sorted by name: Ana's comes first.
    const anaField = page.getByRole("textbox", { name: "Player name" }).first();
    await expect(anaField).toHaveValue("Ana");
    await anaField.fill(`@${ana.accountId}`);
    await expect(page.getByText(ana.accountId, { exact: true })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Role for Ana Bell" })).toHaveValue("player");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/clubs$/);
    await expect
      .poll(async () => (await readFakeClubs(page))[0]?.players.find((p) => p.id === "p-ana")?.link)
      .toEqual({ accountId: ana.accountId, role: "player" });
  });

  test("a Local club's Ended sessions and running Session go with it; this device hosts the Session", async ({
    page,
  }) => {
    const club = garage();
    const own = makeMidMatchSession({
      startedAt: Date.now() - 5 * 60_000,
      overrides: { name: "Tonight", clubId: club.id, clubName: club.name },
    });
    // Session players made from the Club's rows.
    own.players = own.players.map((p, i) => ({ ...p, clubPlayerId: club.players[i]?.id ?? null }));
    const past = makeEndedSessionFromMatches(
      [{ a: ["Ana", "Ben"], b: ["Cat", "Dan"], score: [21, 15] }],
      { name: "Last week", clubId: club.id, clubName: club.name },
    );
    const other = makeEndedSessionFromMatches(
      [{ a: ["Eve", "Fay"], b: ["Gus", "Hal"], score: [21, 9] }],
      { name: "No club night", endedAt: 1_600_000_000_000 },
    );
    await seedStorage(page, {
      account: roy,
      clubs: [club],
      session: own,
      endedSessions: [past, other],
    });
    await page.goto("/clubs/club-garage");

    await makeShared(page, "Roy S.");

    await expect(page.getByText("This device only")).toHaveCount(0);
    await expect.poll(async () => (await readFakeActiveSessions(page)).length).toBe(1);
    const [active] = await readFakeActiveSessions(page);
    expect(active).toMatchObject({ clubId: club.id, hostAccountId: roy.accountId });
    // His own Session player (made from "Roy S.") keeps the Account; the others have none.
    expect(active?.session.players.filter((p) => p.accountId).map((p) => p.clubPlayerId)).toEqual([
      "p-roy",
    ]);
    expect((await readFakeEndedSessions(page)).map((e) => e.name)).toEqual(["Last week"]);
    // The device slot is empty, and Home lists the Session as the one he hosts.
    expect(await readStoredData(page, "session")).toBeNull();
    await page.goto("/");
    const resume = page.getByRole("link", { name: "Resume session" });
    await expect(resume).toHaveCount(1);
    await expect(resume).toContainText("Tonight");
    // Both Ended sessions are still there, each once.
    await expect(page.getByRole("link", { name: "Past sessions" })).toHaveAccessibleDescription(
      "2 sessions",
    );
  });

  test("Add me adds the Account to the roster as Organizer", async ({ page }) => {
    await seedStorage(page, { account: roy, clubs: [garage()] });
    await page.goto("/clubs/club-garage");

    await makeShared(page, /Add me/);

    await expect.poll(async () => (await readFakeClubs(page))[0]?.players.length).toBe(5);
    const me = (await readFakeClubs(page))[0]!.players.at(-1)!;
    expect(me).toMatchObject({
      name: "Roy Smith",
      skill: "intermediate",
      link: { role: "organizer" },
    });
  });

  test("offline it explains that it needs a connection", async ({ page, context }) => {
    await seedStorage(page, { account: roy, clubs: [garage()] });
    await page.goto("/clubs/club-garage");
    await expect(page.getByRole("button", { name: "Make shared club" })).toBeEnabled();

    await context.setOffline(true);

    await expect(page.getByRole("button", { name: "Make shared club" })).toBeDisabled();
    await expect(
      page.getByText("You're offline. Sharing a club needs a connection."),
    ).toBeVisible();
  });
});
