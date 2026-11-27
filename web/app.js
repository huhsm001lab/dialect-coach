/* 사투리 코치 - 화면 동작 파일 (순수 JavaScript, 설치할 것 없음)
 *
 * 구성
 *  1) 순수 계산 함수: 문장 나누기, 글자 비교(편집 거리), 언어 코드 변환
 *     -> 화면과 상관없는 계산이라 따로 테스트할 수 있어요.
 *  2) 화면 동작: 탭, 변환, 연습(음성인식), 듣고 따라하기(소리 읽기)
 */

'use strict';

/* =====================================================================
 * 1) 순수 계산 함수
 * ===================================================================== */

// 사투리 코드 -> 음성 기능에서 쓰는 언어 코드
function speechLangFor(code, language) {
  code = code || '';
  if (code.indexOf('ko-') === 0) return 'ko-KR';
  if (code.indexOf('en-us-') === 0) return 'en-US';
  if (code === 'en-gb-london' || code === 'en-scot') return 'en-GB';
  if (code === 'en-ie') return 'en-IE';
  if (code === 'en-au') return 'en-AU';
  if (code === 'zh-yue') return 'zh-HK';
  if (code === 'zh-tw') return 'zh-TW';
  if (code.indexOf('zh-') === 0) return 'zh-CN';
  // 목록에 없는 코드는 언어 기본값 사용
  if (language === 'en') return 'en-US';
  if (language === 'zh') return 'zh-CN';
  return 'ko-KR';
}

// 대본을 문장 단위로 자르기 (마침표/물음표/느낌표/줄바꿈 기준, 문장부호는 문장 끝에 붙임)
function splitSentences(text) {
  var found = String(text || '').match(/[^.!?。！？…\n]+[.!?。！？…]*["'”’)\]]*/g) || [];
  var out = [];
  for (var i = 0; i < found.length; i++) {
    var s = found[i].trim();
    if (s && /[\p{L}\p{N}]/u.test(s)) out.push(s);
  }
  return out;
}

// 비교 전에 글을 가지런히: 소문자, 문장부호 제거, 공백 정리 (한국어/중국어는 공백도 제거)
function normalizeText(text, language) {
  var t = String(text || '').toLowerCase().normalize('NFC');
  t = t.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  if (language !== 'en') t = t.replace(/\s/g, '');
  return t;
}

// 비교 단위로 쪼개기: 영어는 단어, 한국어/중국어는 글자
function tokenize(text, language) {
  var t = normalizeText(text, language);
  if (!t) return [];
  return language === 'en' ? t.split(' ') : Array.from(t);
}

// 두 목록(a=대본, b=내가 말한 것)의 편집 거리와 차이점 계산
// ops 종류: eq(같음) / sub(다름: a를 b로 말함) / del(빠뜨림) / ins(더 말함)
function diffTokens(a, b) {
  var n = a.length, m = b.length, i, j;
  var d = [];
  for (i = 0; i <= n; i++) {
    d.push(new Array(m + 1));
    d[i][0] = i;
  }
  for (j = 0; j <= m; j++) d[0][j] = j;
  for (i = 1; i <= n; i++) {
    for (j = 1; j <= m; j++) {
      var cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  // 거꾸로 따라가며 어떤 수정이 있었는지 기록 (같음/다름을 우선)
  var ops = [];
  i = n; j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1] && d[i][j] === d[i - 1][j - 1]) {
      ops.push({ type: 'eq', a: a[i - 1], b: b[j - 1] }); i--; j--;
    } else if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + 1) {
      ops.push({ type: 'sub', a: a[i - 1], b: b[j - 1] }); i--; j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      ops.push({ type: 'del', a: a[i - 1] }); i--;
    } else {
      ops.push({ type: 'ins', b: b[j - 1] }); j--;
    }
  }
  ops.reverse();
  return { distance: d[n][m], ops: ops };
}

// 일치율(0~100) 계산
function compareSpeech(target, heard, language) {
  var a = tokenize(target, language);
  var b = tokenize(heard, language);
  var r = diffTokens(a, b);
  var longest = Math.max(a.length, b.length);
  var percent = longest === 0 ? 100 : Math.round((1 - r.distance / longest) * 100);
  return { percent: Math.max(0, percent), ops: r.ops, targetLen: a.length, heardLen: b.length };
}

