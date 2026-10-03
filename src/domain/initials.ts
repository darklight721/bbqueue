/** A letter or digit, in any script. */
const LETTER = /[\p{L}\p{N}]/u;

/**
 * Initials for the avatar: the first letter of each of the first two words of `name`, upper-cased
 * ("Roy Smith" → "RS", "Roy" → "R", "émile zola" → "ÉZ"). Accents are kept. Words with no letter
 * or digit (an emoji, a dash) are skipped. Empty when nothing is left, so callers show a default.
 */
export function initials(name: string): string {
  const firstLetters: string[] = [];
  for (const word of name.normalize("NFC").trim().split(/\s+/)) {
    const letter = Array.from(word).find((char) => LETTER.test(char));
    if (letter) firstLetters.push(letter.toLocaleUpperCase());
    if (firstLetters.length === 2) break;
  }
  return firstLetters.join("");
}
