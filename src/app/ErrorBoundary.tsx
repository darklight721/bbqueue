import { Component, type ErrorInfo, type ReactNode } from "react";
import { clearSharedStorage } from "../storage/storage.ts";

interface Props {
  children: ReactNode;
  /** Starts the app over after the shared data was cleared (the page is reloaded by default). */
  reload?: () => void;
}

/**
 * The last stop for an error while showing the app. Data cached from other devices (the Shared
 * clubs, their Sessions and Ended sessions) is the one thing the person can't fix by themselves
 * and that can break every launch, so the one thing offered is to clear it; it comes back from the
 * server. Everything on the device itself (Local clubs, its own Sessions) is left alone.
 */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("The app failed to show something", error, info.componentStack);
  }

  private clear = () => {
    clearSharedStorage();
    (this.props.reload ?? (() => window.location.reload()))();
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        role="alert"
        className="mx-auto flex max-w-md flex-col items-center gap-4 p-8 text-center"
      >
        <p className="text-lg">Something went wrong showing this.</p>
        <button type="button" className="btn btn-primary" onClick={this.clear}>
          Clear shared data
        </button>
      </div>
    );
  }
}
