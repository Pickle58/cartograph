// Drawings of the map, not pictures of a repository. No names: a label would
// be a claim about somebody's code. Colours are the canvas tokens.

export function MapFigure() {
  return (
    <svg
      viewBox="0 0 480 240"
      className="h-auto w-full"
      aria-hidden
    >
      <Box x={8} y={28} w={120} h={32} />
      <Box x={168} y={16} w={168} h={196} />
      <line x1={168} y1={48} x2={336} y2={48} stroke="var(--border)" />
      <Row y={56} selected={false} swatch="var(--kind-page)" />
      <Row y={84} selected swatch="var(--kind-component)" />
      <Row y={112} selected={false} swatch="var(--kind-api)" />
      <Row y={140} selected={false} swatch="var(--kind-util)" />
      <Row y={168} selected={false} swatch="var(--kind-types)" />
      <Box x={376} y={108} w={96} h={32} />
      <Edge
        id="map-out"
        d="M128 44 H148 V32 H168"
        color="var(--outgoing)"
      />
      <Edge
        id="map-in"
        d="M336 98 H356 V124 H376"
        color="var(--incoming)"
      />
    </svg>
  );
}

export function NeighboursFigure() {
  return (
    <svg viewBox="0 0 480 200" className="h-auto w-full" aria-hidden>
      <Box x={176} y={64} w={128} h={72} />
      <rect
        x={177}
        y={88}
        width={126}
        height={22}
        fill="var(--accent)"
        fillOpacity={0.14}
      />
      <Swatch x={186} y={95} color="var(--kind-component)" />
      <Box x={16} y={24} w={96} h={28} />
      <Box x={368} y={148} w={96} h={28} />
      <Edge id="near-in" d="M112 38 H144 V100 H176" color="var(--incoming)" />
      <Edge id="near-out" d="M304 124 H336 V162 H368" color="var(--outgoing)" />
    </svg>
  );
}

export function ParseFigure() {
  return (
    <svg viewBox="0 0 480 160" className="h-auto w-full" aria-hidden>
      <Box x={8} y={28} w={120} h={104} />
      <Rule x={20} y={48} w={72} color="var(--muted)" />
      <Rule x={20} y={64} w={96} color="var(--fg)" />
      <Rule x={20} y={80} w={64} color="var(--muted)" />
      <Rule x={20} y={96} w={84} color="var(--muted)" />
      <Rule x={20} y={112} w={48} color="var(--muted)" />
      <Box x={176} y={56} w={28} h={28} />
      <Box x={276} y={76} w={28} h={28} />
      <Edge id="parse-edge" d="M204 70 H240 V90 H276" color="var(--outgoing)" />
      <Box x={352} y={24} w={112} h={112} />
      <line x1={352} y1={48} x2={464} y2={48} stroke="var(--border)" />
      <Swatch x={364} y={60} color="var(--kind-page)" />
      <Swatch x={364} y={80} color="var(--kind-api)" />
      <Swatch x={364} y={100} color="var(--kind-service)" />
      <Edge id="parse-map" d="M304 90 H328 V80 H352" color="var(--incoming)" />
    </svg>
  );
}

export function FrameworkFigure() {
  const columns = [
    ["var(--kind-page)", "var(--kind-api)", "var(--kind-action)"],
    ["var(--kind-controller)", "var(--kind-service)", "var(--kind-module)", "var(--kind-entity)"],
    ["var(--kind-page)", "var(--kind-api)", "var(--kind-layout)", "var(--kind-component)"],
    ["var(--kind-controller)", "var(--kind-service)", "var(--kind-entity)"],
    ["var(--kind-component)", "var(--kind-jsx)", "var(--kind-hook)"],
  ];

  return (
    <svg viewBox="0 0 480 140" className="h-auto w-full" aria-hidden>
      {columns.map((swatches, column) => (
        <g key={column} transform={`translate(${16 + column * 96} 28)`}>
          <Box x={0} y={0} w={64} h={24 + swatches.length * 20} />
          {swatches.map((color, row) => (
            <Swatch key={color} x={12} y={12 + row * 20} color={color} />
          ))}
        </g>
      ))}
    </svg>
  );
}

export function AbsenceFigure() {
  return (
    <svg viewBox="0 0 480 160" className="h-auto w-full" aria-hidden>
      <Box x={24} y={64} w={120} h={32} />
      <Box x={336} y={64} w={120} h={32} />
      <path
        d="M144 80 H220"
        fill="none"
        stroke="var(--muted)"
        strokeWidth={1}
      />
    </svg>
  );
}

function Box({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      fill="var(--surface-raised)"
      stroke="var(--border)"
    />
  );
}

function Swatch({ x, y, color }: { x: number; y: number; color: string }) {
  return <rect x={x} y={y} width={8} height={8} fill={color} />;
}

function Row({
  y,
  selected,
  swatch,
}: {
  y: number;
  selected: boolean;
  swatch: string;
}) {
  return (
    <g>
      {selected ? (
        <rect x={169} y={y} width={166} height={22} fill="var(--accent)" fillOpacity={0.14} />
      ) : null}
      <Swatch x={180} y={y + 7} color={swatch} />
    </g>
  );
}

function Rule({
  x,
  y,
  w,
  color,
}: {
  x: number;
  y: number;
  w: number;
  color: string;
}) {
  return <line x1={x} y1={y} x2={x + w} y2={y} stroke={color} strokeWidth={1} />;
}

function Edge({ id, d, color }: { id: string; d: string; color: string }) {
  return (
    <g>
      <defs>
        <marker
          id={id}
          viewBox="0 0 8 8"
          markerWidth={8}
          markerHeight={8}
          refX={7}
          refY={4}
          orient="auto"
        >
          <path d="M0 0 L8 4 L0 8 Z" fill={color} />
        </marker>
      </defs>
      <path d={d} fill="none" stroke={color} strokeWidth={1} markerEnd={`url(#${id})`} />
    </g>
  );
}
