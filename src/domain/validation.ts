/** Trim and collapse inner whitespace. */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/** Normalized, case-insensitive name comparison. */
export function namesEqual(a: string, b: string): boolean {
  return normalizeName(a).toLocaleLowerCase() === normalizeName(b).toLocaleLowerCase();
}

/** Index of the first other entry with an equal name, or -1. */
export function findDuplicateName(name: string, others: readonly string[]): number {
  return others.findIndex((other) => namesEqual(name, other));
}

export type NameError = "required" | "duplicate";

export function validateName(name: string, others: readonly string[]): NameError | null {
  if (normalizeName(name) === "") return "required";
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
