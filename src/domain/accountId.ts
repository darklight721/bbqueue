/** No look-alikes: 0/o, 1/l/i are left out so an Account ID can be read out loud. */
export const ACCOUNT_ID_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const ACCOUNT_ID_SUFFIX_LENGTH = 4;
const SLUG_FALLBACK = "player";
const SLUG_MAX_LENGTH = 12;

/** Returns a number in [0, 1), like `Math.random`. Injectable so tests are deterministic. */
export type RandomSource = () => number;

/** First word of the name: lowercase ASCII letters and digits, accents stripped. */
export function accountIdSlug(name: string): string {
  const firstWord = name.trim().split(/\s+/)[0] ?? "";
  const slug = firstWord
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, SLUG_MAX_LENGTH);
  return slug === "" ? SLUG_FALLBACK : slug;
}

/** `<slug>-<4 characters>`, e.g. "Roy Smith" → `roy-7k3f`. */
export function generateAccountId(name: string, random: RandomSource = Math.random): string {
  let suffix = "";
  for (let i = 0; i < ACCOUNT_ID_SUFFIX_LENGTH; i++) {
    const index = Math.min(
      Math.floor(random() * ACCOUNT_ID_ALPHABET.length),
      ACCOUNT_ID_ALPHABET.length - 1,
    );
    suffix += ACCOUNT_ID_ALPHABET[index];
  }
  return `${accountIdSlug(name)}-${suffix}`;
}

/** The form used to compare and store Account IDs: Account IDs are compared ignoring case. */
export function normalizeAccountId(accountId: string): string {
  return accountId.trim().toLowerCase();
}

export function accountIdsEqual(a: string, b: string): boolean {
  return normalizeAccountId(a) === normalizeAccountId(b);
}

export type AccountIdError = "required" | "invalid";

const ACCOUNT_ID_PATTERN = new RegExp(
  `^[a-z0-9]+-[${ACCOUNT_ID_ALPHABET}]{${ACCOUNT_ID_SUFFIX_LENGTH}}$`,
);

/** Checks the shape of an entered Account ID (not whether it exists). Capitalisation is ignored. */
export function validateAccountId(input: string): AccountIdError | null {
  const normalized = normalizeAccountId(input);
  if (normalized === "") return "required";
  return ACCOUNT_ID_PATTERN.test(normalized) ? null : "invalid";
}
