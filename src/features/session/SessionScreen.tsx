import { useCallback, useState } from "react";
import { Redirect } from "wouter";
import { ChevronDownIcon } from "../../components/icons.tsx";
import { Screen } from "../../components/Screen.tsx";
import { displayClubName } from "../../domain/clubName.ts";
import { isSessionHost } from "../../domain/permissions.ts";
import { useAccount, useActiveSessions, useClubs } from "../../storage/store.ts";
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
import { WatchingNote } from "./WatchingNote.tsx";

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
 *
 * `sessionId` picks one of the Active sessions the device knows (its own, or a Shared club's);
 * without it the device's own Session is shown. Anyone who isn't the Session host (ADR-0007)
 * gets the same screen read-only.
 */
export function SessionScreen({ sessionId }: { sessionId?: string } = {}) {
  const entries = useActiveSessions();
  const entry =
    (sessionId
      ? entries.find((candidate) => candidate.session.id === sessionId)
      : entries.find((candidate) => !candidate.shared)) ?? null;
  const session = entry?.session ?? null;
  const shared = entry?.shared ?? null;
  const account = useAccount();
  const readOnly = !isSessionHost(shared, account?.accountId);
  const clubs = useClubs();
  // Not saved: Players starts open and History closed on every visit.
  const [playersOpen, setPlayersOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pointsOpen, setPointsOpen] = useState(false);
  const openSection = useCallback((id: string) => {
    if (id === "players") setPlayersOpen(true);
    if (id === "history") setHistoryOpen(true);
  }, []);
  // Safety net: the route only renders this for the Active session.
  if (!session) return <Redirect to="/" replace />;

  const clubName = displayClubName(session.clubId, session.clubName, clubs);

  return (
    <SessionProvider
      session={session}
      hostedClubId={shared && !readOnly ? shared.clubId : null}
      readOnly={readOnly}
    >
      <Screen
        title={session.name}
        subtitle={clubName}
        backTo="/"
        wide
        right={
          readOnly ? (
            <span className="inline-flex h-10 items-center rounded-full bg-primary/10 px-3 font-display text-lg font-bold whitespace-nowrap text-primary">
              {session.pointSystem} pts
            </span>
          ) : (
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
          )
        }
      >
        {readOnly && shared ? (
          <WatchingNote hostName={shared.hostName} updatedAt={shared.updatedAt} />
        ) : null}
        {readOnly ? null : (
          <PointSystemDialog open={pointsOpen} onClose={() => setPointsOpen(false)} />
        )}
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
          {readOnly ? null : <EndSessionSection />}
        </div>
        {/* Phones: room for the jump bar fixed at the bottom. */}
        <div aria-hidden="true" className={`-mt-6 ${JUMP_BAR_BOTTOM_SPACE}`} />
      </Screen>
    </SessionProvider>
  );
}
