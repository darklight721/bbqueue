/**
 * The small line under "Rehash all idle courts": which other Idle Courts would get a new Lineup
 * too. Null when none of them holds a Lineup.
 */
export function alsoChangesText(courtNames: readonly string[]): string | null {
  if (courtNames.length === 0) return null;
  if (courtNames.length === 1) return `Also changes the Lineup on ${courtNames[0]}.`;
  const head = courtNames.slice(0, -1).join(", ");
  return `Also changes ${head} and ${courtNames.at(-1)}.`;
}
