import { expect, test, type Page } from "@playwright/test";
import type { Account, ActiveSession, Club } from "../src/domain/types.ts";
import {
  makeClub,
  makeMidMatchSession,
  makeSession,
  readFakeActiveSessions,
  readSharedSessions,
  readStoredData,
  seedStorage,
} from "./fixtures.ts";
import { court, openScoreDialog } from "./session-helpers.ts";

const roy: Account = { accountId: "roy-7k3f", name: "Roy Smith" };
const ana: Account = { accountId: "ana-2222", name: "Ana Bell" };

/** A Shared club on the fake "server": Roy is its Organizer, Ana a Player, three more on the roster. */
const riverside: Club = makeClub({
  id: "club-riverside",
  name: "Riverside",
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
      link: { accountId: ana.accountId, role: "player" },
    },
    { id: "p-cat", name: "Cat", skill: "advanced" },
    { id: "p-dan", name: "Dan", skill: "intermediate" },
    { id: "p-eve", name: "Eve", skill: "beginner" },
  ],
});

/** The Active session of Riverside, hosted by Roy, as the fake "server" holds it. */
function runningAtRiverside(overrides: Partial<ActiveSession> = {}): ActiveSession {
  const session = makeMidMatchSession({
    startedAt: Date.now() - 5 * 60_000,
    overrides: { name: "Thursday night", clubId: riverside.id, clubName: riverside.name },
  });
  return {
    clubId: riverside.id,
    session,
    hostAccountId: roy.accountId,
    hostName: roy.name,
    updatedAt: Date.now(),
    ...overrides,
  };
}

/** Start a Session for Riverside from its Club screen, as Roy. */
async function startRiversideSession(page: Page) {
  await page.goto(`/clubs/${riverside.id}`);
  await page.getByRole("link", { name: "New session" }).click();
  await expect(page).toHaveURL(/\/sessions\/new\?club=/);
  await page.getByRole("textbox", { name: "Session name" }).fill("Thursday night");
  await page.getByRole("button", { name: "Select all" }).click();
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page).toHaveURL(/\/sessions\/(?!new)[^/]+$/);
  await expect(page.getByRole("heading", { level: 1, name: "Thursday night" })).toBeVisible();
}

const serverSession = async (page: Page) =>
  (await readFakeActiveSessions(page)).find((s) => s.clubId === riverside.id);

