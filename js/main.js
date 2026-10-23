// ============================================================
// 全体のつなぎ役
// 「盤面のデータ」と「画面」を持ち、操作が来たら
//   ルールエンジンで処理 → 演出 → 画面を描き直す
// という流れを回している。
// ============================================================

import { createGame, applyAction, getLegalActions } from './engine/index.js';
import { CARDS } from './data/cards.js';
import { fmt, TERMS, setPlayerNames } from './data/terms.js';
import * as R from './ui/render.js';
import * as A from './ui/animate.js';
import { bindInput } from './ui/input.js';
import { loadCardImages } from './ui/images.js';
import { loadSounds, playSound, startBgm, stopBgm, soundSettings } from './ui/sound.js';
import { chooseAction } from './sim/ai.js';
import * as Net from './net/online.js';
import { loadCachedPrivate, refreshPrivate, clearPrivate, privateInfo } from './net/private-cards.js';

const CPU_DELAY_MS = 900;  // コンピュータが1回操作するまでの間(人が目で追えるように)

const $ = (id) => document.getElementById(id);
const els = {
  setup: $('setup'),
  game: $('game'),
  board: $('board'),
  preview: $('preview'),
  log: $('log'),
  overlay: $('overlay'),
};

let state = null;

// 設定(前回の内容をブラウザに覚えておく)
const SETTINGS_KEY = 'sensei-tcg.settings';
let settings = {
  decks: ['aggro', 'control'], controllers: ['human', 'human'],
  field: 'random', curtain: true, confirmEnd: true, sfx: true, bgm: false,
};
try {
  Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
} catch { /* 保存できない環境でも、初期値で動く */ }
// 一時期の「BGMの流し方」('off' / 'pop' など)の保存内容を、オン・オフに読み替える
if (typeof settings.bgm === 'string') settings.bgm = settings.bgm !== 'off';
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* 無視 */ }
}

// 画面側だけで使う情報
const ui = {
  viewer: 0,        // 今、画面の手前側にいるプレイヤー
  selected: null,   // 選んでいるカード(手札 or 対決に出す先生)
  dragging: null,   // ドラッグ中のカード
  overlay: null,    // 全画面の案内 { kind: 'curtain' | 'mulligan' | 'trash' | 'endConfirm' | 'concede' | 'gameover' }
  preview: null,    // サイドバーに大きく表示しているカード
  busy: false,      // 演出中は操作を受け付けない
  bannerTurn: 0,    // ターン開始の帯を出したターン
  cpu: [false, false], // コンピュータが操作するプレイヤー
  online: null,     // オンライン対戦中なら { code: ルームの4文字, seat: 自分の席(0 or 1) }
  sending: false,   // オンライン:自分の操作を送って、戻ってくるのを待っている間
};

// 今、操作する必要があるプレイヤー
function actor(s) {
  if (s.winner !== null) return null;
  if (s.phase === 'mulligan') {
    // オンラインでは、引き直しは自分の分から先に決める(相手と同時に考えられる)
    if (ui.online) {
      const me = ui.online.seat;
      return s.players[me].mulliganDone ? 1 - me : me;
    }
    return s.players[0].mulliganDone ? 1 : 0;
  }
  return s.pending ? s.pending.player : s.active;
}

const isCpu = (p) => p !== null && ui.cpu[p];
// オンライン対戦の相手(別のパソコンで操作する人)
const isRemote = (p) => !!ui.online && p !== null && p !== ui.online.seat;
// 画面の前の人間が操作する番か(コンピュータ同士の観戦中・相手の番は false)
const myTurn = () => !!state && actor(state) === ui.viewer && !isCpu(ui.viewer) && !isRemote(actor(state)) && !ui.sending;
// 交代画面は、人間どうしの対戦のときだけ使う
const useCurtain = () => settings.curtain && !ui.cpu[0] && !ui.cpu[1] && !ui.online;

