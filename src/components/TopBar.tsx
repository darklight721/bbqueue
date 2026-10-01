import { useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { ChevronLeftIcon } from "./icons.tsx";

export interface TopBarProps {
  /** Where the Back button goes. */
  backTo: string;
  /**
   * Optional guard run before going back (e.g. "Discard changes?").
   * Return `false` (or resolve to `false`) to stay on the screen.
   */
  onBack?: () => boolean | Promise<boolean>;
  title: ReactNode;
  /** Optional actions on the right-hand side. */
  right?: ReactNode;
}

export function TopBar({ backTo, onBack, title, right }: TopBarProps) {
  const [, navigate] = useLocation();
  const [busy, setBusy] = useState(false);

  async function handleBack() {
    if (busy) return;
    if (onBack) {
      setBusy(true);
      try {
        const ok = await onBack();
        if (!ok) return;
      } finally {
        setBusy(false);
      }
    }
    navigate(backTo);
  }

  return (
    <header className="pt-safe sticky top-0 z-20 border-b border-base-300 bg-base-100/95 backdrop-blur supports-[backdrop-filter]:bg-base-100/85">
      <div className="px-safe mx-auto flex h-16 w-full max-w-2xl items-center gap-2">
        <button
          type="button"
          className="btn btn-ghost btn-circle -ml-2 size-12 shrink-0"
          aria-label="Back"
          onClick={() => void handleBack()}
        >
          <ChevronLeftIcon className="size-7" />
        </button>
        <h1 className="min-w-0 flex-1 truncate font-display text-2xl uppercase">{title}</h1>
        {right ? <div className="flex shrink-0 items-center gap-1">{right}</div> : null}
      </div>
    </header>
  );
}