// 변환 결과에서 강조할 구간 찾기: changes[].to 가 나오는 모든 자리를 찾아 겹치지 않게 정리
function findHighlights(converted, changes) {
  var ranges = [];
  var list = (changes || []).filter(function (c) { return c && typeof c.to === 'string' && c.to.trim(); });
  // 긴 표현을 먼저 찾아야 짧은 표현이 그 안을 덮어쓰지 않아요
  list = list.slice().sort(function (x, y) { return y.to.length - x.to.length; });
  list.forEach(function (c) {
    var needle = c.to.trim();
    var from = 0, idx;
    while ((idx = converted.indexOf(needle, from)) !== -1) {
      var end = idx + needle.length;
      var overlap = ranges.some(function (r) { return idx < r.end && end > r.start; });
      if (!overlap) ranges.push({ start: idx, end: end, change: c });
      from = end;
    }
  });
  ranges.sort(function (x, y) { return x.start - y.start; });
  return ranges;
}

// ==== DOM 시작 ====  (이 줄 아래는 화면 코드예요. 테스트할 때는 위쪽만 사용해요.)

/* =====================================================================
 * 2) 화면 동작
 * ===================================================================== */

var STORAGE_KEY = 'dialectCoach.v1';
var MAX_CHARS = 3000;
var SERVER_OFF_MSG = '서버가 꺼져 있어요. README-run.md를 보고 npm start로 켜 주세요.';

// 앱이 기억하는 값들
var state = {
  dialects: [],        // 서버가 알려준 지역 목록
  conversion: null,    // 가장 최근 변환 결과 (+ 원본 글)
  sentences: []        // 변환된 대본을 문장으로 자른 것
};

function $(id) { return document.getElementById(id); }

// 안전하게 요소 만들기 (글자는 textContent로 넣어서 이상한 코드가 실행되지 않아요)
function el(tag, className, text) {
  var e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

function show(node, on) { node.hidden = !on; }

/* ---------- 저장/불러오기 (localStorage는 막혀 있을 수 있어서 try/catch) ---------- */
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      conversion: state.conversion,
      language: $('langSelect').value,
      code: $('regionSelect').value
    }));
  } catch (e) { /* 저장이 안 돼도 앱은 계속 동작해요 */ }
}

function loadSaved() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

/* ---------- 탭 ---------- */
var TAB_IDS = ['convert', 'practice', 'listen'];

function selectTab(name, focus) {
  stopListening();
  stopSpeaking();
  TAB_IDS.forEach(function (id) {
    var on = id === name;
    var tab = $('tab-' + id);
    tab.setAttribute('aria-selected', on ? 'true' : 'false');
    tab.tabIndex = on ? 0 : -1;
    show($('panel-' + id), on);
    if (on && focus) tab.focus();
  });
  if (name === 'practice') renderPractice();
  if (name === 'listen') renderListen();
}

function initTabs() {
  TAB_IDS.forEach(function (id, idx) {
    var tab = $('tab-' + id);
    tab.addEventListener('click', function () { selectTab(id, false); });
    tab.addEventListener('keydown', function (e) {
      var next = null;
      if (e.key === 'ArrowRight') next = (idx + 1) % TAB_IDS.length;
      else if (e.key === 'ArrowLeft') next = (idx + TAB_IDS.length - 1) % TAB_IDS.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = TAB_IDS.length - 1;
      if (next !== null) { e.preventDefault(); selectTab(TAB_IDS[next], true); }
    });
  });
  document.querySelectorAll('[data-goto]').forEach(function (b) {
    b.addEventListener('click', function () { selectTab(b.getAttribute('data-goto'), true); });
  });
}

/* ---------- 서버에 요청 ---------- */
// 서버와 이야기하는 공통 함수. 실패하면 사람이 읽을 수 있는 한국어 메시지로 던져요.
async function api(path, options) {
  var res;
  try {
    res = await fetch(path, options);
  } catch (e) {
    var err = new Error(SERVER_OFF_MSG);
    err.serverOff = true;
    throw err;
  }
  var data = null;
  try { data = await res.json(); } catch (e) { /* 내용이 JSON이 아닐 수 있어요 */ }
  if (!res.ok) {
    throw new Error((data && data.error) || '요청에 실패했어요. (오류 번호 ' + res.status + ') 잠시 뒤 다시 시도해 주세요.');
  }
  return data;
}

