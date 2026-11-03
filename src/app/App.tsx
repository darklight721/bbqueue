import { lazy, Suspense, useLayoutEffect, useRef } from "react";
import { Redirect, Route, Switch, useLocation, useRoute } from "wouter";
import { getBackend } from "../backend/index.ts";
import { AccountSettingsScreen } from "../features/account/AccountSettingsScreen.tsx";
import { ClubScreen } from "../features/club-edit/ClubScreen.tsx";
import { EditPlayersScreen } from "../features/club-edit/EditPlayersScreen.tsx";
import { ClubsScreen } from "../features/clubs/ClubsScreen.tsx";
import { HomeScreen } from "../features/home/HomeScreen.tsx";
import { JoinScreen } from "../features/join/JoinScreen.tsx";
import { NewSessionScreen } from "../features/new-session/NewSessionScreen.tsx";
import {
  ClubSessionsScreen,
  PastSessionsScreen,
} from "../features/past-sessions/PastSessionsScreen.tsx";
import { AccountStatsScreen, ClubStatsScreen } from "../features/play-record/PlayRecordScreen.tsx";
import { SessionRoute } from "../features/session/SessionRoute.tsx";
import { SessionSummaryScreen } from "../features/session-summary/SessionSummaryScreen.tsx";
import { WelcomeScreen } from "../features/welcome/WelcomeScreen.tsx";
import { useAccount, useWelcomeDone } from "../storage/store.ts";

// Loaded lazily and only where service workers exist, so the PWA virtual module
// never runs in jsdom tests or unsupported browsers.
const UpdatePrompt = lazy(() =>
  import("../components/UpdatePrompt.tsx").then((module) => ({ default: module.UpdatePrompt })),
);

const supportsServiceWorker = typeof navigator !== "undefined" && "serviceWorker" in navigator;

/**
 * Start each screen at the top. wouter changes the URL without touching scroll, so the
 * window would otherwise keep the previous screen's scroll position. The first render
 * is skipped so a page reload keeps the browser's own scroll restoration.
 */
function useScrollToTopOnNavigate() {
  const [location] = useLocation();
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    window.scrollTo(0, 0);
  }, [location]);
}

export function App() {
  useScrollToTopOnNavigate();
  const welcomeDone = useWelcomeDone();
  const hasAccount = useAccount() !== null;
  // A Join link opens straight away, even on a device that has never opened the app.
  const [onJoinPage] = useRoute("/join/:token");
  // No Backend (no Firebase config): no Accounts, so no Welcome screen either.
  const backend = getBackend();
  const welcome = backend && !welcomeDone && !hasAccount && !onJoinPage;
  return (
    <>
      {welcome ? <WelcomeScreen backend={backend} /> : <Routes />}
      {supportsServiceWorker ? (
        <Suspense fallback={null}>
          <UpdatePrompt />
        </Suspense>
      ) : null}
    </>
  );
}

function Routes() {
  const backend = getBackend();
  return (
    <Switch>
      <Route path="/" component={HomeScreen} />
      <Route path="/account/stats">
        {backend ? <AccountStatsScreen /> : <Redirect to="/" replace />}
      </Route>
      <Route path="/account">
        {/* No Backend, no Accounts: nothing to show here. */}
        {backend ? <AccountSettingsScreen backend={backend} /> : <Redirect to="/" replace />}
      </Route>
      <Route path="/clubs" component={ClubsScreen} />
      <Route path="/clubs/new">
        {/* New club is a sheet on the Clubs page now. */}
        <Redirect to="/clubs" replace />
      </Route>
      <Route path="/clubs/:clubId/players/:clubPlayerId/stats">
        {(params) => <ClubStatsScreen clubId={params.clubId} clubPlayerId={params.clubPlayerId} />}
      </Route>
      <Route path="/clubs/:clubId/players">
        {(params) => <EditPlayersScreen clubId={params.clubId} />}
      </Route>
      <Route path="/clubs/:clubId/sessions">
        {(params) => <ClubSessionsScreen clubId={params.clubId} />}
      </Route>
      <Route path="/clubs/:clubId">{(params) => <ClubScreen clubId={params.clubId} />}</Route>
      <Route path="/join/:token">{(params) => <JoinScreen token={params.token} />}</Route>
      <Route path="/sessions" component={PastSessionsScreen} />
      <Route path="/sessions/new" component={NewSessionScreen} />
      <Route path="/sessions/:id/summary">
        {(params) => <SessionSummaryScreen sessionId={params.id} />}
      </Route>
      <Route path="/sessions/:id">{(params) => <SessionRoute sessionId={params.id} />}</Route>
      <Route>
        <Redirect to="/" replace />
      </Route>
    </Switch>
  );
}
