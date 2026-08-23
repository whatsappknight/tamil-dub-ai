import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Check, CloudUpload, FileVideo2, Loader2, ShieldCheck, Sparkles, Subtitles, Volume2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const VOICES = [
  { id: "female-1", name: "Tamil expressive", detail: "Natural and conversational" },
  { id: "female-2", name: "Tamil crisp", detail: "Bright explainer delivery" },
  { id: "male-1", name: "Tamil balanced", detail: "Even and clear delivery" },
  { id: "male-2", name: "Tamil warm", detail: "Grounded, lower-register tone" },
  { id: "narrator", name: "Tamil narrator", detail: "Measured documentary read" },
  { id: "youth", name: "Tamil youthful", detail: "Energetic social delivery" },
] as const;
const STYLES = ["natural", "professional", "friendly", "documentary", "energetic", "cinematic", "conversational", "dramatic"] as const;
const SUBTITLE_STYLES = ["studio", "minimal", "high_contrast"] as const;
type VoiceId = (typeof VOICES)[number]["id"];
type VoiceStyle = (typeof STYLES)[number];

function mediaType(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase();
  return file.type || ({ mp4: "video/mp4", mov: "video/quicktime", mkv: "video/x-matroska", webm: "video/webm" } as Record<string, string>)[ext || ""] || "";
}

function streamUpload(file: File, path: string, onProgress: (value: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", path);
    xhr.setRequestHeader("Content-Type", mediaType(file));
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)); };
    xhr.onerror = () => reject(new Error("The video could not reach secure project storage."));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      try { reject(new Error((JSON.parse(xhr.responseText) as { error?: string }).error || "Upload failed.")); }
      catch { reject(new Error(`Upload failed with status ${xhr.status}.`)); }
    };
    xhr.send(file);
  });
}

