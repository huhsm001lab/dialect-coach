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

/* =====================================================================
 * 억양(음높이) 계산용 순수 함수 모음
 *  - 화면(DOM)과 상관없는 계산만 모아 둬서 node로 따로 테스트할 수 있어요.
 *  - 흐름: 녹음 소리 -> detectPitchCurve(Hz 목록) -> medianFilter(들쭉날쭉 제거)
 *          -> toSemitones(말하는 사람의 중앙값 기준 반음 단위) -> trimCurve -> resampleCurve(100칸)
 *          -> feedbackLines(한 줄 피드백)
 * ===================================================================== */

var PITCH_MIN_HZ = 70;    // 사람 목소리 최저 범위
var PITCH_MAX_HZ = 500;   // 사람 목소리 최고 범위
var MIN_VOICED_FRAMES = 15; // 목소리가 있는 구간이 이보다 짧으면(약 0.15초) "너무 짧아요"
var END_CHANGE_ST = 1.5;  // 문장 끝 20%에서 이 반음 이상 오르내리면 "올림/내림"으로 봐요

// 소리 알갱이(샘플)를 약 16kHz로 줄이기 (계산량을 줄이려는 거예요). 몇 개씩 평균을 내요.
function downsampleSamples(samples, sampleRate, targetRate) {
  var f = Math.max(1, Math.floor(sampleRate / (targetRate || 16000)));
  if (f === 1) return { samples: samples, sampleRate: sampleRate };
  var n = Math.floor(samples.length / f);
  var out = new Float32Array(n);
  for (var i = 0; i < n; i++) {
    var s = 0;
    for (var k = 0; k < f; k++) s += samples[i * f + k];
    out[i] = s / f;
  }
  return { samples: out, sampleRate: sampleRate / f };
}

// 한 조각(프레임)의 음높이를 YIN 방식으로 찾기. 못 찾으면 null.
// x: 소리, s: 시작 위치, W: 조각 길이, work: 임시 배열(재사용)
function yinFrame(x, s, W, minLag, maxLag, sampleRate, thresh, work) {
  var d = work;
  var tau, j, diff, sum;
  // 1) 자기 자신을 tau만큼 밀어서 뺀 차이의 제곱합
  for (tau = 1; tau <= maxLag; tau++) {
    sum = 0;
    for (j = 0; j < W; j++) { diff = x[s + j] - x[s + j + tau]; sum += diff * diff; }
    d[tau] = sum;
  }
  // 2) 누적 평균으로 정규화 (YIN의 핵심)
  var run = 0;
  d[0] = 1;
  for (tau = 1; tau <= maxLag; tau++) {
    run += d[tau];
    d[tau] = run > 0 ? d[tau] * tau / run : 1;
  }
  // 3) 기준값 아래로 처음 내려가는 골짜기 찾기
  var best = -1;
  for (tau = minLag; tau < maxLag; tau++) {
    if (d[tau] < thresh) {
      while (tau + 1 < maxLag && d[tau + 1] < d[tau]) tau++;
      best = tau;
      break;
    }
  }
  if (best < 0) return null;
  // 4) 정수 사이 값을 포물선으로 보정
  var shift = 0;
  if (best > 1 && best < maxLag) {
    var a = d[best - 1], b = d[best], c = d[best + 1];
    var den = a - 2 * b + c;
    if (den !== 0) shift = Math.max(-1, Math.min(1, 0.5 * (a - c) / den));
  }
  var hz = sampleRate / (best + shift);
  return (hz >= PITCH_MIN_HZ && hz <= PITCH_MAX_HZ) ? hz : null;
}

// 소리 전체의 음높이 곡선: 10ms마다 한 값(Hz). 조용하거나 못 찾은 곳은 null.
function detectPitchCurve(samples, sampleRate, opts) {
  opts = opts || {};
  var minHz = opts.minHz || PITCH_MIN_HZ, maxHz = opts.maxHz || PITCH_MAX_HZ;
  var thresh = opts.threshold || 0.2;
  var ds = downsampleSamples(samples, sampleRate, opts.targetRate || 16000);
  var x = ds.samples, sr = ds.sampleRate;
  var frame = Math.round(sr * 0.04);   // 조각 길이 약 40ms
  var hop = Math.round(sr * 0.01);     // 10ms씩 이동
  var minLag = Math.max(2, Math.floor(sr / maxHz));
  var maxLag = Math.ceil(sr / minHz);
  var need = frame + maxLag;
  var starts = [], rmsList = [], maxRms = 0, s, j;
  for (s = 0; s + need <= x.length; s += hop) {
    var e = 0;
    for (j = 0; j < frame; j++) e += x[s + j] * x[s + j];
    var rms = Math.sqrt(e / frame);
    starts.push(s); rmsList.push(rms);
    if (rms > maxRms) maxRms = rms;
  }
  // 조용함 기준: 절대값 0.01 과 "가장 큰 소리의 10%" 중 큰 쪽
  var silence = Math.max(opts.minRms || 0.01, 0.1 * maxRms);
  var work = new Float32Array(maxLag + 1);
  var curve = [];
  for (var i = 0; i < starts.length; i++) {
    curve.push(rmsList[i] < silence ? null : yinFrame(x, starts[i], frame, minLag, maxLag, sr, thresh, work));
  }
  return curve;
}

function medianOf(values) {
  var a = values.slice().sort(function (p, q) { return p - q; });
  var n = a.length;
  if (!n) return null;
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
}

// 가벼운 평탄화: 앞뒤 size칸의 중앙값. 원래 null인 칸은 null 그대로.
function medianFilter(curve, size) {
  size = size || 5;
  var half = Math.floor(size / 2);
  return curve.map(function (v, i) {
    if (v == null) return null;
    var win = [];
    for (var k = i - half; k <= i + half; k++) if (k >= 0 && k < curve.length && curve[k] != null) win.push(curve[k]);
    return medianOf(win);
  });
}

// Hz -> "그 사람 중앙값보다 몇 반음 높은가" (남녀 목소리를 같은 눈금에서 비교하려고)
function toSemitones(curveHz) {
  var voiced = curveHz.filter(function (v) { return v != null && v > 0; });
  var med = medianOf(voiced);
  return curveHz.map(function (v) {
    return (v == null || v <= 0 || med == null) ? null : 12 * Math.log(v / med) / Math.LN2;
  });
}

// 앞뒤의 null(무음)을 잘라내기
function trimCurve(curve) {
  var a = 0, b = curve.length - 1;
  while (a <= b && curve[a] == null) a++;
  while (b >= a && curve[b] == null) b--;
  return curve.slice(a, b + 1);
}

function countVoiced(curve) {
  return curve.filter(function (v) { return v != null; }).length;
}

// 길이가 다른 곡선을 같은 칸 수(n)로 맞추기 (시간을 0~100%로 정규화). 이웃 둘 다 값이 있을 때만 이어 줘요.
function resampleCurve(curve, n) {
  n = n || 100;
  var out = [];
  var len = curve.length;
  if (!len) { for (var z = 0; z < n; z++) out.push(null); return out; }
  for (var i = 0; i < n; i++) {
    var p = n === 1 ? 0 : i / (n - 1) * (len - 1);
    var lo = Math.floor(p), hi = Math.min(len - 1, Math.ceil(p));
    var a = curve[lo], b = curve[hi];
    if (a != null && b != null) out.push(a + (b - a) * (p - lo));
    else if (a != null && p - lo < 0.5) out.push(a);
    else if (b != null && hi - p < 0.5) out.push(b);
    else out.push(null);
  }
  return out;
}

// 소리 -> 다듬어진 반음 곡선 한 번에 (녹음/기준 음성 모두 이 함수를 써요)
function buildPitchContour(samples, sampleRate) {
  var hz = detectPitchCurve(samples, sampleRate);
  var semis = trimCurve(toSemitones(medianFilter(hz, 5)));
  return { semis: semis, voicedFrames: countVoiced(semis), totalFrames: hz.length };
}

// 곡선의 마지막 20% 구간에서 반음이 얼마나 변했나 (최소제곱 직선의 기울기 x 구간 길이). 값이 모자라면 null.
function endChange(curve) {
  var n = curve.length;
  var from = Math.floor(n * 0.8);
  var xs = [], ys = [];
  for (var i = from; i < n; i++) if (curve[i] != null) { xs.push(i); ys.push(curve[i]); }
  if (xs.length < 4) return null;
  var mx = 0, my = 0, k;
  for (k = 0; k < xs.length; k++) { mx += xs[k]; my += ys[k]; }
  mx /= xs.length; my /= xs.length;
  var num = 0, den = 0;
  for (k = 0; k < xs.length; k++) { num += (xs[k] - mx) * (ys[k] - my); den += (xs[k] - mx) * (xs[k] - mx); }
  if (den === 0) return null;
  return num / den * (xs[xs.length - 1] - xs[0]);
}