// ---- コンピュータの操作 ----
let cpuTimer = null;
let gameId = 0;  // 対戦をやり直したときに、前の対戦の予約を無効にするため

function scheduleCpu() {
  if (cpuTimer) return;
  const id = gameId;
  cpuTimer = setTimeout(async () => {
    cpuTimer = null;
    if (id !== gameId || !state || state.winner !== null) return;
    const p = actor(state);
    if (!isCpu(p)) return;
    // 演出中や、画面に案内が出ている間は、少し待ってからやり直す
    if (ui.busy || (ui.overlay && ui.overlay.kind !== 'trash')) return scheduleCpu();
    // 公平モード:人間と同じく、相手の手札や山札の中身を知らずに考える
    await dispatch(chooseAction(state, p, undefined, { fair: true }));
  }, CPU_DELAY_MS);
}

function render() {
  const legal = !ui.busy && myTurn() ? getLegalActions(state, ui.viewer) : [];
  R.renderBoard(els.board, state, ui, legal);
  R.renderLog(els.log, state);
  R.renderPreview(els.preview, state, ui.preview);
  R.renderOverlay(els.overlay, state, ui);
  updateSoundButtons();
}

// 対戦中の「効果音」「BGM」ボタンの表示
function updateSoundButtons() {
  $('sfx-toggle').textContent = `効果音:${settings.sfx ? 'オン' : 'オフ'}`;
  $('bgm-toggle').textContent = `BGM:${settings.bgm ? 'オン' : 'オフ'}`;
}

// 効果音の設定を反映する
function applySoundSettings() {
  soundSettings.sfx = settings.sfx;
  soundSettings.bgm = settings.bgm;
}

// ------------------------------------------------------------
// 画面の切り替え
// ------------------------------------------------------------
function showSetup() {
  gameId++;
  stopBgm();
  ui.overlay = null;
  R.renderOverlay(els.overlay, state, ui);
  els.game.hidden = true;
  els.setup.hidden = false;
  R.renderSetup(els.setup, settings, privateStatus, privateInfo.count);
  // ゲームの版(オンライン対戦の相手と同じか確かめる時用)
  Net.rulesVersion()
    .then((v) => {
      const el = els.setup.querySelector('.setup__version');
      if (el) el.textContent = `ゲームの版:${v}`;
    })
    .catch((e) => console.warn(e));
}

// ---- 先生の名前・画像(非公開。合言葉で読み込む) ----
let privateStatus = Net.isConfigured() ? 'checking' : 'noconfig';

// 最初の画面の「先生の名前・画像」欄だけを描き直す(入力中の名前などは消さない)
function updatePrivateBox() {
  const box = els.setup.querySelector('.setup__private');
  if (box) box.innerHTML = R.privateBox(privateStatus, privateInfo.count);
}

// 最初の画面で合言葉を入れた時
async function privateLogin() {
  const password = els.setup.querySelector('input[name="privatePassword"]')?.value ?? '';
  if (!password) return;
  privateStatus = 'checking';
  updatePrivateBox();
  try {
    await Net.login(password);
  } catch (e) {
    console.warn(e);
    privateStatus = 'error';
    return updatePrivateBox();
  }
  privateStatus = await refreshPrivate();
  updatePrivateBox();
}

async function checkPrivate() {
  if (!Net.isConfigured()) return;
  privateStatus = 'checking';
  updatePrivateBox();
  privateStatus = await refreshPrivate();
  updatePrivateBox();
}

