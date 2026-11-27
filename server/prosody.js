// 억양 악보(A): 사투리 대본의 글자마다 높낮이·강조·쉼을 AI가 추정해 줍니다.
// ⚠️ AI 추정값입니다. 실제 현지 억양과 다를 수 있어 화면에 "AI 추정"으로 표시합니다.
import { claudeJSON } from "./claude.js";
import { openaiJSON } from "./openai.js";
import { getGuides } from "./dialects.js";

export const PROSODY_SCHEMA = {
  type: "object",
  properties: {
    sentences: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          units: {
            type: "array",
            items: {
              type: "object",
              properties: {
                t: { type: "string" }, // 글자(한국어·중국어) 또는 단어(영어)
                pitch: { type: "string", enum: ["H", "M", "L"] }, // 높음·중간·낮음
                stress: { type: "boolean" }, // 힘주어 말할 곳
                pause_after: { type: "boolean" }, // 이 뒤에서 잠깐 쉬기
              },
              required: ["t", "pitch", "stress", "pause_after"],
              additionalProperties: false,
            },
          },
          ending: { type: "string", enum: ["rise", "fall", "level", "rise-fall"] }, // 문장 끝 흐름
          tip: { type: "string" }, // 이 문장 억양 요령 (한국어)
        },
        required: ["text", "units", "ending", "tip"],
        additionalProperties: false,
      },
    },
    notes: { type: "array", items: { type: "string" } },
  },
  required: ["sentences", "notes"],
  additionalProperties: false,
};

function buildProsodyPrompt(dialect) {
  // 규칙 파일에서 억양·발음 관련 부분만 골라 넣습니다 (짧고 정확하게).
  const rules = {
    name: dialect.name,
    code: dialect.code,
    intonation: dialect.intonation || dialect.tones_intonation || [],
    pronunciation: dialect.pronunciation || [],
    common_mistakes: dialect.common_mistakes || [],
  };
  return `You are a dialect intonation coach for actors. For the given dialect script, mark the pitch contour so an actor can see where the voice goes up and down.

Dialect: ${dialect.name} (${dialect.code})

## Output rules
- Split the script into sentences. For each sentence, list "units" in order:
  - Korean and Chinese: one unit per syllable/character (skip spaces; attach punctuation to the previous unit).
  - English: one unit per word.
- pitch: H (high), M (mid), L (low) — the relative pitch of that unit in THIS dialect's natural delivery, not standard speech.
- stress: true only for the 1-3 units per sentence that carry the main emphasis.
- pause_after: true where an actor should take a short breath/pause.
- ending: the sentence-final contour (rise, fall, level, rise-fall).
- tip: one short practical tip in Korean for this sentence.
- notes (Korean): ALWAYS include one note saying this is an AI estimate and must be checked against native speakers' recordings. If the rules below say nothing about this dialect's intonation, say so in notes.
- Base your marking on the rules below and on well-documented features (e.g. Gyeongsang word-level pitch accent, Gangwon Yeongdong pitch accent, Jeju has NO meaning-distinguishing pitch). Do not invent dramatic contours; when unsure, prefer M.

## Dialect rules (intonation / pronunciation)
${JSON.stringify(rules)}
${(() => {
  const g = getGuides(dialect.code);
  return g.length ? "\n## Verified guide from the user (highest priority)\n" + JSON.stringify(g.map((x) => x.region)) : "";
})()}`;
}

export async function prosodyFor(text, dialect, provider) {
  const system = buildProsodyPrompt(dialect);
  const user = "Mark the intonation of this script:\n\n" + text;
  const data =
    provider === "openai"
      ? await openaiJSON(system, user, PROSODY_SCHEMA, "prosody")
      : await claudeJSON(system, user, PROSODY_SCHEMA);

  // 화면이 쓰기 좋게 정리 (이상한 값은 걸러냄)
  const okPitch = (p) => (p === "H" || p === "L" ? p : "M");
  return {
    sentences: (Array.isArray(data?.sentences) ? data.sentences : []).map((s) => ({
      text: String(s?.text ?? ""),
      units: (Array.isArray(s?.units) ? s.units : []).map((u) => ({
        t: String(u?.t ?? ""),
        pitch: okPitch(u?.pitch),
        stress: Boolean(u?.stress),
        pause_after: Boolean(u?.pause_after),
      })),
      ending: ["rise", "fall", "level", "rise-fall"].includes(s?.ending) ? s.ending : "level",
      tip: String(s?.tip ?? ""),
    })),
    notes: (Array.isArray(data?.notes) ? data.notes : []).map(String),
  };
}