function classifyEnd(change) {
  if (change == null) return null;
  if (change > END_CHANGE_ST) return 'rise';
  if (change < -END_CHANGE_ST) return 'fall';
  return 'level';
}

// 높낮이 폭: 10% ~ 90% 구간의 반음 차이
function rangeOfCurve(curve) {
  var v = curve.filter(function (x) { return x != null; }).sort(function (a, b) { return a - b; });
  if (v.length < 4) return null;
  var lo = v[Math.floor((v.length - 1) * 0.1)], hi = v[Math.ceil((v.length - 1) * 0.9)];
  return hi - lo;
}

var END_WORD = { rise: '올려요', fall: '내려요', level: '평평하게 끝내요' };
var END_MINE = { rise: '끝을 올렸어요', fall: '끝을 내렸어요', level: '끝을 평평하게 말했어요' };

// 한국어 피드백 문장 만들기. user/ref는 resampleCurve 결과(반음). ref가 없으면 내 곡선 설명만.
function feedbackLines(user, ref) {
  var lines = [];
  var ue = classifyEnd(endChange(user));
  var re = ref ? classifyEnd(endChange(ref)) : null;
  var ur = rangeOfCurve(user), rr = ref ? rangeOfCurve(ref) : null;

  if (ue) {
    if (re && re !== ue) lines.push(END_MINE[ue] + ' — 기준은 ' + END_WORD[re]);
    else if (re) lines.push('문장 끝 흐름이 기준과 비슷해요 (' + END_MINE[ue] + ')');
    else lines.push(END_MINE[ue]);
  } else {
    lines.push('문장 끝 부분의 소리가 짧아서 끝 흐름은 판단하지 못했어요.');
  }

  if (ur != null && rr != null) {
    var both = ' (내 폭 ' + ur.toFixed(1) + '반음, 기준 ' + rr.toFixed(1) + '반음)';
    if (ur < rr * 0.7) lines.push('기준보다 높낮이 폭이 좁아요' + both);
    else if (ur > rr * 1.4) lines.push('기준보다 높낮이 폭이 넓어요' + both);
    else lines.push('높낮이 폭이 기준과 비슷해요' + both);
  } else if (ur != null) {
    lines.push('내 높낮이 폭은 약 ' + ur.toFixed(1) + '반음이에요.');
  }
  return lines;
}