function startGame() {
  settings = R.readSetup(els.setup);
  saveSettings();
  applySoundSettings();
  startBgm();
  setPlayerNames(settings.names);
  state = createGame({
    deckKeys: settings.decks,
    fieldId: settings.field === 'random' ? null : settings.field,
  });
  gameId++;
  const cpu = settings.controllers.map((c) => c === 'cpu');
  // 画面の手前側:人間のプレイヤー(両方コンピュータなら、観戦としてプレイヤー1側)
  const viewer = cpu[actor(state)] ? (cpu.indexOf(false) === -1 ? 0 : cpu.indexOf(false)) : actor(state);
  Object.assign(ui, { viewer, cpu, selected: null, preview: null, busy: false, bannerTurn: 0 });
  els.setup.hidden = true;
  els.game.hidden = false;
  if (useCurtain()) {
    ui.overlay = { kind: 'curtain', player: ui.viewer, reason: curtainReason(state) };
  } else {
    showPhaseOverlay();
  }
  render();
}

// 操作するプレイヤーが変わったら、交代画面を出す
function settle() {
  if (state.winner !== null) {
    if (ui.overlay?.kind !== 'gameover') playSound('win');
    ui.overlay = { kind: 'gameover' };
    return;
  }
  const next = actor(state);
  // コンピュータ・オンラインの相手の番:画面はそのまま、相手の操作を待つ
  if (isCpu(next) || isRemote(next)) {
    ui.selected = null;
    showPhaseOverlay();
    return;
  }
  if (next !== ui.viewer) {
    ui.selected = null;
    if (useCurtain()) {
      ui.overlay = { kind: 'curtain', player: next, reason: curtainReason(state) };
      return;
    }
    ui.viewer = next;
  }
  showPhaseOverlay();
}

function showPhaseOverlay() {
  const cpuTurn = isCpu(actor(state));
  if (state.phase === 'mulligan' && !cpuTurn && !isRemote(actor(state))) {
    ui.overlay = { kind: 'mulligan' };
    return;
  }
  ui.overlay = null;
  if (state.phase === 'main' && state.turn !== ui.bannerTurn && !state.pending) {
    ui.bannerTurn = state.turn;
    const who = ui.online
      ? (state.active === ui.online.seat ? 'あなた' : '相手')
      : `${R.pName(state.active)}${ui.cpu[state.active] ? '(コンピュータ)' : ''}`;
    A.banner(`${who}のターン`);
    playSound('turn');
  }
  if (cpuTurn) scheduleCpu();
}

function curtainReason(s) {
  if (s.phase === 'mulligan') return fmt('最初の{hand}の{mulligan}をするか決めてください');
  if (s.pending) {
    if (s.pending.resolve === 'counter') return fmt('{battle}を挑まれました。{counter}するか選んでください');
    return fmt(s.pending.prompt);
  }
  return s.turn !== ui.bannerTurn ? `${s.turn}ターン目が始まります` : 'ターンの続きです';
}

// ------------------------------------------------------------
// 操作を実行する(ルール処理 → 演出 → 描き直し)
// ------------------------------------------------------------
// opts.fromRect:ドラッグで放した位置(そこから中央へ大きく表示する)
async function dispatch(action, opts = {}) {
  if (ui.busy) return;
  let next;
  try {
    next = applyAction(state, action);
  } catch (e) {
    console.warn(e);
    return;
  }
  const prev = state;
  ui.busy = true;
  ui.selected = null;
  ui.dragging = null;
  render(); // 演出中はボタンや光る枠を消しておく

  try {
    const snap = A.snapshot(els.board);

    if (action.type === 'attack') {
      playSound('attack');
      await A.lunge(els.board, action.attacker, action.target);
    }

    let revealed = null;
    const rv = revealTarget(prev, action);
    if (rv) {
      playSound(action.type === 'choose' ? 'counter' : 'play');
      revealed = await A.reveal(els.board, rv.uid, prev.cards[rv.uid].id, { aside: rv.aside, fromRect: opts.fromRect });
      snap.set(rv.uid, revealed);
    }

    // 対決の結果を、2体を大きく並べて見せる
    const battle = next.events.find((e) => e.type === 'battle');
    if (battle) {
      const label = (uid) => {
        const owner = prev.cards[uid].owner;
        if (ui.online) return owner === ui.online.seat ? 'あなた' : '相手';
        return `${R.pName(owner)}${ui.cpu[owner] ? '(コンピュータ)' : ''}`;
      };
      // 対決での撃破は destroy を鳴らさず、勝ち負けの音だけ(ユーザー指定)
      const outcome = battleSound(prev, battle);
      if (outcome) setTimeout(() => playSound(outcome), 800);  // ハンコが出るのと同時に
      await A.battleScene(battle, [label(battle.attacker), label(battle.target)]);
    }

    const destroyed = destroyedTeachers(prev, next);
    if (destroyed.length && !battle) playSound('destroy');
    await A.hit(els.board, destroyed);

    state = next;
    render();
    playChangeSounds(prev, next);
    // 教室の効果が働いた時のお知らせ
    for (const e of next.events.filter((x) => x.type === 'field')) {
      A.toast(`${TERMS.field}「${e.name}」`, fmt(e.text));
    }
    revealed?.remove();
    A.flip(els.board, snap, prev, next);
    await A.wait(A.MOVE_MS);
  } finally {
    ui.busy = false;
    settle();
    render();
  }
}

