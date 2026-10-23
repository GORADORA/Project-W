// ============================================================
// ルールエンジンの入口
//
// 画面(ui)やオンライン対戦(net)からは、この3つだけを使う:
//   createGame(設定)          … 対戦を始める
//   getLegalActions(盤面, p)  … プレイヤーpが今できる操作の一覧
//   applyAction(盤面, 操作)    … 操作を実行して、新しい盤面を返す
//
// 操作(action)の種類:
//   { type: 'mulligan', player, redraw: true/false }
//   { type: 'play',     player, uid }            カードを使う
//   { type: 'promote',  player, uid }            5Cを昇格で出す
//   { type: 'attack',   player, attacker, target }
//   { type: 'choose',   player, value }          選択に答える(null = 選ばない)
//   { type: 'endTurn',  player }
//   { type: 'concede',  player }                 降参
// ============================================================

import {
  createGame, cardOf, playCost, zoneLimit, pushFront, removeFromHand,
  log, pName, cardName, opp, fieldNotice, CONFIG,
} from './game-state.js';
import { mulligan, endTurn } from './turn.js';
import { CARDS } from '../data/cards.js';
import { declareBattle, BATTLE_TASKS, BATTLE_RESOLVERS } from './battle.js';
import { enterField, LESSONS, TASKS as EFFECT_TASKS, RESOLVERS as EFFECT_RESOLVERS } from './effects.js';

export { createGame };
export { power, zoneLimit, playCost, cardOf, CONFIG } from './game-state.js';

const TASKS = { ...EFFECT_TASKS, ...BATTLE_TASKS };
const RESOLVERS = { ...EFFECT_RESOLVERS, ...BATTLE_RESOLVERS };

// ---- 今できる操作の一覧 ----
export function getLegalActions(state, p) {
  if (state.winner !== null) return [];
  const actions = [];
  const pl = state.players[p];

  if (state.phase === 'mulligan') {
    if (!pl.mulliganDone) {
      actions.push({ type: 'mulligan', player: p, redraw: false });
      actions.push({ type: 'mulligan', player: p, redraw: true });
    }
    return actions;
  }

  // 選択待ちがあれば、それに答えることしかできない
  if (state.pending) {
    if (state.pending.player !== p) return [];
    for (const o of state.pending.options) actions.push({ type: 'choose', player: p, value: o.value });
    if (state.pending.optional) actions.push({ type: 'choose', player: p, value: null });
    return actions;
  }

  if (state.active !== p) return [];

  for (const uid of pl.hand) {
    if (canPlay(state, p, uid)) actions.push({ type: 'play', player: p, uid });
    if (canPromote(state, p, uid)) actions.push({ type: 'promote', player: p, uid });
  }
  for (const a of pl.zone) {
    if (a.sick || a.attacked) continue;
    for (const t of state.players[opp(p)].zone) {
      actions.push({ type: 'attack', player: p, attacker: a.uid, target: t.uid });
    }
  }
  actions.push({ type: 'endTurn', player: p });
  return actions;
}

function canPlay(state, p, uid) {
  const pl = state.players[p];
  if (pl.mana < playCost(state, uid)) return false;
  const c = cardOf(state, uid);
  if (c.type === 'teacher') {
    // 先攻有利の対策:先攻の1ターン目は先生を出せない(CONFIG.FIRST_TURN_NO_TEACHER)
    if (state.turn === 1 && CONFIG.FIRST_TURN_NO_TEACHER) return false;
    return pl.zone.length < zoneLimit(state);
  }
  return LESSONS[c.id].can(state, p);
}

// 5Cの昇格:コスト minCost(cards.js)以上で「登場したてではない」自分の先生がいれば、マナなしで出せる
const promoteTargets = (state, p) =>
  state.players[p].zone.filter((t) => cardOf(state, t.uid).cost >= CARDS['5C'].minCost && !t.sick);

function canPromote(state, p, uid) {
  if (state.cards[uid].id !== '5C') return false;
  return promoteTargets(state, p).length > 0;
}

// ---- 操作を実行する ----
// 元の盤面は変更せず、新しい盤面を返す。ルール違反の操作はエラーになる。
export function applyAction(prevState, action) {
  const key = JSON.stringify(normalize(action));
  const legal = getLegalActions(prevState, action.player)
    .some((a) => JSON.stringify(normalize(a)) === key);
  if (action.type !== 'concede' && !legal) {
    throw new Error(`その操作は今はできません:${JSON.stringify(action)}`);
  }

  const state = structuredClone(prevState);
  state.events = [];  // 出来事の記録は、操作ごとにリセット
  const p = action.player;

  switch (action.type) {
    case 'mulligan':
      mulligan(state, p, action.redraw);
      break;

    case 'play': {
      const pl = state.players[p];
      const cost = playCost(state, action.uid);
      if (cost < cardOf(state, action.uid).cost) {
        fieldNotice(state, `${cardName(state, action.uid)}の{cost}が${cardOf(state, action.uid).cost}→${cost}に下がった`);
      }
      pl.mana -= cost;
      removeFromHand(state, p, action.uid);
      if (cardOf(state, action.uid).type === 'teacher') {
        enterField(state, p, action.uid);
      } else {
        log(state, `${pName(p)}が${cardName(state, action.uid)}を使った`);
        state.stack.push(action.uid);
        pushFront(state, [
          { kind: 'lesson', player: p, uid: action.uid },
          { kind: 'toTrash', player: p, uid: action.uid },
        ]);
      }
      break;
    }

    case 'promote': {
      const opts = promoteTargets(state, p)
        .map((t) => ({ value: t.uid, label: cardName(state, t.uid) }));
      state.pending = {
        player: p, prompt: '{promote}:{destroy}する自分の{teacher}を選んでください', options: opts,
        optional: false, resolve: 'promote', ctx: { uid: action.uid },
      };
      break;
    }

    case 'attack':
      declareBattle(state, p, action.attacker, action.target);
      break;

    case 'choose': {
      const pending = state.pending;
      state.pending = null;
      RESOLVERS[pending.resolve](state, pending, action.value);
      break;
    }

    case 'endTurn':
      endTurn(state);
      break;

    case 'concede':
      state.winner = opp(p);
      state.phase = 'gameover';
      log(state, `${pName(p)}が降参した`);
      break;
  }

  runQueue(state);
  return state;
}

// 選択待ちが発生するか、順番待ちが空になるまで効果を処理する
function runQueue(state) {
  while (!state.pending && state.winner === null && state.queue.length) {
    const task = state.queue.shift();
    TASKS[task.kind](state, task);
  }
  if (state.winner !== null) {
    state.pending = null;
    state.queue = [];
  }
}

// 比較用に、操作のキーの並び順をそろえる
function normalize(action) {
  const order = ['type', 'player', 'redraw', 'uid', 'attacker', 'target', 'value'];
  const out = {};
  for (const k of order) if (k in action) out[k] = action[k];
  return out;
}
