import type { CSSProperties } from "react";

/**
 * BBQueue brand mark for the home hero: three shuttlecocks on a skewer, on an
 * off-white disc. Same artwork as the app icon (public/favicon.svg), drawn with
 * theme colours so it follows the dark-mode court green. Purely decorative.
 */

// One shuttle, cork at x = 0..36, feathers at x = -78..0 (flipped below so the
// cork points down toward the skewer handle).
const FEATHERS = "M0 -28L-74 -80Q-82 -60 -74 -40Q-82 -20 -74 0Q-82 20 -74 40Q-82 60 -74 80L0 28Z";
const FEATHER_LINES = "M-8 -12L-70 -44M-8 0H-70M-8 12L-70 44M-60 -62V62";
const CORK = "M0 -30H6A30 30 0 0 1 6 30H0Z";
const SHUTTLE_POSITIONS = [105, -21, -147];

export function BrandMark({
  className = "",
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 512 512"
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="256" cy="256" r="256" className="fill-line" />
      <g transform="translate(256 256) scale(0.86) rotate(-45)">
        {/* Skewer: round handle end, pointed tip. */}
        <path
          d="M-204 0H202"
          fill="none"
          className="stroke-court"
          strokeWidth="14"
          strokeLinecap="round"
        />
        <circle cx="-209" cy="0" r="11" className="fill-court" />
        <path d="M200 -8L221 0L200 8Z" className="fill-court" />
        {SHUTTLE_POSITIONS.map((x) => (
          <g key={x} transform={`translate(${x} 0) scale(-1 1)`}>
            <path d={FEATHERS} className="fill-court" />
            <path
              d={FEATHER_LINES}
              fill="none"
              className="stroke-line"
              strokeWidth="7"
              strokeLinecap="round"
            />
            <path
              d={CORK}
              className="fill-volt stroke-court"
              strokeWidth="6"
              strokeLinejoin="round"
            />
          </g>
        ))}
      </g>
    </svg>
  );
}
