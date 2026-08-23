import { ProjectStatusBadge } from "@/components/ProjectStatusBadge";
import { WaveformPreview } from "@/components/WaveformPreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatDuration, stageLabel } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { Download, FileText, Loader2, Pencil, RefreshCcw, RotateCw, Save, Users, Video, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";

const voices = ["male-1", "male-2", "female-1", "female-2", "narrator", "youth"] as const;
const styles = ["natural", "professional", "friendly", "documentary", "energetic", "cinematic", "conversational", "dramatic"] as const;
const exportPresets = [{ id: "source", label: "Source" }, { id: "youtube", label: "YouTube" }, { id: "shorts", label: "Shorts / Reels" }, { id: "whatsapp", label: "WhatsApp" }] as const;

export default function LocalizationProjectPage() {
  const [, params] = useRoute("/projects/:projectId");
  const projectId = Number(params?.projectId);
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const canLoadProject = Number.isSafeInteger(projectId) && projectId > 0;
  const query = trpc.projects.get.useQuery({ projectId }, { enabled: canLoadProject });
  const project = query.data?.project;
  const [editing, setEditing] = useState<number | null>(null);
  const [tamilText, setTamilText] = useState("");
  const [speaker, setSpeaker] = useState("Speaker 1");
  const [pronunciationHint, setPronunciationHint] = useState("");
  const [voiceId, setVoiceId] = useState<typeof voices[number]>("female-1");
  const [voiceStyle, setVoiceStyle] = useState<typeof styles[number]>("natural");
  const [speed, setSpeed] = useState("1");
  const [retryNotice, setRetryNotice] = useState<string | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const [previewTime, setPreviewTime] = useState(0);
  const [previewDuration, setPreviewDuration] = useState<number | null>(null);

  const refresh = useCallback(() => void utils.projects.get.invalidate({ projectId }), [projectId, utils.projects.get]);
  const retry = trpc.projects.retry.useMutation({
    onMutate: () => {
      setRetryNotice("Sending retry request…");
    },
    onSuccess: async () => {
      setRetryNotice("Retry accepted. Generating voice will resume shortly.");
      toast.success("Retry accepted. The failed stage is resuming.");
      await utils.projects.get.invalidate({ projectId });
    },
    onError: async error => {
      setRetryNotice(null);
      toast.error(error.message || "The retry request could not be accepted.");
      await utils.projects.get.invalidate({ projectId });
    },
  });
  const regenerate = trpc.projects.regenerateSegment.useMutation({
    onSuccess: () => {
      toast.success("Voice regeneration has started.");
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const update = trpc.projects.updateSegment.useMutation({
    onSuccess: () => {
      toast.success("Segment saved. Regenerate its voice to apply the change.");
      setEditing(null);
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const applySpeakerVoice = trpc.projects.applySpeakerVoice.useMutation({ onSuccess: () => { toast.success("Updated the selected speaker profile. Regenerate its segments to apply the new voices."); refresh(); }, onError: error => toast.error(error.message) });
  const renderPreset = trpc.projects.renderExportPreset.useMutation({ onSuccess: () => { toast.success("Preset render started."); refresh(); }, onError: error => toast.error(error.message) });

  useEffect(() => {
    if (!project || !["queued", "processing", "uploading"].includes(project.status)) return;
    const timer = window.setInterval(refresh, 3000);
    return () => window.clearInterval(timer);
  }, [project?.status, refresh]);

  const waveformDuration = previewDuration ?? project?.outputDurationSeconds ?? project?.sourceDurationSeconds ?? 0;
  const mixedAudioUrl = query.data?.files.find(file => file.role === "mixed_audio")?.url ?? project?.finalVideoUrl;
  const seekPreview = useCallback((seconds: number) => {
    const video = previewRef.current;
    if (!video) return;
    const duration = Number.isFinite(video.duration) ? video.duration : waveformDuration;
    const target = Math.max(0, Math.min(duration || 0, seconds));
    video.currentTime = target;
    setPreviewTime(target);
  }, [waveformDuration]);

  if (query.isLoading) return <div className="mx-auto max-w-7xl p-8 text-sm text-muted-foreground">Loading project workspace…</div>;
  if (!project) return <div className="mx-auto max-w-7xl p-8">This project is unavailable.</div>;

  function edit(segment: NonNullable<typeof query.data>["segments"][number]) {
    setEditing(segment.id);
    setTamilText(segment.tamilText || "");
    setSpeaker(segment.speaker || "Speaker 1");
    setPronunciationHint(segment.pronunciationHint || "");
    setVoiceId(segment.voiceId as typeof voiceId);
    setVoiceStyle(segment.voiceStyle as typeof voiceStyle);
    setSpeed(String(segment.speed));
  }

  function save(segmentId: number) {
    update.mutate({ projectId, segmentId, speaker, tamilText, pronunciationHint, voiceId, voiceStyle, speed: Number(speed) });
  }

  function retryFailedStage() {
    if (!canLoadProject) {
      toast.error("This project link is invalid. Return to the project library and open the project again.");
      return;
    }
    setRetryNotice("Sending retry request…");
    retry.mutate({ projectId });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <Button type="button" variant="ghost" className="mb-3 -ml-3" onClick={() => navigate("/projects")}>← Project library</Button>
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-[.18em] text-violet-400">Tamil dubbing project</p>
            <ProjectStatusBadge status={project.status} />
          </div>
          <h1 className="mt-2 text-3xl font-semibold">{project.projectName}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{project.detectedLanguage || project.originalLanguage} → Tamil · Started {formatDate(project.createdAt)}</p>
        </div>
        {project.status === "failed" ? (
          <Button
            type="button"
            data-testid="retry-failed-stage"
            className="min-w-48 gap-2"
            onClick={retryFailedStage}
            disabled={retry.isPending}
            aria-describedby="retry-stage-status"
          >
            {retry.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            {retry.isPending ? "Retrying failed stage…" : "Retry failed stage"}
          </Button>
        ) : null}
      </header>

      <section className="rounded-3xl border border-border/70 bg-card p-6">
        <div className="flex justify-between gap-4">
          <div>
            <h2 className="font-semibold">{stageLabel(project.currentStage)}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{project.statusMessage || "Preparing your project."}</p>
          </div>
          <p className="text-2xl font-semibold">{project.progressPercent}%</p>
        </div>
        <Progress className="mt-4" value={project.progressPercent} />
        <p id="retry-stage-status" aria-live="polite" className="mt-3 min-h-5 text-sm text-violet-300">
          {retryNotice}
        </p>
        {project.lastError ? <p className="mt-4 rounded-xl border border-rose-400/20 bg-rose-500/5 p-3 text-sm text-rose-200">{project.lastError}</p> : null}
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,.85fr)]">
        <section className="min-w-0 rounded-3xl border border-border/70 bg-card p-6">
          <h2 className="font-semibold">Final preview</h2>
          {project.finalVideoUrl ? (
            <>
              <video
                ref={previewRef}
                controls
                className="mt-4 aspect-video w-full rounded-xl bg-black"
                src={project.finalVideoUrl}
                onLoadedMetadata={event => setPreviewDuration(event.currentTarget.duration)}
                onTimeUpdate={event => setPreviewTime(event.currentTarget.currentTime)}
                onEnded={() => setPreviewTime(0)}
              />
              <WaveformPreview
                audioUrl={mixedAudioUrl}
                durationSeconds={waveformDuration}
                currentTime={previewTime}
                onSeek={seekPreview}
                markers={query.data?.segments.map(segment => ({
                  id: segment.id,
                  startSeconds: Number(segment.startSeconds),
                  endSeconds: Number(segment.endSeconds),
                  label: `Dialogue ${segment.sortOrder + 1}`,
                  detail: segment.tamilText || segment.sourceText,
                })) ?? []}
              />
              <div className="mt-4 flex gap-2">
                <Button asChild><a href={project.finalVideoUrl} download><Download className="mr-2 h-4 w-4" />Download MP4</a></Button>
                {project.subtitleSrtUrl ? <Button variant="outline" asChild><a href={project.subtitleSrtUrl} download>Download SRT</a></Button> : null}
              </div>
            </>
          ) : <p className="mt-4 rounded-xl bg-muted/40 p-6 text-sm text-muted-foreground">The preview will appear when rendering completes.</p>}
        </section>
        <section className="min-w-0 rounded-3xl border border-border/70 bg-card p-6">
          <h2 className="font-semibold">Localization output</h2>
          <dl className="mt-5 space-y-3 text-sm">
            <Row label="Original duration" value={formatDuration(project.sourceDurationSeconds)} />
            <Row label="Tamil output duration" value={formatDuration(project.outputDurationSeconds)} />
            <Row label="Tamil voice" value={`${project.voiceId} · ${project.voiceStyle}`} />
            <Row label="Subtitle style" value={project.subtitleStyle.replace("_", " ")} />
            <Row label="Fallback voice" value={project.allowVoiceProviderFallback ? "Allowed when configured" : "Disabled"} />
          </dl>
        </section>
      </div>

      <section className="overflow-hidden rounded-3xl border border-border/70 bg-card">
        <div className="border-b border-border/70 p-6">
          <h2 className="font-semibold">Timeline translation editor</h2>
          <p className="mt-1 text-sm text-muted-foreground">Label speakers, assign Tamil voices and styles, then regenerate only the dialogue that changed.</p>
        </div>
        {query.data?.segments.length ? (
          <div className="divide-y divide-border/60">
            {query.data.segments.map(segment => (
              <div className="p-6" key={segment.id}>
                {editing === segment.id ? (
                  <div className="grid gap-4 lg:grid-cols-[150px_1fr_1fr_180px]">
                    <div><p className="text-xs uppercase text-muted-foreground">Time</p><p className="mt-2 text-sm font-medium">{formatDuration(segment.startSeconds)}–{formatDuration(segment.endSeconds)}</p></div>
                    <div>
                      <Label>Speaker label</Label><Input className="mt-2" value={speaker} onChange={event => setSpeaker(event.target.value)} placeholder="Speaker 1" />
                      <Label className="mt-4 block">Original speech</Label><p className="mt-2 text-sm text-muted-foreground">{segment.sourceText}</p>
                      <Label className="mt-4 block">Pronunciation hint</Label>
                      <Input className="mt-2" value={pronunciationHint} onChange={event => setPronunciationHint(event.target.value)} placeholder="Optional Tamil spoken-form hint" />
                      <p className="mt-1 text-xs text-muted-foreground">Applies after project pronunciation rules for this segment.</p>
                    </div>
                    <div><Label>Tamil translation</Label><Textarea className="mt-2 min-h-28" value={tamilText} onChange={event => setTamilText(event.target.value)} /></div>
                    <div className="space-y-2">
                      <Label>Voice / speed</Label>
                      <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={voiceId} onChange={event => setVoiceId(event.target.value as typeof voiceId)}>{voices.map(item => <option key={item}>{item}</option>)}</select>
                      <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={voiceStyle} onChange={event => setVoiceStyle(event.target.value as typeof voiceStyle)}>{styles.map(item => <option key={item}>{item}</option>)}</select>
                      <Input type="number" min="0.85" max="1.18" step="0.01" value={speed} onChange={event => setSpeed(event.target.value)} />
                      <div className="flex flex-wrap gap-2"><Button type="button" size="sm" disabled={update.isPending} onClick={() => save(segment.id)}><Save className="mr-1 h-3.5 w-3.5" />Save</Button><Button type="button" size="sm" variant="outline" disabled={applySpeakerVoice.isPending || !speaker.trim()} onClick={() => applySpeakerVoice.mutate({ projectId, speaker: speaker.trim(), voiceId, voiceStyle })}><Users className="mr-1 h-3.5 w-3.5" />Apply to speaker</Button><Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button></div>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4 lg:grid-cols-[150px_.9fr_1fr_180px]">
                    <div><p className="text-xs uppercase text-muted-foreground">Time</p><p className="mt-2 text-sm font-medium">{formatDuration(segment.startSeconds)}–{formatDuration(segment.endSeconds)}</p></div>
                    <div><p className="text-xs uppercase text-muted-foreground">{segment.speaker || "Speaker 1"}</p><p className="mt-2 text-sm text-muted-foreground">{segment.sourceText}</p>{segment.pronunciationHint ? <p className="mt-3 text-xs text-cyan-200">Pronunciation: {segment.pronunciationHint}</p> : null}</div>
                    <div><p className="text-xs uppercase text-muted-foreground">Tamil translation</p><p className="mt-2 text-sm">{segment.tamilText || "Translation is being prepared…"}</p></div>
                    <div className="flex flex-wrap items-start gap-2 lg:justify-end">
                      <Button type="button" size="sm" variant="outline" onClick={() => edit(segment)}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button>
                      <Button type="button" size="sm" variant="outline" disabled={!segment.tamilText || regenerate.isPending} onClick={() => regenerate.mutate({ projectId, segmentId: segment.id })}><RotateCw className="mr-1 h-3.5 w-3.5" />Regenerate</Button>
                      {segment.ttsAudioUrl ? <Button type="button" size="icon" variant="ghost" asChild><a href={segment.ttsAudioUrl} target="_blank" rel="noreferrer"><Volume2 className="h-4 w-4" /></a></Button> : null}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : <div className="p-10 text-center text-sm text-muted-foreground"><FileText className="mx-auto mb-3 h-6 w-6 text-violet-400" />Transcript segments will appear here after transcription completes.</div>}
      </section>
      <section className="rounded-3xl border border-border/70 bg-card p-6">
        <div className="flex items-start gap-3"><div className="rounded-xl bg-violet-500/10 p-2 text-violet-300"><Video className="h-5 w-5" /></div><div><h2 className="font-semibold">Delivery export</h2><p className="mt-1 text-sm text-muted-foreground">Render a new MP4 from the existing Tamil audio without regenerating voices.</p></div></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{exportPresets.map(preset => <Button key={preset.id} type="button" variant="outline" disabled={renderPreset.isPending || !project.finalVideoUrl} onClick={() => renderPreset.mutate({ projectId, exportPreset: preset.id })}>{renderPreset.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Video className="mr-2 h-4 w-4" />}{preset.label}</Button>)}</div>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{label}</dt><dd className="text-right font-medium capitalize">{value}</dd></div>;
}
