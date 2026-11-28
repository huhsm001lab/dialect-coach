// Claude(AI)를 불러 실제 사투리 변환을 하는 모듈입니다.
import Anthropic from "@anthropic-ai/sdk";
import { getGuides } from "./dialects.js";

export const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

// 서버 코드에서 던질 때 쓰는 "사용자에게 그대로 보여줄 수 있는" 오류
export class UserError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// AI가 돌려줄 JSON의 모양(스키마). 이 모양대로만 답하도록 강제합니다.
export const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    converted: { type: "string" },
    changes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          from: { type: "string" },
          to: { type: "string" },
          rule: { type: "string" },
        },
        required: ["from", "to", "rule"],
        additionalProperties: false,
      },
    },
    intonation_tips: { type: "array", items: { type: "string" } },
    pronunciation_tips: { type: "array", items: { type: "string" } },
    notes: { type: "array", items: { type: "string" } },
  },
  required: ["converted", "changes", "intonation_tips", "pronunciation_tips", "notes"],
  additionalProperties: false,
};

// 시스템 프롬프트: 같은 사투리면 내용이 항상 똑같아야 캐시(비용 절감)가 잘 먹힙니다.
// 한국어 지역은 "사투리로 바꾸기", 영어·중국어 지역은 "현지 회화체로 번역하기"입니다.
function taskSection(dialect) {
  if (dialect.language === "ko") {
    return `You are a dialect coach helping an actor rehearse. You convert a standard-language monologue into the regional dialect "${dialect.name}" (code: ${dialect.code}).

## Task
- Keep the meaning, emotion, line breaks, and stage directions (text in parentheses or brackets) exactly as they are. Change ONLY the speech style (endings, vocabulary, grammar, particles).`;
  }
  const target = dialect.language === "en" ? "English" : "Chinese";
  return `You are a dialogue translator and dialect coach for actors. The input monologue is usually written in Korean (it may also already be in ${target}). TRANSLATE it into natural, spoken ${target} as a native speaker of "${dialect.name}" (code: ${dialect.code}) would actually say it.

## Task
- This is translation, not word substitution. Write it like real-life conversation or a line from a film or TV drama: natural spoken rhythm, contractions, everyday idioms, sentence-final particles where natives use them. Never produce stiff, literal, textbook or written-style sentences.
- Keep the meaning, emotion, relationship between speakers, and intent of every line. Adapt Korean-specific expressions to what a native would naturally say in the same situation (cultural equivalent), not a literal rendering.
- Keep the line breaks. Translate stage directions (text in parentheses or brackets) into Korean-readable form: keep them in Korean inside the same brackets.
- Use the regional variety's grammar and vocabulary where a native would naturally use them — authentic but not a caricature, not overloaded with slang.
- "converted" = the translated script only.
- "changes" = the regional/colloquial expressions you chose: from = the neutral/standard ${target} way to say it, to = the regional expression used in the script, rule = Korean explanation (meaning + why it fits this region).
- In "notes" (Korean), add the meaning of any tricky line so the actor understands what they are saying.
- LANGUAGE OF EXPLANATIONS: every "rule", every "notes" item and every tip MUST be written in KOREAN (한국어), even though the script itself is in ${target}. Only quoted ${target} words may appear inside them.`;
}

export function buildSystemPrompt(dialect) {
  return `${taskSection(dialect)}
- Write all explanations (rule, notes, tips) in Korean, so a Korean-speaking actor can read them. Dialect words themselves stay in the target dialect.
- Return ONLY the JSON that matches the required schema.

## How to use the rule file below
- Prefer rule items that have source_ids (they are backed by sources).
- Do not overload the text with rare vocabulary; a natural line beats a dense one.
- Follow "conversion_guidelines" and avoid everything listed in "common_mistakes".
- "examples" are verified model conversions for this region: imitate their endings, rhythm and register. Items marked "constructed": true were built from rules, so they are slightly less certain than sourced ones.
- "sub_regions" describe differences inside the region: unless the actor's text says otherwise, use the main/central variety described first, and do not mix sub-regional forms in one script.
- If items carry a "variety" field (e.g. North Korean: 평양 문화어 / 평안 / 함경), use the one marked "actor_default" unless told otherwise. If the file has "registers" (e.g. Jeju mild vs heavy), default to the mild, actor-usable register.
- Never use anything listed in "open_questions" as if it were confirmed.
- Each entry in "changes" must have: from, to, rule (Korean explanation of which rule motivated the change). "to" must appear verbatim in "converted".
- "intonation_tips" and "pronunciation_tips": short, practical Korean tips an actor can apply when speaking this specific text.
- If the rule file's confidence is "low" or the file is thin for the needed expression, you may use your general knowledge, but you MUST add an entry to "notes" listing which changes are NOT backed by the rule file, and say they should be verified with a native speaker.
- Always add one note reminding that the result is a practice aid and should be checked with a native speaker.

## Language-specific rules
- Korean (ko): convert endings and vocabulary according to "endings" and "vocabulary".
- English (en): use normal spelling (no eye-dialect respelling). Put accent guidance (vowels, consonants, rhythm) into "pronunciation_tips".
- Chinese (zh): use "grammar", "particles", "vocabulary". For Cantonese (zh-yue) write spoken Cantonese (口語, e.g. 佢、唔、咗、嘅) in Traditional characters, not formal written Chinese. For Taiwanese Mandarin (zh-tw) use Traditional characters. Do not put pinyin/jyutping inside the script; put pronunciation help into "pronunciation_tips".

## Dialect rule file (JSON)
${JSON.stringify(dialect)}${buildGuideSection(dialect.code)}`;
}

