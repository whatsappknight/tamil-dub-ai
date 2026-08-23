export type LocalizationRule = { source: string; target: string };
export type SubtitleStyle = "minimal" | "studio" | "high_contrast";

export function parseLocalizationRules(value?: string | null): LocalizationRule[] {
  if (!value?.trim()) return [];
  return value.split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(0, 80).flatMap(line => {
    const separator = line.includes("=>") ? "=>" : line.includes("=") ? "=" : null;
    if (!separator) return [];
    const [source, ...targets] = line.split(separator);
    const target = targets.join(separator).trim();
    return source?.trim() && target ? [{ source: source.trim(), target }] : [];
  });
}

export function applyPronunciationRules(text: string, rules?: string | null, segmentHint?: string | null) {
  let result = text;
  for (const rule of parseLocalizationRules(rules)) result = result.split(rule.source).join(rule.target);
  return segmentHint?.trim() ? `${result} <break time="120ms"/> ${segmentHint.trim()}` : result;
}

export function subtitleForceStyle(style: SubtitleStyle) {
  if (style === "minimal") return "FontName=Noto Sans Tamil,FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H90000000,BorderStyle=1,Outline=1.2,Shadow=0,MarginV=28,Alignment=2";
  if (style === "high_contrast") return "FontName=Noto Sans Tamil,FontSize=21,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Shadow=0,MarginV=36,Alignment=2";
  return "FontName=Noto Sans Tamil,FontSize=20,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H78000000,BorderStyle=1,Outline=2,Shadow=0,MarginV=34,Alignment=2";
}

export function buildBurnedSubtitleFilter(srtPath: string, style: SubtitleStyle) {
  return `subtitles=${srtPath.replaceAll("\\", "\\\\").replaceAll(":", "\\:")}:force_style='${subtitleForceStyle(style)}'`;
}
