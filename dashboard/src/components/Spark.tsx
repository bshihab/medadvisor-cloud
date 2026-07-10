// Trend sparkline per the unified skill-area spec (PLAN.md, SETTLED):
// ~56×20, 2px stroke, catmull-rom smooth, colored by the latest band.
// Under 2 points: keep the space, draw nothing.
export function Spark({
  values,
  color,
  w = 56,
  h = 20,
}: {
  values: (number | null)[];
  color: string;
  w?: number;
  h?: number;
}) {
  const present = values.filter((v): v is number => v != null);
  if (present.length < 2) return <span style={{ display: "inline-block", width: w }} />;
  const pts = present.map((v, i) => ({
    x: 2 + (i * (w - 4)) / (present.length - 1),
    y: h - 2 - v * (h - 4),
  }));
  let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    d += ` C ${(p1.x + (p2.x - p0.x) / 6).toFixed(1)},${(p1.y + (p2.y - p0.y) / 6).toFixed(1)} ${(p2.x - (p3.x - p1.x) / 6).toFixed(1)},${(p2.y - (p3.y - p1.y) / 6).toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}