export default function LocalizationUploadPage() {
  const [, navigate] = useLocation();
  const picker = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [projectName, setProjectName] = useState("");
  const [language, setLanguage] = useState("auto");
  const [voiceId, setVoiceId] = useState<VoiceId>("female-1");
  const [voiceStyle, setVoiceStyle] = useState<VoiceStyle>("natural");
  const [terminologyRules, setTerminologyRules] = useState("");
  const [pronunciationRules, setPronunciationRules] = useState("");
  const [subtitleStyle, setSubtitleStyle] = useState<(typeof SUBTITLE_STYLES)[number]>("studio");
  const [fallback, setFallback] = useState(true);
  const [subtitles, setSubtitles] = useState(true);
  const [burn, setBurn] = useState(false);
  const [srt, setSrt] = useState(true);
  const [music, setMusic] = useState(false);
  const [effects, setEffects] = useState(false);
  const [owns, setOwns] = useState(false);
  const [responsible, setResponsible] = useState(false);
  const prepare = trpc.projects.prepareUpload.useMutation();
  const complete = trpc.projects.completeUpload.useMutation();
  const start = trpc.projects.startProcessing.useMutation();
  const busy = prepare.isPending || complete.isPending || start.isPending || (progress > 0 && progress < 100);

  function select(next?: File) {
    if (!next) return;
    if (!/[.](mp4|mov|mkv|webm)$/i.test(next.name)) return toast.error("Use MP4, MOV, MKV, or WebM.");
    if (next.size > 200 * 1024 * 1024) return toast.error("This MVP supports videos up to 200 MB.");
    setFile(next);
    setProjectName(value => value || next.name.replace(/\.[^.]+$/, ""));
    setProgress(0);
  }

  async function submit() {
    if (!file) return toast.error("Choose a video to continue.");
    if (!owns || !responsible) return toast.error("Confirm both copyright acknowledgements before processing.");
    try {
      const mimeType = mediaType(file);
      const created = await prepare.mutateAsync({ projectName, originalLanguage: language, voiceId, voiceStyle, terminologyRules, pronunciationRules, subtitleStyle, allowVoiceProviderFallback: fallback, preserveBackgroundAudio: music, preserveSoundEffects: effects, generateSubtitles: subtitles, burnSubtitles: burn, createSrt: srt, copyrightOwnershipConfirmed: true, copyrightResponsibilityConfirmed: true, filename: file.name, mimeType, sizeBytes: file.size });
      await streamUpload(file, created.uploadPath, setProgress);
      await complete.mutateAsync({ projectId: created.projectId, file: { filename: file.name, mimeType, sizeBytes: file.size } });
      await start.mutateAsync({ projectId: created.projectId });
      toast.success("Upload complete. Tamil dubbing has started.");
      navigate(`/projects/${created.projectId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to start the dubbing project.");
      setProgress(0);
    }
  }

  return <div className="mx-auto max-w-6xl space-y-7 pb-12">
    <header><p className="text-xs font-medium uppercase tracking-[.18em] text-violet-400">New production</p><h1 className="mt-1 text-3xl font-semibold">Create a Tamil dub</h1></header>
    <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
      <main className="space-y-6">
        <section className="rounded-3xl border border-border/70 bg-card p-6">
          <div className="flex justify-between"><div><h2 className="text-lg font-semibold">1. Upload your video</h2><p className="mt-1 text-sm text-muted-foreground">Direct upload only. MP4, MOV, MKV, and WebM up to 200 MB.</p></div><FileVideo2 className="h-5 w-5 text-violet-400" /></div>
          <button type="button" className="mt-5 flex min-h-48 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 px-6 transition-colors hover:border-violet-400" onClick={() => picker.current?.click()}><CloudUpload className="h-7 w-7 text-violet-400" /><p className="mt-3 font-medium">{file ? file.name : "Drop your video here"}</p><p className="mt-1 text-sm text-muted-foreground">{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB · choose another file` : "or browse from your computer"}</p></button>
          <input ref={picker} className="hidden" type="file" accept=".mp4,.mov,.mkv,.webm,video/*" onChange={event => select(event.target.files?.[0])} />
          {progress > 0 ? <div className="mt-5"><div className="mb-2 flex justify-between text-xs text-muted-foreground"><span>Uploading securely</span><span>{progress}%</span></div><Progress value={progress} /></div> : null}
        </section>
        <section className="rounded-3xl border border-border/70 bg-card p-6">
          <div className="flex items-center gap-3"><div className="rounded-xl bg-cyan-500/10 p-2 text-cyan-400"><Volume2 className="h-5 w-5" /></div><div><h2 className="font-semibold">2. Tamil voice direction</h2><p className="text-sm text-muted-foreground">Set the default voice and speaking style. Each labelled speaker can be changed later.</p></div></div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2"><Field label="Project name"><Input value={projectName} onChange={event => setProjectName(event.target.value)} /></Field><Field label="Original language"><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={language} onChange={event => setLanguage(event.target.value)}>{[["auto", "Auto detect"], ["en", "English"], ["hi", "Hindi"], ["te", "Telugu"], ["ml", "Malayalam"], ["kn", "Kannada"]].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></Field></div>
          <Label className="mt-5 block">Tamil voice profile</Label><div className="mt-2 grid gap-2 sm:grid-cols-2">{VOICES.map(voice => <button type="button" key={voice.id} onClick={() => setVoiceId(voice.id)} className={`rounded-xl border p-3 text-left transition-colors ${voiceId === voice.id ? "border-violet-500 bg-violet-500/10" : "border-border hover:border-violet-400/60"}`}><div className="flex justify-between"><span className="text-sm font-semibold">{voice.name}</span>{voiceId === voice.id ? <Check className="h-4 w-4 text-violet-400" /> : null}</div><p className="mt-1 text-xs text-muted-foreground">{voice.detail}</p></button>)}</div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Default Tamil speaking style"><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm capitalize" value={voiceStyle} onChange={event => setVoiceStyle(event.target.value as VoiceStyle)}>{STYLES.map(style => <option key={style} value={style}>{style}</option>)}</select></Field><Toggle title="Use configured backup voice provider" detail="Used only when a compatible fallback is available." checked={fallback} onChange={setFallback} /></div>
          <Rules label="Terminology rules" detail="Use source => preferred Tamil term, one per line." value={terminologyRules} onChange={setTerminologyRules} placeholder={"Dashboard => டாஷ்போர்டு\nAI => செயற்கை நுண்ணறிவு"} />
          <Rules label="Pronunciation rules" detail="Use spoken form => preferred Tamil spoken form, one per line." value={pronunciationRules} onChange={setPronunciationRules} placeholder={"OpenAI => ஓபன் ஏஐ\nSaaS => சாஸ்"} />
        </section>
        <section className="rounded-3xl border border-border/70 bg-card p-6"><div className="flex items-center gap-3"><div className="rounded-xl bg-violet-500/10 p-2 text-violet-400"><Subtitles className="h-5 w-5" /></div><div><h2 className="font-semibold">3. Subtitle and audio finish</h2><p className="text-sm text-muted-foreground">Select captions and audio handling. Platform export presets are available after the Tamil mix is ready.</p></div></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><Field label="Subtitle treatment"><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={subtitleStyle} onChange={event => setSubtitleStyle(event.target.value as typeof subtitleStyle)}>{SUBTITLE_STYLES.map(style => <option key={style} value={style}>{style.replace("_", " ")}</option>)}</select></Field><Toggle title="Generate Tamil subtitles" detail="Create timed captions." checked={subtitles} onChange={setSubtitles} /><Toggle title="Burn captions into MP4" detail="Render captions into video." checked={burn} onChange={setBurn} /><Toggle title="Create separate SRT" detail="Add a downloadable subtitle export." checked={srt} onChange={setSrt} /><Toggle title="Preserve background music" detail="Choose only if a clean non-dialogue source is available." checked={music} onChange={setMusic} /><Toggle title="Preserve sound effects" detail="Requires an audio-separation provider." checked={effects} onChange={setEffects} /></div></section>
      </main>
      <aside className="h-fit space-y-5 lg:sticky lg:top-6"><section className="rounded-3xl border border-amber-400/25 bg-amber-400/5 p-5"><div className="flex gap-3"><ShieldCheck className="h-5 w-5 shrink-0 text-amber-300" /><div><h2 className="font-semibold">Copyright and permission</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">You must own this video or have permission or a valid license to translate, dub, modify, and republish it.</p></div></div><label className="mt-5 flex gap-3 text-sm"><Checkbox checked={owns} onCheckedChange={value => setOwns(value === true)} /><span>I own this content or have permission to modify and dub it.</span></label><label className="mt-4 flex gap-3 text-sm"><Checkbox checked={responsible} onCheckedChange={value => setResponsible(value === true)} /><span>I understand that I am responsible for copyright compliance.</span></label></section><section className="rounded-3xl border border-border/70 bg-card p-5"><h2 className="font-semibold">Processing sequence</h2><ol className="mt-4 space-y-2 text-sm text-muted-foreground">{["Extract audio", "Detect language", "Label and translate dialogue", "Generate Tamil voices", "Synchronize and render MP4"].map((step, index) => <li className="flex gap-3" key={step}><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-xs text-violet-300">{index + 1}</span>{step}</li>)}</ol><Button className="mt-6 w-full gap-2 bg-violet-600 hover:bg-violet-500" disabled={busy || !file || !owns || !responsible || !projectName.trim()} onClick={submit}>{busy ? <><Loader2 className="h-4 w-4 animate-spin" />{progress ? `Uploading ${progress}%` : "Preparing project"}</> : <><Sparkles className="h-4 w-4" />Start Tamil dubbing</>}</Button></section></aside>
    </div>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }
function Rules({ label, detail, value, onChange, placeholder }: { label: string; detail: string; value: string; onChange: (value: string) => void; placeholder: string }) { return <div className="mt-5 space-y-2"><div className="flex justify-between gap-3"><Label>{label}</Label><span className="text-xs text-muted-foreground">One rule per line</span></div><Textarea className="min-h-24 font-mono text-xs" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} /><p className="text-xs text-muted-foreground">{detail}</p></div>; }
function Toggle({ title, detail, checked, onChange }: { title: string; detail: string; checked: boolean; onChange: (value: boolean) => void }) { return <div className="flex justify-between gap-3 rounded-xl border border-border/70 p-3"><div><p className="text-sm font-medium">{title}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div><Switch checked={checked} onCheckedChange={onChange} /></div>; }
