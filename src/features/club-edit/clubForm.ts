import { newId } from "../../domain/ids.ts";
import { normalizeName } from "../../domain/validation.ts";
import {
  DEFAULT_SKILL,
  type Account,
  type AccountLink,
  type Club,
  type ClubKind,
  type SkillLevel,
} from "../../domain/types.ts";

export interface PlayerRow {
  /** Club player id (kept for existing players, fresh for new rows). */
  id: string;
  name: string;
  skill: SkillLevel;
  /** The Club player's link to an Account: saved, or made on this screen. */
  link?: AccountLink;
}

export interface ClubForm {
  name: string;
  rows: PlayerRow[];
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

/**
 * Form state for a Club. Players sorted by name. A new Club starts empty, or, when it will be a
 * Shared club, with the creator's own row linked to their Account as Organizer.
 */
export function formFromClub(club: Club | null, creator: Account | null = null): ClubForm {
  if (!club) {
    if (!creator) return { name: "", rows: [] };
    return {
      name: "",
      rows: [
        {
          id: newId(),
          name: creator.name,
          skill: DEFAULT_SKILL,
          link: { accountId: creator.accountId, role: "organizer" },
        },
      ],
    };
  }
  return {
    name: club.name,
    rows: [...club.players].sort(byName).map(({ id, name, skill, link }) => ({
      id,
      name,
      skill,
      ...(link ? { link } : {}),
    })),
  };
}

/** Comparable snapshot of a form; whitespace-only differences don't count as changes. */
export function formSignature(form: ClubForm): string {
  return JSON.stringify([
    normalizeName(form.name),
    form.rows.map((row) => [
      row.id,
      normalizeName(row.name),
      row.skill,
      row.link?.accountId.toLowerCase() ?? null,
      row.link?.role ?? null,
    ]),
  ]);
}

/** The Club to persist, with normalised names. */
export function clubFromForm(id: string, kind: ClubKind, form: ClubForm): Club {
  return {
    id,
    name: normalizeName(form.name),
    kind,
    players: form.rows.map((row) => ({
      id: row.id,
      name: normalizeName(row.name),
      skill: row.skill,
      ...(row.link ? { link: row.link } : {}),
    })),
  };
}
