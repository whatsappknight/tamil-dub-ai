import { describe, expect, it } from "vitest";
import { assignMarkerLanes, buildTimelineTicks, findActiveMarker, getMarkerPositionPercent, getTimelineSeekSeconds, sampleChannelPeaks, type DialogueMarker } from "../client/src/lib/waveform";

const markers: DialogueMarker[] = [
  { id: 1, startSeconds: 10, endSeconds: 18, label: "Dialogue 1" },
  { id: 2, startSeconds: 31, endSeconds: 39, label: "Dialogue 2" },
];

describe("waveform timeline utilities", () => {
  it("converts pointer positions to bounded playback times", () => {
    expect(getTimelineSeekSeconds(150, 100, 200, 120)).toBe(30);
    expect(getTimelineSeekSeconds(0, 100, 200, 120)).toBe(0);
    expect(getTimelineSeekSeconds(500, 100, 200, 120)).toBe(120);
  });

  it("finds active dialogue markers and positions them in the timeline", () => {
    expect(findActiveMarker(markers, 14)?.id).toBe(1);
    expect(findActiveMarker(markers, 25)).toBeNull();
    expect(getMarkerPositionPercent(markers[1]!, 80)).toEqual({ left: 38.75, width: 10 });
  });

  it("assigns visually overlapping marker ranges to separate interaction lanes", () => {
    const denseMarkers: DialogueMarker[] = [
      { id: "a", startSeconds: 0, endSeconds: 1, label: "A" },
      { id: "b", startSeconds: 0.5, endSeconds: 1.5, label: "B" },
      { id: "c", startSeconds: 1, endSeconds: 2, label: "C" },
    ];
    expect(assignMarkerLanes(denseMarkers, 100).map(item => item.lane)).toEqual([0, 1, 2]);
  });

  it("creates a safe set of timeline ticks and bounded waveform peaks", () => {
    expect(buildTimelineTicks(120)).toEqual([0, 60, 120]);
    const peaks = sampleChannelPeaks([new Float32Array([0, -0.4, 0.2, 0.8]), new Float32Array([0.1, 0.3, -0.6, 0.2])], 16);
    expect(peaks).toHaveLength(4);
    expect(Math.max(...peaks)).toBeCloseTo(0.8);
  });
});