// ------------------------------------------------------------
// 人間の操作は、ここを通す
// ・1台で遊ぶ時は、その場で実行する
// ・オンラインでは Firebase に送るだけ。実行は、届いた操作を順番に再生する時に行う
//   (自分の操作も相手の操作も同じ道を通るので、両方の画面が必ず同じになる)
// ------------------------------------------------------------
async function submit(action, opts = {}) {
  if (!ui.online) return dispatch(action, opts);
  if (ui.busy || ui.sending) return;
  try {
    applyAction(state, action);  // 送る前に、ルール違反でないか確かめる
  } catch (e) {
    console.warn(e);
    return;
  }
  ui.sending = true;
  ui.selected = null;
  render();
  try {
    await Net.sendAction(ui.online.code, action);
  } catch (e) {
    ui.sending = false;
    render();
    A.toast('通信エラー', '操作を送れませんでした。もう一度試してください');
  }
}

// ---- オンライン:届いた操作を、届いた順に1つずつ演出つきで実行する ----
const onlineQueue = [];
let queueRunning = false;
let followUp = null;  // ドラッグで昇格した時の「重ねた先生を自壊させる」続きの操作

async function runOnlineQueue() {
  if (queueRunning) return;
  queueRunning = true;
  while (onlineQueue.length) {
    while (ui.busy) await A.wait(50);
    const action = onlineQueue.shift();
    if (action.player === ui.online?.seat) ui.sending = false;
    const before = state;
    await dispatch(action);
    if (state === before) {
      A.toast('同期エラー', '相手との盤面がずれた可能性があります。再読み込みして対戦に戻ってください');
    }
    // 昇格の続き:重ねた先生をそのまま自壊させる
    if (followUp && state.pending?.resolve === 'promote' && state.pending.player === ui.online?.seat
      && state.pending.options.some((o) => o.value === followUp)) {
      const value = followUp;
      followUp = null;
      submit({ type: 'choose', player: ui.online.seat, value });
    }
  }
  queueRunning = false;
}

// ------------------------------------------------------------
// オンライン対戦の画面(合言葉 → ルームを作る/入る → 相手待ち → 対戦)
// ------------------------------------------------------------
let stopRoomWatch = null;
let stopActionWatch = null;
const ROOM_KEY = 'sensei-tcg.room';  // 再読み込みした時に対戦に戻るため(タブごとに保存)
const savedRoom = () => { try { return sessionStorage.getItem(ROOM_KEY); } catch { return null; } };
const saveRoom = (code) => { try { code ? sessionStorage.setItem(ROOM_KEY, code) : sessionStorage.removeItem(ROOM_KEY); } catch { /* 無視 */ } };

function showOnline(info) {
  els.game.hidden = true;
  els.setup.hidden = false;
  ui.overlay = null;
  R.renderOverlay(els.overlay, state, ui);
  R.renderOnline(els.setup, info, settings);
}

