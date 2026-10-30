import { devices, expect, test, type Page } from "@playwright/test";
import {
  FIRST_LAUNCH_STORAGE_STATE,
  readFakeAccount,
  readStored,
  readStoredData,
  seedStorage,
} from "./fixtures.ts";
import { openWelcomeWayOn } from "./welcome-helpers.ts";

// First launch: this device has not been through the Welcome screen yet.
test.use({ storageState: FIRST_LAUNCH_STORAGE_STATE });

const welcome = (page: Page) => page.getByRole("heading", { level: 1, name: "Welcome to BBQueue" });
const home = (page: Page) => page.getByRole("heading", { level: 1, name: "BBQueue" });

// On both projects (a phone's browser) the form is in a sheet; `openWelcomeWayOn` gets there.
test.describe("Welcome", () => {
  test("entering a name creates an Account and goes Home; the Welcome screen stays gone after a reload", async ({
    page,
  }) => {
    await page.goto("/");
    const form = await openWelcomeWayOn(page);

    await form.getByLabel("Your name").fill("Roy Smith");
    await form.getByRole("button", { name: "Continue", exact: true }).click();

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
    const form = await openWelcomeWayOn(page);
    await form.getByRole("button", { name: "Continue", exact: true }).click();

    await expect(form.getByText("Enter a name")).toBeVisible();
    await expect(welcome(page)).toBeVisible();
    expect(await readFakeAccount(page)).toBeNull();
  });

  test("Continue with a name longer than 40 characters asks for a shorter one", async ({
    page,
  }) => {
    await page.goto("/");
    const form = await openWelcomeWayOn(page);
    await form.getByLabel("Your name").fill("x".repeat(41));
    await form.getByRole("button", { name: "Continue", exact: true }).click();

    await expect(form.getByText("Name is too long (at most 40 characters)")).toBeVisible();
    await expect(welcome(page)).toBeVisible();
    expect(await readFakeAccount(page)).toBeNull();
  });

  test("Enter in the name field creates the Account and goes Home", async ({ page }) => {
    await page.goto("/");
    const name = (await openWelcomeWayOn(page)).getByLabel("Your name");
    await name.fill("Roy");
    await name.press("Enter");

    await expect(home(page)).toBeVisible();
    expect(await readFakeAccount(page)).toMatchObject({ name: "Roy" });
  });

  test("Enter with no name keeps the field focused and asks for one", async ({ page }) => {
    await page.goto("/");
    const form = await openWelcomeWayOn(page);
    const name = form.getByLabel("Your name");
    await name.press("Enter");

    await expect(name).toBeFocused();
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await expect(form.getByText("Enter a name")).toBeVisible();
    await expect(welcome(page)).toBeVisible();
    expect(await readFakeAccount(page)).toBeNull();
  });

  test("Skip goes Home without an Account; the Welcome screen stays gone after a reload", async ({
    page,
  }) => {
    await page.goto("/");
    const form = await openWelcomeWayOn(page);

    await form.getByRole("button", { name: "Skip for now" }).click();

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

    const wayOn = await openWelcomeWayOn(page);
    await expect(wayOn.getByRole("status")).toContainText("An Account needs a connection");
    await expect(page.getByLabel("Your name")).toHaveCount(0);
    await wayOn.getByRole("button", { name: "Continue without an Account" }).click();

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
    const form = await openWelcomeWayOn(page);
    await form.getByRole("button", { name: "Skip for now" }).click();

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

// Which install hint shows depends on the browser's user agent, so each block sets one.
const installFirst = (page: Page) =>
  page.getByRole("region", { name: "Add BBQueue to your Home Screen first" });
const anyway = (page: Page) => page.getByRole("button", { name: "Continue in the browser anyway" });
const sheet = (page: Page) => page.getByRole("dialog", { name: "Continue in the browser" });
const androidSteps = (page: Page) =>
  page.getByRole("region", { name: "Add BBQueue to your Home Screen", exact: true });

test.describe("Welcome install hint in a browser on iPhone", () => {
  test.use({ userAgent: devices["iPhone 14"].userAgent });

  test("installing comes first; Continue in the browser anyway opens the name form in a sheet, which creates an Account", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(welcome(page)).toBeVisible();
    await expect(installFirst(page)).toBeVisible();
    await expect(installFirst(page)).toContainText("What you set up here stays in this browser.");
    await expect(installFirst(page).getByRole("listitem")).toHaveText([
      /Share menu/,
      /Add to Home Screen/,
      /Open BBQueue from your Home Screen/,
    ]);
    await expect(androidSteps(page)).toHaveCount(0);
    // No form until asked for.
    await expect(page.getByLabel("Your name")).toHaveCount(0);

    await anyway(page).click();
    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page)).toContainText("What you set up here stays in this browser.");
    // The keyboard stays down until the field is tapped: the title has focus, not the field.
    const name = sheet(page).getByLabel("Your name");
    await expect(name).not.toBeFocused();

    // Typed with the keyboard, submitted with Return.
    await name.click();
    await expect(name).toBeFocused();
    await page.keyboard.type("Roy");
    await page.keyboard.press("Enter");

    await expect(home(page)).toBeVisible();
    expect(await readFakeAccount(page)).toMatchObject({ name: "Roy" });
  });

  test("the sheet's Continue and Skip for now work as before", async ({ page }) => {
    await page.goto("/");
    await anyway(page).click();

    // An empty name is refused, and the sheet stays.
    await sheet(page).getByRole("button", { name: "Continue", exact: true }).click();
    await expect(sheet(page).getByText("Enter a name")).toBeVisible();

    await sheet(page).getByRole("button", { name: "Skip for now" }).click();

    await expect(home(page)).toBeVisible();
    expect(await readFakeAccount(page)).toBeNull();
  });

  test("closing the sheet goes back to the install steps", async ({ page }) => {
    await page.goto("/");
    await anyway(page).click();
    await sheet(page).getByLabel("Your name").fill("Roy");

    await sheet(page).getByRole("button", { name: "Close" }).click();

    await expect(sheet(page)).toHaveCount(0);
    await expect(installFirst(page)).toBeVisible();
    await expect(anyway(page)).toBeVisible();
    expect(await readFakeAccount(page)).toBeNull();

    // Escape closes it too.
    await anyway(page).click();
    await expect(sheet(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet(page)).toHaveCount(0);
    await expect(welcome(page)).toBeVisible();
  });

  test("offline: installing still comes first, and the same button leads to continuing without an Account", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await expect(welcome(page)).toBeVisible();
    await context.setOffline(true);

    await expect(installFirst(page)).toBeVisible();
    await anyway(page).click();
    await expect(sheet(page).getByRole("status")).toContainText("An Account needs a connection");
    await sheet(page).getByRole("button", { name: "Continue without an Account" }).click();
    await expect(home(page)).toBeVisible();
  });
});

test.describe("Welcome install hint in Chrome on iPhone", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1",
  });

  test("installing comes first there too", async ({ page }) => {
    await page.goto("/");
    await expect(installFirst(page)).toBeVisible();
    await expect(anyway(page)).toBeVisible();
  });
});

