// 사투리 코치 서버: 웹 화면(web/)을 보여주고, /api/* 요청을 처리합니다.
import "dotenv/config"; // .env 파일의 값을 읽어 process.env 에 넣습니다 (가장 먼저!)
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDialects, getDialect, listDialects } from "./dialects.js";
import { demoConvert } from "./demo.js";
import { claudeConvert, MODEL, UserError } from "./claude.js";
import { openaiConvert, openaiSpeech, OPENAI_MODEL } from "./openai.js";
import { prosodyFor } from "./prosody.js";
import { analyzeScript } from "./analyze.js";

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
// AI 음성은 ChatGPT(OpenAI) 키가 있을 때만 쓸 수 있습니다.
const hasTts = () => filled(process.env.OPENAI_API_KEY);

// ── 사용량 제한 ─────────────────────────────────────────────
// 한 사람(IP)당 1시간에 RATE_PER_HOUR번, 서버 전체로 하루 DAILY_LIMIT번까지만 AI를 부릅니다.
// 숫자는 .env(또는 Vercel 환경변수)에서 바꿀 수 있습니다.
// 주의: Vercel에서는 서버가 여러 개로 나뉘어 켜질 수 있어 "대략적인" 제한입니다.
//       확실한 상한은 OpenAI/Anthropic 사이트에서 월 사용 한도(Usage limit)를 꼭 걸어 두세요.
// 기능마다 따로 셉니다: 변환 / 억양 표시 / AI 음성
const LIMITS = {
  convert: { perHour: Number(process.env.RATE_PER_HOUR) || 10, perDay: Number(process.env.DAILY_LIMIT) || 100, label: "변환" },
  prosody: { perHour: Number(process.env.PROSODY_PER_HOUR) || 10, perDay: Number(process.env.PROSODY_DAILY) || 100, label: "억양 표시" },
  analyze: { perHour: Number(process.env.ANALYZE_PER_HOUR) || 5, perDay: Number(process.env.ANALYZE_DAILY) || 50, label: "대본 분석" },
  tts: { perHour: Number(process.env.TTS_PER_HOUR) || 40, perDay: Number(process.env.TTS_DAILY) || 400, label: "AI 음성 재생" },
};
const hits = new Map(); // "기능:ip" -> [요청 시각들]
const dayCounts = {}; // 기능 -> 오늘 횟수
let day = new Date().toDateString();
function checkLimit(ip, kind = "convert") {
  const lim = LIMITS[kind];
  const now = Date.now();
  if (new Date().toDateString() !== day) {
    day = new Date().toDateString();
    for (const k in dayCounts) dayCounts[k] = 0;
  }
  if ((dayCounts[kind] || 0) >= lim.perDay) return `오늘 사용 가능한 ${lim.label} 횟수를 모두 썼어요. 내일 다시 시도해 주세요.`;
  const key = kind + ":" + ip;
  const recent = (hits.get(key) || []).filter((t) => now - t < 60 * 60 * 1000);
  if (recent.length >= lim.perHour) return `${lim.label}은(는) 1시간에 ${lim.perHour}번까지 할 수 있어요. 잠시 후 다시 시도해 주세요.`;
  recent.push(now);
  hits.set(key, recent);
  dayCounts[kind] = (dayCounts[kind] || 0) + 1;
  return null;
}
const currentModel = () => (provider() === "openai" ? OPENAI_MODEL : MODEL);

const app = express();
// Vercel은 프록시 뒤에서 동작하므로, 실제 사용자 IP를 읽도록 설정합니다.
app.set("trust proxy", true);
app.use(express.json({ limit: "300kb" })); // 긴 대본(최대 2만 자)도 받을 수 있게

