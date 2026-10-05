/**
 * The longest name (Account, Club or Club player) the app and the Security Rules accept, in
 * characters. `firestore.rules` repeats this number: change both together.
 */
export const MAX_NAME_LENGTH = 40;

/**
 * Trim, collapse inner whitespace and drop what can't be seen or shouldn't be in a name: control,
 * bidi and zero-width characters (Unicode category C). `firestore.rules` refuses a name that
 * contains any (see `validName`).
 */
export function normalizeName(name: string): string {
  return name.replace(/\s+/g, " ").replace(/\p{C}/gu, "").replace(/ {2,}/g, " ").trim();
}

/** Normalized, case-insensitive name comparison. */
export function namesEqual(a: string, b: string): boolean {
  return normalizeName(a).toLocaleLowerCase() === normalizeName(b).toLocaleLowerCase();
}

/** Index of the first other entry with an equal name, or -1. */
export function findDuplicateName(name: string, others: readonly string[]): number {
  return others.findIndex((other) => namesEqual(name, other));
}

export type NameError = "required" | "too-long" | "duplicate";

export function validateName(name: string, others: readonly string[]): NameError | null {
  const normalized = normalizeName(name);
  if (normalized === "") return "required";
  if (normalized.length > MAX_NAME_LENGTH) return "too-long";
  if (findDuplicateName(name, others) !== -1) return "duplicate";
  return null;
}

export interface ClubErrors {
  name: NameError | null;
  players: (NameError | null)[];
}

/**
 * Club name is checked against `otherClubNames`; each player row is checked
 * against all OTHER rows of the same club.
 */
export function validateClub(
  input: { name: string; players: { name: string }[] },
  otherClubNames: readonly string[],
): ClubErrors {
  const names = input.players.map((player) => player.name);
  return {
    name: validateName(input.name, otherClubNames),
    players: names.map((name, index) =>
      validateName(
        name,
        names.filter((_, other) => other !== index),
      ),
    ),
  };
}

export function hasClubErrors(errors: ClubErrors): boolean {
  return errors.name !== null || errors.players.some((error) => error !== null);
}
