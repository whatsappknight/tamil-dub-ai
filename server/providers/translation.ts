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
        { role: "system", content: "You are an expert Tamil audiovisual localizer and dialogue writer. Translate the supplied dialogue as one coherent paragraph or conversation, then distribute the meaning back into the timestamped segments. Use idiomatic, natural spoken Tamil for Tamil-speaking viewers. When the source is casual, prefer everyday colloquial Tamil and natural Tamil-English code-switching; avoid stiff literary Tamil, word-for-word translation, and newsreader phrasing. Preserve meaning, speaker intent, emotion, technical terms, segment order, and conversational continuity. The available timing is intentional: keep the dialogue flowing continuously across gaps up to about two seconds. If a segment is too short for its available time, add only a brief semantically faithful connective or conversational phrase such as சரி, அதனால், இப்போ, பாருங்க, or இல்லையா, so it can be spoken at normal human speed; never invent facts, repeat the main idea, or alter the meaning. Every returned segment should contain speakable Tamil, not an empty filler or a one-word line. Never add commentary or omit a segment." },
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
    return parsed.segments.map(segment => { const source = input.segments.find(item => item.segmentId === Number(segment.segmentId)); const tamilText = String(segment.tamilText).trim(); const duration = source?.targetDurationSeconds ?? 0; const deficit = Math.max(0, Math.ceil((duration * 32 - tamilText.length) / 32)); const fillers = ["சரி, தொடர்ந்து பார்ப்போம்", "இதை இன்னும் கொஞ்சம் தெளிவாக புரிந்துகொள்வோம்", "அடுத்து முக்கியமான விஷயத்தை பார்க்கலாம்", "இவ்வாறு இந்த உரையாடல் தொடர்ந்து செல்கிறது"]; const padding = Array.from({ length: Math.min(deficit, fillers.length) }, (_, index) => fillers[index]).join(". "); return { segmentId: Number(segment.segmentId), tamilText: padding && duration >= 2.5 ? `${tamilText}${tamilText.endsWith(".") ? "" : "."} ${padding}.` : tamilText }; });
  }
}

export const tamilTranslationProvider = new BuiltInTamilTranslationProvider();
