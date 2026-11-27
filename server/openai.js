// ChatGPT(OpenAI)를 불러 사투리 변환을 하는 모듈입니다.
// Claude용(claude.js)과 같은 프롬프트·같은 답변 모양을 써서, 화면은 어느 AI든 똑같이 동작합니다.
import OpenAI from "openai";
import { buildSystemPrompt, OUTPUT_SCHEMA, UserError } from "./claude.js";

// 쓸 모델 이름. 내 계정에서 쓸 수 있는 모델로 .env의 OPENAI_MODEL을 바꿀 수 있습니다.
export const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o";

// 키는 환경변수 OPENAI_API_KEY 에서 자동으로 읽습니다.
let client = null;
function getClient() {
  if (!client) client = new OpenAI();
  return client;
}

export async function openaiConvert(text, dialect) {
  let response;
  try {
    response = await getClient().chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: buildSystemPrompt(dialect) },
        { role: "user", content: "Convert this monologue:\n\n" + text },
      ],
      // 정해진 JSON 모양으로만 답하게 강제합니다.
      response_format: {
        type: "json_schema",
        json_schema: { name: "dialect_conversion", strict: true, schema: OUTPUT_SCHEMA },
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
