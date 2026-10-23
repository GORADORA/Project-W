// ============================================================
// AI同士の自動対戦
// ============================================================

import { createGame, applyAction } from '../engine/index.js';
import { chooseAction } from './ai.js';

const MAX_TURNS = 60;  // これを超えたら引き分け扱い

// 1試合を最後まで行う
// banned: 実験用。[プレイヤー1が使わないカードID[], プレイヤー2が使わないカードID[]]
// 戻り値:{ winner: 0|1|null, first: 先攻のプレイヤー, turns, field, used }
// used: 各プレイヤーが使ったカード(プレイ・昇格・手札からの反撃)と、最初に使ったターン
//       [[['1A', 3], ['S1', 5], ...], [...]]
// fair: [プレイヤー1が公平モードか, プレイヤー2が公平モードか]
export function playGame(deckKeys, seed, fieldId = null, banned = [[], []], fair = [false, false]) {
  let s = createGame({ deckKeys, seed, fieldId });
  const first = s.active;
  const bannedSets = banned.map((b) => new Set(b));
  const used = [new Map(), new Map()];
  const record = (p, id) => { if (!used[p].has(id)) used[p].set(id, s.turn); };
  // 分析用:最初にサイドを取ったプレイヤーとそのターン、最初に対決したターン
  let firstSide = null;
  let firstBattleTurn = null;

  for (let step = 0; step < 5000; step++) {
    if (s.winner !== null || s.turn > MAX_TURNS) break;
    const p = s.phase === 'mulligan'
      ? (s.players[0].mulliganDone ? 1 : 0)
      : (s.pending ? s.pending.player : s.active);
    const action = chooseAction(s, p, bannedSets[p], { fair: fair[p] });
    if (action.type === 'play' || action.type === 'promote') record(p, s.cards[action.uid].id);
    if (action.type === 'choose' && s.pending.resolve === 'counter' && s.cards[action.value]) {
      record(p, s.cards[action.value].id);
    }
    const before = s.players.map((pl) => pl.side.length);
    s = applyAction(s, action);
    if (!firstSide) {
      const q = [0, 1].find((i) => s.players[i].side.length < before[i]);
      if (q !== undefined) firstSide = { player: q, turn: s.turn };
    }
    if (firstBattleTurn === null && action.type === 'attack') firstBattleTurn = s.turn;
  }
  return {
    winner: s.winner, first, turns: s.turn, field: s.field, used: used.map((u) => [...u]),
    firstSide, firstBattleTurn,
  };
}
