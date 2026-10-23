// ============================================================
// 対決と反撃
//
// 流れ:対決を宣言 → 防御側が反撃を使うか選ぶ → パワーを比べる
// ============================================================

import {
  log, pName, cardName, cardOf, power, destroy, discard, findTeacher,
  pushFront, ask, opp, cardOptions, emit,
} from './game-state.js';
import { CARDS } from '../data/cards.js';

// 対決を宣言する
export function declareBattle(state, p, attacker, target) {
  findTeacher(state, attacker).t.attacked = true;
  state.battleThisTurn = true;
  log(state, `${pName(p)}の${cardName(state, attacker)}が${cardName(state, target)}に{battle}を挑んだ`);

  const d = opp(p);
  const options = [{ value: 'pass', label: '{counter}せずに受ける' }];
  const hand = state.players[d].hand;
  const b3 = CARDS['3B'];
  for (const uid of hand) {
    const id = state.cards[uid].id;
    // 3Bは、コスト3以上の先生に攻撃された時だけ使える
    if (id === '3B' && cardOf(state, attacker).cost >= b3.counterMinCost) {
      options.push({ value: uid, label: `{hand}の3Bを捨てて{counter}(攻撃側の{power}-${b3.counterPower})` });
    }
    if (id === 'S5' && hand.length >= 2) {
      options.push({ value: uid, label: 'S5+{hand}1枚を捨てて{counter}({battle}を無効にする)' });
    }
  }
  ask(state, d, '{battle}を挑まれました。{counter}しますか?', options, 'counter', { attacker, target });
}

export const BATTLE_TASKS = {
  // パワーを比べて、勝敗を決める
  // noReward: 手札の3Bで反撃した対決では、攻撃側を撃破してもサイドを獲得しない
  battle(state, { attacker, target, noReward = false }) {
    if (!findTeacher(state, attacker) || !findTeacher(state, target)) {
      log(state, '{battle}は無効になった');
      return;
    }
    const a = power(state, attacker);
    const t = power(state, target);
    const ap = findTeacher(state, attacker).p;
    log(state, `{battle}:${cardName(state, attacker)}(${a}) vs ${cardName(state, target)}(${t})`);

    const defeatAttacker = () => {
      if (noReward) log(state, '3Bの{counter}による{destroy}のため、{side}は獲得しない');
      destroy(state, attacker, opp(ap), { reward: !noReward });
    };
    const ids = { attackerId: state.cards[attacker].id, targetId: state.cards[target].id };
    if (a > t) {
      destroy(state, target, ap);
    } else if (a < t) {
      defeatAttacker();
    } else {
      log(state, '同点!両者相打ち');
      destroy(state, target, ap);
      defeatAttacker();
    }
    // 画面の演出用:結果と、実際に場を離れたか(ガードで防いだ場合は残る)
    emit(state, {
      type: 'battle', attacker, target, ...ids, a, t, attackerOwner: ap,
      result: a > t ? 'attacker' : a < t ? 'target' : 'draw',
      attackerDown: !findTeacher(state, attacker),
      targetDown: !findTeacher(state, target),
    });
  },
};

export const BATTLE_RESOLVERS = {
  counter(state, { player, ctx }, value) {
    const { attacker, target } = ctx;
    const battleTask = { kind: 'battle', attacker, target };

    if (value === 'pass') {
      pushFront(state, [battleTask]);
      return;
    }
    if (state.cards[value].id === '3B') {
      log(state, `${pName(player)}が{hand}の3Bを公開して{counter}`);
      discard(state, player, value);
      const amount = CARDS['3B'].counterPower;
      findTeacher(state, attacker).t.temp -= amount;
      log(state, `${cardName(state, attacker)}の{power}-${amount}(このターン中)`);
      pushFront(state, [{ ...battleTask, noReward: true }]);
      return;
    }
    // S5の反撃:S5を捨て、さらに手札を1枚捨てる
    log(state, `${pName(player)}がS5で{counter}`);
    discard(state, player, value);
    ask(state, player, 'S5:追加で捨てるカードを選んでください',
      cardOptions(state, state.players[player].hand), 's5Counter', { attacker, target });
  },
  // S5の反撃:対決を無効にするだけ(攻撃側は場に残る)
  s5Counter(state, { player, ctx }, uid) {
    discard(state, player, uid);
    log(state, '{battle}は無効になった');
    emit(state, {
      type: 'battle', result: 'nullified', attacker: ctx.attacker, target: ctx.target,
      attackerId: state.cards[ctx.attacker].id, targetId: state.cards[ctx.target].id,
    });
  },
};
