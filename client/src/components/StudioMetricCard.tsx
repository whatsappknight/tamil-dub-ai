import type { LucideIcon } from "lucide-react";

export function StudioMetricCard({ label, value, icon: Icon, tone }: { label: string; value: number; icon: LucideIcon; tone: "violet" | "cyan" | "emerald" | "rose" }) {
  const tones = { violet: "from-violet-500/20 to-fuchsia-500/5 text-violet-500", cyan: "from-cyan-500/20 to-sky-500/5 text-cyan-500", emerald: "from-emerald-500/20 to-teal-500/5 text-emerald-500", rose: "from-rose-500/20 to-orange-500/5 text-rose-500" };
  return <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card p-5 shadow-sm"><div className={`absolute inset-0 bg-gradient-to-br ${tones[tone]} opacity-70`} /><div className="relative flex items-start justify-between"><div><p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p></div><div className="rounded-xl bg-background/70 p-2.5 shadow-sm"><Icon className={`h-5 w-5 ${tones[tone].split(" ").at(-1)}`} /></div></div></div>;
}