test.describe("Shared active session", () => {
  test("Home lists this device's own Session for a Local club and a Shared club's Active session, and the Shared one opens read-only", async ({
    page,
  }) => {
    const local = makeClub({ id: "club-local", name: "Garage Club", kind: "local" });
    const own = makeSession({
      name: "Garage night",
      clubId: local.id,
      clubName: local.name,
    });
    const shared = runningAtRiverside();
    await seedStorage(page, {
      account: ana,
      otherAccounts: [roy],
      clubs: [local],
      session: own,
      sharedClubs: [riverside],
      activeSessions: [shared],
    });

    await page.goto("/");

    const resume = page.getByRole("link", { name: "Resume session" });
    await expect(resume).toHaveCount(1);
    await expect(resume).toContainText("Garage night");
    const view = page.getByRole("link", { name: "View session" });
    await expect(view).toContainText("Thursday night · Riverside · Host: Roy Smith");

    await view.click();
    await expect(page).toHaveURL(new RegExp(`/sessions/${shared.session.id}$`));
    await expect(page.getByText("Watching. Roy Smith runs this session.")).toBeVisible();
    // Courts, Lineups and Players are there to look at …
    await expect(court(page, 1).getByText("Playing", { exact: true })).toBeVisible();
    await expect(court(page, 2).getByText("Lineup", { exact: true })).toBeVisible();
    await expect(page.getByRole("list", { name: "Session players" })).toBeVisible();
    // … and nothing changes the Session.
    for (const name of [
      /Start match/,
      /Rehash/,
      /End match/,
      /Remove match/,
      /Add court/,
      /Add queue/,
      /Sit out/,
      /Add player/,
      /End session/,
      /change point system/,
    ]) {
      await expect(page.getByRole("button", { name })).toHaveCount(0);
    }
    await expect(page.getByRole("textbox")).toHaveCount(0);
    // The device's own Session is untouched, and still on Home.
    expect((await readStoredData<{ id: string }>(page, "session"))?.id).toBe(own.id);
  });

  test("an Organizer starts a Shared club's Session from the Club screen and becomes its host, without replacing the device's own Session", async ({
    page,
  }) => {
    const own = makeSession({ name: "Garage night" });
    await seedStorage(page, {
      account: roy,
      otherAccounts: [ana],
      sharedClubs: [riverside],
      session: own,
    });

    await startRiversideSession(page);

    // No "End the current session?" question: nothing of the device's own was replaced.
    expect((await readStoredData<{ id: string }>(page, "session"))?.id).toBe(own.id);
    await expect.poll(async () => (await serverSession(page))?.hostAccountId).toBe(roy.accountId);
    expect((await serverSession(page))?.session.players.map((p) => p.name).sort()).toEqual([
      "Ana Bell",
      "Cat",
      "Dan",
      "Eve",
      "Roy Smith",
    ]);
    // The host runs it as always.
    await expect(court(page, 1).getByRole("button", { name: "Start match" })).toBeVisible();
    await expect(page.getByRole("button", { name: "End session" })).toBeVisible();

    // Home lists both, and says which one I host.
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Resume session" })).toHaveCount(2);
    await expect(
      page.getByRole("link", { name: "Resume session" }).filter({ hasText: "You're the host" }),
    ).toContainText("Thursday night · Riverside");

    // The Club screen now offers the running Session instead of a second one.
    await page.goto(`/clubs/${riverside.id}`);
    await expect(page.getByRole("link", { name: "New session" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Open active session" })).toContainText(
      "Thursday night",
    );
    // And so does New session itself.
    await page.goto(`/sessions/new?club=${riverside.id}`);
    await expect(page.getByRole("button", { name: "Start session" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Open active session" })).toBeVisible();
  });

  test("a Session an Organizer didn't start is theirs to watch only, even from the Club screen", async ({
    page,
  }) => {
    const shared = runningAtRiverside({ hostAccountId: "other-9999", hostName: "Another Host" });
    await seedStorage(page, {
      account: roy,
      sharedClubs: [riverside],
      activeSessions: [shared],
    });

    await page.goto(`/clubs/${riverside.id}`);
    await page.getByRole("link", { name: "Open active session" }).click();

    await expect(page.getByText("Watching. Another Host runs this session.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Start match" })).toHaveCount(0);
  });

  test("starting a Shared club's Session needs a connection", async ({ page, context }) => {
    await seedStorage(page, { account: roy, sharedClubs: [riverside] });
    await page.goto(`/sessions/new?club=${riverside.id}`);
    await page.getByRole("button", { name: "Select all" }).click();
    await expect(page.getByRole("button", { name: "Start session" })).toBeEnabled();

    await context.setOffline(true);

    await expect(page.getByRole("button", { name: "Start session" })).toBeDisabled();
    await expect(page.getByText(/You're offline\. Starting needs a connection/)).toBeVisible();

    await context.setOffline(false);
    await expect(page.getByRole("button", { name: "Start session" })).toBeEnabled();
  });

  test("the host keeps playing offline, and the latest copy is uploaded once the connection is back", async ({
    page,
    context,
  }) => {
    await seedStorage(page, { account: roy, sharedClubs: [riverside] });
    await startRiversideSession(page);
    await expect.poll(async () => (await serverSession(page))?.session.matches.length).toBe(0);
    const uploadedAt = (await serverSession(page))!.updatedAt;

    await context.setOffline(true);
    await court(page, 1).getByRole("button", { name: "Start match" }).click();
    await expect(court(page, 1).getByText("Playing", { exact: true })).toBeVisible();
    const dialog = await openScoreDialog(page, 1);
    await dialog.getByRole("button", { name: "End without score" }).click();
    await expect(court(page, 1).getByText("Idle", { exact: true })).toBeVisible();
    await court(page, 1).getByRole("button", { name: "Start match" }).click();
    await expect(court(page, 1).getByText("Playing", { exact: true })).toBeVisible();

    // Nothing reaches the "server" while offline, but the device has all of it.
    await page.waitForTimeout(1500);
    expect((await serverSession(page))?.session.matches).toHaveLength(0);
    expect((await readSharedSessions(page))[0]?.session.matches).toHaveLength(2);

    await context.setOffline(false);
    await expect
      .poll(async () => (await serverSession(page))?.session.matches.map((m) => m.status))
      .toEqual(["ended", "active"]);
    expect((await serverSession(page))!.updatedAt).toBeGreaterThan(uploadedAt);
  });

  test("the host is still the host after a reload, with the Session as they left it", async ({
    page,
  }) => {
    await seedStorage(page, { account: roy, sharedClubs: [riverside] });
    await startRiversideSession(page);
    await court(page, 1).getByRole("button", { name: "Start match" }).click();
    await expect(court(page, 1).getByText("Playing", { exact: true })).toBeVisible();

    await page.reload();

    await expect(court(page, 1).getByText("Playing", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "End session" })).toBeVisible();
    await expect(page.getByText(/Watching\./)).toHaveCount(0);
    await expect
      .poll(async () => (await serverSession(page))?.session.matches.map((m) => m.status))
      .toEqual(["active"]);
  });

  test("the host ends the Session: it leaves the Shared club, the Ended session stays on the device", async ({
    page,
  }) => {
    await seedStorage(page, { account: roy, sharedClubs: [riverside] });
    await startRiversideSession(page);
    await court(page, 1).getByRole("button", { name: "Start match" }).click();
    const dialog = await openScoreDialog(page, 1);
    await dialog.getByRole("button", { name: "End without score" }).click();
    await expect(court(page, 1).getByText("Idle", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "End session" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "End session" }).click();

    await expect(page).toHaveURL(/\/sessions\/[^/]+\/summary$/);
    await expect.poll(async () => await serverSession(page)).toBeUndefined();
    expect(await readSharedSessions(page)).toEqual([]);
    expect(await readStoredData<unknown[]>(page, "endedSessions")).toHaveLength(1);
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Resume session" })).toHaveCount(0);
    // The Club can start a new one.
    await page.goto(`/clubs/${riverside.id}`);
    await expect(page.getByRole("link", { name: "New session" })).toBeVisible();
  });
});
