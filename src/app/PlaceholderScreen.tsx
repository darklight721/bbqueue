import { Screen } from "../components/Screen.tsx";

/** Temporary screen frame for routes that are not built yet. */
export function PlaceholderScreen({ title, backTo }: { title: string; backTo: string }) {
  return (
    <Screen title={title} backTo={backTo}>
      <p className="text-base-content/60">Coming soon.</p>
    </Screen>
  );
}
