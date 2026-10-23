// ============================================================
// 盤面の状態と、共通で使う小さな処理
//
// 盤面(state)はただのデータ(JSON)にしてある。
// → そのままFirebaseに保存・送信できる
// → 同じ操作を同じ順番で行えば、どのパソコンでも同じ結果になる
// ============================================================

import { CARDS, FIELDS, FIELD, cardText } from '../data/cards.js';
import { expandDeck } from '../data/decks.js';
import { CONFIG } from '../data/rules.js';

// ゲームの基本設定の数値は js/data/rules.js にまとめてある
export { CONFIG };

// ---- 乱数(シード付き) ----
// 同じシードなら同じ順番で乱数が出るので、対戦の再現や同期に使える
export function random(state) {
  let t = (state.rng += 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function shuffle(state, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random(state) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ---- 対戦の準備 ----
// deckKeys: ['aggro', 'control'] のように、2人分のデッキを指定
export function createGame({ deckKeys, seed = Date.now(), fieldId = null }) {
  const state = {
    rng: seed | 0,
    turn: 0,             // 何ターン目か(両者合わせて数える)
    active: 0,           // 今が誰のターンか(0 or 1)
    phase: 'mulligan',   // 'mulligan' → 'main' → 'gameover'
    field: null,         // 教室カードのID
    battleThisTurn: false,
    cards: {},           // カード1枚ごとの情報 { uid: { id, owner } }
    players: [],
    stack: [],           // 効果を処理中のカード(使用中の授業など)
    queue: [],           // これから処理する効果の順番待ち
    pending: null,       // プレイヤーの選択待ち
    winner: null,
    log: [],
    events: [],          // 直前の操作で起きた出来事(画面の演出・お知らせ用)
  };

  state.field = fieldId ?? FIELDS[Math.floor(random(state) * FIELDS.length)].id;

  let n = 0;
  for (let p = 0; p < 2; p++) {
    const deck = expandDeck(deckKeys[p]).map((id) => {
      const uid = `c${n++}`;
      state.cards[uid] = { id, owner: p };
      return uid;
    });
    shuffle(state, deck);
    state.players.push({
      deckKey: deckKeys[p],
      deck,
      hand: [],
      side: deck.splice(0, CONFIG.SIDE_SIZE), // 山札の上から4枚を裏向きで
      trash: [],                              // 墓地
      zone: [],                               // 場の先生 { uid, sick, attacked, temp, guard }
      manaMax: 0,
      mana: 0,
      turnsTaken: 0,     // 自分のターンが何回来たか
      mulliganDone: false,
    });
    draw(state, p, CONFIG.HAND_SIZE, { silent: true });
  }

  state.active = random(state) < 0.5 ? 0 : 1; // 先攻をランダムに決める
  const f = FIELDS.find((x) => x.id === state.field);
  log(state, state.field === 'F0' ? '{field}:なし' : `{field}「${f.name}」:${cardText(f)}`);
  log(state, `先攻は${pName(state.active)}`);
  if (CONFIG.SECOND_PLAYER_SIDE_MINUS) {
    const pl = state.players[opp(state.active)];
    pl.deck.push(pl.side.shift());
    shuffle(state, pl.deck);
    log(state, `後攻の${pName(opp(state.active))}は{side}が1枚少ない状態で始まる`);
  }
  if (CONFIG.SECOND_PLAYER_BONUS_SIDE) {
    const second = opp(state.active);
    log(state, `後攻の${pName(second)}は{side}を1枚獲得した状態で始まる`);
    takeSide(state, second);
  }
  return state;
}

// ---- 表示用の名前 ----
// プレイヤーの名前は、表示する時に入力された名前へ置き換わる(terms.js の fmt)
export const pName = (p) => `{p${p}}`;
export const opp = (p) => 1 - p;

export function cardName(state, uid) {
  const c = CARDS[state.cards[uid].id];
  return c.name === c.id ? c.id : `${c.name}(${c.id})`;
}

export function log(state, msg) {
  state.log.push(msg);
}

// 画面に伝えたい出来事を記録する(対決の結果、教室の効果が働いた、など)
export function emit(state, event) {
  state.events.push(event);
}

// 教室の効果が働いたことを知らせる
export function fieldNotice(state, text) {
  const f = FIELDS.find((x) => x.id === state.field);
  emit(state, { type: 'field', field: f.id, name: f.name, text });
}

// ---- カード情報の取得 ----
export const cardOf = (state, uid) => CARDS[state.cards[uid].id];

// 実際に支払うコスト(購買 = Knowledge-Tree の効果を反映)
export function playCost(state, uid) {
  const cost = cardOf(state, uid).cost;
  if (state.field !== 'F4') return cost;
  const { costDown, minCost } = FIELD.F4;
  // もともと下限より安いカード(コスト0のS9など)は、そのまま(「最低1」で逆に上がらないように)
  return cost <= minCost ? cost : Math.max(minCost, cost - costDown);
}

// 先生ゾーンに置ける数(Stadium の時は cards.js の F1 の zoneLimit)
export function zoneLimit(state) {
  return state.field === 'F1' ? FIELD.F1.zoneLimit : CONFIG.ZONE_LIMIT;
}

// 場の先生を uid で探す → { p, t } または null
export function findTeacher(state, uid) {
  for (let p = 0; p < 2; p++) {
    const t = state.players[p].zone.find((x) => x.uid === uid);
    if (t) return { p, t };
  }
  return null;
}

// 先生の今のパワー(元の値 + このターン中の増減 + 常時効果)
export function power(state, uid) {
  const { p, t } = findTeacher(state, uid);
  const me = cardOf(state, uid);
  let total = me.power + t.temp;
  for (const other of state.players[p].zone) {
    const id = state.cards[other.uid].id;
    if (id === '3A' && me.cost <= CARDS['3A'].maxCost) total += CARDS['3A'].amount;
    if (id === '4A') total += CARDS['4A'].amount; // 4A自身も含む
  }
  return total;
}

// ---- カードの移動 ----
export function draw(state, p, count = 1, { silent = false } = {}) {
  const pl = state.players[p];
  for (let i = 0; i < count; i++) {
    if (pl.deck.length === 0) {
      if (!silent) log(state, `${pName(p)}の{deck}が0枚のため、引けなかった`);
      return;
    }
    pl.hand.push(pl.deck.shift());
  }
  if (!silent) log(state, `${pName(p)}がカードを${count}枚引いた`);
}

export function removeFromHand(state, p, uid) {
  const hand = state.players[p].hand;
  hand.splice(hand.indexOf(uid), 1);
}

export function discard(state, p, uid) {
  removeFromHand(state, p, uid);
  state.players[p].trash.push(uid);
  log(state, `${pName(p)}が${cardName(state, uid)}を捨てた`);
}

// 場の先生を持ち主の手札に戻す(バウンス)
export function bounce(state, uid) {
  const { p } = findTeacher(state, uid);
  const zone = state.players[p].zone;
  zone.splice(zone.findIndex((x) => x.uid === uid), 1);
  state.players[p].hand.push(uid);
  log(state, `${cardName(state, uid)}が${pName(p)}の{hand}に戻った`);
}

// サイドを1枚手札に加える。0枚になったら勝利
export function takeSide(state, p) {
  const pl = state.players[p];
  if (pl.side.length === 0 || state.winner !== null) return;
  pl.hand.push(pl.side.shift());
  log(state, `${pName(p)}が{side}を1枚獲得(残り${pl.side.length}枚)`);
  if (pl.side.length === 0) {
    state.winner = p;
    state.phase = 'gameover';
    log(state, `${pName(p)}の勝利!`);
  }
}

// 先生を撃破する
// by: 撃破したプレイヤー。持ち主と同じなら「自分の先生を撃破」(S9・5Cの昇格)扱い:
//     ガードは効かず、撃破報酬(サイド)は相手が獲得する
//     (スピードデッキは「相手にサイドを与える代わりに素早く展開する」コンセプト)
// reward: false なら撃破報酬(サイド獲得)なし
// 戻り値: 実際に撃破されたら true
export function destroy(state, uid, by, { reward = true } = {}) {
  const { p, t } = findTeacher(state, uid);
  const selfDestroy = by === p;

  if (t.guard && !selfDestroy) {
    t.guard = false;
    log(state, `${cardName(state, uid)}の{guard}が{destroy}を防いだ`);
    return false;
  }

  const pl = state.players[p];
  pl.zone.splice(pl.zone.indexOf(t), 1);
  const c = cardOf(state, uid);
  if (state.field === 'F5' && c.cost <= FIELD.F5.maxCost) {
    pl.hand.push(uid);
    const fieldName = FIELDS.find((x) => x.id === state.field).name;
    log(state, `${cardName(state, uid)}が{destroy}され、${fieldName}の効果で{hand}に戻った`);
    fieldNotice(state, `${cardName(state, uid)}は{trash}ではなく${pName(p)}の{hand}に戻った`);
  } else {
    pl.trash.push(uid);
    log(state, `${cardName(state, uid)}が{destroy}された`);
  }

  // 撃破時効果を、順番待ちの先頭に入れる
  pushFront(state, [{ kind: 'onDestroy', player: p, uid }]);

  // 撃破報酬:撃破された先生の持ち主の相手がサイドを獲得(自分の先生を撃破した時も相手が獲得)
  // ただし 1D のように「撃破されても相手はサイドを獲得しない」先生もいる(cards.js の noSide)
  if (reward && c.noSide) log(state, `${cardName(state, uid)}の効果で、${pName(opp(p))}は{side}を獲得しない`);
  else if (reward) takeSide(state, opp(p));
  return true;
}

// ---- 効果の順番待ち ----
// 新しく発生した効果は、今の処理の直後(=先頭)に割り込ませる
export function pushFront(state, tasks) {
  state.queue.unshift(...tasks);
}

// プレイヤーに選択を求める
// options: [{ value, label }]  optional: true なら「選ばない」もOK
export function ask(state, player, prompt, options, resolve, ctx = {}, optional = false) {
  state.pending = { player, prompt, options, optional, resolve, ctx };
}

// 選択肢を作る便利関数
export const teacherOptions = (state, p, filter = () => true) =>
  state.players[p].zone
    .filter((t) => filter(t))
    .map((t) => ({ value: t.uid, label: `${cardName(state, t.uid)}({power}${power(state, t.uid)})` }));

export const cardOptions = (state, uids) =>
  uids.map((uid) => ({ value: uid, label: cardName(state, uid) }));
