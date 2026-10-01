import { expect, type Locator, type Page } from "@playwright/test";
import type { Session } from "../src/domain/types.ts";
import { readStoredData } from "./fixtures.ts";

export const NAMES = ["Ana", "Ben", "Cat", "Dan", "Eve", "Fay", "Gus", "Hal"];

/** Start a session through the real New session screen. */
export async function startSession(
  page: Page,
  options: { players?: number; courts?: number } = {},
) {
  const { players = 8, courts = 2 } = options;
  await page.goto("/session/new");
  await page.getByRole("textbox", { name: "Session name" }).fill("Courtside");
  for (const name of NAMES.slice(0, players)) {
    await page.getByRole("textbox", { name: "Player name" }).fill(name);
    await page.getByRole("button", { name: "Add guest" }).click();
    await expect(page.getByRole("button", { name: `Remove ${name}` })).toBeVisible();
  }
  for (let i = 1; i < courts; i++) {
    await page.getByRole("button", { name: "Increase Courts" }).click();
  }
  await expect(page.getByRole("spinbutton", { name: "Courts" })).toHaveValue(String(courts));
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page).toHaveURL(/\/session$/);
  await expect(page.getByRole("heading", { level: 1, name: "Courtside" })).toBeVisible();
}

export const court = (page: Page, number: number) =>
  page.getByRole("region", { name: `Court ${number}`, exact: true });

export interface Lineup {
  a: string[];
  b: string[];
}

export async function lineupOf(region: Locator): Promise<Lineup> {
  const names = async (label: "Team A" | "Team B") => {
    const items = region.getByRole("list", { name: label }).getByRole("listitem");
    await expect(items).toHaveCount(2);
    return (await items.allInnerTexts()).map((text) => text.split("\n")[0]!.trim());
  };
  return { a: await names("Team A"), b: await names("Team B") };
}

/** Which two pairs play, ignoring which side is Team A. */
export const splitKey = (lineup: Lineup) =>
  [[...lineup.a].sort().join("+"), [...lineup.b].sort().join("+")].sort().join(" | ");
export const playersOf = (lineup: Lineup) => [...lineup.a, ...lineup.b].sort();

export const storedSession = async (page: Page) =>
  (await readStoredData<Session>(page, "session"))!;

export const idNames = (session: Session) => new Map(session.players.map((p) => [p.id, p.name]));

export function parseTimer(text: string): number {
  const parts = text.split(":").map(Number);
  return parts.reduce((total, part) => total * 60 + part, 0);
}

export async function openScoreDialog(page: Page, number: number) {
  await court(page, number).getByRole("button", { name: "End match" }).click();
  const dialog = page.getByRole("dialog", { name: `End match — Court ${number}` });
  await expect(dialog).toBeVisible();
  return dialog;
}