/* ---------- ① 변환 탭 ---------- */
var CONF_LABEL = { high: '신뢰도 높음', medium: '신뢰도 보통', low: '검증 필요' };

function makeBadge(confidence) {
  var b = el('span', 'badge badge-' + (CONF_LABEL[confidence] ? confidence : 'medium'), CONF_LABEL[confidence] || '신뢰도 보통');
  return b;
}

function fillRegions(preferCode) {
  var lang = $('langSelect').value;
  var sel = $('regionSelect');
  sel.innerHTML = '';
  var list = state.dialects.filter(function (d) { return d.language === lang; });
  list.forEach(function (d) {
    var o = el('option', null, d.name);
    o.value = d.code;
    sel.appendChild(o);
  });
  if (!list.length) {
    var o2 = el('option', null, '이 언어의 지역이 아직 없어요');
    sel.appendChild(o2);
  }
  if (preferCode && list.some(function (d) { return d.code === preferCode; })) sel.value = preferCode;
  sel.disabled = !list.length;
  updateRegionInfo();
  updateConvertButton();
}

function currentDialect() {
  var code = $('regionSelect').value;
  return state.dialects.find(function (d) { return d.code === code; }) || null;
}

function updateRegionInfo() {
  var d = currentDialect();
  var box = $('regionInfo');
  box.innerHTML = '';
  if (d) {
    box.appendChild(makeBadge(d.confidence));
    box.appendChild(document.createTextNode(d.summary || ''));
  }
  show($('lowWarn'), !!d && d.confidence === 'low');
}

function updateCharCount() {
  var n = $('sourceText').value.length;
  $('charCount').textContent = n + ' / ' + MAX_CHARS + '자';
  updateConvertButton();
}

function updateConvertButton() {
  var ok = !!currentDialect() && $('sourceText').value.trim().length > 0 && !converting;
  $('convertBtn').disabled = !ok;
}

var converting = false;
var progressTimer = null;
var PROGRESS_MSGS = [
  'AI가 대본을 읽고 있어요…',
  '지역 말투 규칙을 확인하는 중이에요…',
  '문장을 하나씩 사투리로 바꾸는 중이에요…',
  '바뀐 이유를 정리하고 있어요…',
  '거의 다 됐어요. AI가 오래 걸릴 때는 30초까지 걸려요…'
];

function startProgress() {
  var t0 = Date.now();
  var p = $('progress');
  show(p, true);
  function tick() {
    var sec = Math.floor((Date.now() - t0) / 1000);
    var i = Math.min(PROGRESS_MSGS.length - 1, Math.floor(sec / 6));
    p.textContent = PROGRESS_MSGS[i] + ' (' + sec + '초)';
  }
  tick();
  progressTimer = setInterval(tick, 1000);
}

function stopProgress() {
  clearInterval(progressTimer);
  show($('progress'), false);
}

async function doConvert() {
  if (converting) return;
  var text = $('sourceText').value.trim();
  var d = currentDialect();
  if (!text || !d) return;

  converting = true;
  $('convertBtn').disabled = true;
  $('convertBtn').textContent = '바꾸는 중…';
  $('convertBtn').setAttribute('aria-busy', 'true');
  show($('convertError'), false);
  startProgress();

  try {
    var data = await api('/api/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text, code: d.code })
    });
    if (!data || typeof data.converted !== 'string') throw new Error('서버가 이상한 답을 보냈어요. 다시 시도해 주세요.');
    state.conversion = {
      original: text,
      code: data.code || d.code,
      name: data.name || d.name,
      language: data.language || d.language,
      converted: data.converted,
      changes: Array.isArray(data.changes) ? data.changes : [],
      tips: data.tips || { intonation: [], pronunciation: [] },
      notes: Array.isArray(data.notes) ? data.notes : [],
      demo: !!data.demo,
      confidence: data.confidence || d.confidence
    };
    saveState();
    renderResult();
    $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    var box = $('convertError');
    box.textContent = e.message;
    show(box, true);
  } finally {
    converting = false;
    stopProgress();
    $('convertBtn').textContent = '사투리로 바꾸기';
    $('convertBtn').removeAttribute('aria-busy');
    updateConvertButton();
  }
}