// 1) 서버 상태 확인
app.get("/api/health", (req, res) => {
  res.json({ ok: true, hasKey: hasKey(), provider: provider(), model: currentModel(), tts: hasTts() });
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
    // 영어·중국어는 "번역"이라 데모 모드(단어 치환)로는 할 수 없다는 걸 알려 줍니다.
    if (demo && dialect.language !== "ko") {
      result.notes = ["데모 모드에서는 번역을 할 수 없어요. AI 키를 넣으면 현지 회화체로 번역돼요.", ...(result.notes || [])];
    }

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

// 4) 억양 악보 (A) — 사투리 대본의 높낮이·강조·쉼을 AI가 추정
app.post("/api/prosody", async (req, res) => {
  try {
    const { text, code } = req.body || {};
    if (typeof text !== "string" || !text.trim()) return res.status(400).json({ error: "억양을 표시할 대본이 없어요." });
    if (text.length > MAX_CHARS) return res.status(400).json({ error: `대본이 너무 깁니다. ${MAX_CHARS}자 이하로 줄여 주세요.` });
    const dialect = typeof code === "string" ? getDialect(code) : undefined;
    if (!dialect) return res.status(400).json({ error: "알 수 없는 사투리 코드입니다." });
    const who = provider();
    if (!who) return res.status(503).json({ error: "억양 표시는 AI 키가 있어야 쓸 수 있어요. (지금은 데모 모드)" });
    const blocked = checkLimit(req.ip || "unknown", "prosody");
    if (blocked) return res.status(429).json({ error: blocked });
    res.json(await prosodyFor(text, dialect, who));
  } catch (err) {
    if (err instanceof UserError) return res.status(err.status).json({ error: err.message });
    console.error("[억양 오류]", err?.name, err?.message);
    res.status(500).json({ error: "억양 표시 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요." });
  }
});

// 5) AI 음성 — 문장 하나를 사투리 억양으로 읽은 mp3를 돌려줌 (OpenAI 키 필요)
app.post("/api/tts", async (req, res) => {
  try {
    const { text, code, tips } = req.body || {};
    if (typeof text !== "string" || !text.trim()) return res.status(400).json({ error: "읽을 문장이 없어요." });
    if (text.length > 600) return res.status(400).json({ error: "AI 음성은 한 번에 600자까지만 읽을 수 있어요. 문장 단위로 들어 주세요." });
    const dialect = typeof code === "string" ? getDialect(code) : undefined;
    if (!dialect) return res.status(400).json({ error: "알 수 없는 사투리 코드입니다." });
    if (!hasTts()) return res.status(503).json({ error: "AI 음성은 ChatGPT(OpenAI) 키가 있어야 쓸 수 있어요." });
    const blocked = checkLimit(req.ip || "unknown", "tts");
    if (blocked) return res.status(429).json({ error: blocked });
    const audio = await openaiSpeech(text, dialect, tips);
    res.set("Content-Type", "audio/mpeg");
    res.set("Cache-Control", "no-store");
    res.send(audio);
  } catch (err) {
    if (err instanceof UserError) return res.status(err.status).json({ error: err.message });
    console.error("[음성 오류]", err?.name, err?.message);
    res.status(500).json({ error: "AI 음성을 만드는 중 문제가 생겼습니다." });
  }
});

// 6) 대본 흐름 분석 (v3) — 대본은 저장하지 않고 분석에만 씁니다
const MAX_SCRIPT = 20000;
app.post("/api/analyze", async (req, res) => {
  try {
    const { text, role } = req.body || {};
    if (typeof text !== "string" || !text.trim()) return res.status(400).json({ error: "분석할 대본을 넣어 주세요." });
    if (text.length > MAX_SCRIPT) {
      return res.status(400).json({ error: `대본이 너무 깁니다. ${MAX_SCRIPT.toLocaleString()}자 이하로 나눠서 넣어 주세요. (현재 ${text.length.toLocaleString()}자)` });
    }
    const who = provider();
    if (!who) return res.status(503).json({ error: "대본 분석은 AI 키가 있어야 쓸 수 있어요. (지금은 데모 모드)" });
    const blocked = checkLimit(req.ip || "unknown", "analyze");
    if (blocked) return res.status(429).json({ error: blocked });
    const myRole = typeof role === "string" ? role.trim().slice(0, 40) : "";
    res.json(await analyzeScript(text, myRole, who));
  } catch (err) {
    if (err instanceof UserError) return res.status(err.status).json({ error: err.message });
    console.error("[분석 오류]", err?.name, err?.message);
    res.status(500).json({ error: "대본 분석 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요." });
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
