// ChatGPT(OpenAI)를 불러 사투리 변환을 하는 모듈입니다.
// Claude용(claude.js)과 같은 프롬프트·같은 답변 모양을 써서, 화면은 어느 AI든 똑같이 동작합니다.
import OpenAI from "openai";
import { buildSystemPrompt, OUTPUT_SCHEMA, UserError, normalizeConversion } from "./claude.js";

// 쓸 모델 이름. 내 계정에서 쓸 수 있는 모델로 .env의 OPENAI_MODEL을 바꿀 수 있습니다.
export const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o";

// 키는 환경변수 OPENAI_API_KEY 에서 자동으로 읽습니다.
let client = null;
function getClient() {
  if (!client) client = new OpenAI();
  return client;
}

// 시스템 지시 + 사용자 글 + JSON 모양을 받아 AI 답(JSON 객체)을 돌려주는 공통 함수
export async function openaiJSON(systemText, userText, schema, schemaName = "result") {
  let response;
  try {
    response = await getClient().chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: systemText },
        { role: "user", content: userText },
      ],
      // 정해진 JSON 모양으로만 답하게 강제합니다.
      response_format: {
        type: "json_schema",
        json_schema: { name: schemaName, strict: true, schema },
      },
    });
  } catch (err) {
    // 콘솔엔 종류만, 화면엔 쉬운 한국어 안내 (키·내용은 남기지 않음)
    console.error("[OpenAI 호출 실패]", err?.name, err?.status);
    if (err instanceof OpenAI.AuthenticationError || err instanceof OpenAI.PermissionDeniedError) {
      throw new UserError(502, "ChatGPT API 키가 올바르지 않거나 권한이 없습니다. .env 파일의 OPENAI_API_KEY를 확인해 주세요.");
    }
    if (err instanceof OpenAI.RateLimitError) {
      throw new UserError(502, "요청이 너무 많거나 잔액(크레딧)이 부족합니다. platform.openai.com의 Billing을 확인해 주세요.");
    }
    if (err instanceof OpenAI.NotFoundError) {
      throw new UserError(502, `모델 "${OPENAI_MODEL}"을(를) 쓸 수 없습니다. .env 파일의 OPENAI_MODEL을 내 계정에서 쓸 수 있는 모델로 바꿔 주세요.`);
    }
    if (err instanceof OpenAI.BadRequestError) {
      throw new UserError(502, "ChatGPT가 요청을 거절했습니다. 모델 이름이나 계정 설정을 확인해 주세요.");
    }
    if (err instanceof OpenAI.APIConnectionError) {
      throw new UserError(502, "ChatGPT 서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.");
    }
    throw new UserError(502, "AI 호출 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.");
  }

  const choice = response.choices?.[0];
  if (choice?.message?.refusal) {
    throw new UserError(502, "AI가 이 내용의 변환을 거절했습니다. 다른 표현으로 바꿔서 다시 시도해 주세요.");
  }
  if (choice?.finish_reason === "length") {
    throw new UserError(502, "독백이 너무 길어 AI 답변이 중간에 끊겼습니다. 글을 나눠서 시도해 주세요.");
  }

  let data;
  try {
    data = JSON.parse(choice?.message?.content ?? "");
  } catch {
    throw new UserError(502, "AI 답변을 읽지 못했습니다. 다시 한 번 시도해 주세요.");
  }
  return data;
}

// 사투리 변환 (ChatGPT)
export async function openaiConvert(text, dialect) {
  const data = await openaiJSON(buildSystemPrompt(dialect), "Convert this monologue:\n\n" + text, OUTPUT_SCHEMA, "dialect_conversion");
  return normalizeConversion(data);
}

// ── AI 음성(TTS) ───────────────────────────────────────────
// OpenAI 음성 모델에 "이 지역 억양으로 읽어 줘"라고 지시해서 mp3를 받아옵니다.
// 주의: AI가 흉내 낸 억양이라 실제 현지 말투와 다를 수 있습니다.
export const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
export const OPENAI_TTS_VOICE = process.env.OPENAI_TTS_VOICE || "coral";

const LANG_NAME = { ko: "Korean", en: "English", zh: "Chinese" };

function buildVoiceInstructions(dialect, tips) {
  const lang = LANG_NAME[dialect.language] || "the target language";
  const lines = [
    `You are a native speaker from this region: ${dialect.name} (${dialect.code}).`,
    `Read the text in ${lang} with the authentic regional accent, pitch pattern, rhythm and sentence-final intonation of this dialect — NOT standard ${lang}.`,
    "Deliver it like an actor in a natural, conversational scene. Do not exaggerate or caricature the dialect.",
  ];
  if (dialect.code === "zh-yue") lines.push("Speak in Cantonese (not Mandarin).");
  const t = (Array.isArray(tips) ? tips : []).map(String).slice(0, 6);
  if (t.length) lines.push("Delivery notes (written in Korean for the actor):\n- " + t.join("\n- "));
  return lines.join("\n");
}

export async function openaiSpeech(text, dialect, tips) {
  try {
    const res = await getClient().audio.speech.create({
      model: OPENAI_TTS_MODEL,
      voice: OPENAI_TTS_VOICE,
      input: text,
      instructions: buildVoiceInstructions(dialect, tips),
      response_format: "mp3",
    });
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    console.error("[OpenAI 음성 실패]", err?.name, err?.status);
    if (err instanceof OpenAI.AuthenticationError || err instanceof OpenAI.PermissionDeniedError) {
      throw new UserError(502, "ChatGPT API 키가 올바르지 않거나 음성 기능 권한이 없습니다.");
    }
    if (err instanceof OpenAI.RateLimitError) {
      throw new UserError(502, "요청이 너무 많거나 잔액(크레딧)이 부족합니다. 잠시 후 다시 시도해 주세요.");
    }
    if (err instanceof OpenAI.NotFoundError || err instanceof OpenAI.BadRequestError) {
      throw new UserError(502, `음성 모델 "${OPENAI_TTS_MODEL}"을(를) 쓸 수 없습니다. OPENAI_TTS_MODEL 설정을 확인해 주세요.`);
    }
    throw new UserError(502, "AI 음성을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
}
