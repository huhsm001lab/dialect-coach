// 사투리 규칙 파일(dialects/*.json)을 읽어 오는 모듈입니다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 이 파일(server/dialects.js) 기준으로 프로젝트 루트의 dialects 폴더를 찾습니다.
const here = path.dirname(fileURLToPath(import.meta.url));
const DIALECT_DIR = path.join(here, "..", "dialects");

// 목록에서 보여줄 순서: 한국어 -> 영어 -> 중국어
const LANG_ORDER = { ko: 0, en: 1, zh: 2 };

// 서버 시작할 때 한 번만 모두 읽어 메모리에 보관합니다.
const dialects = new Map();

export function loadDialects() {
  dialects.clear();
  for (const file of fs.readdirSync(DIALECT_DIR)) {
    if (!file.endsWith(".json")) continue;
    try {
      const data = JSON.parse(fs.readFileSync(path.join(DIALECT_DIR, file), "utf8"));
      if (data.code) dialects.set(data.code, data);
    } catch (err) {
      // 파일 하나가 깨져도 서버 전체는 계속 켜져 있게 합니다.
      console.warn(`[경고] ${file} 를 읽지 못했습니다: ${err.message}`);
    }
  }
  return dialects.size;
}

export function getDialect(code) {
  return dialects.get(code);
}

// 사용자가 직접 검증한 보고서(dialects/guides/*.json)를 읽습니다.
// 이 가이드는 규칙 파일보다 우선합니다. 해당 지역 내용과 공통 원칙만 골라 돌려줍니다.
export function getGuides(code) {
  const dir = path.join(DIALECT_DIR, "guides");
  if (!fs.existsSync(dir)) return [];
  const found = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    try {
      const g = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      const region = g.regions?.[code];
      if (region) found.push({ title: g.title, general: g.general, region, sources: g.sources });
    } catch (err) {
      console.warn(`[경고] guides/${file} 를 읽지 못했습니다: ${err.message}`);
    }
  }
  return found;
}

// 프론트엔드 목록용 요약 정보 (ko, en, zh 순서 + 코드 순)
export function listDialects() {
  return [...dialects.values()]
    .map((d) => ({
      code: d.code,
      name: d.name,
      language: d.language,
      confidence: d.confidence,
      summary: d.summary,
    }))
    .sort(
      (a, b) =>
        (LANG_ORDER[a.language] ?? 9) - (LANG_ORDER[b.language] ?? 9) ||
        a.code.localeCompare(b.code)
    );
}
