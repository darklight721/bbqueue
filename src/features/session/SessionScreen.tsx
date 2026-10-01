import { Redirect } from "wouter";
import { Screen } from "../../components/Screen.tsx";
import { useSession } from "../../storage/store.ts";
import { CourtsSection } from "./courts/CourtsSection.tsx";
import { EndSessionSection } from "./end/EndSessionSection.tsx";
import { HistorySection } from "./history/HistorySection.tsx";
import { PlayersSection } from "./players/PlayersSection.tsx";
import { QueuesSection } from "./queues/QueuesSection.tsx";
import { SessionProvider } from "./SessionProvider.tsx";

/**
 * The courtside screen. Top to bottom: Courts (hero), Queues, Players, History, End session.
 * Everything re-renders from the saved Session; every change is saved straight away.
 */
export function SessionScreen() {
  const session = useSession();
  if (!session) return <Redirect to="/" replace />;

  return (
    <SessionProvider session={session}>
      <Screen
        title={session.name}
        backTo="/"
        wide
        right={
          <span
            className="rounded-full bg-primary/10 px-3 py-1 font-display text-lg font-bold whitespace-nowrap text-primary"
            title="Point system"
          >
            {session.pointSystem} pts
          </span>
        }
      >
        <div className="flex flex-col gap-10">
          <CourtsSection />
          <QueuesSection />
          <PlayersSection />
          <HistorySection />
          <EndSessionSection />
        </div>
      </Screen>
    </SessionProvider>
  );
}
