# 영어 6개 변종 2차 개선 기록 (v2-en)

> 대상: en-us-south, en-us-ny, en-gb-london, en-scot, en-ie, en-au
> 방식: 1차는 위키백과 중심이라, 이번에는 Yale Grammatical Diversity Project(YGDP), 스코틀랜드어 사전(DSL/SND), 호주 국립사전센터(ANDC), 맥쿼리 사전, eWAVE, 대학 연구 페이지(York, QMUL, 글래스고 대학 STELLA, 오픈유니버시티), Frontiers 논문을 실제로 열어 확인함.
> 원칙: 열어 본 출처만 근거로 추가. 확인 못 한 것은 `open_questions`에 남김. 아래 "구성 예문"은 검증된 규칙을 조합해 만든 문장이라 `constructed: true`로 표시.

## 1. 항목 수 변화 (전 → 후)

| 파일 | 문법 | 어휘 | 발음 | 억양 | 예문 | 하위지역 | 출처 | 신뢰도 |
|---|---|---|---|---|---|---|---|---|
| en-us-south | 4 → 12 | 14 → 27 | 6 → 10 | 0 → 2 | 0 → 12 | 0 → 6 | 4 → 11 | 중간 (문법 중상) |
| en-us-ny | 0 → 2 | 7 → 11 | 5 → 7 | 0 → 1 | 0 → 12 | 0 → 4 | 3 → 6 | 중간 (문법·억양 낮음) |
| en-gb-london | 5 → 10 | 5 → 25 | 8 → 15 | 0 → 3 | 0 → 12 | 0 → 5 | 3 → 7 | 중간 (MLE 억양은 중상) |
| en-scot | 3 → 14 | 11 → 22 | 6 → 11 | 0 → 1 | 0 → 12 | 0 → 6 | 3 → 15 | 중간 (부정형·ken 중상) |
| en-ie | 4 → 13 | 3 → 29 | 8 → 14 | 0 → 3 | 0 → 12 | 0 → 5 | 3 → 7 | 중간 (문법 중상) |
| en-au | 0 → 9 | 9 → 29 | 9 → 14 | 1 → 2 | 0 → 12 | 0 → 6 | 1 → 7 | 중간 (어휘 중상) |

`confidence`는 기존 키에 맞춰 low/medium/high 중 하나(전부 medium)로 두고, 항목별 세부 평가는 새 키 `confidence_detail`에 적음.

## 2. 1차 오류·수정 사항

- **en-gb-london**
  - `kosher` 삭제 (런던 고유어가 아님).
  - `Mockney` 삭제 (가짜 억양을 가리키는 말이지 인물이 쓰는 단어가 아님).
  - "MLE=th-stopping, Cockney=th-fronting으로 딱 나뉜다"는 1차 서술은 과함. MLE 문서에는 stopping과 fronting이 모두 나옴 → 한 인물에 한 패턴만 가볍게 쓰도록 수정.
  - L-vocalisation은 Cockney 항목에만 두고, MLE 문서에 없다고 명시.
  - Cockney(옛 동런던)와 MLE(젊은 다문화)를 발음·문법·어휘·예문에 `COCKNEY`/`MLE` 표기로 분리.
  - `me`(=my)가 저신뢰에서 중간으로 올라감. Cockney 위키 문서에 "'At's me book you got 'ere" 예문이 있음.
  - 라이밍 슬랭 추가. 다만 위키 자체가 "출처 보강 필요" 상태라 `butcher's`만 "널리 쓰임"으로 표시.
  - MLE 억양(rise-fall, 강조 자음 늘이기, 평서형 질문) 추가. 출처는 York·QMUL 2026 연구.
- **en-scot**
  - `provost` 삭제 (연기에 불필요한 관직명).
  - 법률·행정 용어(depute, interdict 등)는 넣지 않음.
  - `ken` / `dinnae` / `cannae` / `isnae` / `outwith` / `wean` / `bairn` / `glaikit`를 DSL(SND)에서 확인해 추가.
  - `och`는 사전에서 확인 못 했고 `och aye the noo`는 고정관념이라 뺌.
  - `how?`(=why), `stay`(=live), `numpty`, `kirk` 등 위키 확인 항목 추가.
  - 문법은 3개에서 14개로 늘림. OpenLearn(오픈유니버시티) 스코츠 문법과 YGDP `needs washed` 기반이며, SSE(격식)와 Scots(비격식)를 구분함.
  - 글래스고(성문음 t, th-fronting, r 약화)와 에든버러를 STELLA 보고서로 구분.
