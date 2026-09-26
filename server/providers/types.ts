import type { LocalizationRule } from "../services/localization";

export type TimestampedSegment = {
  startSeconds: number;
  endSeconds: number;
  text: string;
  speaker?: string | null;
};

export type TranslationSegment = {
  segmentId: number;
  tamilText: string;
};

export interface SpeechToTextProvider {
  transcribe(input: {
    audioUrl: string;
    languageHint?: string;
    offsetSeconds?: number;
  }): Promise<{ detectedLanguage: string; segments: TimestampedSegment[] }>;
}

export interface TranslationProvider {
  translateToTamil(input: {
    segments: Array<{ segmentId: number; sourceText: string; targetDurationSeconds: number }>;
    paragraphContext?: string;
    terminologyRules?: LocalizationRule[];
  }): Promise<TranslationSegment[]>;
}

export interface TamilTtsProvider {
  synthesize(input: {
    text: string;
    voice: string;
    style: string;
    speed: number;
  }): Promise<{ audio: Buffer; contentType: string; extension: "mp3" | "wav" | "m4a" }>;
}
