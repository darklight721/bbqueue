import { lazy, Suspense, useLayoutEffect, useRef } from "react";
import { Redirect, Route, Switch, useLocation } from "wouter";
import { getBackend } from "../backend/index.ts";
import { ClubEditScreen } from "../features/club-edit/ClubEditScreen.tsx";
import { ClubsScreen } from "../features/clubs/ClubsScreen.tsx";
import { HomeScreen } from "../features/home/HomeScreen.tsx";
import { NewSessionScreen } from "../features/new-session/NewSessionScreen.tsx";
import {
  ClubSessionsScreen,
  PastSessionsScreen,
} from "../features/past-sessions/PastSessionsScreen.tsx";
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
  // No Backend (no Firebase config): no Accounts, so no Welcome screen either.
  const backend = getBackend();
  return (
    <>
      {backend && !welcomeDone && !hasAccount ? <WelcomeScreen backend={backend} /> : <Routes />}
      {supportsServiceWorker ? (
        <Suspense fallback={null}>
          <UpdatePrompt />
        </Suspense>
      ) : null}
    </>
  );
}

function Routes() {
  return (
    <Switch>
      <Route path="/" component={HomeScreen} />
      <Route path="/clubs" component={ClubsScreen} />
      <Route path="/clubs/new">
        <ClubEditScreen />
      </Route>
      <Route path="/clubs/:clubId/sessions">
        {(params) => <ClubSessionsScreen clubId={params.clubId} />}
      </Route>
      <Route path="/clubs/:clubId">{(params) => <ClubEditScreen clubId={params.clubId} />}</Route>
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
