# HANDOFF — 배우의 저장소 인수인계 (2026-11-28)

> 먼저 `CLAUDE.md`(지킬 원칙·주소 규칙·실행 방법)를 읽으세요. 이 문서는 "지금 어디까지 왔고, 다음에 뭘 할지"예요.
> 공개 사이트: https://dialect-coach.vercel.app · GitHub: huhsm001lab/dialect-coach (public)

---

## 1. 기술 구조

| 항목 | 내용 |
|---|---|
| 프레임워크 | **Node.js + Express 5** (ESM). 화면은 **프레임워크 없는 HTML·CSS·바닐라 JS** (빌드 단계 없음) |
| 로컬 실행 | `npm start` → `server/index.js`가 `web/`을 정적 제공 + `/api/*` 처리 (포트 3000) |
| 배포 | Vercel. `api/index.js`가 Express 앱을 내보내고, `vercel.json`이 모든 주소를 `/api`로 보냄 (`includeFiles: web, dialects`, `maxDuration: 300`) |
| 로그인 | **있음.** Supabase Auth, **이메일 숫자 코드(OTP)** 방식. 처음 로그인하면 자동 가입. 메일은 **사용자 Gmail SMTP**로 발송 (Supabase 대시보드에 설정됨). 코드 길이는 현재 **8자리**(Supabase 기본값) |
| 데이터 저장 | ① 로그인 안 함: 브라우저 **sessionStorage**(탭 닫으면 삭제) ② 로그인 함: Supabase **`public.records`** 표(서비스별 기록, RLS로 본인만) ③ 서버는 아무것도 저장하지 않음 (대본은 분석 후 버림). 사용량 제한 카운터만 서버 메모리에 잠깐 |
| 브라우저 라이브러리 | `web/vendor/supabase-2.119.2.js` (supabase-js UMD를 그대로 복사해 둠, CDN 안 씀) |

### 폴더·주요 파일
```
server/
  index.js      Express 앱: /api/health, /api/dialects, /api/convert, /api/prosody, /api/tts,
                /api/analyze, /api/config(로그인용 공개값). 사용량 제한(checkLimit), AI 업체 선택(provider)
  claude.js     Claude 호출 + ★사투리/번역 지시문(buildSystemPrompt, taskSection) + 공통 JSON 호출(claudeJSON)
  openai.js     OpenAI 호출(openaiJSON) + 변환 + AI 음성(openaiSpeech, gpt-4o-mini-tts)
  prosody.js    ★억양 악보 지시문·스키마 (AI 추정)
  analyze.js    ★대본 흐름 분석 지시문·스키마
  dialects.js   dialects/*.json 읽기 + 사용자 보고서(guides) 붙이기
  demo.js       AI 키 없을 때 단어 치환 데모
api/index.js    Vercel 입구
web/
  index.html    모든 화면(로그인 창 → 서비스 고르기(소개) → 서비스들). 서비스 = "방(room)", 화면 조각 = "탭"
  app.js        화면 동작 전부 (방·탭, 변환, 연습(음성인식), 듣기(AI 음성·억양 악보·억양 그래프), 분석, 연기 노트, 로그인, 보관함)
  style.css     디자인 (색은 맨 위 CSS 변수, 라이트/다크)
  connect.html  다른 서비스에서 연결하는 링크·코드 안내 페이지
  demo/mood.html 예시 무드 영상 v1 (신춘문예 희곡 3편 상상 장면, 캔버스 그림 + .webm 저장, 소리 없음)
dialects/
  *.json        지역별 규칙 17개 (ko 7, en 6, zh 4). examples·sub_regions·open_questions 포함
  guides/ko-user-report.json  ★사용자 검증 보고서 — 한국어 변환 최우선 기준
  review/       2차 리서치 변경 기록 (v2-ko-a/b, v2-en, v2-zh)
supabase/       001_records.sql(표+RLS), 002_grants.sql(권한) — 둘 다 이미 실행됨
prd.md          기획서 (12장 = 서비스 구조·로드맵)
research-review.md  리서치 검토 (1차 + 2차 요약)
```

