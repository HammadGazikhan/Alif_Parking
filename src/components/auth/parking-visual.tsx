/** Abstract top-down parking-bay illustration for the brand panel. */
export function ParkingVisual({ className }: { className?: string }) {
  const bays = Array.from({ length: 6 });
  return (
    <svg viewBox="0 0 420 260" className={className} role="img" aria-label="Illustration of parking bays">
      <defs>
        <linearGradient id="bay-fade" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.16" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.02" />
        </linearGradient>
        <radialGradient id="gold-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#eacb18" stopOpacity="0.45" />
          <stop offset="1" stopColor="#eacb18" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* driving lane */}
      <rect x="0" y="118" width="420" height="24" fill="#fff" fillOpacity="0.03" />
      {Array.from({ length: 12 }).map((_, i) => (
        <rect key={i} x={8 + i * 36} y="128.5" width="18" height="3" rx="1.5" fill="#fff" fillOpacity="0.18" />
      ))}

      {/* top row */}
      {bays.map((_, i) => (
        <g key={`t${i}`} transform={`translate(${12 + i * 66} 8)`}>
          <path d="M0 0 V104 M62 0 V104" stroke="url(#bay-fade)" strokeWidth="2" />
          {i !== 2 && i !== 4 ? <Car x={13} y={14} /> : null}
        </g>
      ))}

      {/* bottom row */}
      {bays.map((_, i) => (
        <g key={`b${i}`} transform={`translate(${12 + i * 66} 148)`}>
          <path d="M0 0 V104 M62 0 V104" stroke="url(#bay-fade)" strokeWidth="2" style={{ transform: "scaleY(-1)", transformOrigin: "center" }} />
          {i !== 1 ? <Car x={13} y={12} flip /> : null}
        </g>
      ))}

      {/* highlighted (assigned) bay */}
      <g transform="translate(144 8)">
        <circle cx="31" cy="54" r="58" fill="url(#gold-glow)" />
        <rect x="3" y="4" width="56" height="98" rx="8" fill="none" stroke="#eacb18" strokeWidth="1.5" strokeDasharray="4 4" />
        <g transform="translate(16 36)">
          <rect width="30" height="30" rx="9" fill="#eacb18" />
          <text x="15" y="21" textAnchor="middle" fontSize="16" fontWeight="800" fill="#05070d" fontFamily="var(--font-montserrat), sans-serif">
            P
          </text>
        </g>
      </g>
    </svg>
  );
}

function Car({ x, y, flip }: { x: number; y: number; flip?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) ${flip ? "rotate(180 18 38)" : ""}`}>
      <rect width="36" height="76" rx="10" fill="#fff" fillOpacity="0.09" stroke="#fff" strokeOpacity="0.14" />
      <rect x="5" y="12" width="26" height="15" rx="5" fill="#fff" fillOpacity="0.12" />
      <rect x="5" y="50" width="26" height="12" rx="4" fill="#fff" fillOpacity="0.07" />
    </g>
  );
}
