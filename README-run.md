# 사투리 코치 실행 방법 (처음 하는 분용)

내 컴퓨터에서만 열리는 웹 앱입니다. 인터넷에 올라가지 않습니다.

## 0. 준비물
- Node.js 설치 확인: 터미널(PowerShell)에서 `node -v` 를 입력했을 때 `v26...` 같은 숫자가 나오면 OK.
- 터미널은 이 프로젝트 폴더(`package.json`이 있는 폴더)에서 열어야 합니다.

## 1. 처음 한 번만: 부품 설치
```
npm install
```
- 하는 일: 앱이 쓰는 부품(express, @anthropic-ai/sdk, dotenv)을 `node_modules` 폴더에 내려받습니다.
- 끝나면 `found 0 vulnerabilities` 같은 문장이 보입니다. (이미 했다면 건너뛰어도 됩니다.)

## 2. 서버 켜기 (데모 모드, 키 없이)
```
npm start
```
- 아래처럼 보이면 성공입니다.
  ```
  사투리 코치 서버 시작: http://localhost:3000
  사투리 규칙 17개 로드 / API 키: 없음 (데모 모드) / 모델: claude-opus-5-5
  ```
- 브라우저 주소창에 `http://localhost:3000` 을 입력하면 화면이 열립니다.
- 데모 모드는 단어 몇 개만 바꾸는 간단한 기능입니다. 정확한 변환은 3번(API 키)이 필요합니다.
- 끄려면 터미널에서 `Ctrl + C` 를 누릅니다.

## 3. 진짜 AI 변환 쓰기 (API 키 넣기)
API 키는 "AI를 쓸 수 있는 비밀번호"입니다. 남에게 보여주거나 채팅/캡처에 올리면 안 됩니다.

1. 프로젝트 폴더에서 `.env.example` 파일을 복사해 이름을 `.env` 로 바꿉니다.
   (PowerShell: `Copy-Item .env.example .env`)
2. `.env` 를 메모장으로 열어 `ANTHROPIC_API_KEY=` 뒤에 키를 붙여 넣고 저장합니다. 따옴표나 공백은 넣지 않습니다.
   ```
   ANTHROPIC_API_KEY=여기에키
   CLAUDE_MODEL=claude-opus-5-5
   ```
3. 서버를 껐다가(`Ctrl + C`) 다시 `npm start` 합니다. `API 키: 설정됨` 이라고 나오면 됩니다.
- `.env` 는 `.gitignore` 에 들어 있어 git에 올라가지 않습니다. 그래도 파일을 남에게 보내지 마세요.
- 키는 Anthropic 콘솔(console.anthropic.com)에서 발급합니다. 사용량만큼 요금이 나옵니다.

## 4. 자주 나는 문제
| 보이는 증상 | 원인과 해결 |
|---|---|
| `npm`을 찾을 수 없다고 나옴 | Node.js가 설치되지 않았거나 터미널을 다시 열어야 합니다. |
| `EADDRINUSE` / 포트 사용 중 | 3000번을 다른 프로그램이 쓰는 중입니다. 다른 번호로 실행: `$env:PORT=3001; npm start` |
| 화면에 "API 키가 올바르지 않습니다" | `.env` 의 키를 다시 확인(앞뒤 공백, 줄바꿈). 수정 후 서버 재시작. |
| "요청이 너무 많습니다" | 잠시 후 다시 시도하세요. 사용 한도/크레딧도 확인하세요. |
| 모델을 찾을 수 없다고 나옴 | `.env` 의 `CLAUDE_MODEL` 이름을 확인하세요. |
| 키를 넣었는데 데모 모드로 나옴 | `.env` 파일 이름이 `.env.txt` 가 아닌지, 서버를 재시작했는지 확인하세요. |

## 5. 폴더 구조
- `server/index.js` : 서버 본체 (주소 `/api/health`, `/api/dialects`, `/api/convert`)
- `server/claude.js` : AI 호출 (프롬프트를 바꾸고 싶으면 여기의 `buildSystemPrompt`)
- `server/demo.js` : 키 없을 때 쓰는 간단 변환
- `server/dialects.js` : `dialects/*.json` 규칙 파일 읽기
- `dialects/` : 사투리 규칙 데이터
- `web/` : 화면
