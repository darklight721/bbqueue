/**
 * The small line under "Rehash all idle courts": which other Idle Courts would get a new Lineup
 * too. Null when none of them holds a Lineup.
 */
export function alsoChangesText(courtNumbers: readonly number[]): string | null {
  if (courtNumbers.length === 0) return null;
  if (courtNumbers.length === 1) return `Also changes the Lineup on Court ${courtNumbers[0]}.`;
  const head = courtNumbers.slice(0, -1).join(", ");
  return `Also changes Courts ${head} and ${courtNumbers.at(-1)}.`;
}