async function openOnline(error = '') {
  stopOnline();
  if (!Net.isConfigured()) return showOnline({ step: 'noconfig' });
  showOnline({ step: 'busy' });
  try {
    const loggedIn = await Net.isLoggedIn();
    showOnline({ step: loggedIn ? 'lobby' : 'login', saved: savedRoom(), error });
  } catch (e) {
    console.warn(e);
    showOnline({ step: 'login', error: '通信できませんでした。インターネットの接続を確かめてください' });
  }
}

// オンラインの画面で選んだデッキと名前を読み取る(次回のために覚えておく)
function readOnlineChoice() {
  const deck = els.setup.querySelector('input[name="onlineDeck"]:checked')?.value ?? settings.onlineDeck ?? 'aggro';
  const nameInput = els.setup.querySelector('input[name="onlineName"]');
  const name = (nameInput ? nameInput.value : settings.onlineName ?? '').trim().slice(0, 12);
  settings.onlineDeck = deck;
  settings.onlineName = name;
  saveSettings();
  return { deck, name };
}

// 対戦をやめて、通信の見張りを止める
function stopOnline() {
  stopRoomWatch?.();
  stopActionWatch?.();
  stopRoomWatch = stopActionWatch = null;
  onlineQueue.length = 0;
  followUp = null;
  ui.online = null;
  ui.sending = false;
  Net.release();  // 対戦が終わったら Firebase から切断する(同時接続の数を使わないように)
}

async function startOnline(code, room, seat) {
  if (ui.online) return;  // すでに始まっている
  stopRoomWatch?.();
  stopRoomWatch = null;
  saveRoom(code);
  applySoundSettings();
  startBgm();
  setPlayerNames([room.players[0].name, room.players[1].name]);
  state = createGame({
    deckKeys: [room.players[0].deck, room.players[1].deck],
    seed: room.seed,
    fieldId: room.field === 'random' ? null : room.field,
  });
  gameId++;
  Object.assign(ui, {
    viewer: seat, cpu: [false, false], online: { code, seat }, sending: false,
    selected: null, preview: null, busy: false, bannerTurn: 0, overlay: null,
  });
  els.setup.hidden = true;
  els.game.hidden = false;
  render();
  stopActionWatch = await Net.watchActions(code, (action, initial) => {
    if (initial) {
      // 再読み込みで戻った時:これまでの操作を演出なしで一気に再生する
      try { state = applyAction(state, action); } catch (e) { console.warn(e); }
    } else {
      onlineQueue.push(action);
      runOnlineQueue();
    }
  }, () => {
    settle();
    render();
  });
}

// 中央に大きく表示するカード:プレイしたカードと、手札から公開した反撃カード
function revealTarget(prev, action) {
  if (action.type === 'play') {
    return { uid: action.uid, aside: CARDS[prev.cards[action.uid].id].type === 'lesson' };
  }
  if (action.type === 'choose' && prev.pending?.resolve === 'counter' && prev.cards[action.value]) {
    return { uid: action.value, aside: false };
  }
  return null;
}

// ターン終了:まだ対決できる先生や使えるカードがあれば確認する
function requestEndTurn() {
  const legal = getLegalActions(state, ui.viewer);
  const attackers = new Set(legal.filter((a) => a.type === 'attack').map((a) => a.attacker)).size;
  const playable = new Set(legal.filter((a) => a.type === 'play' || a.type === 'promote').map((a) => a.uid)).size;
  if (settings.confirmEnd && (attackers || playable)) {
    ui.overlay = { kind: 'endConfirm', attackers, playable };
    ui.selected = null;
    return render();
  }
  return submit({ type: 'endTurn', player: ui.viewer });
}

// ------------------------------------------------------------
// ドラッグ操作
// ------------------------------------------------------------
function canInteract() {
  return state && !ui.busy && !ui.overlay && !state.pending && myTurn();
}

