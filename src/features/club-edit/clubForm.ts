import { normalizeName } from "../../domain/validation.ts";
import type { AccountLink, Club, SkillLevel } from "../../domain/types.ts";

export interface PlayerRow {
  /** Club player id (kept for existing players, fresh for new rows). */
  id: string;
  name: string;
  skill: SkillLevel;
  /** The Club player's link to an Account: saved, or made on this screen. */
  link?: AccountLink;
}

/** Edit players' form: the roster, one row per Club player. */
export interface RosterForm {
  rows: PlayerRow[];
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

/** Form state for a Club's roster, sorted by name. */
export function formFromClub(club: Club): RosterForm {
  return {
    rows: [...club.players].sort(byName).map(({ id, name, skill, link }) => ({
      id,
      name,
      skill,
      ...(link ? { link } : {}),
    })),
  };
}

/** Comparable snapshot of a form; whitespace-only differences don't count as changes. */
export function formSignature(form: RosterForm): string {
  return JSON.stringify(
    form.rows.map((row) => [
      row.id,
      normalizeName(row.name),
      row.skill,
      row.link?.accountId.toLowerCase() ?? null,
      row.link?.role ?? null,
    ]),
  );
}

/** The Club with the form's roster, with normalised names. Everything else stays as it is. */
export function clubFromForm(club: Club, form: RosterForm): Club {
  return {
    ...club,
    players: form.rows.map((row) => ({
      id: row.id,
      name: normalizeName(row.name),
      skill: row.skill,
      ...(row.link ? { link: row.link } : {}),
    })),
  };
}