## 2. AI 연결
| 항목 | 내용 |
|---|---|
| 업체 | **OpenAI**(현재 배포에서 사용) 또는 Anthropic Claude. 키가 있는 쪽을 자동 선택(`AI_PROVIDER`로 강제 가능) |
| 모델 | 변환·억양·분석: `OPENAI_MODEL`(기본 `gpt-4o`) / Claude는 `CLAUDE_MODEL`(기본 `claude-opus-5-5`). AI 음성: `OPENAI_TTS_MODEL`(기본 `gpt-4o-mini-tts`), 목소리 `OPENAI_TTS_VOICE`(기본 `coral`) |
| 프롬프트 위치 | 사투리·번역: `server/claude.js`의 `taskSection`·`buildSystemPrompt` (두 업체 공통으로 씀) / 억양 악보: `server/prosody.js` / 대본 분석: `server/analyze.js` / AI 음성 지시: `server/openai.js`의 `buildVoiceInstructions` |
| 출력 형식 | 모두 JSON 스키마 강제(구조화 출력) |
| ⚠️ 현재 상태 | **OpenAI 키가 만료됨(2026-11-28).** 배포 사이트에서 변환·억양·AI 음성·분석 버튼을 누르면 오류가 나요. 새 키를 Vercel `OPENAI_API_KEY`에 넣고 Redeploy 필요 |

## 3. 배포
- Vercel 프로젝트: **`dialect-coach`** (팀: 사용자 개인 팀) → https://dialect-coach.vercel.app
- main에 push하면 자동 배포.
- 환경변수 **이름** (값은 Vercel에만 있음, 문서·커밋에 쓰지 말 것):
  - AI: `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_TTS_MODEL`, `OPENAI_TTS_VOICE`, `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `AI_PROVIDER`
  - 로그인: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (publishable 키, 브라우저 공개용. service_role/secret 키는 쓰지 않음)
  - 사용량 제한(선택): `RATE_PER_HOUR`, `DAILY_LIMIT`, `PROSODY_PER_HOUR`, `PROSODY_DAILY`, `TTS_PER_HOUR`, `TTS_DAILY`, `ANALYZE_PER_HOUR`, `ANALYZE_DAILY`
  - 기타: `PORT`(로컬만), `VERCEL`(Vercel이 자동 설정), `AI_MAINTENANCE`(선택, 1이면 AI 점검 중 안내를 강제로 켬)
- Supabase 프로젝트: 이름 `actor-archive`, 지역 서울. 대시보드 설정(코드 밖에 있음): Authentication → URL Configuration(Site URL·Redirect URL = 배포 주소), Custom SMTP(Gmail 앱 비밀번호), Email 템플릿(Magic Link·Confirm signup에 `{{ .Token }}` 코드 표시, 제목 "[배우의 저장소] 로그인 코드").

## 4. 지금까지 내린 결정과 이유 (날짜순)
| 날짜 | 결정 | 이유 |
|---|---|---|
| 11-27 | 로컬 웹(Express + 바닐라 JS)으로 시작, PRD 기반 | 교육생이 이해하기 쉬운 구조 |
| 11-27 | 사투리 규칙을 JSON + 출처로 관리, AI가 규칙을 참고해 변환 | 그럴듯한 가짜 사투리 방지 |
| 11-27 | 사용자 보고서(`ko-user-report.json`)를 최우선 기준으로 | 사용자가 직접 검증한 자료 |
| 11-27 | ChatGPT(OpenAI) 키로 운영, Claude도 선택 가능 | 사용자가 가진 키 |
| 11-27 | GitHub 공개 + Vercel 배포, 키는 Vercel 환경변수에만, 서버에 사용량 제한 | 공개 사이트 요금 폭주 방지 |
| 11-27 | AI 음성(OpenAI TTS), 억양 악보(AI 추정), 억양 그래프(실측 YIN) 추가 | 사투리 억양을 보고·듣고·비교 |
| 11-27 | 영어·중국어는 "사투리 변환"이 아니라 **현지 회화체 번역**, 설명은 한국어 | 사용자 요청 |
| 11-27 | 정체성: 사투리 서비스 → **배우의 저장소(서비스 안의 서비스)** | 사용자 정정: 대본 분석·영상·무드·사투리는 각각 다른 서비스 |
| 11-27 | 대본 분석 스튜디오, 연기 노트 추가. 해시 `#dialect/#analyze/#note`, `?text=` 연결 | 다른 서비스(SOKMAL)에서 링크로 열기 |
| 11-27 | 대본 분석·연기 노트에서 사투리 관련 버튼 제거 | 서비스는 서로 독립 |
| 11-27 | 무드 영상 데모(`/demo/mood.html`) 공개, 발표 PDF에 링크 | 분석→콘티→영상 흐름 예시 |
| 11-28 | 기록 저장을 localStorage → **sessionStorage** + 예전 기록 자동 삭제 | 공용 컴퓨터에서 앞사람 기록이 보임 |
| 11-28 | **로그인 도입**(Supabase), SOKMAL과 같은 계정을 쓰는 방향 | 개인 기록은 계정에 남겨야 함 (SOKMAL엔 아직 Supabase 없음 — 나중에 이 프로젝트에 연결 예정) |
| 11-28 | 흐름: **로그인 창(맨 처음) → 서비스 고르기 → 서비스** | 사용자 요청 |
| 11-28 | 메일 링크 → **숫자 코드 로그인**, Gmail SMTP | 사용자 요청 + 앱으로 만들 때도 코드가 편함 + 기본 메일은 팀원에게만·수량 제한 |
| 11-28 | 이름 **"배우의 저장소"** 확정 | 사용자 요청 (주소는 아직 `dialect-coach`) |
| 11-28 | 사투리 규칙 2차 리서치(Sonnet 4팀) 반영, 예문·지역 안 차이 추가 | 정확도 |
| 11-28 | 앱은 나중, **웹서비스 먼저** | 사용자 결정 (앱 메모: PWA는 쉬움, 앱 껍데기(WebView)는 브라우저 음성인식이 안 됨 → 휴대폰 자체 음성인식이나 서버 STT 필요) |