// 문자열 목록을 <ul>에 채우기 (비어 있으면 기본 문구)
function fillList(ul, items, emptyText) {
  ul.innerHTML = '';
  if (!items || !items.length) {
    ul.appendChild(el('li', 'muted', emptyText));
    return;
  }
  items.forEach(function (s) { ul.appendChild(el('li', null, String(s))); });
}

function renderResult() {
  var c = state.conversion;
  if (!c) { show($('result'), false); return; }
  // 변환 결과가 바뀌면 연습/듣기용 문장 목록도 새로 만들어요
  state.sentences = splitSentences(c.converted);
  practiceIndex = -1;
  show($('result'), true);
  show($('demoBanner'), c.demo);
  show($('resultLowWarn'), c.confidence === 'low');
  $('resultName').textContent = '· ' + c.name;
  $('originalView').textContent = c.original || '';

  // 바뀐 부분을 <mark>로 감싸서 보여주기
  var view = $('convertedView');
  view.innerHTML = '';
  var pos = 0;
  findHighlights(c.converted, c.changes).forEach(function (r) {
    if (r.start > pos) view.appendChild(document.createTextNode(c.converted.slice(pos, r.start)));
    var m = el('mark', 'change', c.converted.slice(r.start, r.end));
    m.tabIndex = 0;
    m.dataset.from = r.change.from || '';
    m.dataset.to = r.change.to || '';
    m.dataset.rule = r.change.rule || '';
    m.setAttribute('aria-label', (r.change.from || '') + ' → ' + (r.change.to || '') + (r.change.rule ? ', ' + r.change.rule : ''));
    view.appendChild(m);
    pos = r.end;
  });
  if (pos < c.converted.length) view.appendChild(document.createTextNode(c.converted.slice(pos)));

  // 바뀐 곳 목록 (터치 화면에서도 설명을 볼 수 있게)
  var ul = $('changesList');
  ul.innerHTML = '';
  c.changes.forEach(function (ch) {
    var li = el('li');
    li.appendChild(el('strong', null, (ch.from || '') + ' → ' + (ch.to || '')));
    if (ch.rule) li.appendChild(el('div', 'muted small', ch.rule));
    ul.appendChild(li);
  });
  $('changesCount').textContent = '(' + c.changes.length + '곳)';
  show($('changesBox'), c.changes.length > 0);

  var tips = c.tips || {};
  fillList($('tipsIntonation'), tips.intonation, '억양 팁이 없어요.');
  fillList($('tipsPronunciation'), tips.pronunciation, '발음 팁이 없어요.');
  fillList($('notesList'), c.notes, '');
  show($('notesBox'), c.notes.length > 0);
}

