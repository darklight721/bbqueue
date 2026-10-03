import { expect, test, type Page } from "@playwright/test";
import {
  FIRST_LAUNCH_STORAGE_STATE,
  readFakeAccount,
  readStored,
  readStoredData,
  seedStorage,
} from "./fixtures.ts";

// First launch: this device has not been through the Welcome screen yet.
test.use({ storageState: FIRST_LAUNCH_STORAGE_STATE });

const welcome = (page: Page) => page.getByRole("heading", { level: 1, name: "Welcome to BBQueue" });
const home = (page: Page) => page.getByRole("heading", { level: 1, name: "BBQueue" });

test.describe("Welcome", () => {
  test("entering a name creates an Account and goes Home; the Welcome screen stays gone after a reload", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(welcome(page)).toBeVisible();

    await page.getByLabel("Your name").fill("Roy Smith");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(home(page)).toBeVisible();
    await expect(welcome(page)).toHaveCount(0);
    const account = await readFakeAccount(page);
    expect(account).toMatchObject({ name: "Roy Smith" });
    expect(account?.accountId).toMatch(/^roy-[a-z0-9]{4}$/);

    await page.reload();
    await expect(home(page)).toBeVisible();
    await expect(welcome(page)).toHaveCount(0);
    expect(await readFakeAccount(page)).toEqual(account);
    expect(await readStoredData(page, "account")).toEqual(account);
  });

  test("Continue without a name asks for one", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByText("Enter a name")).toBeVisible();
    await expect(welcome(page)).toBeVisible();
    expect(await readFakeAccount(page)).toBeNull();
  });

  test("Enter in the name field creates the Account and goes Home", async ({ page }) => {
    await page.goto("/");
    const name = page.getByLabel("Your name");
    await name.fill("Roy");
    await name.press("Enter");

    await expect(home(page)).toBeVisible();
    expect(await readFakeAccount(page)).toMatchObject({ name: "Roy" });
  });

  test("Enter with no name keeps the field focused and asks for one", async ({ page }) => {
    await page.goto("/");
    const name = page.getByLabel("Your name");
    await name.press("Enter");

    await expect(name).toBeFocused();
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("Enter a name")).toBeVisible();
    await expect(welcome(page)).toBeVisible();
    expect(await readFakeAccount(page)).toBeNull();
  });

  test("Skip goes Home without an Account; the Welcome screen stays gone after a reload", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(welcome(page)).toBeVisible();

    await page.getByRole("button", { name: "Skip for now" }).click();

    await expect(home(page)).toBeVisible();
    expect(await readFakeAccount(page)).toBeNull();

    await page.reload();
    await expect(home(page)).toBeVisible();
    await expect(welcome(page)).toHaveCount(0);
    expect(await readFakeAccount(page)).toBeNull();
    expect(await readStored(page, "account")).toBeNull();
  });

  test("offline: explains an Account needs a connection and continues without one", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await expect(welcome(page)).toBeVisible();

    await context.setOffline(true);

    await expect(page.getByRole("status")).toContainText("An Account needs a connection");
    await expect(page.getByLabel("Your name")).toHaveCount(0);
    await page.getByRole("button", { name: "Continue without an Account" }).click();

    await expect(home(page)).toBeVisible();
    expect(await readFakeAccount(page)).toBeNull();

    // Back online the Welcome screen doesn't return, and no Account was made behind the scenes.
    await context.setOffline(false);
    await page.reload();
    await expect(home(page)).toBeVisible();
    await expect(welcome(page)).toHaveCount(0);
    expect(await readFakeAccount(page)).toBeNull();
  });

  test("a device that is past the Welcome screen goes straight to the page it was opened on", async ({
    page,
  }) => {
    await page.goto("/clubs");
    await expect(welcome(page)).toBeVisible();
    await page.getByRole("button", { name: "Skip for now" }).click();

    await expect(page).toHaveURL(/\/clubs$/);
    await expect(page.getByRole("heading", { level: 1, name: "Clubs" })).toBeVisible();
  });

  test("a device that already has an Account goes straight Home", async ({ page }) => {
    await seedStorage(page, { account: { accountId: "ana-2222", name: "Ana" } });
    await page.goto("/");

    await expect(home(page)).toBeVisible();
    await expect(welcome(page)).toHaveCount(0);
  });
});
