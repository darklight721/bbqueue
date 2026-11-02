/**
 * Top-down badminton court markings (doubles court, 13.4 m × 6.1 m, 1 unit = 10 cm).
 * Purely decorative.
 */
export function CourtLines({ className = "" }: { className?: string }) {
  const length = 134;
  const width = 61;
  const net = length / 2;
  const shortService = 19.8;
  const longService = 7.6;
  const singles = 4.6;
  const mid = width / 2;
  return (
    <svg
      viewBox={`-2 -2 ${length + 4} ${width + 4}`}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="0.8"
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
    >
      <rect x="0" y="0" width={length} height={width} />
      <line x1="0" y1={singles} x2={length} y2={singles} />
      <line x1="0" y1={width - singles} x2={length} y2={width - singles} />
      <line x1={longService} y1="0" x2={longService} y2={width} />
      <line x1={length - longService} y1="0" x2={length - longService} y2={width} />
      <line x1={net - shortService} y1="0" x2={net - shortService} y2={width} />
      <line x1={net + shortService} y1="0" x2={net + shortService} y2={width} />
      <line x1="0" y1={mid} x2={net - shortService} y2={mid} />
      <line x1={net + shortService} y1={mid} x2={length} y2={mid} />
      {/* Net */}
      <line x1={net} y1="-2" x2={net} y2={width + 2} strokeWidth="1.6" strokeDasharray="1.2 1.2" />
    </svg>
  );
}
