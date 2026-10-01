import type { ReactNode } from "react";
import { TopBar, type TopBarProps } from "./TopBar.tsx";

export interface ScreenProps extends TopBarProps {
  children?: ReactNode;
  /** Use a wider content column on tablets (e.g. for a grid of Courts). */
  wide?: boolean;
  /** Content pinned to the bottom of the screen (e.g. a primary action). */
  footer?: ReactNode;
}

/** Standard screen frame: TopBar with Back, a centred content column, optional sticky footer. */
export function Screen({ children, wide = false, footer, ...topBar }: ScreenProps) {
  const column = wide ? "max-w-5xl" : "max-w-2xl";
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar {...topBar} />
      <main
        className={`px-safe mx-auto flex w-full ${column} flex-1 flex-col gap-6 pt-5 ${footer ? "pb-8" : "pb-[max(2rem,env(safe-area-inset-bottom))]"}`}
      >
        {children}
      </main>
      {footer ? (
        <div className="pb-safe sticky bottom-0 z-10 border-t border-base-300 bg-base-100/95 pt-3 backdrop-blur">
          <div className={`px-safe mx-auto w-full ${column}`}>{footer}</div>
        </div>
      ) : null}
    </div>
  );
}