/* 바뀐 부분 설명 말풍선 */
function initTooltip() {
  var tip = $('tooltip');
  var view = $('convertedView');

  function open(mark) {
    tip.innerHTML = '';
    tip.appendChild(el('b', null, mark.dataset.from + ' → ' + mark.dataset.to));
    if (mark.dataset.rule) tip.appendChild(document.createTextNode(mark.dataset.rule));
    tip.hidden = false;
    var r = mark.getBoundingClientRect();
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    var left = Math.max(8, Math.min(window.innerWidth - tw - 8, r.left + r.width / 2 - tw / 2));
    var top = r.top - th - 8;
    if (top < 8) top = r.bottom + 8; // 위에 자리가 없으면 아래에
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }
  function close() { tip.hidden = true; }

  view.addEventListener('mouseover', function (e) { var m = e.target.closest('mark.change'); if (m) open(m); });
  view.addEventListener('mouseout', function (e) { if (e.target.closest('mark.change')) close(); });
  view.addEventListener('focusin', function (e) { var m = e.target.closest('mark.change'); if (m) open(m); });
  view.addEventListener('focusout', close);
  view.addEventListener('click', function (e) { var m = e.target.closest('mark.change'); if (m) open(m); }); // 폰에서 누르면 보이기
  document.addEventListener('click', function (e) { if (!e.target.closest('mark.change')) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  window.addEventListener('scroll', close, true);
}

/* 복사 */
async function copyConverted() {
  var c = state.conversion;
  if (!c) return;
  var status = $('copyStatus');
  try {
    await navigator.clipboard.writeText(c.converted);
    status.textContent = '복사했어요!';
  } catch (e) {
    // 클립보드 기능이 막힌 경우: 임시 입력칸을 이용한 옛 방식
    try {
      var ta = document.createElement('textarea');
      ta.value = c.converted;
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      status.textContent = ok ? '복사했어요!' : '복사하지 못했어요. 대본을 직접 드래그해서 복사해 주세요.';
    } catch (e2) {
      status.textContent = '복사하지 못했어요. 대본을 직접 드래그해서 복사해 주세요.';
    }
  }
  setTimeout(function () { status.textContent = ''; }, 3000);
}

/* ---------- 문장 선택 (연습 탭) ---------- */
var practiceIndex = -1; // -1 = 전체, 0.. = 문장 번호

function targetText() {
  if (!state.conversion) return '';
  return practiceIndex < 0 ? state.sentences.join(' ') : (state.sentences[practiceIndex] || '');
}

function renderPractice() {
  var c = state.conversion;
  show($('practiceEmpty'), !c);
  show($('practiceBody'), !!c);
  if (!c) return;
  show($('sttUnsupported'), !SpeechRec);
  $('micBtn').disabled = !SpeechRec;
  if (practiceIndex >= state.sentences.length) practiceIndex = -1;

  var box = $('sentencePicker');
  box.innerHTML = '';
  function addPick(label, idx, num) {
    var b = el('button', 'pick');
    b.type = 'button';
    b.setAttribute('aria-pressed', idx === practiceIndex ? 'true' : 'false');
    if (num) b.appendChild(el('span', 'num', num));
    b.appendChild(document.createTextNode(label));
    b.addEventListener('click', function () {
      stopListening();
      practiceIndex = idx;
      resetScore();
      renderPractice();
    });
    box.appendChild(b);
  }
  addPick('전체 (처음부터 끝까지)', -1, '');
  state.sentences.forEach(function (s, i) { addPick(s, i, (i + 1) + '.'); });
  $('practiceTarget').textContent = targetText();
}

/* ---------- ② 연습: 음성인식 ---------- */
var SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition || null;
var recognizer = null;
var listening = false;
var heardText = '';
var recError = '';

function resetScore() {
  show($('scoreBox'), false);
  show($('micError'), false);
  $('micStatus').textContent = '';
  heardText = '';
}

function showMicError(msg) {
  var box = $('micError');
  box.textContent = msg;
  show(box, true);
}

function setMicUi(on) {
  var b = $('micBtn');
  b.classList.toggle('recording', on);
  b.textContent = on ? '■ 멈추고 채점하기' : '🎤 말하기 시작';
  b.setAttribute('aria-label', on ? '음성인식 멈추고 채점하기' : '음성인식 시작');
}

function startListening() {
  if (!SpeechRec || !state.conversion) return;
  resetScore();
  recError = '';
  heardText = '';
  var rec = new SpeechRec();
  rec.lang = speechLangFor(state.conversion.code, state.conversion.language);
  rec.interimResults = true;
  rec.continuous = true;
  rec.maxAlternatives = 1;

  rec.onresult = function (e) {
    // 지금까지 받아 적은 것 전체를 다시 이어 붙여요 (확정된 것 + 아직 확정 안 된 것)
    var text = '';
    for (var i = 0; i < e.results.length; i++) text += e.results[i][0].transcript + ' ';
    heardText = text.trim();
    $('micStatus').textContent = '듣는 중… ' + heardText;
  };
  rec.onerror = function (e) {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      recError = '마이크 사용이 막혀 있어요. 주소창 왼쪽 자물쇠 아이콘을 눌러 마이크를 "허용"으로 바꾼 뒤 다시 시도해 주세요.';
    } else if (e.error === 'no-speech') {
      recError = '목소리가 들리지 않았어요. 마이크 가까이에서 다시 말해 보세요.';
    } else if (e.error === 'audio-capture') {
      recError = '마이크를 찾지 못했어요. 마이크가 연결돼 있는지 확인해 주세요.';
    } else if (e.error === 'network') {
      recError = '음성인식 서비스에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.';
    } else if (e.error !== 'aborted') {
      recError = '음성인식 중 문제가 생겼어요. (' + e.error + ') 다시 시도해 주세요.';
    }
  };
  rec.onend = function () {
    listening = false;
    recognizer = null;
    setMicUi(false);
    $('micStatus').textContent = '';
    if (recError) { showMicError(recError); return; }
    if (!heardText) { showMicError('목소리가 들리지 않았어요. 마이크 가까이에서 다시 말해 보세요.'); return; }
    renderScore();
  };

  try {
    rec.start();
    recognizer = rec;
    listening = true;
    setMicUi(true);
    $('micStatus').textContent = '듣는 중… 대본을 소리 내어 읽어 보세요.';
  } catch (e) {
    showMicError('음성인식을 시작하지 못했어요. 잠시 뒤 다시 눌러 주세요.');
  }
}

function stopListening() {
  if (recognizer) {
    try { recognizer.stop(); } catch (e) { /* 이미 멈춘 경우 */ }
  }
}

function renderScore() {
  var c = state.conversion;
  var lang = c.language;
  var r = compareSpeech(targetText(), heardText, lang);
  $('transcriptView').textContent = heardText;
  $('scoreNum').textContent = r.percent;
  var view = $('diffView');
  view.innerHTML = '';
  var gap = lang === 'en' ? ' ' : '';
  r.ops.forEach(function (op) {
    if (op.type === 'eq') {
      view.appendChild(el('span', 'd-eq', op.a + gap));
    } else if (op.type === 'sub') {
      var bad = el('span', 'd-bad', op.a + gap);
      bad.title = '말한 내용: ' + op.b;
      view.appendChild(bad);
      view.appendChild(el('span', 'd-extra', op.b + gap));
    } else if (op.type === 'del') {
      var miss = el('span', 'd-bad', op.a + gap);
      miss.title = '빠뜨린 부분';
      view.appendChild(miss);
    } else {
      view.appendChild(el('span', 'd-extra', op.b + gap));
    }
  });
  show($('scoreBox'), true);
  $('scoreBox').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ---------- ③ 듣고 따라하기: 소리 읽기 ---------- */
var synth = window.speechSynthesis || null;
var voices = [];
var playingIndex = -1;
var playToken = 0; // 반복 재생을 멈출 때 쓰는 번호표

function loadVoices() {
  if (!synth) return;
  voices = synth.getVoices() || [];
}

// 언어 코드에 딱 맞는 목소리 -> 같은 언어 계열 -> 없으면 null
function pickVoice(lang) {
  var low = lang.toLowerCase().replace('_', '-');
  var exact = voices.filter(function (v) { return v.lang.toLowerCase().replace('_', '-') === low; });
  if (exact.length) return { voice: exact[0], exact: true };
  var base = low.split('-')[0];
  var same = voices.filter(function (v) { return v.lang.toLowerCase().split(/[-_]/)[0] === base; });
  if (same.length) return { voice: same[0], exact: false };
  return { voice: null, exact: false };
}

function currentSpeed() {
  var r = document.querySelector('input[name="speed"]:checked');
  return r ? parseFloat(r.value) : 1;
}

function renderListen() {
  var c = state.conversion;
  show($('listenEmpty'), !c);
  show($('listenBody'), !!c);
  if (!c) return;
  show($('ttsUnsupported'), !synth);
  loadVoices();

  var lang = speechLangFor(c.code, c.language);
  var pv = pickVoice(lang);
  var info = $('voiceInfo');
  if (!synth) info.textContent = '';
  else if (pv.exact) info.textContent = '사용할 목소리: ' + pv.voice.name + ' (' + pv.voice.lang + ')';
  else if (pv.voice) info.textContent = '"' + lang + '" 목소리가 설치돼 있지 않아 "' + pv.voice.name + ' (' + pv.voice.lang + ')" 목소리로 대신 읽어요.';
  else info.textContent = '이 컴퓨터에서 쓸 수 있는 목소리를 찾지 못했어요. 목소리 목록이 늦게 올 수 있으니 잠시 뒤 다시 눌러 보세요.';

  var ol = $('listenList');
  ol.innerHTML = '';
  state.sentences.forEach(function (s, i) {
    var li = el('li', 'listen-item');
    li.id = 'listen-item-' + i;
    var b = el('button', 'btn btn-primary play-btn', '▶');
    b.type = 'button';
    b.setAttribute('aria-label', (i + 1) + '번 문장 재생');
    b.addEventListener('click', function () { speakSentence(i); });
    li.appendChild(b);
    li.appendChild(el('div', 'script-text', s));
    ol.appendChild(li);
  });
}

function markPlaying(idx) {
  playingIndex = idx;
  document.querySelectorAll('.listen-item').forEach(function (li, i) {
    li.classList.toggle('playing', i === idx);
  });
}

function speakSentence(i) {
  if (!synth || !state.conversion) return;
  synth.cancel();
  var token = ++playToken;
  var lang = speechLangFor(state.conversion.code, state.conversion.language);
  var text = state.sentences[i];

  function once() {
    var u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    var pv = pickVoice(lang);
    if (pv.voice) u.voice = pv.voice;
    u.rate = currentSpeed();
    u.onend = function () {
      if (token !== playToken) return; // 다른 문장을 눌렀거나 멈춤
      if ($('repeatToggle').checked) setTimeout(function () { if (token === playToken) once(); }, 400);
      else markPlaying(-1);
    };
    u.onerror = function () { if (token === playToken) markPlaying(-1); };
    synth.speak(u);
  }
  markPlaying(i);
  once();
}

function stopSpeaking() {
  playToken++;
  if (synth) synth.cancel();
  markPlaying(-1);
}

/* ---------- 시작 ---------- */
async function init() {
  initTabs();
  initTooltip();

  // 저장돼 있던 변환 결과 불러오기 (새로고침해도 ②③ 탭이 동작하도록)
  var saved = loadSaved();
  if (saved && saved.conversion && typeof saved.conversion.converted === 'string') {
    var sc = saved.conversion;
    sc.changes = Array.isArray(sc.changes) ? sc.changes : [];
    sc.notes = Array.isArray(sc.notes) ? sc.notes : [];
    sc.tips = sc.tips || { intonation: [], pronunciation: [] };
    state.conversion = sc;
  }

  $('sourceText').addEventListener('input', updateCharCount);
  $('langSelect').addEventListener('change', function () { fillRegions(); });
  $('regionSelect').addEventListener('change', function () { updateRegionInfo(); });
  $('convertBtn').addEventListener('click', doConvert);
  $('copyBtn').addEventListener('click', copyConverted);
  $('toPracticeBtn').addEventListener('click', function () { selectTab('practice', true); });
  $('micBtn').addEventListener('click', function () { if (listening) stopListening(); else startListening(); });
  $('stopBtn').addEventListener('click', stopSpeaking);
  if (synth) {
    loadVoices();
    synth.addEventListener('voiceschanged', function () {
      loadVoices();
      if (!$('panel-listen').hidden) renderListen();
    });
  }

  if (state.conversion) {
    $('sourceText').value = state.conversion.original || '';
    renderResult();
  }
  updateCharCount();

  // 서버 상태 확인 (키 안내) + 지역 목록
  api('/api/health').then(function (h) {
    show($('keyNotice'), h && h.hasKey === false);
  }).catch(function () { /* 아래 지역 목록 실패 때 안내해요 */ });

  try {
    var list = await api('/api/dialects');
    state.dialects = Array.isArray(list) ? list : [];
    if (saved && saved.language) $('langSelect').value = saved.language;
    fillRegions(saved && saved.code);
    if (!state.dialects.length) throw new Error('지역 목록이 비어 있어요. 서버 설정(dialects 폴더)을 확인해 주세요.');
  } catch (e) {
    var box = $('convertError');
    box.textContent = e.message;
    show(box, true);
    $('regionSelect').innerHTML = '';
    $('regionSelect').appendChild(el('option', null, '지역을 불러오지 못했어요'));
  }
}

init();