- **en-ie**
  - FACE 모음: 일반 아일랜드 영어는 단모음 [eː], 더블린은 이중모음으로 정리해 1차 충돌 해소.
  - 더블린 Local / Mainstream / Advanced 구분 강화 (T-lenition, THOUGHT, NURSE/SQUARE, horse=hoarse).
  - `after` 완료형을 YGDP와 Cork/Kerry 연구로 보강.
  - `youse`는 맥쿼리 사전으로 보강. 아일랜드 영어에서 온 말이며 1890년대 기록.
  - 새 문법: 동사 되받아 대답("I am."), `so I can`, `sure` 태그, `Will I...?`, `'tis`.
  - 어휘 3개에서 29개로 늘림 (위키 문서의 사전 인용 목록 기반).
- **en-au**
  - 문법 0개에서 9개로 늘림. `youse`(맥쿼리), 문장 끝 `but`(eWAVE B등급), `eh`, `heaps`, `real good`, `sweet as`, `-o/-ie` 조어, `yeah-no`(낮은 확신).
  - 어휘는 ANDC에서 뜻과 연대를 확인 (arvo 1920s, no worries 1960s, g'day 1880s 등).
  - `smoko`는 ANDC 표제어에서 못 찾아 "확인 필요"로 표시. 나머지는 위키 출처임을 명시.
  - 모음 IPA를 Australian English phonology 문서로 갱신 (KIT·DRESS 상승, GOOSE 전설화, FACE·GOAT 낮은 시작 등).
  - 1차 `trap-bath` 서술을 주(州)별(남호주 vs 호바트)로 보정.
- **en-us-south**
  - 남부 모음 이동(Southern Shift) 3단계와 PRICE 단모음화를 추가. 내륙은 전 위치에서 활음 탈락, 찰스턴·애틀랜타·서배너는 거의 없음.
  - pin-pen 병합 예외 지역(뉴올리언스, 남부 플로리다, 로컬랜드)을 명시.
  - 문법을 YGDP 페이지로 모두 재확인하고 추가 (`not fixin' to`=강한 거절, `liketa` 제약, `done`, personal dative, `a-prefixing`, negative concord).
  - `liketa`와 `ain't`는 어휘에서 문법으로 이동.
  - 어휘는 위키 Vocabulary 절 전체에서 보강 (catty-corner, cut on/off, toboggan, tump 등).
- **en-us-ny**
  - short-a 분열의 조건을 위키 `Æ raising` 문서(Labov, Ash, Boberg 2006 요약)로 정리. 예외 목록 포함.
  - `on line`을 어휘에서 문법으로 이동.
  - 대화 스타일(협력적 겹침, Tannen)을 억양/리듬 칸에 추가.
  - **문법은 2개뿐.** 확인된 NYC 고유 문법이 `on line` 외에 거의 없음. `youse`, `he don't` 등은 근거가 없어 넣지 않음.

## 3. 가장 의심스러운 부분

1. **1차 출처 의존이 아직 큼**: 모음 IPA 대부분은 위키 요약(Labov·Ash·Boberg 2006, Thomas 2004, Cox·Fletcher 2017, Hickey)을 거친 값입니다. 원문 책은 열지 못함.
2. **서버가 막은 출처**: ling.upenn.edu의 Atlas 지도, Penn 논문(403), Wells의 UCL 강의 PDF(연결 거부), 영국도서관 Sounds Familiar(404), eWAVE 목록(자바스크립트 렌더링). PDF 중 Hirst, Cheshire·Fox 발표 자료는 본문 해독 불가.
3. **억양**: 남부, 스코틀랜드, 더블린, 뉴욕 억양은 사실상 검증 못 함 (각각 1~2개 항목, 일부는 말투 리듬만). 런던 MLE와 아일랜드 얼스터·남서부, 호주 HRT만 근거가 있음.
4. **구성 예문**: 모두 `constructed: true`. 이 가운데 `man` 대명사, `this is` 인용, 문장 끝 `still`, `Why...for?`, `yeah-no`, `embedded inversion`은 규칙 설명만 있고 실제 인용문은 확인 못 함.
5. **연령 표시**: 어휘의 세대(yonder, whisht, cushty 등)는 출처에 없는 코칭 판단. 노트에 "나이 정보 없음"이라고 명시함.
6. **하위지역**: 딥사우스 vs 텍사스, 뉴욕 자치구별, 하일랜드 영어, 호주 원주민 영어는 거의 검증 못 함.
7. **직접 확인할 것**: 각 지역 출신 검수자에게 `examples`를 보여 주고 "자연스러운가, 과장인가"를 먼저 물어보세요.