// 사용자가 검증한 보고서가 있으면 "가장 우선하는 기준"으로 프롬프트에 붙입니다.
function buildGuideSection(code) {
  const guides = getGuides(code);
  if (guides.length === 0) return "";
  return `

## Verified guide from the user (HIGHEST PRIORITY)
This guide was fact-checked by the user. When it conflicts with the rule file above, follow this guide.
- "use": expressions confirmed as authentic for this region — prefer these.
- "avoid": things that are wrong, exaggerated, or unverified — do NOT use them (if you still need one, mention it in "notes" as unverified).
- "general.principles": apply to every conversion. "general.acting_tips": you may reflect them in intonation_tips.
${JSON.stringify(guides)}`;
}

// 클라이언트는 필요할 때 한 번만 만듭니다 (키는 환경변수 ANTHROPIC_API_KEY에서 자동으로 읽음).
let client = null;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

// 시스템 지시 + 사용자 글 + JSON 모양을 받아 AI 답(JSON 객체)을 돌려주는 공통 함수
export async function claudeJSON(systemText, userText, schema, maxTokens = 8000) {
  let response;
  try {
    response = await getClient().messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      // 규칙이 담긴 긴 시스템 프롬프트를 캐시해 두면 같은 사투리를 다시 쓸 때 빠르고 쌉니다.
      system: [
        { type: "text", text: systemText, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: userText }],
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema },
      },
    });
  } catch (err) {
    // 서버 콘솔에는 종류만 남기고(키/내용 노출 방지), 화면에는 쉬운 한국어 안내를 돌려줍니다.
    console.error("[Claude 호출 실패]", err?.name, err?.status);
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      throw new UserError(502, "API 키가 올바르지 않거나 권한이 없습니다. .env 파일의 ANTHROPIC_API_KEY를 확인해 주세요.");
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new UserError(502, "요청이 너무 많거나 사용 한도를 넘었습니다. 잠시 후 다시 시도해 주세요.");
    }
    if (err instanceof Anthropic.NotFoundError) {
      throw new UserError(502, "AI 모델 이름을 찾을 수 없습니다. .env 파일의 CLAUDE_MODEL 값을 확인해 주세요.");
    }
    if (err instanceof Anthropic.BadRequestError) {
      throw new UserError(502, "AI에게 보낸 요청이 거절되었습니다. 크레딧(잔액)이나 모델 설정을 확인해 주세요.");
    }
    if (err instanceof Anthropic.APIConnectionError) {
      throw new UserError(502, "AI 서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.");
    }
    throw new UserError(502, "AI 호출 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.");
  }

  if (response.stop_reason === "refusal") {
    throw new UserError(502, "AI가 이 내용의 변환을 거절했습니다. 다른 표현으로 바꿔서 다시 시도해 주세요.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new UserError(502, "독백이 너무 길어 AI 답변이 중간에 끊겼습니다. 글을 나눠서 시도해 주세요.");
  }

  // 응답에서 텍스트 블록만 모아 JSON으로 읽습니다. (구조화 출력이라 보통 바로 파싱됨)
  const raw = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new UserError(502, "AI 답변을 읽지 못했습니다. 다시 한 번 시도해 주세요.");
  }
  return data;
}

// 사투리 변환 (Claude)
export async function claudeConvert(text, dialect) {
  const data = await claudeJSON(buildSystemPrompt(dialect), "Convert this monologue:\n\n" + text, OUTPUT_SCHEMA);
  return normalizeConversion(data);
}

// AI 답을 화면이 쓰는 모양으로 정리 (Claude·ChatGPT 공통)
export function normalizeConversion(data) {
  if (!data || typeof data.converted !== "string") {
    throw new UserError(502, "AI 답변 형식이 올바르지 않습니다. 다시 한 번 시도해 주세요.");
  }
  const arr = (x) => (Array.isArray(x) ? x.map(String) : []);
  return {
    converted: data.converted,
    changes: Array.isArray(data.changes)
      ? data.changes.map((c) => ({ from: String(c?.from ?? ""), to: String(c?.to ?? ""), rule: String(c?.rule ?? "") }))
      : [],
    tips: { intonation: arr(data.intonation_tips), pronunciation: arr(data.pronunciation_tips) },
    notes: arr(data.notes),
  };
}