// ドラッグしたカードを el の上で放したら、どの操作になるか(できなければ null)
// 戻り値:{ action, then? }  then は昇格で自壊させる先生
function dropAction(uid, el) {
  if (!el || !el.closest('#board')) return null;
  const legal = getLegalActions(state, ui.viewer);
  const has = (type) => legal.find((a) => a.type === type && a.uid === uid);
  const over = el.closest('#board [data-uid]')?.dataset.uid;

  if (state.players[ui.viewer].hand.includes(uid)) {
    if (el.closest('.hand--bottom')) return null;
    // 5C:コスト3以上の自分の先生に重ねると昇格
    const promote = has('promote');
    const mine = state.players[ui.viewer].zone.find((t) => t.uid === over);
    if (promote && mine && !mine.sick && CARDS[state.cards[over].id].cost >= 3) return { action: promote, then: over };

    const play = has('play');
    if (!play) return null;
    if (CARDS[state.cards[uid].id].type === 'teacher') {
      return el.closest('.half--bottom .area-zone') ? { action: play } : null;
    }
    return { action: play };  // 授業は盤面のどこに放してもOK
  }

  const attack = legal.find((a) => a.type === 'attack' && a.attacker === uid && a.target === over);
  return attack ? { action: attack } : null;
}

// 対決の勝ち負けの音(相打ち・無効なら鳴らさない)
// 画面の前の人が1人に決まる時(オンライン・人間対コンピュータ)は、その人から見た勝ち負け。
// 交代で遊ぶ対戦・コンピュータ同士の観戦では、どちらが勝っても「勝ち」の音
function battleSound(prev, battle) {
  const winnerUid = battle.result === 'attacker' ? battle.attacker
    : battle.result === 'target' ? battle.target : null;
  if (!winnerUid) return null;
  const me = ui.online ? ui.online.seat
    : ui.cpu[0] !== ui.cpu[1] ? (ui.cpu[0] ? 1 : 0) : null;
  if (me === null) return 'battleWin';
  return prev.cards[winnerUid].owner === me ? 'battleWin' : 'battleLose';
}

// 盤面の変化に合わせた効果音(ガード・ドロー・サイド獲得)
function playChangeSounds(prev, next) {
  const guardUsed = prev.players.some((pl, p) => pl.zone.some((t) =>
    t.guard && next.players[p].zone.some((n) => n.uid === t.uid && !n.guard)));
  if (guardUsed) playSound('guard');
  if (next.players.some((pl, p) => pl.side.length < prev.players[p].side.length)) playSound('side');
  if (next.players.some((pl, p) => pl.deck.length < prev.players[p].deck.length)) playSound('draw');
  // 職員室のカードが手札に戻った(2B・5C・S2の回収)
  if (prev.players.some((pl, p) => pl.trash.some((uid) => next.players[p].hand.includes(uid)))) playSound('recover');
}

// 場から墓地へ移った先生(=撃破された)
function destroyedTeachers(prev, next) {
  const out = [];
  for (const pl of prev.players) {
    for (const t of pl.zone) {
      if (A.where(next, t.uid)?.area === 'trash') out.push(t.uid);
    }
  }
  return out;
}

