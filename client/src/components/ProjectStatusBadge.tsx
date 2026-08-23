import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, CircleDashed, Clock3 } from "lucide-react";

export function ProjectStatusBadge({ status }: { status: string }) {
  const options: Record<string, { label: string; icon: typeof Clock3; className: string }> = {
    completed: { label: "Completed", icon: CheckCircle2, className: "border-emerald-400/20 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300" },
    failed: { label: "Needs attention", icon: AlertTriangle, className: "border-rose-400/20 bg-rose-400/10 text-rose-700 dark:text-rose-300" },
    processing: { label: "Processing", icon: CircleDashed, className: "border-violet-400/20 bg-violet-400/10 text-violet-700 dark:text-violet-300" },
    queued: { label: "Queued", icon: Clock3, className: "border-amber-400/20 bg-amber-400/10 text-amber-700 dark:text-amber-300" },
    ready: { label: "Ready", icon: CheckCircle2, className: "border-cyan-400/20 bg-cyan-400/10 text-cyan-700 dark:text-cyan-300" },
    uploading: { label: "Uploading", icon: CircleDashed, className: "border-violet-400/20 bg-violet-400/10 text-violet-700 dark:text-violet-300" },
    draft: { label: "Draft", icon: Clock3, className: "border-slate-400/20 bg-slate-400/10 text-slate-700 dark:text-slate-300" },
  };
  const option = options[status] || options.draft;
  const Icon = option.icon;
  return <Badge variant="outline" className={cn("gap-1.5 rounded-full px-2.5 py-1 font-medium", option.className)}><Icon className={cn("h-3.5 w-3.5", status === "processing" || status === "uploading" ? "animate-spin" : "")} />{option.label}</Badge>;
}
