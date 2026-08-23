import { ProjectStatusBadge } from "@/components/ProjectStatusBadge";
import { StudioMetricCard } from "@/components/StudioMetricCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatDuration, stageLabel } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { ArrowRight, CirclePlay, Clock3, FolderClock, Plus, Sparkles, TriangleAlert, Video } from "lucide-react";
import { useLocation } from "wouter";

export default function Home() {
  const [, navigate] = useLocation();
  const summary = trpc.projects.summary.useQuery();
  const projects = trpc.projects.list.useQuery();
  const recent = (projects.data ?? []).slice(0, 5);

  return <div className="mx-auto max-w-7xl space-y-8 pb-10">
    <section className="relative overflow-hidden rounded-3xl border border-violet-400/20 bg-[radial-gradient(circle_at_82%_18%,rgba(139,92,246,.25),transparent_28%),radial-gradient(circle_at_8%_96%,rgba(34,211,238,.16),transparent_30%)] bg-card px-6 py-8 shadow-sm sm:px-8 lg:px-10">
      <div className="absolute right-5 top-5 hidden h-28 w-28 rounded-full border border-violet-400/20 bg-violet-400/10 blur-[1px] sm:block" />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between"><div className="max-w-2xl"><div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-400/25 bg-violet-400/10 px-3 py-1 text-xs font-medium text-violet-700 dark:text-violet-200"><Sparkles className="h-3.5 w-3.5" />Tamil AI dubbing studio</div><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">A refined Tamil voice for every story.</h1><p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">Upload a video you are authorized to adapt, select a voice, and monitor the complete Tamil dubbing workflow from timestamped transcription through downloadable MP4 output.</p></div><Button size="lg" onClick={() => navigate("/upload")} className="gap-2 rounded-xl bg-violet-600 px-5 shadow-lg shadow-violet-500/20 hover:bg-violet-500"><Plus className="h-4 w-4" />New Tamil dub</Button></div>
    </section>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StudioMetricCard label="All projects" value={summary.data?.total ?? 0} icon={Video} tone="violet" />
      <StudioMetricCard label="In production" value={summary.data?.processing ?? 0} icon={Clock3} tone="cyan" />
      <StudioMetricCard label="Completed" value={summary.data?.completed ?? 0} icon={CirclePlay} tone="emerald" />
      <StudioMetricCard label="Need attention" value={summary.data?.failed ?? 0} icon={TriangleAlert} tone="rose" />
    </section>

    <section className="rounded-3xl border border-border/70 bg-card shadow-sm"><div className="flex flex-col gap-3 border-b border-border/70 px-6 py-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-semibold tracking-tight">Recent projects</h2><p className="mt-1 text-sm text-muted-foreground">Track uploads, live pipeline status, and final outputs.</p></div><Button variant="ghost" className="justify-start gap-2 text-violet-700 hover:text-violet-800 dark:text-violet-300" onClick={() => navigate("/projects")}>View all <ArrowRight className="h-4 w-4" /></Button></div>
      {projects.isLoading ? <div className="space-y-3 p-6">{Array.from({ length: 3 }).map((_, index) => <Skeleton className="h-20 w-full rounded-2xl" key={index} />)}</div> : recent.length ? <div className="divide-y divide-border/60">{recent.map(project => <button key={project.id} onClick={() => navigate(`/projects/${project.id}`)} className="flex w-full items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-muted/35"><div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-violet-500/25 via-fuchsia-500/15 to-cyan-500/20">{project.thumbnailUrl ? <img src={project.thumbnailUrl} alt="" className="h-full w-full object-cover" /> : <Video className="h-5 w-5 text-violet-500" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-medium">{project.projectName}</p><ProjectStatusBadge status={project.status} /></div><p className="mt-1 truncate text-sm text-muted-foreground">{stageLabel(project.currentStage)} · {formatDuration(project.sourceDurationSeconds)} · Created {formatDate(project.createdAt)}</p></div><ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" /></button>)}</div> : <div className="flex flex-col items-center px-6 py-14 text-center"><div className="rounded-2xl bg-violet-500/10 p-4 text-violet-500"><FolderClock className="h-7 w-7" /></div><h3 className="mt-4 font-semibold">Your studio is ready for its first project</h3><p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Start with a video uploaded directly from your computer. TamilDub AI does not download or scrape content from external platforms.</p><Button className="mt-5 gap-2 rounded-xl" onClick={() => navigate("/upload")}><Plus className="h-4 w-4" />Upload video</Button></div>}
    </section>
  </div>;
}