// ---- オンライン対戦の画面のボタン ----
async function onlineAct(name) {
  const input = (n) => els.setup.querySelector(`input[name="${n}"]`)?.value ?? '';
  try {
    switch (name) {
      case 'online-open':
        settings = R.readSetup(els.setup);  // 教室などの設定はデッキ選択画面のものを使う
        saveSettings();
        return openOnline();

      case 'online-back':
        stopOnline();
        saveRoom(null);
        return showSetup();

      case 'online-login': {
        const password = input('password');
        if (!password) return;
        showOnline({ step: 'busy' });
        try {
          await Net.login(password);
        } catch (e) {
          console.warn(e);
          return showOnline({ step: 'login', error: '合言葉が違うか、通信できませんでした' });
        }
        privateStatus = await refreshPrivate();  // 同じ合言葉で、先生の名前・画像も読み込む
        return openOnline();
      }

      case 'online-logout':
        await Net.logout();
        clearPrivate();
        privateStatus = 'off';
        return openOnline();

      case 'online-create': {
        const { deck, name } = readOnlineChoice();
        showOnline({ step: 'busy' });
        const code = await Net.createRoom(deck, settings.field, name);
        saveRoom(code);
        showOnline({ step: 'waiting', code });
        // 相手が入ってきたら、対戦を始める
        stopRoomWatch = await Net.watchRoom(code, (room) => startOnline(code, room, 0));
        return;
      }

      case 'online-cancel': {
        const code = savedRoom();
        stopOnline();
        saveRoom(null);
        if (code) await Net.cancelRoom(code);
        return openOnline();
      }

      case 'online-join':
      case 'online-rejoin': {
        const choice = readOnlineChoice();
        const code = name === 'online-rejoin' ? savedRoom() : input('code');
        if (!code) return;
        showOnline({ step: 'busy' });
        const { room, seat } = await Net.joinRoom(code, choice.deck, choice.name);
        if (room.status === 'waiting') {
          // 自分が作った、まだ相手のいないルームに戻った
          showOnline({ step: 'waiting', code: code.toUpperCase() });
          stopRoomWatch = await Net.watchRoom(code.toUpperCase(), (r) => startOnline(code.toUpperCase(), r, 0));
          return;
        }
        return startOnline(code.toUpperCase(), room, seat);
      }
    }
  } catch (e) {
    console.warn(e);
    return openOnline(e.message || '通信できませんでした');
  }
}