// 서버가 준 억양 악보 데이터를 화면에 쓰기 안전한 모양으로 정리 (이상한 값은 기본값으로)
function normalizeProsody(data) {
  var out = { sentences: [], notes: [] };
  if (!data || typeof data !== 'object') return out;
  if (Array.isArray(data.notes)) out.notes = data.notes.filter(function (n) { return typeof n === 'string' && n; });
  var ENDS = ['rise', 'fall', 'level', 'rise-fall'];
  (Array.isArray(data.sentences) ? data.sentences : []).forEach(function (s) {
    if (!s || typeof s !== 'object') return;
    var units = (Array.isArray(s.units) ? s.units : []).filter(function (u) { return u && typeof u.t === 'string' && u.t; }).map(function (u) {
      return { t: u.t, pitch: (u.pitch === 'H' || u.pitch === 'L') ? u.pitch : 'M', stress: !!u.stress, pause_after: !!u.pause_after };
    });
    out.sentences.push({
      text: typeof s.text === 'string' ? s.text : units.map(function (u) { return u.t; }).join(' '),
      units: units,
      ending: ENDS.indexOf(s.ending) >= 0 ? s.ending : null,
      tip: typeof s.tip === 'string' ? s.tip : ''
    });
  });
  return out;
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
  sentences: [],       // 변환된 대본을 문장으로 자른 것
  health: null,        // /api/health 결과 (AI 음성 사용 가능 여부 등)
  prosody: null        // AI 억양 악보 결과 { code, converted, data } (변환이 바뀌면 버려요)
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

/* ---------- 소개 페이지와 연습실(방) ---------- */
// 첫 페이지(소개)에서 저장소 안의 서비스("사투리 코치" 또는 "대본 분석 스튜디오")를 골라 들어가요.
// - 주소 끝에 #dialect 또는 #analyze 를 붙이면 그 방으로 바로 열려요 (다른 서비스에서 바로가기 링크로 쓰기 좋아요).
// - 같은 탭에서 새로고침하면 들어가 있던 방이 그대로 보여요. 탭을 닫고 다시 열면 소개부터 나와요.
var ROOM_KEY = 'dialectCoach.room';
var ROOMS = {
  dialect: { name: '사투리 코치', tabs: ['convert', 'practice', 'listen'], other: 'analyze' },
  analyze: { name: '대본 분석 스튜디오', tabs: ['analyze'], other: 'dialect' }
};
var currentRoom = 'dialect';

function roomTabs() { return ROOMS[currentRoom].tabs; }

function showIntro(on) {
  document.body.classList.toggle('show-intro', on);
  $('intro').hidden = !on;
  window.scrollTo(0, 0);
  if (on) {
    try { sessionStorage.removeItem(ROOM_KEY); } catch (e) { /* 무시 */ }
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    var first = document.querySelector('.room-card');
    if (first) first.focus({ preventScroll: true });
  }
}

function enterRoom(room) {
  if (!ROOMS[room]) room = 'dialect';
  currentRoom = room;
  var r = ROOMS[room];
  document.body.setAttribute('data-room', room);
  $('roomName').textContent = r.name;
  $('roomSwitch').textContent = ROOMS[r.other].name + ' →';
  // 이 방의 탭만 보이게 (탭이 하나뿐이면 탭 줄 자체를 숨겨요)
  TAB_IDS.forEach(function (id) { $('tab-' + id).hidden = r.tabs.indexOf(id) === -1; });
  $('tabList').hidden = r.tabs.length < 2;
  try { sessionStorage.setItem(ROOM_KEY, room); } catch (e) { /* 무시 */ }
  if (location.hash !== '#' + room) history.replaceState(null, '', '#' + room);
  showIntro(false);
  selectTab(r.tabs[0], false);
  var focusEl = room === 'analyze' ? document.querySelector('#panel-analyze textarea') : $('sourceText');
  if (focusEl) focusEl.focus();
}

function roomFromHash() {
  var h = (location.hash || '').replace('#', '');
  return ROOMS[h] ? h : null;
}

function initIntro() {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; // 새로고침해도 맨 위부터 보이게
  document.querySelectorAll('[data-room]').forEach(function (btn) {
    btn.addEventListener('click', function () { enterRoom(btn.getAttribute('data-room')); });
  });
  $('introOpen').addEventListener('click', function () { showIntro(true); });
  $('roomSwitch').addEventListener('click', function () { enterRoom(ROOMS[currentRoom].other); });
  window.addEventListener('hashchange', function () { var r = roomFromHash(); if (r && r !== currentRoom) enterRoom(r); });

  var saved = null;
  try { saved = sessionStorage.getItem(ROOM_KEY); } catch (e) { /* 저장 막힘 */ }
  var start = roomFromHash() || (ROOMS[saved] ? saved : null);
  if (start) enterRoom(start); else showIntro(true);
}

/* ---------- 탭 ---------- */
var TAB_IDS = ['convert', 'practice', 'listen', 'analyze'];

function selectTab(name, focus) {
  stopListening();
  stopSpeaking();
  cancelRecording();
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
  TAB_IDS.forEach(function (id) {
    var tab = $('tab-' + id);
    tab.addEventListener('click', function () { selectTab(id, false); });
    tab.addEventListener('keydown', function (e) {
      var list = roomTabs(); // 지금 들어와 있는 방의 탭들 안에서만 이동
      var idx = list.indexOf(id);
      var next = null;
      if (e.key === 'ArrowRight') next = (idx + 1) % list.length;
      else if (e.key === 'ArrowLeft') next = (idx + list.length - 1) % list.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = list.length - 1;
      if (next !== null) { e.preventDefault(); selectTab(list[next], true); }
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
  applyMode(); // 언어에 맞게 버튼 문구(사투리로 바꾸기 / 번역하기) 맞추기
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

/* ---------- 언어별 문구: 한국어는 "사투리로 바꾸기", 영어·중국어는 "번역하기" ---------- */
function modeFor(language) {
  if (language === 'en' || language === 'zh') {
    return {
      btn: '번역하기',
      busy: '번역하는 중…',
      title: '번역 대본',
      hint: '(한국어로 넣으면 현지 회화체로 번역해요)',
      placeholder: '여기에 한국어 독백(대사)을 붙여넣어 주세요. 영화 대사처럼 자연스러운 회화체로 번역해요.'
    };
  }
  return {
    btn: '사투리로 바꾸기',
    busy: '바꾸는 중…',
    title: '사투리 대본',
    hint: '(표준어로 쓴 글)',
    placeholder: '여기에 독백(대사)을 붙여넣어 주세요. 표준어로 쓴 글이면 돼요.'
  };
}
function applyMode() {
  var m = modeFor($('langSelect').value);
  if (!converting) $('convertBtn').textContent = m.btn;
  $('sourceText').placeholder = m.placeholder;
  $('modeHint').textContent = m.hint;
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
  $('convertBtn').textContent = modeFor($('langSelect').value).busy;
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
    $('convertBtn').textContent = modeFor($('langSelect').value).btn;
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
  invalidateProsodyIfStale(); // 대본이 바뀌었으면 예전 억양 악보/그래프를 버려요
  show($('result'), true);
  show($('demoBanner'), c.demo);
  show($('resultLowWarn'), c.confidence === 'low');
  $('resultName').textContent = '· ' + c.name;
  $('resultTitle').textContent = modeFor(c.language).title;
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

/* ---------- ③ 듣고 따라하기 ---------- */
var synth = window.speechSynthesis || null;
var voices = [];
var playingIndex = -1;
var playToken = 0; // 반복 재생을 멈출 때 쓰는 번호표

var aiAudio = null;            // 지금 재생 중인 AI 음성 (HTMLAudioElement)
var ttsCache = new Map();      // "코드|문장" -> { blob, url }  (같은 문장은 다시 요청하지 않아요: 요청마다 돈이 들어요)
var ttsPending = new Map();    // 지금 만드는 중인 요청 (같은 문장을 동시에 두 번 요청하지 않게)
var listenRefs = [];           // 문장 줄마다 버튼/자리 모음
var graphResults = {};         // 문장 번호 -> { user, ref, refNote } (억양 그래프 결과)
var engineChosen = false;      // 사용자가 직접 음성 종류를 골랐는지
var PROSODY_KEY = 'dialectCoach.prosody.v1';
var REC_MAX_SEC = 15;

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

function currentEngine() {
  var r = document.querySelector('input[name="engine"]:checked');
  return r ? r.value : 'browser';
}

/* --- 음성 종류(AI / 브라우저) 선택 --- */
// 서버 /api/health 결과에 따라 AI 음성 선택 가능 여부를 정해요
function applyHealth(h) {
  state.health = h || null;
  var ai = document.querySelector('input[name="engine"][value="ai"]');
  var br = document.querySelector('input[name="engine"][value="browser"]');
  var ok = !!(h && h.tts);
  ai.disabled = !ok;
  var reason = $('engineReason');
  if (ok) reason.textContent = 'AI 음성은 처음 만들 때 몇 초 걸리고, 한 번 만든 문장은 다시 만들지 않아요.';
  else if (!h) reason.textContent = '서버에 연결하지 못해서 AI 음성을 쓸 수 없어요.';
  else if (!h.hasKey) reason.textContent = 'AI 음성은 데모 모드(키 없음)에서는 쓸 수 없어요.';
  else reason.textContent = 'ChatGPT 키가 있어야 해요. (지금 연결된 AI로는 AI 음성을 만들 수 없어요.)';
  if (ok && !engineChosen) ai.checked = true;
  if (!ok) br.checked = true;
  updateEngineUi();
}

function updateEngineUi() {
  var eng = currentEngine();
  show($('ttsUnsupported'), !synth && eng === 'browser');
  show($('browserNote'), eng === 'browser');
  var info = $('voiceInfo');
  var c = state.conversion;
  if (eng !== 'browser' || !c || !synth) { info.textContent = ''; return; }
  var lang = speechLangFor(c.code, c.language);
  var pv = pickVoice(lang);
  if (pv.exact) info.textContent = '사용할 목소리: ' + pv.voice.name + ' (' + pv.voice.lang + ')';
  else if (pv.voice) info.textContent = '"' + lang + '" 목소리가 설치돼 있지 않아 "' + pv.voice.name + ' (' + pv.voice.lang + ')" 목소리로 대신 읽어요.';
  else info.textContent = '이 컴퓨터에서 쓸 수 있는 목소리를 찾지 못했어요. 목소리 목록이 늦게 올 수 있으니 잠시 뒤 다시 눌러 보세요.';
}

function showAiMsg(msg) {
  var box = $('aiMsg');
  box.textContent = msg || '';
  show(box, !!msg);
}

/* --- 문장 목록 그리기 --- */
function renderListen() {
  var c = state.conversion;
  show($('listenEmpty'), !c);
  show($('listenBody'), !!c);
  if (!c) return;
  loadVoices();
  updateEngineUi();
  showAiMsg('');

  var ol = $('listenList');
  ol.innerHTML = '';
  listenRefs = [];
  state.sentences.forEach(function (s, i) {
    var li = el('li', 'listen-item');
    li.id = 'listen-item-' + i;

    var row = el('div', 'listen-row');
    var b = el('button', 'btn btn-primary play-btn', '▶');
    b.type = 'button';
    b.setAttribute('aria-label', (i + 1) + '번 문장 재생');
    b.addEventListener('click', function () { playSentence(i); });
    row.appendChild(b);

    var r = el('button', 'btn rec-btn', '🎤 따라 말하기');
    r.type = 'button';
    r.setAttribute('aria-label', (i + 1) + '번 문장 따라 말하기 (녹음 시작)');
    r.addEventListener('click', function () { toggleRecord(i); });
    row.appendChild(r);

    row.appendChild(el('div', 'script-text', s));
    li.appendChild(row);

    var pros = el('div', 'pros-slot');
    var status = el('p', 'rec-status small muted');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    var graph = el('div', 'graph-slot');
    li.appendChild(pros);
    li.appendChild(status);
    li.appendChild(graph);
    ol.appendChild(li);
    listenRefs[i] = { li: li, play: b, rec: r, pros: pros, status: status, graph: graph };
    if (graphResults[i]) renderGraph(i);
  });
  updateProsodyView();
  refreshProsodyBtn();
}

function markPlaying(idx) {
  playingIndex = idx;
  document.querySelectorAll('.listen-item').forEach(function (li, i) {
    li.classList.toggle('playing', i === idx);
  });
}

// ▶ 버튼: 고른 음성 종류로 재생
function playSentence(i) {
  if (!state.conversion || recState.active) return;
  showAiMsg('');
  if (currentEngine() === 'ai') playAiSentence(i);
  else {
    if (!synth) { showAiMsg('이 브라우저는 소리 읽기를 지원하지 않아요. Chrome 브라우저에서 열어 주세요.'); return; }
    speakSentence(i);
  }
}

/* --- 브라우저 기본 음성 --- */
function speakSentence(i) {
  if (!synth || !state.conversion) return;
  stopSpeaking();
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

/* --- AI 음성 --- */
function ttsKey(code, text) { return code + '|' + text; }

// 한 문장의 AI 음성 파일(Blob)을 가져와요. 이미 만든 건 저장해 둔 걸 그대로 돌려줘요.
async function getAiClip(text) {
  var c = state.conversion;
  var key = ttsKey(c.code, text);
  if (ttsCache.has(key)) return ttsCache.get(key);
  if (ttsPending.has(key)) return ttsPending.get(key);
  if (text.length > 600) throw new Error('문장이 너무 길어서(600자 넘음) AI 음성을 만들 수 없어요.');

  var p = (async function () {
    var tips = ((c.tips && c.tips.intonation) || []).filter(function (t) { return typeof t === 'string'; }).slice(0, 8);
    var res;
    try {
      res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text, code: c.code, tips: tips })
      });
    } catch (e) {
      throw new Error(SERVER_OFF_MSG);
    }
    if (!res.ok) {
      var data = null;
      try { data = await res.json(); } catch (e) { /* JSON이 아닐 수 있어요 */ }
      throw new Error((data && data.error) || 'AI 음성을 만들지 못했어요. (오류 번호 ' + res.status + ') 잠시 뒤 다시 시도해 주세요.');
    }
    var blob = await res.blob();
    var entry = { blob: blob, url: URL.createObjectURL(blob) };
    ttsCache.set(key, entry);
    return entry;
  })();
  ttsPending.set(key, p);
  try { return await p; } finally { ttsPending.delete(key); }
}

// 버튼에 "만드는 중" 표시
function setPlayLoading(i, on) {
  var r = listenRefs[i];
  if (!r) return;
  r.play.disabled = on;
  r.play.classList.toggle('loading', on);
  r.play.textContent = on ? '…' : '▶';
  if (on) r.play.setAttribute('aria-busy', 'true'); else r.play.removeAttribute('aria-busy');
  r.status.textContent = on ? 'AI 음성을 만드는 중이에요… (몇 초 걸려요)' : '';
}

async function playAiSentence(i) {
  stopSpeaking();
  var token = ++playToken;
  var text = state.sentences[i];
  markPlaying(i);
  setPlayLoading(i, true);
  var clip;
  try {
    clip = await getAiClip(text);
  } catch (e) {
    setPlayLoading(i, false);
    if (token === playToken) { markPlaying(-1); showAiMsg(e.message); }
    return;
  }
  setPlayLoading(i, false);
  if (token !== playToken) return; // 기다리는 동안 멈춤/다른 문장을 눌렀어요

  function once() {
    var a = new Audio(clip.url);
    // 느리게 들어도 목소리 높이가 변하지 않게
    a.preservesPitch = true; a.mozPreservesPitch = true; a.webkitPreservesPitch = true;
    a.defaultPlaybackRate = currentSpeed();
    a.playbackRate = currentSpeed();
    a.onended = function () {
      if (token !== playToken) return;
      if ($('repeatToggle').checked) setTimeout(function () { if (token === playToken) once(); }, 400);
      else { aiAudio = null; markPlaying(-1); }
    };
    a.onerror = function () {
      if (token !== playToken) return;
      markPlaying(-1);
      showAiMsg('AI 음성을 재생하지 못했어요. 다시 눌러 주세요.');
    };
    aiAudio = a;
    var pr = a.play();
    if (pr && pr.catch) pr.catch(function () {
      if (token !== playToken) return;
      markPlaying(-1);
      showAiMsg('브라우저가 소리 재생을 막았어요. ▶ 버튼을 한 번 더 눌러 주세요.');
    });
  }
  once();
}

// 멈춤 버튼: 브라우저 음성, AI 음성 둘 다 멈춰요
function stopSpeaking() {
  playToken++;
  if (synth) synth.cancel();
  if (aiAudio) {
    try { aiAudio.pause(); } catch (e) { /* 이미 멈춘 경우 */ }
    aiAudio = null;
  }
  markPlaying(-1);
}

/* =====================================================================
 * (A) 억양 악보 - AI 추정
 * ===================================================================== */
var END_ARROW = {
  'rise': ['↗', '끝을 올려요'],
  'fall': ['↘', '끝을 내려요'],
  'level': ['→', '평평하게 끝내요'],
  'rise-fall': ['↗↘', '올렸다가 내려요']
};
var PITCH_LABEL = { H: '높음', M: '중간', L: '낮음' };
var prosodyBusy = false;
var prosodyVisible = false;

function loadProsodySaved() {
  try {
    var raw = localStorage.getItem(PROSODY_KEY);
    var p = raw ? JSON.parse(raw) : null;
    if (p && typeof p.code === 'string' && typeof p.converted === 'string' && p.data) return p;
  } catch (e) { /* 저장된 게 없거나 막힌 경우 */ }
  return null;
}

function saveProsody() {
  try {
    if (state.prosody) localStorage.setItem(PROSODY_KEY, JSON.stringify(state.prosody));
    else localStorage.removeItem(PROSODY_KEY);
  } catch (e) { /* 저장이 안 돼도 괜찮아요 */ }
}

// 변환 결과가 바뀌면 예전 억양 악보와 그래프는 버려요
function invalidateProsodyIfStale() {
  var c = state.conversion;
  if (state.prosody && (!c || state.prosody.code !== c.code || state.prosody.converted !== c.converted)) {
    state.prosody = null;
    saveProsody();
  }
  prosodyVisible = false;
  graphResults = {};
}

function refreshProsodyBtn() {
  var b = $('prosodyBtn');
  if (!b) return;
  b.disabled = prosodyBusy;
  b.textContent = prosodyBusy ? '억양 분석 중…' : (prosodyVisible ? '억양 표시 숨기기' : '억양 표시 보기 (AI 추정)');
  if (prosodyBusy) b.setAttribute('aria-busy', 'true'); else b.removeAttribute('aria-busy');
}

async function onProsodyClick() {
  if (prosodyBusy || !state.conversion) return;
  var err = $('prosodyError');
  show(err, false);
  if (prosodyVisible) { prosodyVisible = false; updateProsodyView(); refreshProsodyBtn(); return; }
  if (state.prosody) { prosodyVisible = true; updateProsodyView(); refreshProsodyBtn(); return; }

  var c = state.conversion;
  prosodyBusy = true;
  refreshProsodyBtn();
  $('prosodyStatus').textContent = 'AI가 억양을 분석하는 중이에요… (최대 30초 걸려요)';
  try {
    var data = await api('/api/prosody', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: c.converted, code: c.code })
    });
    var norm = normalizeProsody(data);
    if (!norm.sentences.length) throw new Error('AI가 억양 정보를 주지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    // 분석하는 동안 대본이 바뀌었으면 결과를 버려요
    if (state.conversion !== c) return;
    state.prosody = { code: c.code, converted: c.converted, data: norm };
    saveProsody();
    prosodyVisible = true;
  } catch (e) {
    err.textContent = e.message;
    show(err, true);
  } finally {
    prosodyBusy = false;
    $('prosodyStatus').textContent = '';
    updateProsodyView();
    refreshProsodyBtn();
  }
}

var SVG_NS = 'http://www.w3.org/2000/svg';

// 문장 하나의 악보 만들기
function buildProsodyBlock(s) {
  var wrap = el('div', 'pros-sentence');
  var line = el('div', 'pros-line');
  line.setAttribute('role', 'group');
  line.setAttribute('aria-label', '억양 악보: ' + s.text);
  var svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'pros-svg');
  svg.setAttribute('aria-hidden', 'true');
  line.appendChild(svg);

  s.units.forEach(function (u) {
    var box = el('span', 'pros-unit pitch-' + u.pitch + (u.stress ? ' stress' : ''));
    box.appendChild(el('span', 'pros-t', u.t));
    if (u.pause_after) box.appendChild(el('span', 'pros-pause', '‖'));
    box.setAttribute('aria-label', u.t + ', 음 ' + PITCH_LABEL[u.pitch] + (u.stress ? ', 강조' : '') + (u.pause_after ? ', 뒤에 쉼' : ''));
    box.title = PITCH_LABEL[u.pitch] + (u.stress ? ' · 강조' : '') + (u.pause_after ? ' · 쉼' : '');
    box.dataset.pitch = u.pitch;
    line.appendChild(box);
  });
  if (!s.units.length) line.appendChild(el('span', 'muted small', s.text));
  wrap.appendChild(line);

  if (s.ending && END_ARROW[s.ending]) {
    var end = el('p', 'pros-end');
    var arrow = el('span', 'pros-arrow', END_ARROW[s.ending][0]);
    arrow.setAttribute('aria-hidden', 'true');
    end.appendChild(arrow);
    end.appendChild(document.createTextNode(' 끝 흐름: ' + END_ARROW[s.ending][1]));
    wrap.appendChild(end);
  }
  if (s.tip) wrap.appendChild(el('p', 'pros-tip small muted', s.tip));
  return wrap;
}

// 유닛 상자들을 이어 주는 선(SVG)을 그려요. 줄이 바뀌면 줄마다 따로 이어요.
function drawProsodyLine(line) {
  var svg = line.querySelector('.pros-svg');
  if (!svg || !line.isConnected) return;
  var lr = line.getBoundingClientRect();
  if (!lr.width) return;
  svg.setAttribute('width', lr.width);
  svg.setAttribute('height', lr.height);
  svg.setAttribute('viewBox', '0 0 ' + lr.width + ' ' + lr.height);
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  var rows = {};
  line.querySelectorAll('.pros-unit').forEach(function (u) {
    var r = u.getBoundingClientRect();
    var margin = parseFloat(getComputedStyle(u).marginTop) || 0;
    var rowKey = Math.round(r.top - margin - lr.top); // 같은 줄이면 같은 값
    (rows[rowKey] = rows[rowKey] || []).push((r.left + r.width / 2 - lr.left).toFixed(1) + ',' + (r.top + r.height / 2 - lr.top).toFixed(1));
  });
  Object.keys(rows).forEach(function (k) {
    if (rows[k].length < 2) return;
    var pl = document.createElementNS(SVG_NS, 'polyline');
    pl.setAttribute('points', rows[k].join(' '));
    svg.appendChild(pl);
  });
}

function redrawAllProsodyLines() {
  document.querySelectorAll('.pros-line').forEach(drawProsodyLine);
}

// 억양 악보 영역 전체를 현재 상태에 맞게 다시 채우기
function updateProsodyView() {
  var box = $('prosodyBox');
  if (!box) return;
  var p = state.prosody;
  var on = prosodyVisible && !!p;
  show(box, on);
  listenRefs.forEach(function (r) { r.pros.innerHTML = ''; });
  var list = $('prosodyList');
  list.innerHTML = '';
  if (!on) return;

  var data = p.data;
  fillList($('prosodyNotes'), data.notes, '');
  show($('prosodyNotesWrap'), data.notes.length > 0);

  var matched = data.sentences.length === state.sentences.length && listenRefs.length === state.sentences.length;
  $('prosodyWhere').textContent = matched
    ? '각 문장의 ▶ 줄 바로 아래에 악보가 있어요.'
    : 'AI가 문장을 나눈 방식이 달라서, 악보를 아래에 따로 모아 보여 드려요.';
  data.sentences.forEach(function (s, i) {
    var blk = buildProsodyBlock(s);
    if (matched) listenRefs[i].pros.appendChild(blk);
    else {
      var item = el('div', 'pros-item');
      item.appendChild(el('p', 'pros-num small muted', (i + 1) + '번'));
      item.appendChild(blk);
      list.appendChild(item);
    }
  });
  requestAnimationFrame(redrawAllProsodyLines);
}

/* =====================================================================
 * (B) 억양 그래프 - 실제 측정 (내 목소리 녹음 -> 음높이 곡선)
 * ===================================================================== */
var recState = { active: false, busy: false, index: -1, stream: null, recorder: null, chunks: [], timer: null, tick: null, cancelled: false, t0: 0 };
var audioCtx = null;

function getAudioCtx() {
  if (audioCtx) return audioCtx;
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  audioCtx = new AC();
  return audioCtx;
}

function decodeBlob(blob) {
  return blob.arrayBuffer().then(function (ab) {
    var ctx = getAudioCtx();
    if (!ctx) throw new Error('이 브라우저는 소리 분석을 지원하지 않아요. Chrome 브라우저에서 열어 주세요.');
    return new Promise(function (resolve, reject) { ctx.decodeAudioData(ab, resolve, reject); });
  });
}

function setRecUi(i, on) {
  listenRefs.forEach(function (r, idx) {
    var mine = idx === i;
    r.rec.classList.toggle('recording', on && mine);
    r.rec.textContent = (on && mine) ? '■ 녹음 중… 다시 누르면 끝' : '🎤 따라 말하기';
    r.rec.setAttribute('aria-label', (idx + 1) + '번 문장 ' + ((on && mine) ? '녹음 끝내기' : '따라 말하기 (녹음 시작)'));
    r.rec.disabled = on ? !mine : recState.busy;
    r.play.disabled = on || recState.busy;
  });
}

async function toggleRecord(i) {
  if (recState.busy) return;
  if (recState.active) {
    if (recState.index === i) stopRecording();
    return;
  }
  var r = listenRefs[i];
  showAiMsg('');
  if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    r.status.textContent = '이 주소에서는 마이크를 쓸 수 없어요. 마이크는 https 주소나 localhost 에서만 동작해요.';
    return;
  }
  if (typeof MediaRecorder === 'undefined') {
    r.status.textContent = '이 브라우저는 녹음을 지원하지 않아요. Chrome 브라우저에서 열어 주세요.';
    return;
  }
  stopSpeaking();
  stopListening(); // 음성인식(② 연습)과 동시에 쓰지 않아요
  var stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    var n = e && e.name;
    if (n === 'NotAllowedError' || n === 'SecurityError') r.status.textContent = '마이크 사용이 막혀 있어요. 주소창 왼쪽 자물쇠 아이콘을 눌러 마이크를 "허용"으로 바꾼 뒤 다시 시도해 주세요.';
    else if (n === 'NotFoundError' || n === 'OverconstrainedError') r.status.textContent = '마이크를 찾지 못했어요. 마이크가 연결돼 있는지 확인해 주세요.';
    else r.status.textContent = '마이크를 켜지 못했어요. 다른 프로그램이 마이크를 쓰고 있는지 확인해 주세요.';
    return;
  }
  var recorder;
  try { recorder = new MediaRecorder(stream); } catch (e) {
    stream.getTracks().forEach(function (t) { t.stop(); });
    r.status.textContent = '녹음을 시작하지 못했어요. 다른 브라우저로 시도해 주세요.';
    return;
  }
  recState.active = true; recState.index = i; recState.stream = stream; recState.recorder = recorder;
  recState.chunks = []; recState.cancelled = false; recState.t0 = Date.now();
  recorder.ondataavailable = function (ev) { if (ev.data && ev.data.size) recState.chunks.push(ev.data); };
  recorder.onstop = function () {
    stream.getTracks().forEach(function (t) { t.stop(); });
    clearTimeout(recState.timer); clearInterval(recState.tick);
    var idx = recState.index;
    var blob = new Blob(recState.chunks, { type: recorder.mimeType || 'audio/webm' });
    recState.active = false; recState.recorder = null; recState.stream = null;
    if (recState.cancelled) { recState.busy = false; setRecUi(-1, false); if (listenRefs[idx]) listenRefs[idx].status.textContent = ''; return; }
    analyzeRecording(idx, blob);
  };
  recorder.start();
  setRecUi(i, true);
  function tick() {
    var sec = Math.floor((Date.now() - recState.t0) / 1000);
    r.status.textContent = '녹음 중… 다시 누르면 끝 (' + sec + '초 / ' + REC_MAX_SEC + '초)';
  }
  tick();
  recState.tick = setInterval(tick, 1000);
  recState.timer = setTimeout(stopRecording, REC_MAX_SEC * 1000); // 15초가 되면 자동으로 끝내요
  r.rec.focus();
}

