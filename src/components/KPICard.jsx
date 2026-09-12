export default function KPICard({ label, value, suffix = "", tone = "default" }) {
  const toneClass =
    tone === "good"
      ? "text-green-600"
      : tone === "bad"
      ? "text-red-600"
      : "text-court-dark";

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-slate-400 font-medium">
        {label}
      </span>
      <span className={`text-2xl font-bold ${toneClass}`}>
        {value ?? "—"}
        {value != null && suffix}
      </span>
    </div>
  );
}
