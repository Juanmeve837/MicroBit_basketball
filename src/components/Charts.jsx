import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const AXIS_COLORS = { x: "#ea580c", y: "#0ea5e9", z: "#16a34a" };

export function PotenciaBarChart({ tiros }) {
  const data = tiros.map((t) => ({
    tiro: `#${t.tiro}`,
    potencia_avg: t.potencia_avg,
    potencia_max: t.potencia_max,
    cesta: t.cesta,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="tiro" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip />
        <Bar dataKey="potencia_avg" fill="#ea580c" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AxisStatsChart({ axisStats }) {
  const data = ["x", "y", "z"].map((axis) => ({
    axis: axis.toUpperCase(),
    mean: axisStats[axis]?.mean ?? 0,
    std: axisStats[axis]?.std ?? 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="axis" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip />
        <Bar dataKey="mean" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function EffectivenessEvolutionChart({ sessions }) {
  const data = sessions
    .slice()
    .sort((a, b) => (a.date > b.date ? 1 : -1))
    .map((s) => ({ date: s.date, efectividad: s.efectividad }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 12 }} unit="%" />
        <Tooltip />
        <Line
          type="monotone"
          dataKey="efectividad"
          stroke="#ea580c"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function computeBoxStats(values) {
  if (!values || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const q = (p) => {
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };
  return {
    min: sorted[0],
    q1: q(0.25),
    median: q(0.5),
    q3: q(0.75),
    max: sorted[sorted.length - 1],
  };
}

export function PotenciaBoxplot({ sessions }) {
  const stats = sessions
    .map((s) => ({ label: s.session_id?.slice(-6) || s.date, box: computeBoxStats(s.potencias) }))
    .filter((s) => s.box);

  if (stats.length === 0) {
    return <p className="text-sm text-slate-400">Sin datos suficientes para el boxplot.</p>;
  }

  const globalMax = Math.max(...stats.map((s) => s.box.max));
  const globalMin = Math.min(...stats.map((s) => s.box.min));
  const range = globalMax - globalMin || 1;
  const chartHeight = 220;
  const toY = (v) => chartHeight - ((v - globalMin) / range) * chartHeight;
  const boxWidth = 28;
  const gap = 48;

  return (
    <div className="overflow-x-auto">
      <svg
        width={Math.max(stats.length * gap + 40, 300)}
        height={chartHeight + 40}
        role="img"
        aria-label="Boxplot de potencia por sesión"
      >
        {stats.map((s, i) => {
          const cx = 30 + i * gap;
          return (
            <g key={s.label}>
              <line
                x1={cx}
                x2={cx}
                y1={toY(s.box.min)}
                y2={toY(s.box.max)}
                stroke="#94a3b8"
              />
              <rect
                x={cx - boxWidth / 2}
                y={toY(s.box.q3)}
                width={boxWidth}
                height={Math.max(toY(s.box.q1) - toY(s.box.q3), 1)}
                fill="#fed7aa"
                stroke="#ea580c"
              />
              <line
                x1={cx - boxWidth / 2}
                x2={cx + boxWidth / 2}
                y1={toY(s.box.median)}
                y2={toY(s.box.median)}
                stroke="#ea580c"
                strokeWidth={2}
              />
              <text
                x={cx}
                y={chartHeight + 16}
                textAnchor="middle"
                fontSize="10"
                fill="#64748b"
              >
                {s.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function AxisDistributionChart({ samples }) {
  const buckets = 12;
  const axes = ["x", "y", "z"];
  const values = axes.reduce((acc, axis) => {
    acc[axis] = samples.map((s) => s[axis]).filter((v) => v != null);
    return acc;
  }, {});

  const allValues = axes.flatMap((a) => values[a]);
  if (allValues.length === 0) {
    return <p className="text-sm text-slate-400">Sin muestras para distribución de ejes.</p>;
  }
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const step = (max - min || 1) / buckets;

  const data = Array.from({ length: buckets }, (_, i) => {
    const rangeStart = min + i * step;
    const rangeEnd = rangeStart + step;
    const bucket = { bucket: rangeStart.toFixed(0) };
    axes.forEach((axis) => {
      bucket[axis] = values[axis].filter(
        (v) => v >= rangeStart && (i === buckets - 1 ? v <= rangeEnd : v < rangeEnd)
      ).length;
    });
    return bucket;
  });

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip />
        {axes.map((axis) => (
          <Bar key={axis} dataKey={axis} fill={AXIS_COLORS[axis]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