// ------------------------------------------------------------
// 操作の受け取り
// ------------------------------------------------------------
bindInput({
  act(name, data) {
    // data-silent のボタン(反撃する・回収するカード)は、専用の音が鳴るのでクリック音なし
    if (!data.silent) playSound('click');
    if (name === 'toggle-sfx') {
      settings.sfx = !settings.sfx;
      saveSettings();
      applySoundSettings();
      updateSoundButtons();
      return;
    }
    if (name === 'toggle-bgm') {
      settings.bgm = !settings.bgm;
      saveSettings();
      applySoundSettings();
      if (settings.bgm) startBgm(); else stopBgm();
      updateSoundButtons();
      return;
    }
    if (name === 'start') return startGame();
    if (name === 'to-setup') return showSetup();
    if (name === 'rematch') return startGame();
    if (name.startsWith('online-')) return onlineAct(name);
    if (name === 'private-login') return privateLogin();
    if (name === 'private-logout') {
      Net.logout().catch((e) => console.warn(e));
      clearPrivate();
      privateStatus = 'off';
      return updatePrivateBox();
    }
    if (!state || ui.busy) return;

    switch (name) {
      case 'play':
      case 'promote':
        return submit({ type: name, player: ui.viewer, uid: ui.selected });
      case 'end-turn':
        return requestEndTurn();
      case 'end-turn-yes':
        if (els.overlay.querySelector('input[name="skip-confirm"]')?.checked) {
          settings.confirmEnd = false;
          saveSettings();
        }
        ui.overlay = null;
        return submit({ type: 'endTurn', player: ui.viewer });
      case 'choose':
        return submit({ type: 'choose', player: ui.viewer, value: data.null ? null : data.value });
      case 'cancel':
        ui.selected = null;
        return render();
      case 'curtain-ok':
        ui.viewer = ui.overlay.player;
        showPhaseOverlay();
        return render();
      case 'mulligan-keep':
      case 'mulligan-redraw':
        ui.overlay = null;
        R.renderOverlay(els.overlay, state, ui);
        return submit({ type: 'mulligan', player: ui.viewer, redraw: name === 'mulligan-redraw' });
      case 'open-trash':
        if (ui.overlay) return;
        ui.overlay = { kind: 'trash', p: Number(data.p) };
        return render();
      case 'close-overlay':
        ui.overlay = null;
        return render();
      case 'concede':
        if (ui.overlay || state.winner !== null) return;
        ui.overlay = { kind: 'concede' };
        return render();
      case 'concede-yes':
        ui.overlay = null;
        render();
        return submit({ type: 'concede', player: ui.viewer });
    }
  },

  card(uid, cid) {
    if (cid) {
      ui.preview = `${cid}|${uid}`;
      R.renderPreview(els.preview, state, ui.preview);
    }
    if (!state || ui.busy || ui.overlay || !myTurn()) return;
    const legal = getLegalActions(state, ui.viewer);

    // 選択待ち:光っているカードを選ぶ
    if (state.pending) {
      if (legal.some((a) => a.value === uid)) submit({ type: 'choose', player: ui.viewer, value: uid });
      return;
    }
    // 対決の相手を選ぶ
    if (ui.selected) {
      const attack = legal.find((a) => a.type === 'attack' && a.attacker === ui.selected && a.target === uid);
      if (attack) return submit(attack);
    }
    // 手札のカード・対決できる先生を選ぶ(もう一度押すと解除)
    const inHand = state.players[ui.viewer].hand.includes(uid);
    const canAttack = legal.some((a) => a.type === 'attack' && a.attacker === uid);
    if (inHand || canAttack) {
      ui.selected = ui.selected === uid ? null : uid;
      if (ui.selected) playSound('select');
    } else {
      ui.selected = null;
    }
    render();
  },

  // ドラッグ開始:使える手札・対決できる先生だけ掴める
  dragStart(uid) {
    if (!canInteract()) return false;
    const legal = getLegalActions(state, ui.viewer);
    const ok = legal.some((a) => a.uid === uid || a.attacker === uid);
    if (!ok) return false;
    ui.selected = uid;  // 対決の相手などを光らせる
    ui.dragging = uid;
    playSound('select');
    render();
    return true;
  },

  dragOver(uid, el) {
    return !!(state && dropAction(uid, el));
  },

  async drop(uid, el, rect) {
    const drop = canInteract() ? dropAction(uid, el) : null;
    ui.dragging = null;
    if (!drop) {
      ui.selected = null;
      return render();
    }
    if (ui.online) {
      // オンライン:昇格の続き(重ねた先生の自壊)は、昇格が届いてから送る
      followUp = drop.then ?? null;
      return submit(drop.action);
    }
    await dispatch(drop.action, { fromRect: rect });
    // 昇格:重ねた先生をそのまま自壊させる
    if (drop.then && state.pending?.resolve === 'promote'
      && state.pending.options.some((o) => o.value === drop.then)) {
      await dispatch({ type: 'choose', player: ui.viewer, value: drop.then });
    }
  },

  dragCancel() {
    ui.dragging = null;
    ui.selected = null;
    if (state) render();
  },

  background() {
    if (ui.selected && !ui.busy) {
      ui.selected = null;
      render();
    }
  },

  hover(key) {
    if (!state || els.game.hidden) return;
    ui.preview = key;
    R.renderPreview(els.preview, state, key);
  },

  escape() {
    if (ui.busy) return;
    if (ui.overlay && ['trash', 'concede', 'endConfirm'].includes(ui.overlay.kind)) {
      ui.overlay = null;
      render();
    } else if (ui.selected) {
      ui.selected = null;
      render();
    }
  },
});

loadCachedPrivate();  // 前に読み込んだ先生の名前・画像があれば、すぐ使う
loadCardImages();  // 画像の確認は裏で進める(対戦開始までには終わる)
loadSounds();
applySoundSettings();
showSetup();
checkPrivate();  // 合言葉でログイン中なら、最新の名前・画像を読み込む(裏で)