## 5. 하던 작업과 다음 할 일

### 5-1. 브랜치 `handoff-wip` (main에 합치지 않은 미완성 작업)
main 최신 + 아래 미완성 변경이 들어 있어요. **이대로 배포하면 빈 화면 서비스가 보이니 main에 그냥 합치지 마세요.**
- `web/app.js`: 방(ROOMS)에 `portfolio`(나의 포트폴리오), `records`(내 기록 전체) 추가, 대본 분석 방에 탭 `storyboard`(콘티·무드 영상) 추가, `TAB_IDS` 확장, 보관함 막대가 이 화면들에선 숨게 함, 새 기능 파일들이 쓰는 공용 창구 **`window.App`**(auth, user, room, enterRoom, selectTab, openRecord, toast, $/el/show)과 이벤트 `app:room`·`app:tab`·`app:auth`
- `web/index.html`: 위 탭 버튼·빈 패널(`#sbRoot`, `#pfRoot`, `#rcRoot`), 위쪽 메뉴에 🎬 포트폴리오·📂 내 기록 버튼, 새 스크립트 3개 연결
- `web/records.js`, `web/portfolio.js`, `web/storyboard.js`: **한 줄짜리 빈 파일** (아직 아무 기능 없음)
- `research/shinchun/storyboard.md`: 무드 영상 콘티(장면·움직임·내레이션·감정 + 장면별 속마음·배우에게 질문) — 콘티 편집기·영상 v2의 기준 자료
- 계획했던 설계(아직 코드 없음):
  - **포트폴리오**: Supabase 표 `portfolios`(user_id, slug, is_public, 이름·한 줄 소개·경력·연기 영상 링크(유튜브/비메오) 등) + 사진은 Supabase Storage(본인 폴더만 쓰기) + 공개 페이지(`slug`로 누구나 보기)
  - **내 기록 전체**: `records`를 서비스 구분 없이 목록·검색·필터, 열기 → `App.openRecord(service,row)`
  - **콘티 편집기**: 장면마다 배경 템플릿(등잔불 방·눈 거리·노을 벌판·여름밤 방·꿈속 방·무대 조명·비 오는 길·창가)·인물 자세·색·내레이션·속마음·질문 → `demo/mood.html`의 그리기 코드로 재생·.webm 저장. 저장하려면 `records.service` 허용값에 `storyboard` 추가 필요(SQL 수정)

