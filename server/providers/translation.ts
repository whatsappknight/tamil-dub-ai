import { invokeLLM } from "../_core/llm";
import type { TranslationProvider } from "./types";

type TranslationResponse = { segments: Array<{ segmentId: number; tamilText: string }> };

function responseContentToString(content: unknown) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(item => typeof item === "string" ? item : item && typeof item === "object" && "text" in item ? String(item.text) : "").join("");
  return String(content ?? "");
}

export class BuiltInTamilTranslationProvider implements TranslationProvider {
  async translateToTamil(input: { segments: Array<{ segmentId: number; sourceText: string; targetDurationSeconds: number }>; paragraphContext?: string; terminologyRules?: Array<{ source: string; target: string }> }) {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are an expert Tamil audiovisual localizer and dialogue writer. Translate the supplied dialogue as one coherent paragraph or conversation, then distribute the meaning back into the timestamped segments. Use idiomatic, natural spoken Tamil for Tamil-speaking viewers. When the source is casual, prefer everyday colloquial Tamil and natural Tamil-English code-switching; avoid stiff literary Tamil, word-for-word translation, and newsreader phrasing. Preserve meaning, speaker intent, emotion, technical terms, segment order, and conversational continuity. Use the available timing naturally: when a segment would otherwise be unnaturally short, you may add a brief semantically faithful connective or conversational phrase such as சரி, அதனால், இப்போ, பாருங்க, or இல்லையா, but never invent facts, repeat content, or alter the meaning. Keep each returned segment easy to speak at normal human speed and concise enough for its timing. Never add commentary or omit a segment." },
        { role: "user", content: JSON.stringify({ targetLanguage: "Tamil", terminologyRules: input.terminologyRules || [], paragraphContext: input.paragraphContext || input.segments.map(segment => segment.sourceText).join(" "), segments: input.segments }) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "tamil_dubbing_translation",
          strict: true,
          schema: {
            type: "object",
            properties: { segments: { type: "array", items: { type: "object", properties: { segmentId: { type: "integer" }, tamilText: { type: "string" } }, required: ["segmentId", "tamilText"], additionalProperties: false } } },
            required: ["segments"],
            additionalProperties: false,
          },
        },
      },
    });
    const raw = responseContentToString(response.choices?.[0]?.message?.content);
    let parsed: TranslationResponse;
    try { parsed = JSON.parse(raw) as TranslationResponse; } catch { throw new Error("Translation provider returned an unreadable structured response."); }
    if (!Array.isArray(parsed.segments) || parsed.segments.length !== input.segments.length) throw new Error("Translation provider returned an incomplete segment set.");
    return parsed.segments.map(segment => ({ segmentId: Number(segment.segmentId), tamilText: String(segment.tamilText).trim() }));
  }
}

export const tamilTranslationProvider = new BuiltInTamilTranslationProvider();