function stopRecording() {
  if (recState.recorder && recState.recorder.state !== 'inactive') {
    try { recState.recorder.stop(); } catch (e) { /* 이미 멈춘 경우 */ }
  }
}

// 탭을 옮기거나 새 대본이 오면 녹음을 버리고 끝내요
function cancelRecording() {
  recState.cancelled = true;
  if (recState.recorder && recState.recorder.state !== 'inactive') stopRecording();
  else {
    clearTimeout(recState.timer); clearInterval(recState.tick);
    recState.active = false;
  }
}

async function analyzeRecording(i, blob) {
  var r = listenRefs[i];
  var c = state.conversion;
  var text = state.sentences[i];
  recState.busy = true;
  setRecUi(-1, false);
  if (r) r.status.textContent = '내 목소리의 높낮이를 분석하는 중이에요…';
  try {
    var buf = await decodeBlob(blob);
    var user = buildPitchContour(buf.getChannelData(0), buf.sampleRate);
    if (user.voicedFrames < MIN_VOICED_FRAMES) {
      if (listenRefs[i]) listenRefs[i].status.textContent = '녹음이 너무 짧거나 소리가 작아서 높낮이를 읽지 못했어요. 마이크 가까이에서 문장을 끝까지 말해 보세요.';
      return;
    }
    // 기준 곡선: AI 음성을 쓸 수 있을 때만 (같은 문장은 저장해 둔 음성 재사용)
    var ref = null, refNote = '';
    if (state.health && state.health.tts) {
      if (listenRefs[i]) listenRefs[i].status.textContent = '기준이 될 AI 음성을 준비하는 중이에요…';
      try {
        var clip = await getAiClip(text);
        var rb = await decodeBlob(clip.blob);
        var rc = buildPitchContour(rb.getChannelData(0), rb.sampleRate);
        if (rc.voicedFrames >= MIN_VOICED_FRAMES) ref = resampleCurve(rc.semis, 100);
        else refNote = 'AI 음성에서 높낮이를 읽지 못해 내 곡선만 보여 드려요.';
      } catch (e) {
        refNote = 'AI 기준 음성을 가져오지 못해 내 곡선만 보여 드려요. (' + e.message + ')';
      }
    } else {
      refNote = 'AI 음성을 쓸 수 없는 상태라 내 곡선만 보여 드려요.';
    }
    if (state.conversion !== c) return; // 분석 중에 대본이 바뀜
    graphResults[i] = { user: resampleCurve(user.semis, 100), ref: ref, refNote: refNote };
    renderGraph(i);
    if (listenRefs[i]) listenRefs[i].status.textContent = '분석이 끝났어요. 아래 그래프를 확인하세요.';
  } catch (e) {
    if (listenRefs[i]) listenRefs[i].status.textContent = '녹음을 분석하지 못했어요. ' + (e && e.message && e.message.indexOf('지원') >= 0 ? e.message : '다시 녹음해 주세요.');
  } finally {
    recState.busy = false;
    setRecUi(-1, false);
  }
}

