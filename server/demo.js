// 데모 모드: API 키가 없을 때 쓰는 아주 단순한 규칙 기반 변환기입니다.
// 정확도는 낮지만 서버가 죽지 않고 "대략 이런 결과가 나온다"를 보여주는 용도입니다.

// 'A / B' 또는 'A/B' 처럼 여러 대안이 있으면 첫 번째만 씁니다.
function firstAlt(s) {
  return String(s).split("/")[0].trim();
}

// 문장 부호, '-' 표기, 괄호 설명을 걷어낸 순수 글자만 남깁니다.
function clean(s) {
  return firstAlt(s)
    .replace(/\(.*?\)/g, "")
    .replace(/[?.!~\-…]/g, "")
    .trim();
}

export function demoConvert(text, dialect) {
  let out = text;
  const changes = [];

  // 1) 단어 치환: 표준어 표현이 글자 그대로 들어 있을 때만 바꿉니다.
  for (const v of dialect.vocabulary || []) {
    const from = clean(v.standard);
    const to = clean(v.dialect);
    if (!from || !to || from === to || from.length < 2) continue;
    if (out.includes(from)) {
      out = out.split(from).join(to);
      changes.push({ from, to, rule: "단어 치환 (규칙 파일 vocabulary)" });
    }
  }

  // 2) 한국어 어미 치환: 뒤에 문장부호/공백/끝이 올 때만 조심스럽게 바꿉니다.
  if (dialect.language === "ko") {
    for (const e of dialect.endings || []) {
      const from = clean(e.standard);
      const to = clean(e.dialect);
      // 너무 짧은 어미(한 글자)는 엉뚱하게 바뀔 수 있어 건너뜁니다.
      if (!from || !to || from === to || from.length < 2) continue;
      // 정규식 특수문자를 안전하게 처리한 뒤 '문장 끝' 조건을 붙입니다.
      const esc = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(esc + "(?=[?.!]|\\s|$)", "g");
      if (re.test(out)) {
        out = out.replace(new RegExp(esc + "(?=[?.!]|\\s|$)", "g"), to);
        changes.push({ from, to, rule: "어미 치환 (규칙 파일 endings)" });
      }
    }
  }

  return {
    converted: out,
    changes,
    tips: { intonation: [], pronunciation: [] },
    notes: ["데모 모드: API 키가 없어 단어 치환만 했습니다. 정확도가 낮습니다."],
  };
}