test.describe("Welcome install hint on Android", () => {
  test.use({ userAgent: devices["Pixel 7"].userAgent });

  test("Android's own install steps on the hero, with no claim that data stays behind; the form is in the sheet and works", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(welcome(page)).toBeVisible();
    await expect(androidSteps(page)).toContainText(
      "It opens full screen, and the browser is less likely to clear your data.",
    );
    await expect(androidSteps(page)).not.toContainText("stays in this browser");
    await expect(androidSteps(page).getByRole("listitem")).toHaveText([
      /⋮ menu/,
      /Install app or Add to Home Screen/,
      /Open BBQueue from your Home Screen/,
    ]);
    await expect(installFirst(page)).toHaveCount(0);
    await expect(page.getByLabel("Your name")).toHaveCount(0);

    await anyway(page).click();
    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page)).not.toContainText("stays in this browser");
    await sheet(page).getByLabel("Your name").fill("Roy");
    await sheet(page).getByRole("button", { name: "Continue", exact: true }).click();

    await expect(home(page)).toBeVisible();
    expect(await readFakeAccount(page)).toMatchObject({ name: "Roy" });
  });

  test("closing the sheet goes back to the install steps; Skip for now goes Home", async ({
    page,
  }) => {
    await page.goto("/");
    await anyway(page).click();
    await sheet(page).getByRole("button", { name: "Close" }).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(androidSteps(page)).toBeVisible();

    await anyway(page).click();
    await sheet(page).getByRole("button", { name: "Skip for now" }).click();
    await expect(home(page)).toBeVisible();
    expect(await readFakeAccount(page)).toBeNull();
  });

  test("offline: the same button leads to continuing without an Account", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await expect(welcome(page)).toBeVisible();
    await context.setOffline(true);

    await expect(androidSteps(page)).toBeVisible();
    await anyway(page).click();
    await sheet(page).getByRole("button", { name: "Continue without an Account" }).click();
    await expect(home(page)).toBeVisible();
  });
});

test.describe("Welcome with no install hint", () => {
  test.describe("on desktop", () => {
    test.use({ userAgent: devices["Desktop Chrome"].userAgent });

    test("shows just the form", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByLabel("Your name")).toBeVisible();
      await expect(installFirst(page)).toHaveCount(0);
      await expect(anyway(page)).toHaveCount(0);
      await expect(androidSteps(page)).toHaveCount(0);
    });
  });

  for (const device of ["iPhone 14", "Pixel 7"] as const) {
    test.describe(`running as the installed app (${device})`, () => {
      test.use({ userAgent: devices[device].userAgent });

      test("shows just the form", async ({ page }) => {
        await runAsInstalledApp(page);
        await page.goto("/");
        await expect(page.getByLabel("Your name")).toBeVisible();
        await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeVisible();
        await expect(installFirst(page)).toHaveCount(0);
        await expect(anyway(page)).toHaveCount(0);
        await expect(androidSteps(page)).toHaveCount(0);
      });
    });
  }
});

/**
 * Pretend the page was opened from the Home Screen: `display-mode: standalone` matches.
 * Playwright can't emulate that media feature, so `matchMedia` answers for it.
 */
async function runAsInstalledApp(page: Page) {
  await page.addInitScript(() => {
    const matchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query: string) => {
      const result = matchMedia(query);
      if (!/display-mode:\s*standalone/.test(query)) return result;
      return new Proxy(result, {
        get: (target, key) => {
          if (key === "matches") return true;
          const value = Reflect.get(target, key, target) as unknown;
          return typeof value === "function"
            ? (value as (...args: unknown[]) => unknown).bind(target)
            : value;
        },
      });
    };
  });
}