// 그래프 색은 style.css 의 변수에서 읽어요 (다크 모드 자동)
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

function drawCurves(canvas, user, ref) {
  var box = canvas.parentNode;
  var w = Math.max(240, Math.floor(box.clientWidth || 300));
  var h = 200;
  var dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  var ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  var padL = 8, padR = 8, padT = 10, padB = 22;
  var all = user.concat(ref || []).filter(function (v) { return v != null; });
  var lo = Math.min.apply(null, all.concat([-2])) - 1;
  var hi = Math.max.apply(null, all.concat([2])) + 1;
  if (hi - lo < 6) { var mid = (hi + lo) / 2; lo = mid - 3; hi = mid + 3; }
  function X(k) { return padL + k / 99 * (w - padL - padR); }
  function Y(v) { return padT + (hi - v) / (hi - lo) * (h - padT - padB); }

  ctx.font = '12px sans-serif';
  ctx.textBaseline = 'alphabetic';
  var muted = cssVar('--muted');
  // 가운데(0반음 = 내 평소 높이) 점선
  ctx.strokeStyle = cssVar('--border'); ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(padL, Y(0)); ctx.lineTo(w - padR, Y(0)); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeRect(padL + 0.5, padT + 0.5, w - padL - padR - 1, h - padT - padB - 1);
  ctx.fillStyle = muted;
  ctx.textAlign = 'left'; ctx.fillText('0%', padL, h - 6);
  ctx.textAlign = 'center'; ctx.fillText('문장 진행 (시간)', w / 2, h - 6);
  ctx.textAlign = 'right'; ctx.fillText('100%', w - padR, h - 6);
  ctx.textAlign = 'left'; ctx.fillText('높음', padL + 4, padT + 13);
  ctx.fillText('낮음', padL + 4, h - padB - 5);

  function line(curve, color, dash, width) {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    var pen = false;
    for (var k = 0; k < curve.length; k++) {
      if (curve[k] == null) { pen = false; continue; }
      if (!pen) { ctx.moveTo(X(k), Y(curve[k])); pen = true; } else ctx.lineTo(X(k), Y(curve[k]));
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (ref) line(ref, cssVar('--line-ref'), [7, 5], 2.5);   // 기준: 파란 점선
  line(user, cssVar('--line-user'), [], 3);                // 내 목소리: 붉은 실선
}

function renderGraph(i) {
  var r = listenRefs[i], g = graphResults[i];
  if (!r || !g) return;
  var box = r.graph;
  box.innerHTML = '';
  box.appendChild(el('h3', 'graph-title', '억양 그래프 (베타) · 실제 측정'));

  var legend = el('p', 'graph-legend small');
  if (g.ref) {
    var s1 = el('span', 'sw sw-ref', '┅ 기준(AI 음성)');
    legend.appendChild(s1);
  }
  legend.appendChild(el('span', 'sw sw-user', '━ 내 목소리'));
  box.appendChild(legend);

  var canvas = el('canvas', 'graph-canvas');
  canvas.setAttribute('role', 'img');
  var fb = feedbackLines(g.user, g.ref);
  canvas.setAttribute('aria-label', '억양 그래프. ' + fb.join(' '));
  box.appendChild(canvas);

  var ul = el('ul', 'graph-feedback');
  fb.forEach(function (t) { ul.appendChild(el('li', null, t)); });
  box.appendChild(ul);
  if (g.refNote) box.appendChild(el('p', 'small muted', g.refNote));
  box.appendChild(el('p', 'small muted', '기준이 AI 음성이면 AI 억양과 비교하는 거예요. 지역 출신자 녹음과 비교하는 게 가장 정확해요.'));
  canvas._draw = function () { drawCurves(canvas, g.user, g.ref); };
  canvas._draw();
}

function redrawAllGraphs() {
  document.querySelectorAll('.graph-canvas').forEach(function (cv) { if (cv._draw) cv._draw(); });
}

/* ---------- ④ 대본 분석: 순수 함수 (화면과 상관없이 계산만 해요) ---------- */
// AN_PURE_START
var AN_MAX = 20000;
var AN_KEY = 'dialectCoach.analysis.v1';

// 긴장도를 0~10 정수로 맞춰요 (이상한 값이 와도 차트가 깨지지 않게)
function clampTension(t) {
  var n = Math.round(Number(t));
  if (!isFinite(n)) n = 0;
  return Math.max(0, Math.min(10, n));
}

// 차트 좌표 계산: 장면 목록 -> 점 위치, 선/면 경로, 눈금
// (SVG 안의 좌표만 계산하는 순수 함수라서 node로도 시험할 수 있어요)
function chartGeometry(scenes) {
  var n = scenes.length;
  var H = 280, padL = 40, padR = 28, padT = 44, padB = 40;
  var step = n > 12 ? 56 : 0;                       // 12개 넘으면 장면당 56px 간격 (가로 스크롤)
  var W = n > 12 ? padL + padR + step * (n - 1) : 640;
  var innerW = W - padL - padR, innerH = H - padT - padB;
  var points = scenes.map(function (s, i) {
    var t = clampTension(s.tension);
    var x = n === 1 ? padL + innerW / 2 : padL + innerW * i / (n - 1);
    var y = padT + innerH * (1 - t / 10);
    return { x: x, y: y, t: t, no: s.no != null ? s.no : i + 1, label: String(i + 1), turn: s.turning_point === true };
  });
  var line = points.map(function (p, i) { return (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' ');
  var baseY = padT + innerH;
  var area = n ? line + ' L' + points[n - 1].x.toFixed(1) + ' ' + baseY + ' L' + points[0].x.toFixed(1) + ' ' + baseY + ' Z' : '';
  var ticks = [0, 5, 10].map(function (v) { return { v: v, y: padT + innerH * (1 - v / 10) }; });
  return { W: W, H: H, padL: padL, padR: padR, padT: padT, padB: padB, baseY: baseY,
           points: points, line: line, area: area, ticks: ticks, scroll: n > 12 };
}

// 점에 붙일 설명 문장 (aria-label, 말풍선 공용)
function pointLabel(s, i) {
  var no = s.no != null ? s.no : i + 1;
  return '장면 ' + no + ': ' + (s.title || '제목 없음') + ' · 긴장 ' + clampTension(s.tension) + '/10' +
    (s.emotion ? ' · ' + s.emotion : '') + (s.turning_point === true ? ' · 전환점' : '');
}

function asArr(v) { return Array.isArray(v) ? v : []; }
function asStr(v) { return v == null ? '' : String(v); }

// 서버 응답을 화면이 안전하게 쓸 수 있는 모양으로 정리해요 (빠진 칸은 빈 값)
function normalizeAnalysis(d) {
  d = d || {};
  var f = d.focus || {};
  return {
    title_guess: asStr(d.title_guess), logline: asStr(d.logline), genre_tone: asStr(d.genre_tone),
    themes: asArr(d.themes).map(asStr), structure: asStr(d.structure),
    scenes: asArr(d.scenes).map(function (s, i) {
      s = s || {};
      return { no: s.no != null ? s.no : i + 1, title: asStr(s.title), place_time: asStr(s.place_time),
        characters: asArr(s.characters).map(asStr), summary: asStr(s.summary),
        tension: clampTension(s.tension), emotion: asStr(s.emotion),
        turning_point: s.turning_point === true, start_quote: asStr(s.start_quote) };
    }),
    characters: asArr(d.characters).map(function (c) {
      c = c || {};
      return { name: asStr(c.name), description: asStr(c.description), want: asStr(c.want),
        obstacle: asStr(c.obstacle), arc: asStr(c.arc) };
    }),
    relationships: asArr(d.relationships).map(function (r) {
      r = r || {};
      return { a: asStr(r.a), b: asStr(r.b), relation: asStr(r.relation), change: asStr(r.change) };
    }),
    focus: {
      character: asStr(f.character), super_objective: asStr(f.super_objective),
      beats: asArr(f.beats).map(function (b) {
        b = b || {};
        return { scene_no: b.scene_no, objective: asStr(b.objective), action_verb: asStr(b.action_verb),
          emotion: asStr(b.emotion), subtext: asStr(b.subtext) };
      }),
      acting_tips: asArr(f.acting_tips).map(asStr)
    },
    notes: asArr(d.notes).map(asStr)
  };
}

// 복사용 일반 글 요약
function analysisToText(a) {
  var L = [];
  if (a.title_guess) L.push('[' + a.title_guess + ']');
  if (a.logline) L.push(a.logline);
  if (a.genre_tone) L.push('장르·분위기: ' + a.genre_tone);
  if (a.themes.length) L.push('주제: ' + a.themes.join(', '));
  if (a.structure) L.push('구조: ' + a.structure);
  if (a.scenes.length) {
    L.push('', '■ 장면 흐름');
    a.scenes.forEach(function (s) {
      L.push(s.no + '. ' + s.title + (s.place_time ? ' (' + s.place_time + ')' : '') +
        ' - 긴장 ' + s.tension + '/10' + (s.emotion ? ', ' + s.emotion : '') + (s.turning_point ? ' [전환점]' : ''));
      if (s.summary) L.push('   ' + s.summary);
    });
  }
  if (a.characters.length) {
    L.push('', '■ 인물');
    a.characters.forEach(function (c) {
      L.push('- ' + c.name + ': ' + c.description);
      if (c.want) L.push('   원하는 것: ' + c.want);
      if (c.obstacle) L.push('   가로막는 것: ' + c.obstacle);
      if (c.arc) L.push('   변화: ' + c.arc);
    });
  }
  if (a.relationships.length) {
    L.push('', '■ 관계');
    a.relationships.forEach(function (r) {
      L.push('- ' + r.a + ' ↔ ' + r.b + ' : ' + r.relation + (r.change ? ' (변화: ' + r.change + ')' : ''));
    });
  }
  var f = a.focus;
  if (f.character || f.beats.length) {
    L.push('', '■ 내 배역 여정' + (f.character ? ' - ' + f.character : ''));
    if (f.super_objective) L.push('최상위 목표: ' + f.super_objective);
    f.beats.forEach(function (b) {
      L.push('- 장면 ' + b.scene_no + ': ' + b.objective + ' / 행동동사 ' + b.action_verb +
        ' / 감정 ' + b.emotion + ' / 속마음 ' + b.subtext);
    });
    if (f.acting_tips.length) {
      L.push('연기 팁:');
      f.acting_tips.forEach(function (t) { L.push('- ' + t); });
    }
  }
  L.push('', '(AI 분석 · 해석은 참고용)');
  return L.join('\n');
}
// AN_PURE_END

/* ---------- ④ 대본 분석: 화면 ---------- */
var analyzing = false;
var anTimer = null;
var anData = null; // 가장 최근 분석 결과 (정리된 모양)

var AN_PROGRESS = [
  '대본을 끝까지 읽고 있어요…',
  '장면을 나누고 긴장의 높낮이를 재는 중이에요…',
  '인물과 관계를 정리하고 있어요…',
  '내 배역의 행동동사를 고르는 중이에요…',
  '긴 대본은 90초까지 걸릴 수 있어요. 조금만 기다려 주세요…'
];

function anSave() {
  try {
    localStorage.setItem(AN_KEY, JSON.stringify({
      text: $('anText').value, role: $('anRole').value, analysis: anData
    }));
  } catch (e) { /* 저장이 안 돼도 괜찮아요 */ }
}

function anLoad() {
  try {
    var raw = localStorage.getItem(AN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function anUpdateButton() {
  var n = $('anText').value.length;
  $('anCount').textContent = n.toLocaleString('en-US') + ' / ' + AN_MAX.toLocaleString('en-US') + '자';
  var h = state.health;
  var noKey = !!(h && h.hasKey === false);
  var reason = '';
  if (noKey) reason = '데모 모드(AI 키 없음)에서는 대본 분석을 쓸 수 없어요. README-run.md를 보고 키를 넣어 주세요.';
  else if (!h) reason = '';
  $('anReason').textContent = analyzing ? '' : reason;
  $('anBtn').disabled = analyzing || noKey || !$('anText').value.trim();
}

/* 작은 DOM 도우미: 라벨이 붙은 항목(dt/dd) 만들기 */
function anDef(dl, label, value) {
  if (!value) return;
  dl.appendChild(el('dt', null, label));
  dl.appendChild(el('dd', null, value));
}

function anChips(items) {
  var ul = el('ul', 'an-chips');
  items.forEach(function (t) { ul.appendChild(el('li', 'an-chip', t)); });
  return ul;
}

function anRenderOverview(a) {
  var box = $('anOverview');
  box.innerHTML = '';
  box.appendChild(el('span', 'badge badge-medium an-badge', 'AI 분석 · 해석은 참고용'));
  if (a.title_guess) box.appendChild(el('p', 'an-title', a.title_guess));
  box.appendChild(el('p', 'an-logline', a.logline || '(한 줄 요약이 없어요)'));
  if (a.genre_tone) box.appendChild(el('p', 'an-tone', a.genre_tone));
  if (a.themes.length) {
    box.appendChild(el('h3', 'an-sub', '주제'));
    box.appendChild(anChips(a.themes));
  }
  if (a.structure) {
    box.appendChild(el('h3', 'an-sub', '구조'));
    box.appendChild(el('p', null, a.structure));
  }
}

var SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs, text) {
  var e = document.createElementNS(SVG_NS, tag);
  for (var k in attrs) e.setAttribute(k, attrs[k]);
  if (text != null) e.textContent = text;
  return e;
}

// 장면 카드로 부드럽게 이동 + 잠깐 테두리 표시
function anGoScene(i) {
  var card = $('an-scene-' + i);
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.focus({ preventScroll: true });
  card.classList.add('flash');
  setTimeout(function () { card.classList.remove('flash'); }, 1600);
}

function anRenderChart(a) {
  var box = $('anChart');
  box.innerHTML = '';
  if (!a.scenes.length) { box.appendChild(el('p', 'muted', '장면 정보가 없어요.')); return; }
  var g = chartGeometry(a.scenes);
  var svg = svgEl('svg', { viewBox: '0 0 ' + g.W + ' ' + g.H, 'class': 'an-svg', role: 'group',
    'aria-label': '장면별 긴장도 그래프. 가로는 장면 순서, 세로는 긴장도 0에서 10.' });
  if (g.scroll) svg.style.minWidth = g.W + 'px';
  // 가로 눈금선(0, 5, 10)과 숫자
  g.ticks.forEach(function (t) {
    svg.appendChild(svgEl('line', { x1: g.padL, x2: g.W - g.padR, y1: t.y, y2: t.y, 'class': t.v === 0 ? 'an-axis' : 'an-gl' }));
    svg.appendChild(svgEl('text', { x: g.padL - 8, y: t.y + 4, 'text-anchor': 'end', 'class': 'an-tick' }, String(t.v)));
  });
  svg.appendChild(svgEl('path', { d: g.area, 'class': 'an-area' }));
  svg.appendChild(svgEl('path', { d: g.line, 'class': 'an-line' }));
  g.points.forEach(function (p, i) {
    var s = a.scenes[i];
    var label = pointLabel(s, i);
    var grp = svgEl('g', { 'class': 'an-pt-g', tabindex: '0', role: 'button', 'aria-label': label + '. 누르면 장면 카드로 이동' });
    grp.appendChild(svgEl('title', {}, label)); // 마우스를 올리면 나오는 말풍선
    grp.appendChild(svgEl('circle', { cx: p.x, cy: p.y, r: 16, fill: 'transparent' })); // 누르기 쉬운 넓은 영역
    grp.appendChild(svgEl('circle', { cx: p.x, cy: p.y, r: p.turn ? 9 : 5.5, 'class': 'an-pt' + (p.turn ? ' turn' : '') }));
    grp.addEventListener('click', function () { anGoScene(i); });
    grp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); anGoScene(i); }
    });
    svg.appendChild(grp);
    if (p.turn) svg.appendChild(svgEl('text', { x: p.x, y: p.y - 16, 'text-anchor': 'middle', 'class': 'an-turn-label' }, '전환점'));
    svg.appendChild(svgEl('text', { x: p.x, y: g.baseY + 26, 'text-anchor': 'middle', 'class': 'an-tick' }, p.label));
  });
  box.appendChild(svg);
}

function anRenderScenes(a) {
  var ol = $('anScenes');
  ol.innerHTML = '';
  if (!a.scenes.length) { ol.appendChild(el('li', 'muted', '장면 정보가 없어요.')); return; }
  a.scenes.forEach(function (s, i) {
    var li = el('li', 'card an-scene');
    li.id = 'an-scene-' + i;
    li.tabIndex = -1;
    var head = el('div', 'an-scene-head');
    head.appendChild(el('span', 'an-no', String(s.no)));
    head.appendChild(el('h3', null, s.title || '제목 없음'));
    if (s.turning_point) head.appendChild(el('span', 'badge an-turn-badge', '전환점'));
    li.appendChild(head);
    if (s.place_time) li.appendChild(el('p', 'an-meta', s.place_time));
    if (s.characters.length) li.appendChild(anChips(s.characters));
    if (s.summary) li.appendChild(el('p', null, s.summary));
    if (s.emotion) li.appendChild(el('p', 'small', '감정: ' + s.emotion));
    var row = el('div', 'an-bar-row');
    row.appendChild(el('span', null, '긴장 ' + s.tension + '/10'));
    var bar = el('div', 'an-bar');
    bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', '긴장 ' + s.tension + '/10');
    var fill = el('span');
    fill.style.width = (s.tension * 10) + '%';
    bar.appendChild(fill);
    row.appendChild(bar);
    li.appendChild(row);
    ol.appendChild(li);
  });
}

function anRenderCharacters(a) {
  var grid = $('anChars');
  grid.innerHTML = '';
  if (!a.characters.length) grid.appendChild(el('p', 'muted', '인물 정보가 없어요.'));
  a.characters.forEach(function (c) {
    var card = el('article', 'card');
    card.appendChild(el('h3', null, c.name || '이름 없음'));
    if (c.description) card.appendChild(el('p', null, c.description));
    var dl = el('dl');
    anDef(dl, '원하는 것', c.want);
    anDef(dl, '가로막는 것', c.obstacle);
    anDef(dl, '변화', c.arc);
    card.appendChild(dl);
    grid.appendChild(card);
  });
  var rels = $('anRels');
  rels.innerHTML = '';
  if (a.relationships.length) {
    var card2 = el('div', 'card');
    card2.appendChild(el('h3', null, '관계'));
    var ul = el('ul', 'an-rels');
    a.relationships.forEach(function (r) {
      ul.appendChild(el('li', null, r.a + ' ↔ ' + r.b + ' : ' + r.relation + (r.change ? ' (변화: ' + r.change + ')' : '')));
    });
    card2.appendChild(ul);
    rels.appendChild(card2);
  }
}

function anRenderFocus(a) {
  var box = $('anFocus');
  box.innerHTML = '';
  box.classList.add('an-focus');
  var f = a.focus;
  if (!f.character && !f.beats.length) { box.appendChild(el('p', 'muted', '내 배역 정보가 없어요.')); return; }
  box.appendChild(el('h3', null, f.character || '주인공'));
  if (f.super_objective) {
    var sup = el('p', 'an-super');
    sup.appendChild(el('span', 'small muted', '최상위 목표 '));
    sup.appendChild(document.createElement('br'));
    sup.appendChild(document.createTextNode(f.super_objective));
    box.appendChild(sup);
  }
  if (f.beats.length) {
    var wrap = el('div', 'an-table-wrap');
    var table = el('table', 'an-beats');
    var cap = el('caption', 'small muted', '장면별 행동 흐름');
    cap.style.cssText = 'text-align:left;padding-bottom:4px';
    table.appendChild(cap);
    var tr = el('tr');
    ['장면', '원하는 것', '행동동사', '감정', '속마음'].forEach(function (h) {
      var th = el('th', null, h); th.scope = 'col'; tr.appendChild(th);
    });
    table.appendChild(el('thead')).appendChild(tr);
    var body = el('tbody');
    f.beats.forEach(function (b) {
      var r = el('tr');
      [['장면', '장면 ' + (b.scene_no != null ? b.scene_no : '?'), ''], ['원하는 것', b.objective, ''],
       ['행동동사', b.action_verb, 'an-verb'], ['감정', b.emotion, ''], ['속마음', b.subtext, '']].forEach(function (c) {
        var td = el('td', c[2], c[1]);
        td.setAttribute('data-label', c[0]);
        r.appendChild(td);
      });
      body.appendChild(r);
    });
    table.appendChild(body);
    wrap.appendChild(table);
    box.appendChild(wrap);
  }
  if (f.acting_tips.length) {
    box.appendChild(el('h3', null, '연기 팁'));
    var ul = el('ul', 'plain-list');
    f.acting_tips.forEach(function (t) { ul.appendChild(el('li', null, t)); });
    box.appendChild(ul);
  }
}

function anRenderNotes(a) {
  var box = $('anNotes');
  box.innerHTML = '';
  show(box, a.notes.length > 0);
  if (!a.notes.length) return;
  var ul = el('ul', 'plain-list');
  a.notes.forEach(function (t) { ul.appendChild(el('li', null, t)); });
  box.appendChild(ul);
}

// 분석 결과 전체를 화면에 그려요
function renderAnalysis() {
  var a = anData;
  if (!a) { show($('anResult'), false); return; }
  anRenderOverview(a);
  anRenderChart(a);
  anRenderScenes(a);
  anRenderCharacters(a);
  anRenderFocus(a);
  anRenderNotes(a);
  $('anCopyStatus').textContent = '';
  show($('anResult'), true);
}

function anStartProgress() {
  var t0 = Date.now();
  var p = $('anProgress');
  show(p, true);
  function tick() {
    var sec = Math.floor((Date.now() - t0) / 1000);
    p.textContent = AN_PROGRESS[Math.min(AN_PROGRESS.length - 1, Math.floor(sec / 10))] + ' (' + sec + '초)';
  }
  tick();
  anTimer = setInterval(tick, 1000);
}

function anStopProgress() {
  clearInterval(anTimer);
  show($('anProgress'), false);
}

async function doAnalyze() {
  if (analyzing) return;
  var text = $('anText').value.trim();
  if (!text) return;
  analyzing = true;
  var btn = $('anBtn');
  btn.disabled = true;
  btn.textContent = '분석하는 중…';
  btn.setAttribute('aria-busy', 'true');
  show($('anError'), false);
  anStartProgress();
  try {
    var body = { text: text };
    var role = $('anRole').value.trim();
    if (role) body.role = role;
    var data = await api('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!data || typeof data !== 'object' || !Array.isArray(data.scenes)) {
      throw new Error('서버가 이상한 답을 보냈어요. 다시 시도해 주세요.');
    }
    anData = normalizeAnalysis(data);
    anSave();
    renderAnalysis();
    $('anResult').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    var box = $('anError');
    box.textContent = e.message;
    show(box, true);
  } finally {
    analyzing = false;
    anStopProgress();
    btn.textContent = '분석하기';
    btn.removeAttribute('aria-busy');
    anUpdateButton();
  }
}

async function copyAnalysis() {
  if (!anData) return;
  var text = analysisToText(anData);
  var status = $('anCopyStatus');
  var ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; }
  catch (e) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e2) { ok = false; }
  }
  status.textContent = ok ? '복사했어요!' : '복사하지 못했어요. 결과를 직접 드래그해서 복사해 주세요.';
  setTimeout(function () { status.textContent = ''; }, 3000);
}

