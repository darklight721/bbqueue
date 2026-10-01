import { Redirect, Route, Switch } from "wouter";

function Home() {
  return <h1>Badminton Queue</h1>;
}

function Clubs() {
  return <h1>Clubs</h1>;
}

function NewClub() {
  return <h1>New club</h1>;
}

function EditClub() {
  return <h1>Edit club</h1>;
}

function NewSession() {
  return <h1>New session</h1>;
}

function Session() {
  return <h1>Session</h1>;
}

function SessionSummary() {
  return <h1>Session summary</h1>;
}

export function App() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/clubs" component={Clubs} />
      <Route path="/clubs/new" component={NewClub} />
      <Route path="/clubs/:clubId" component={EditClub} />
      <Route path="/session/new" component={NewSession} />
      <Route path="/session" component={Session} />
      <Route path="/session/summary" component={SessionSummary} />
      <Route>
        <Redirect to="/" replace />
      </Route>
    </Switch>
  );
}
