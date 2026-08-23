export type DialogueMarker = {
  id: number | string;
  startSeconds: number;
  endSeconds: number;
  label: string;
  detail?: string | null;
};

export function clampTimelineTime(timeSeconds: number, durationSeconds: number) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  return Math.min(Math.max(0, Number.isFinite(timeSeconds) ? timeSeconds : 0), durationSeconds);
}

export function getTimelineSeekSeconds(clientX: number, left: number, width: number, durationSeconds: number) {
  if (!Number.isFinite(width) || width <= 0) return 0;
  return clampTimelineTime(((clientX - left) / width) * durationSeconds, durationSeconds);
}

export function getMarkerPositionPercent(marker: Pick<DialogueMarker, "startSeconds" | "endSeconds">, durationSeconds: number, minimumWidthPercent = 0.5) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return { left: 0, width: 0 };
  const start = clampTimelineTime(marker.startSeconds, durationSeconds);
  const end = clampTimelineTime(marker.endSeconds, durationSeconds);
  return {
    left: (Math.min(start, end) / durationSeconds) * 100,
    width: Math.max(minimumWidthPercent, ((Math.max(start, end) - Math.min(start, end)) / durationSeconds) * 100),
  };
}

export function assignMarkerLanes(markers: DialogueMarker[], durationSeconds: number, laneCount = 5) {
  const availableLanes = Math.max(1, laneCount);
  const laneEnds = Array.from({ length: availableLanes }, () => -Infinity);
  const byMarkerId = new Map<number | string, { lane: number; left: number; width: number }>();
  const sorted = [...markers].sort((first, second) => first.startSeconds - second.startSeconds);

  for (const marker of sorted) {
    const position = getMarkerPositionPercent(marker, durationSeconds, 1.2);
    const markerEnd = position.left + position.width;
    let lane = laneEnds.findIndex(laneEnd => laneEnd <= position.left);
    if (lane < 0) lane = laneEnds.reduce((bestLane, laneEnd, index) => laneEnd < laneEnds[bestLane]! ? index : bestLane, 0);
    laneEnds[lane] = Math.max(laneEnds[lane]!, markerEnd);
    byMarkerId.set(marker.id, { lane, ...position });
  }

  return markers.map(marker => ({ marker, ...(byMarkerId.get(marker.id) ?? { lane: 0, left: 0, width: 0 }) }));
}

export function findActiveMarker(markers: DialogueMarker[], currentTime: number) {
  return markers.find(marker => currentTime >= marker.startSeconds && currentTime <= marker.endSeconds) ?? null;
}

export function buildTimelineTicks(durationSeconds: number, maxTicks = 6) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return [0];
  const count = Math.max(2, Math.min(maxTicks, Math.ceil(durationSeconds / 90) + 1));
  return Array.from({ length: count }, (_, index) => (durationSeconds * index) / (count - 1));
}

export function sampleChannelPeaks(channels: Float32Array[], bucketCount = 240) {
  const length = Math.max(0, ...channels.map(channel => channel.length));
  if (!length || !channels.length) return [];
  const buckets = Math.min(length, Math.max(16, Math.min(bucketCount, length)));
  const framesPerBucket = Math.ceil(length / buckets);

  return Array.from({ length: buckets }, (_, bucketIndex) => {
    const start = bucketIndex * framesPerBucket;
    const end = Math.min(length, start + framesPerBucket);
    const stride = Math.max(1, Math.floor((end - start) / 96));
    let peak = 0;
    for (const channel of channels) {
      for (let frame = start; frame < Math.min(end, channel.length); frame += stride) {
        peak = Math.max(peak, Math.abs(channel[frame] ?? 0));
      }
    }
    return Math.min(1, peak);
  });
}

export function formatWaveformTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}
