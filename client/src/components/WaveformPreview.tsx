import { cn } from "@/lib/utils";
import {
  buildTimelineTicks,
  assignMarkerLanes,
  findActiveMarker,
  formatWaveformTime,
  getMarkerPositionPercent,
  getTimelineSeekSeconds,
  sampleChannelPeaks,
  type DialogueMarker,
} from "@/lib/waveform";
import { AudioLines, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type WaveformPreviewProps = {
  audioUrl?: string | null;
  durationSeconds: number | null | undefined;
  currentTime: number;
  markers: DialogueMarker[];
  onSeek: (seconds: number) => void;
  className?: string;
};

function drawWaveform(canvas: HTMLCanvasElement, peaks: number[], durationSeconds: number, currentTime: number) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.scale(ratio, ratio);

  context.fillStyle = "#0e1020";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "rgba(148, 163, 184, 0.18)";
  context.lineWidth = 1;
  for (let division = 0; division <= 4; division += 1) {
    const x = Math.round((width * division) / 4) + 0.5;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  context.beginPath();
  context.moveTo(0, Math.round(height / 2) + 0.5);
  context.lineTo(width, Math.round(height / 2) + 0.5);
  context.stroke();

  if (peaks.length) {
    const barWidth = Math.max(1, width / peaks.length - 1);
    const progress = durationSeconds > 0 ? Math.min(1, Math.max(0, currentTime / durationSeconds)) : 0;
    peaks.forEach((peak, index) => {
      const x = index * (width / peaks.length);
      const amplitude = Math.max(4, peak * (height * 0.72));
      context.fillStyle = index / peaks.length <= progress ? "#a78bfa" : "#475569";
      context.fillRect(x, (height - amplitude) / 2, barWidth, amplitude);
    });
  } else {
    context.fillStyle = "rgba(148, 163, 184, 0.44)";
    context.font = "12px sans-serif";
    context.textAlign = "center";
    context.fillText("Audio waveform will appear when the preview track is available.", width / 2, height / 2 + 4);
  }

  if (durationSeconds > 0) {
    const cursor = Math.min(width, Math.max(0, (currentTime / durationSeconds) * width));
    context.strokeStyle = "#f5f3ff";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(cursor, 0);
    context.lineTo(cursor, height);
    context.stroke();
  }
}

export function WaveformPreview({ audioUrl, durationSeconds, currentTime, markers, onSeek, className }: WaveformPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(audioUrl));
  const [loadError, setLoadError] = useState(false);
  const duration = Number(durationSeconds ?? 0);
  const activeMarker = useMemo(() => findActiveMarker(markers, currentTime), [currentTime, markers]);
  const ticks = useMemo(() => buildTimelineTicks(duration), [duration]);
  const markerLanes = useMemo(() => assignMarkerLanes(markers, duration), [duration, markers]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const render = () => drawWaveform(canvas, peaks, duration, currentTime);
    render();
    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [currentTime, duration, peaks]);

  useEffect(() => {
    if (!audioUrl) {
      setPeaks([]);
      setIsLoading(false);
      setLoadError(false);
      return;
    }
    let cancelled = false;
    let context: AudioContext | null = null;
    setIsLoading(true);
    setLoadError(false);
    void (async () => {
      try {
        const response = await fetch(audioUrl);
        if (!response.ok) throw new Error("The preview audio could not be loaded.");
        const encoded = await response.arrayBuffer();
        context = new AudioContext();
        const decoded = await context.decodeAudioData(encoded);
        const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) => decoded.getChannelData(index));
        if (!cancelled) setPeaks(sampleChannelPeaks(channels));
      } catch {
        if (!cancelled) {
          setPeaks([]);
          setLoadError(true);
        }
      } finally {
        await context?.close().catch(() => undefined);
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [audioUrl]);

  const seekFromClientX = useCallback((clientX: number) => {
    const bounds = timelineRef.current?.getBoundingClientRect();
    if (!bounds || duration <= 0) return;
    onSeek(getTimelineSeekSeconds(clientX, bounds.left, bounds.width, duration));
  }, [duration, onSeek]);

  return (
    <section className={cn("mt-5 w-full min-w-0 max-w-full rounded-2xl border border-border/70 bg-muted/20 p-4", className)} aria-label="Dialogue waveform preview">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AudioLines className="h-4 w-4 text-violet-300" />
          <h3 className="text-sm font-semibold">Dialogue waveform</h3>
          {isLoading ? <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Loading audio</span> : null}
        </div>
        <p className="text-xs text-muted-foreground">{activeMarker ? `Playing dialogue ${markers.findIndex(marker => marker.id === activeMarker.id) + 1}` : "Click waveform or a marker to seek"}</p>
      </div>
      <div
        ref={timelineRef}
        className="relative mt-3 w-full min-w-0 max-w-full cursor-pointer touch-manipulation overflow-hidden rounded-xl outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-violet-400"
        role="slider"
        tabIndex={0}
        aria-label="Video playback position"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, duration)}
        aria-valuenow={Math.max(0, Math.min(duration, currentTime))}
        aria-valuetext={`${formatWaveformTime(currentTime)} of ${formatWaveformTime(duration)}`}
        onClick={event => seekFromClientX(event.clientX)}
        onKeyDown={event => {
          const increment = event.shiftKey ? 10 : 5;
          if (event.key === "ArrowRight") { event.preventDefault(); onSeek(Math.min(duration, currentTime + increment)); }
          if (event.key === "ArrowLeft") { event.preventDefault(); onSeek(Math.max(0, currentTime - increment)); }
          if (event.key === "Home") { event.preventDefault(); onSeek(0); }
          if (event.key === "End") { event.preventDefault(); onSeek(duration); }
        }}
      >
        <canvas ref={canvasRef} className="block h-36 w-full" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-9 border-b border-violet-300/15 bg-slate-950/40" aria-hidden="true" />
        {markerLanes.map(({ marker, lane, left, width }, index) => {
          const isActive = activeMarker?.id === marker.id;
          return (
            <button
              key={marker.id}
              type="button"
              className={cn("absolute h-1.5 min-w-1 rounded-sm border border-violet-200/30 bg-violet-400/50 transition-colors hover:bg-violet-300/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white", isActive && "bg-fuchsia-300/90")}
              style={{ left: `${left}%`, top: `${4 + lane * 6}px`, width: `${width}%` }}
              title={`Dialogue ${index + 1}: ${formatWaveformTime(marker.startSeconds)}–${formatWaveformTime(marker.endSeconds)}${marker.detail ? ` — ${marker.detail}` : ""}`}
              aria-label={`Seek to dialogue ${index + 1}, ${formatWaveformTime(marker.startSeconds)} to ${formatWaveformTime(marker.endSeconds)}${marker.detail ? `: ${marker.detail}` : ""}`}
              onClick={event => { event.stopPropagation(); onSeek(marker.startSeconds); }}
            />
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[11px] tabular-nums text-muted-foreground" aria-hidden="true">
        {ticks.map(tick => <span key={tick}>{formatWaveformTime(tick)}</span>)}
      </div>
      {markers.length ? (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 md:hidden" aria-label="Dialogue marker touch controls">
          {markers.map((marker, index) => {
            const isActive = activeMarker?.id === marker.id;
            return (
              <button
                key={marker.id}
                type="button"
                className={cn("min-h-11 shrink-0 rounded-lg border border-violet-300/25 bg-slate-900/80 px-3 py-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300", isActive && "border-fuchsia-200 bg-fuchsia-400/20 text-fuchsia-100")}
                onClick={() => onSeek(marker.startSeconds)}
                aria-label={`Seek to dialogue ${index + 1} at ${formatWaveformTime(marker.startSeconds)}`}
              >
                <span className="block font-semibold">Dialogue {index + 1}</span>
                <span className="block text-[11px] text-muted-foreground">{formatWaveformTime(marker.startSeconds)}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      <p className="mt-3 text-xs text-muted-foreground">Violet bars mark timestamped dialogue. Use the left and right arrow keys to move the playhead by five seconds; hold Shift for ten seconds.</p>
      {loadError ? <p className="mt-2 text-xs text-amber-200">The visual waveform could not be decoded, but dialogue markers and seeking remain available.</p> : null}
    </section>
  );
}
