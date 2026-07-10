import { Link, useNavigate, useParams } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { bandColor, bandName, dimensionScores, fmtDay, fmtWhen, pct } from "@/lib/scoring";
import { memberName } from "@/store";
import { usePerson } from "./Person";

// Summary → detail (mirrors the app): big per-skill chart, one point per
// session, tap a point to open that session in the timeline.
export function SkillDetail() {
  const { dimId = "" } = useParams();
  const { uid, member, ss, latestRubric } = usePerson();
  const navigate = useNavigate();
  if (!member) return null;
  const label = latestRubric?.dimensions.find((d) => d.id === dimId)?.label ?? dimId;
  const data = ss
    .map((s) => ({ score: dimensionScores(s)[dimId] ?? null, s }))
    .filter((p): p is { score: number; s: (typeof ss)[number] } => p.score != null)
    .map((p) => ({
      date: fmtDay(p.s.recordedAt).slice(5),
      when: fmtWhen(p.s.recordedAt),
      value: Math.round(p.score * 100),
      score: p.score,
      sessionId: p.s.sessionId,
    }));
  const latest = data.at(-1);

  return (
    <div className="space-y-4">
      <Link to={`/person/${uid}`} className="text-sm text-accent hover:underline">
        ← {memberName(member)}
      </Link>
      <Card>
        <CardTitle className="flex items-center gap-2">
          {label}
          {latest && (
            <Badge style={{ background: bandColor(latest.score) }}>
              {bandName(latest.score)} · {pct(latest.score)}
            </Badge>
          )}
        </CardTitle>
        {data.length === 0 ? (
          <p className="text-sm text-muted">No scored sessions for this skill area yet.</p>
        ) : (
          <>
            <div className="h-64">
              <ResponsiveContainer>
                <LineChart data={data} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="var(--color-line)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-muted)" }} tickLine={false} />
                  <YAxis
                    domain={[0, 100]}
                    ticks={[0, 50, 100]}
                    tickFormatter={(v: number) => `${v}%`}
                    tick={{ fontSize: 11, fill: "var(--color-muted)" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    formatter={(v) => [`${v}%`, label]}
                    labelFormatter={(_, payload) => (payload?.[0]?.payload as { when: string })?.when ?? ""}
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-line)",
                      borderRadius: 12,
                      color: "var(--color-ink)",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={latest ? bandColor(latest.score) : "#8888"}
                    strokeWidth={2.5}
                    activeDot={{ r: 8 }}
                    dot={({ cx, cy, payload }) => (
                      <circle
                        key={payload.sessionId}
                        cx={cx}
                        cy={cy}
                        r={6}
                        fill={bandColor(payload.score)}
                        cursor="pointer"
                        onClick={() =>
                          navigate(`/person/${uid}/sessions`, {
                            state: { scrollTo: `sess-${payload.sessionId}` },
                          })
                        }
                      />
                    )}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-xs text-muted">
              Each point is one session — tap a point to open that session.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
