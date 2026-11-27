// 대본 흐름 분석(v3): 대본·희곡 전체를 읽고 장면·인물·감정 흐름·내 배역의 여정을 정리합니다.
// 대본은 서버에 저장하지 않고, 분석에만 쓰고 버립니다.
import { claudeJSON } from "./claude.js";
import { openaiJSON } from "./openai.js";

const str = { type: "string" };
const strArr = { type: "array", items: str };
const obj = (properties) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

// AI가 돌려줄 분석 결과의 모양
export const ANALYSIS_SCHEMA = obj({
  title_guess: str, // 작품 제목(대본에 있으면), 없으면 빈 문자열
  logline: str, // 한 줄 요약
  genre_tone: str, // 장르와 분위기
  themes: strArr, // 주제
  structure: str, // 전체 구조 설명 (발단-전개-위기-절정-결말 등)
  scenes: {
    type: "array",
    items: obj({
      no: { type: "integer" },
      title: str, // 장면 이름 (짧게)
      place_time: str, // 장소·시간
      characters: strArr, // 등장인물
      summary: str, // 무슨 일이 일어나는지
      tension: { type: "integer" }, // 긴장도 0~10
      emotion: str, // 장면의 주된 감정 (한 단어~짧은 구)
      turning_point: { type: "boolean" }, // 흐름이 바뀌는 지점인지
      start_quote: str, // 이 장면이 시작되는 대사/지문 앞부분 (원문 그대로, 20자 이내)
    }),
  },
  characters: {
    type: "array",
    items: obj({
      name: str,
      description: str, // 어떤 사람인지
      want: str, // 원하는 것 (목표)
      obstacle: str, // 가로막는 것
      arc: str, // 처음 → 끝 어떻게 변하는지
    }),
  },
  relationships: {
    type: "array",
    items: obj({ a: str, b: str, relation: str, change: str }),
  },
  focus: obj({
    character: str, // 분석한 배역 이름 (요청이 없으면 주인공)
    super_objective: str, // 작품 전체를 꿰는 최종 목표
    beats: {
      type: "array",
      items: obj({
        scene_no: { type: "integer" },
        objective: str, // 이 장면에서 원하는 것
        action_verb: str, // 행동동사 (예: 달래다, 떠보다, 몰아붙이다)
        emotion: str,
        subtext: str, // 대사 밑에 깔린 속마음
      }),
    },
    acting_tips: strArr,
  }),
  notes: strArr,
});

function buildAnalysisPrompt(role) {
  return `You are a dramaturg and acting coach analysing a script (screenplay, stage play, or monologue) for an actor.

## What to produce (match the JSON schema)
- Write EVERYTHING in Korean (한국어), except quoted original lines and character names (keep them as written).
- Base every point on the script text. Do NOT invent events, backstory, or facts that are not in the script; if something is unclear, say "대본에 나오지 않음" or put an interpretation clearly marked as "해석:".
- scenes: split the script into scenes/beats in order (by scene headings, location/time changes, or major shifts). For a short monologue, split it into its emotional beats instead. tension is an integer 0-10 (0 = calm, 10 = peak). Mark turning_point = true only for real turning points (usually 1-4). start_quote = the first words of that scene copied exactly from the script (max 20 characters).
- characters: main characters only (up to 8), with want / obstacle / arc.
- relationships: important pairs only, and how the relationship changes.
- focus: ${role ? `analyse the character "${role}" (the actor's own role).` : "analyse the protagonist (the actor did not name a role)."} super_objective = what they want across the whole piece. beats = one entry per scene where this character appears, with an action verb an actor can play (transitive, playable: 달래다, 떠보다, 몰아붙이다, 감추다…), not a feeling. subtext = what they really mean under the lines.
- acting_tips: 3-6 practical tips for playing this role, grounded in specific moments of the script.
- notes: limitations of the analysis (e.g. script excerpt only, ambiguous parts).
- Keep each text field concise (1-3 sentences).`;
}

export async function analyzeScript(text, role, provider) {
  const system = buildAnalysisPrompt(role);
  const user = "Analyse this script:\n\n" + text;
  const data =
    provider === "openai"
      ? await openaiJSON(system, user, ANALYSIS_SCHEMA, "script_analysis")
      : await claudeJSON(system, user, ANALYSIS_SCHEMA, 16000);

  // 이상한 값 정리 (긴장도는 0~10 사이로)
  const clamp = (n) => Math.max(0, Math.min(10, Math.round(Number(n) || 0)));
  if (Array.isArray(data?.scenes)) {
    data.scenes = data.scenes.map((s, i) => ({ ...s, no: Number(s.no) || i + 1, tension: clamp(s.tension) }));
  }
  return data;
}