function initAnalyze() {
  var saved = anLoad();
  if (saved) {
    if (typeof saved.text === 'string') $('anText').value = saved.text.slice(0, AN_MAX);
    if (typeof saved.role === 'string') $('anRole').value = saved.role;
    if (saved.analysis && Array.isArray(saved.analysis.scenes)) {
      anData = normalizeAnalysis(saved.analysis);
      renderAnalysis();
    }
  }
  $('anText').addEventListener('input', function () { anUpdateButton(); anSave(); });
  $('anRole').addEventListener('input', anSave);
  $('anBtn').addEventListener('click', doAnalyze);
  $('anCopyBtn').addEventListener('click', copyAnalysis);
  $('anAgainBtn').addEventListener('click', function () {
    $('anText').focus();
    $('anText').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  $('anImportBtn').addEventListener('click', function () {
    var src = $('sourceText').value;
    if (!src.trim()) { $('anReason').textContent = '① 변환 탭에 독백이 아직 없어요.'; return; }
    $('anText').value = src.slice(0, AN_MAX);
    anUpdateButton();
    anSave();
    $('anReason').textContent = '독백을 가져왔어요.';
  });
  anUpdateButton();
}

/* ---------- 시작 ---------- */
async function init() {
  initTabs();
  initIntro(); // 탭 준비가 끝난 뒤 첫 페이지 또는 방을 열어요
  initTooltip();
  initAnalyze();

  // 저장돼 있던 변환 결과 불러오기 (새로고침해도 ②③ 탭이 동작하도록)
  var saved = loadSaved();
  if (saved && saved.conversion && typeof saved.conversion.converted === 'string') {
    var sc = saved.conversion;
    sc.changes = Array.isArray(sc.changes) ? sc.changes : [];
    sc.notes = Array.isArray(sc.notes) ? sc.notes : [];
    sc.tips = sc.tips || { intonation: [], pronunciation: [] };
    state.conversion = sc;
    var sp = loadProsodySaved();
    if (sp && sp.code === sc.code && sp.converted === sc.converted) {
      sp.data = normalizeProsody(sp.data);
      if (sp.data.sentences.length) state.prosody = sp;
    }
  }

  $('sourceText').addEventListener('input', updateCharCount);
  $('langSelect').addEventListener('change', function () { fillRegions(); });
  $('regionSelect').addEventListener('change', function () { updateRegionInfo(); });
  $('convertBtn').addEventListener('click', doConvert);
  $('copyBtn').addEventListener('click', copyConverted);
  $('toPracticeBtn').addEventListener('click', function () { selectTab('practice', true); });
  $('micBtn').addEventListener('click', function () { if (listening) stopListening(); else startListening(); });
  $('stopBtn').addEventListener('click', stopSpeaking);
  $('prosodyBtn').addEventListener('click', onProsodyClick);
  document.querySelectorAll('input[name="engine"]').forEach(function (r) {
    r.addEventListener('change', function () { engineChosen = true; stopSpeaking(); showAiMsg(''); updateEngineUi(); });
  });
  // 속도를 바꾸면 재생 중인 AI 음성에도 바로 적용
  document.querySelectorAll('input[name="speed"]').forEach(function (r) {
    r.addEventListener('change', function () { if (aiAudio) aiAudio.playbackRate = currentSpeed(); });
  });
  // 화면 크기/다크 모드가 바뀌면 그래프와 악보 선을 다시 그려요
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { redrawAllGraphs(); redrawAllProsodyLines(); }, 150);
  });
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', redrawAllGraphs);
  }
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
    applyHealth(h);
    anUpdateButton();
  }).catch(function () { applyHealth(null); /* 지역 목록 실패 때도 안내해요 */ });

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
