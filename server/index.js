// 사투리 코치 서버: 웹 화면(web/)을 보여주고, /api/* 요청을 처리합니다.
import "dotenv/config"; // .env 파일의 값을 읽어 process.env 에 넣습니다 (가장 먼저!)
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDialects, getDialect, listDialects } from "./dialects.js";
import { demoConvert } from "./demo.js";
import { claudeConvert, MODEL, UserError } from "./claude.js";
import { openaiConvert, OPENAI_MODEL } from "./openai.js";

const PORT = Number(process.env.PORT) || 3000;
const MAX_CHARS = 3000;
const here = path.dirname(fileURLToPath(import.meta.url));

// 어떤 AI를 쓸지 정합니다. (키가 비어 있거나 공백이면 "없음")
// 1) .env에 AI_PROVIDER=openai 또는 claude 라고 적으면 그걸 씁니다.
// 2) 안 적었으면 Claude 키 → ChatGPT 키 순서로, 있는 쪽을 씁니다.
// 3) 둘 다 없으면 데모 모드.
const filled = (v) => Boolean((v || "").trim());
function provider() {
  const want = (process.env.AI_PROVIDER || "").trim().toLowerCase();
  const claudeOk = filled(process.env.ANTHROPIC_API_KEY);
  const openaiOk = filled(process.env.OPENAI_API_KEY);
  if (want === "openai" && openaiOk) return "openai";
  if (want === "claude" && claudeOk) return "claude";
  if (claudeOk) return "claude";
  if (openaiOk) return "openai";
  return null;
}
const hasKey = () => provider() !== null;

// ── 사용량 제한 ─────────────────────────────────────────────
// 한 사람(IP)당 1시간에 RATE_PER_HOUR번, 서버 전체로 하루 DAILY_LIMIT번까지만 AI를 부릅니다.
// 숫자는 .env(또는 Vercel 환경변수)에서 바꿀 수 있습니다.
// 주의: Vercel에서는 서버가 여러 개로 나뉘어 켜질 수 있어 "대략적인" 제한입니다.
//       확실한 상한은 OpenAI/Anthropic 사이트에서 월 사용 한도(Usage limit)를 꼭 걸어 두세요.
const RATE_PER_HOUR = Number(process.env.RATE_PER_HOUR) || 10;
const DAILY_LIMIT = Number(process.env.DAILY_LIMIT) || 100;
const hits = new Map(); // ip -> [요청 시각들]
let day = new Date().toDateString();
let dayCount = 0;
function checkLimit(ip) {
  const now = Date.now();
  if (new Date().toDateString() !== day) {
    day = new Date().toDateString();
    dayCount = 0;
  }
  if (dayCount >= DAILY_LIMIT) return "오늘 사용 가능한 변환 횟수를 모두 썼어요. 내일 다시 시도해 주세요.";
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60 * 60 * 1000);
  if (recent.length >= RATE_PER_HOUR) return `1시간에 ${RATE_PER_HOUR}번까지 변환할 수 있어요. 잠시 후 다시 시도해 주세요.`;
  recent.push(now);
  hits.set(ip, recent);
  dayCount++;
  return null;
}
const currentModel = () => (provider() === "openai" ? OPENAI_MODEL : MODEL);

const app = express();
// Vercel은 프록시 뒤에서 동작하므로, 실제 사용자 IP를 읽도록 설정합니다.
app.set("trust proxy", true);
app.use(express.json({ limit: "100kb" }));

// 1) 서버 상태 확인
app.get("/api/health", (req, res) => {
  res.json({ ok: true, hasKey: hasKey(), provider: provider(), model: currentModel() });
});

// 2) 사투리 목록
app.get("/api/dialects", (req, res) => {
  res.json(listDialects());
});

// 3) 변환
app.post("/api/convert", async (req, res) => {
  try {
    const { text, code } = req.body || {};
    if (typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "변환할 독백을 입력해 주세요." });
    }
    if (text.length > MAX_CHARS) {
      return res.status(400).json({ error: `독백이 너무 깁니다. ${MAX_CHARS}자 이하로 줄여 주세요. (현재 ${text.length}자)` });
    }
    const dialect = typeof code === "string" ? getDialect(code) : undefined;
    if (!dialect) {
      return res.status(400).json({ error: "알 수 없는 사투리 코드입니다. 목록에서 다시 선택해 주세요." });
    }

    const who = provider();
    const demo = who === null;
    // 실제 AI를 쓸 때만 사용량 제한을 겁니다 (공개 사이트에서 요금 폭탄 방지).
    if (!demo) {
      const blocked = checkLimit(req.ip || "unknown");
      if (blocked) return res.status(429).json({ error: blocked });
    }
    const result = demo
      ? demoConvert(text, dialect)
      : who === "openai"
        ? await openaiConvert(text, dialect)
        : await claudeConvert(text, dialect);

    res.json({
      code: dialect.code,
      name: dialect.name,
      language: dialect.language,
      ...result,
      demo,
      confidence: dialect.confidence,
    });
  } catch (err) {
    if (err instanceof UserError) return res.status(err.status).json({ error: err.message });
    // 스택 트레이스나 키가 화면에 나가지 않도록 서버 콘솔에만 이름/메시지를 남깁니다.
    console.error("[변환 오류]", err?.name, err?.message);
    res.status(500).json({ error: "서버에서 문제가 생겼습니다. 잠시 후 다시 시도해 주세요." });
  }
});

// 모르는 /api 주소는 JSON 오류로 응답
app.use("/api", (req, res) => res.status(404).json({ error: "없는 주소입니다." }));

// 4) 화면(web 폴더)을 "/" 로 제공
app.use(express.static(path.join(here, "..", "web")));

// JSON 파싱 실패 등 예상 못 한 오류도 안전한 메시지로 (스택 노출 금지)
app.use((err, req, res, next) => {
  const bad = err?.type === "entity.parse.failed" || err?.type === "entity.too.large";
  res
    .status(bad ? 400 : 500)
    .json({ error: bad ? "요청 형식이 올바르지 않거나 너무 큽니다." : "서버에서 문제가 생겼습니다." });
});

const count = loadDialects();

// Vercel(인터넷 배포)에서는 Vercel이 직접 서버를 켜 주므로 listen 하지 않습니다.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`사투리 코치 서버 시작: http://localhost:${PORT}`);
    const who = provider();
    const label = who === "openai" ? "ChatGPT" : who === "claude" ? "Claude" : "없음 (데모 모드)";
    console.log(`사투리 규칙 ${count}개 로드 / 사용 AI: ${label} / 모델: ${currentModel()}`);
  });
}

export default app;
