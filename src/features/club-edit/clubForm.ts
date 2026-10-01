import { normalizeName } from "../../domain/validation.ts";
import type { Club, SkillLevel } from "../../domain/types.ts";

export interface PlayerRow {
  /** Club player id (kept for existing players, fresh for new rows). */
  id: string;
  name: string;
  skill: SkillLevel;
}

export interface ClubForm {
  name: string;
  rows: PlayerRow[];
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

/** Form state for a Club (or an empty form for a new one). Players sorted by name. */
export function formFromClub(club: Club | null): ClubForm {
  if (!club) return { name: "", rows: [] };
  return {
    name: club.name,
    rows: [...club.players].sort(byName).map(({ id, name, skill }) => ({ id, name, skill })),
  };
}

/** Comparable snapshot of a form; whitespace-only differences don't count as changes. */
export function formSignature(form: ClubForm): string {
  return JSON.stringify([
    normalizeName(form.name),
    form.rows.map((row) => [row.id, normalizeName(row.name), row.skill]),
  ]);
}

/** The Club to persist, with normalised names. */
export function clubFromForm(id: string, form: ClubForm): Club {
  return {
    id,
    name: normalizeName(form.name),
    players: form.rows.map((row) => ({
      id: row.id,
      name: normalizeName(row.name),
      skill: row.skill,
    })),
  };
}