### 5-2. 남은 할 일 (우선순위 순)
1. **AI 키 교체** (만료) → Vercel `OPENAI_API_KEY` 갱신 + Redeploy. 그 뒤 2차 리서치 반영된 변환 품질을 지역별로 한두 문장 시험
2. ~~"AI 점검 중" 안내~~ **완료(11-28, 새 계정)**: 키 오류(만료·권한 없음)가 나면 서버가 10분간 기억하고 `/api/health`의 `aiDown`으로 알려 줌 → 화면 위쪽 「AI 점검 중」 안내, AI 음성 선택 꺼짐. 환경변수 `AI_MAINTENANCE=1`이면 강제로 켬. 오류 응답은 `code: "ai_down"`(503). AI 없는 기능은 그대로
3. **보관함 실제 시험**: 로그인 후 각 서비스에서 💾 저장 → 탭 닫기 → 📂 내 기록 → 열기 (사용자가 아직 확인 안 함)
4. **무드 영상 v2** (사용자 요청, 진행 중 멈춤): 절차적 WebAudio 음악·효과음, 1080p, 여러 층 깊이감·빛·입자, 소리 포함 .webm 저장. `/demo/mood.html` 주소 유지하고 교체
5. **예문 검수 페이지**: 지역 출신자에게 링크로 `dialects/*.json`의 examples를 보여 주고 👍/👎·고친 문장 받기 → 규칙에 반영 (제안만 하고 사용자 답 대기 상태였음)
6. **포트폴리오 → 내 기록 전체 → 콘티 편집기** (`handoff-wip`에서 이어가기, 위 5-1 설계)
7. 로그인 다듬기: 코드 길이 6/8 결정(Supabase Auth → Email OTP Length, 화면 문구 `web/index.html`·`web/app.js`의 "8자리"와 맞추기), "Confirm signup" 템플릿도 코드 메일인지 확인, 위쪽 헤더의 옛 로그인 대화상자(`loginDlg`)는 이제 거의 안 쓰임 → 정리
8. 이름·주소: Vercel 프로젝트명/도메인을 "배우의 저장소"에 맞게 (바꿔도 기존 `dialect-coach.vercel.app` 링크가 살아 있게 확인)
9. SOKMAL과 계정 통합 방향 확정 (SOKMAL에 Supabase 연결, 연기 방식 불간섭 원칙과 사투리 코치의 억양 악보 사이 결정)
10. 앱: PWA(홈 화면 추가)부터

### 5-3. 알려진 버그·약점
- 연기 노트: 화면 폭이 바뀌어 글이 다시 줄바꿈되면 손그림이 글자와 어긋날 수 있음 / PNG 저장에 스케치 페이지가 빠짐 / 되돌리기는 새로고침 후 안 됨 / 키보드만으로 글 선택 불가
- 사투리 규칙: 학술 근거 못 찾은 대표 표현(경상 `-아이가`·`-데이`, 전라 `-랑께`·`허벌나게`, 충청 `됐슈` 뉘앙스, 청두·동북 어기사, 뉴욕 문법), 억양 데이터 전반 부족 → 지역 출신자 검수 필요. 강원 `옥시기`는 2차 리서치에서 확인됐지만 사용자 보고서는 '사용 자제' (보고서 우선 중)
- gpt-4o가 영어 번역에서 발음 팁을 가끔 영어로 씀 (지시문은 한국어 강제)
- 사용량 제한은 서버 메모리 기준이라 Vercel 인스턴스마다 따로 셈 (대략적). OpenAI 쪽 월 한도 설정 권장
- 음성인식은 Chrome에서만 안정적, 사투리를 표준어로 받아 적는 경향 (점수는 암기 확인용으로 안내 중)

## 6. 사용자(송무)가 요청했는데 아직 안 한 것
- 무드 영상 퀄리티 올리기(v2) — 시작했다가 사용량 한도로 멈춤, 파일은 아직 없음
- 🎬 나의 포트폴리오 (연기 영상 올리고 나를 소개·홍보하는 공간)
- 📂 내 기록 전체 페이지
- 🎞 콘티 편집기 (자체 제작 무드 영상)
- 사투리 "더 확실하게": 2차 리서치까지 했고, 다음은 지역 출신자 검수(검수 페이지 제안 상태)
- 6자리 코드로 받고 싶어 했으나 Supabase가 8자리를 보내서 화면을 8자리로 맞춰 둠 (6자리로 바꿀지 미정)

## 7. 저장소 밖에 있는 관련 작업 (참고)
- 사용자의 다른 서비스 **SOKMAL**(별도 폴더, git 아님) 홈 화면에 "배우의 저장소 ↗" 타일을 추가해 둠 (`sokmal-web/legacy/body.html`, 기록은 그 폴더의 `SOKMAL-개발.md` 0-3절)
- 발표 PDF 마지막 장에 `/demo/mood.html` 링크를 넣은 새 PDF를 사용자 폴더에 만들어 둠
- 소개 슬라이드 3장(Claude 아티팩트, 사용자 계정 소유)
