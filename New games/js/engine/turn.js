// ============================================================
// ターンの流れ
//
// マリガン → [ドロー → 準備(マナ) → メイン → ターン終了処理] の繰り返し
// ============================================================

import { CONFIG, log, pName, draw, shuffle, takeSide, opp } from './game-state.js';

// マリガン:1回だけ、手札を山札に戻して同じ枚数を引き直せる
export function mulligan(state, p, redraw) {
  const pl = state.players[p];
  if (redraw) {
    const n = pl.hand.length;
    pl.deck.push(...pl.hand);
    pl.hand = [];
    shuffle(state, pl.deck);
    draw(state, p, n, { silent: true });
    log(state, `${pName(p)}が{mulligan}をした`);
  } else {
    log(state, `${pName(p)}は{mulligan}をしなかった`);
  }
  pl.mulliganDone = true;

  if (state.players.every((x) => x.mulliganDone)) {
    state.phase = 'main';
    startTurn(state);
  }
}

// ターン開始:ドロー → マナ上限アップ・全回復(数値は js/data/rules.js)
export function startTurn(state) {
  state.turn += 1;
  state.battleThisTurn = false;
  const p = state.active;
  const pl = state.players[p];
  pl.turnsTaken += 1;  // そのプレイヤーにとって何回目のターンか
  log(state, `―― ${state.turn}ターン目:${pName(p)}のターン ――`);

  for (const t of pl.zone) t.attacked = false;
  // 先攻の1ターン目はドローしない(先攻有利の対策。CONFIG.FIRST_TURN_DRAW で変更可)
  if (state.turn > 1 || CONFIG.FIRST_TURN_DRAW) draw(state, p, CONFIG.DRAW_PER_TURN);

  pl.manaMax += CONFIG.MANA_PER_TURN;
  if (CONFIG.MANA_CAP !== null) pl.manaMax = Math.min(pl.manaMax, CONFIG.MANA_CAP);
  pl.mana = pl.manaMax;
}

// ターン終了処理
export function endTurn(state) {
  const p = state.active;
  const me = state.players[p];

  // 自分の場に先生がいないままターンを終えた時(自分の2ターン目以降・このターンに対決なし):
  // 相手がサイドを1枚獲得し、自分はカードを1枚引く。
  // (どちらのプレイヤーにも、先生を出すまで自分のターン2回分の猶予がある)
  const quiet = me.turnsTaken >= CONFIG.EMPTY_FIELD_RULE_FROM_OWN_TURN && !state.battleThisTurn;
  if (quiet && me.zone.length === 0) {
    log(state, `${pName(p)}の場に{teacher}がいないままターンを終えたため、${pName(opp(p))}が{side}を獲得`);
    takeSide(state, opp(p));
    if (state.winner !== null) return;
    draw(state, p, CONFIG.EMPTY_FIELD_DRAW);
  }

  // 召喚酔い解除・このターン中のパワー増減をリセット
  for (const pl of state.players) {
    for (const t of pl.zone) {
      t.temp = 0;
      if (pl === me) t.sick = false;
    }
  }

  state.active = opp(p);
  startTurn(state);
}
