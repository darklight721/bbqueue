import { useCallback, useState } from "react";
import { Redirect } from "wouter";
import { ChevronDownIcon } from "../../components/icons.tsx";
import { Screen } from "../../components/Screen.tsx";
import { useSession, useSummary } from "../../storage/store.ts";
import { CourtsSection } from "./courts/CourtsSection.tsx";
import { EndSessionSection } from "./end/EndSessionSection.tsx";
import { HistorySection } from "./history/HistorySection.tsx";
import { PlayersSection } from "./players/PlayersSection.tsx";
import { PointSystemDialog } from "./PointSystemDialog.tsx";
import { QueuesSection } from "./queues/QueuesSection.tsx";
import {
  JUMP_BAR_BOTTOM_SPACE,
  SECTION_SCROLL_MARGIN,
  SectionJumpBar,
  type JumpTarget,
} from "./SectionJumpBar.tsx";
import { SessionProvider } from "./SessionProvider.tsx";

/** Sections shown in the jump bar, in screen order. */
const JUMP_TARGETS: readonly JumpTarget[] = [
  { id: "courts", label: "Courts" },
  { id: "queues", label: "Queues" },
  { id: "players", label: "Players" },
  { id: "history", label: "History" },
];

/**
 * The courtside screen. Top to bottom: Courts (hero), Queues, Players, History, End session.
 * Everything re-renders from the saved Session; every change is saved straight away.
 */
export function SessionScreen() {
  const session = useSession();
  const summary = useSummary();
  // Not saved: Players starts open and History closed on every visit.
  const [playersOpen, setPlayersOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pointsOpen, setPointsOpen] = useState(false);
  const openSection = useCallback((id: string) => {
    if (id === "players") setPlayersOpen(true);
    if (id === "history") setHistoryOpen(true);
  }, []);
  // Safety net: just after End session, go to the summary rather than Home.
  if (!session) return <Redirect to={summary ? "/session/summary" : "/"} replace />;

  return (
    <SessionProvider session={session}>
      <Screen
        title={session.name}
        backTo="/"
        wide
        right={
          <button
            type="button"
            className="btn h-10 min-h-10 gap-1 rounded-full border-0 bg-primary/10 px-3 font-display text-lg font-bold whitespace-nowrap text-primary shadow-none hover:bg-primary/20"
            aria-label={`${session.pointSystem} pts, change point system`}
            aria-haspopup="dialog"
            onClick={() => setPointsOpen(true)}
          >
            {session.pointSystem} pts
            <ChevronDownIcon className="size-4" />
          </button>
        }
      >
        <PointSystemDialog open={pointsOpen} onClose={() => setPointsOpen(false)} />
        <SectionJumpBar targets={JUMP_TARGETS} onJump={openSection} />
        <div className="flex flex-col gap-10">
          <div id="courts" className={SECTION_SCROLL_MARGIN}>
            <CourtsSection />
          </div>
          <div id="queues" className={SECTION_SCROLL_MARGIN}>
            <QueuesSection />
          </div>
          <div id="players" className={SECTION_SCROLL_MARGIN}>
            <PlayersSection open={playersOpen} onOpenChange={setPlayersOpen} />
          </div>
          <div id="history" className={SECTION_SCROLL_MARGIN}>
            <HistorySection open={historyOpen} onOpenChange={setHistoryOpen} />
          </div>
          <EndSessionSection />
        </div>
        {/* Phones: room for the jump bar fixed at the bottom. */}
        <div aria-hidden="true" className={`-mt-6 ${JUMP_BAR_BOTTOM_SPACE}`} />
      </Screen>
    </SessionProvider>
  );
}
