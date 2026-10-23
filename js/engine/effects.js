// ============================================================
// カード効果の中身
//
// ・先生:場に出た時(ENTER)/ 撃破時(DESTROY)
// ・授業:使えるかどうか(can)と、使った時の処理(run)
// ・選択を求めた後の続き(RESOLVERS)
// ============================================================

import {
  log, pName, cardName, cardOf, draw, discard, removeFromHand, bounce, destroy,
  findTeacher, playCost, zoneLimit, pushFront, ask, opp, teacherOptions, cardOptions, power, fieldNotice, CONFIG,
} from './game-state.js';
import { CARDS } from '../data/cards.js';

// 効果の数字は、すべて cards.js に書いてある(例:C('S1').amount)
const C = (id) => CARDS[id];

const hasTeacher = (state, p) => state.players[p].zone.length > 0;
const trashTeachers = (state, p) =>
  state.players[p].trash.filter((uid) => cardOf(state, uid).type === 'teacher');

// ---- 先生を場に出す(通常プレイ・昇格・S9 共通) ----
export function enterField(state, p, uid) {
  // スピードアタッカーは召喚酔いしない
  const sick = !cardOf(state, uid).haste;
  state.players[p].zone.push({ uid, sick, attacked: false, temp: 0, guard: false });
  log(state, `${pName(p)}が${cardName(state, uid)}を場に出した`);
  // Stadium のおかげで、ふだんの上限より多く出せた時にお知らせ
  const n = state.players[p].zone.length;
  if (state.field === 'F1' && n > CONFIG.ZONE_LIMIT) {
    fieldNotice(state, `${n}体目の{teacher}を場に出せた`);
  }
  pushFront(state, [{ kind: 'onEnter', player: p, uid }]);
}

// ---- 場に出た時の効果 ----
const ENTER = {
  '1C'(state, p, uid) {
    const { amount } = C('1C');
    const opts = teacherOptions(state, p, (t) => t.uid !== uid);
    if (opts.length) ask(state, p, `1C:{power}+${amount}する{teacher}を選んでください`, opts, 'tempPower', { amount });
  },
  '1D'(state, p) {
    const hand = state.players[p].hand;
    const n = C('1D').draw;
    if (hand.length) {
      ask(state, p, `1D:捨てるカードを選ぶと${n}枚引けます(選ばなくてもOK)`,
        cardOptions(state, hand), 'discardDraw', { n }, true);
    }
  },
  '2A'(state, p) { draw(state, p, C('2A').draw); },
  '2C'(state, p) {
    const n = C('2C').mana;
    state.players[p].mana += n;
    log(state, `${pName(p)}の{mana}+${n}(このターンのみ)`);
  },
  '5B'(state, p) {
    // 自分自身にも付けられる
    ask(state, p, '5B:{guard}を付ける{teacher}を選んでください', teacherOptions(state, p), 'guard');
  },
  '5C'(state, p) {
    const opts = cardOptions(state, trashTeachers(state, p));
    if (opts.length) ask(state, p, '5C:{trash}から{hand}に戻す{teacher}を選んでください', opts, 'recover');
  },
};

// ---- 撃破時の効果 ----
const DESTROY = {
  '1B'(state, p) { draw(state, p, C('1B').draw); },
  '2C'(state, p) { draw(state, p, C('2C').draw); },
  '2B'(state, p) {
    // 回収できるのは先生カードだけ(授業カードは回収できない)
    const opts = cardOptions(state, trashTeachers(state, p));
    if (opts.length) ask(state, p, '2B:{trash}から{hand}に戻す{teacher}を選んでください', opts, 'recover');
  },
  '3C'(state, p) {
    const { amount, draw: n } = C('3C');
    pushFront(state, [{ kind: 'draw', player: p, n }]); // 選択の後に引く
    const opts = teacherOptions(state, opp(p));
    if (opts.length) ask(state, p, `3C:{power}-${amount}する相手の{teacher}を選んでください`, opts, 'tempPower', { amount: -amount });
  },
};

// ---- 授業カード ----
// can: 使える状況か(手札にこのカードがある状態で判定)
// run: 使った時の処理
export const LESSONS = {
  S1: {
    can: (state, p) => hasTeacher(state, opp(p)),
    run: (state, p) => ask(state, p, `S1:{power}-${C('S1').amount}する相手の{teacher}を選んでください`,
      teacherOptions(state, opp(p)), 'tempPower', { amount: -C('S1').amount }),
  },
  S2: {
    can: (state, p) => state.players[p].trash.length > 0,
    run: (state, p) => ask(state, p, 'S2:{trash}から{hand}に戻すカードを選んでください',
      cardOptions(state, state.players[p].trash), 'recover'),
  },
  S3: {
    can: (state, p) => hasTeacher(state, p),
    run: (state, p) => ask(state, p, `S3:{power}+${C('S3').amount}する{teacher}を選んでください`,
      teacherOptions(state, p), 'tempPower', { amount: C('S3').amount }),
  },
  S4: {
    can: () => true,
    run: (state, p) => draw(state, p, C('S4').draw),
  },
  S5: {
    can: (state, p) => hasTeacher(state, opp(p)),
    run: (state, p) => ask(state, p, 'S5:{hand}に戻す相手の{teacher}を選んでください',
      teacherOptions(state, opp(p)), 'bounce'),
  },
  S6: {
    can: (state, p) => state.players[p].hand.length >= 2,
    run: (state, p) => ask(state, p, 'S6:捨てるカードを選んでください',
      cardOptions(state, state.players[p].hand), 'discardDraw', { n: C('S6').draw }),
  },
  S7: {
    // 手札を1枚捨てて発動。対象は、使う時点のパワーが maxPower 以下の先生だけ
    can: (state, p) => s7Targets(state, p).length > 0 && state.players[p].hand.length >= 2,
    run: (state, p) => ask(state, p, 'S7:捨てるカードを選んでください',
      cardOptions(state, state.players[p].hand), 's7Discard'),
  },
  S8: {
    can: (state, p) => state.players[p].hand.length >= C('S8').minHand,
    run(state, p) {
      for (const uid of [...state.players[p].hand]) discard(state, p, uid);
      for (const t of [...state.players[opp(p)].zone]) {
        if (state.winner === null) destroy(state, t.uid, p);
      }
    },
  },
  S9: {
    can: (state, p) => hasTeacher(state, p),
    run: (state, p) => ask(state, p, 'S9:{destroy}する自分の{teacher}を選んでください',
      teacherOptions(state, p), 's9Sacrifice'),
  },
};

// ---- 順番待ちの処理 ----
export const TASKS = {
  onEnter(state, { player, uid }) {
    ENTER[state.cards[uid].id]?.(state, player, uid);
  },
  onDestroy(state, { player, uid }) {
    DESTROY[state.cards[uid].id]?.(state, player, uid);
  },
  lesson(state, { player, uid }) {
    LESSONS[state.cards[uid].id].run(state, player, uid);
  },
  // 使い終わった授業カードを墓地へ
  toTrash(state, { player, uid }) {
    const stack = state.stack;
    stack.splice(stack.indexOf(uid), 1);
    state.players[player].trash.push(uid);
  },
  draw(state, { player, n }) {
    draw(state, player, n);
  },
  // S9の後半:撃破した先生の「コスト+step以下」の先生を、手札から安く出せる
  // (例:コスト1を撃破→コスト3以下、コスト3を撃破→コスト5以下)
  s9Followup(state, { player, cost }) {
    const pl = state.players[player];
    if (pl.zone.length >= zoneLimit(state)) return;
    const maxCost = cost + C('S9').step;
    const opts = cardOptions(state, pl.hand.filter((uid) => {
      const c = cardOf(state, uid);
      return c.type === 'teacher' && c.cost <= maxCost && pl.mana >= s9Cost(state, uid, cost);
    }));
    if (opts.length) {
      const price = s9Discount(cost) >= maxCost ? '{cost}0' : `{cost}-${s9Discount(cost)}`;
      ask(state, player, `S9:{cost}${maxCost}以下の{teacher}を、${price}で場に出せます(出さなくてもOK)`,
        opts, 's9Play', { from: cost }, true);
    }
  },
};

// 割引の量(cards.js の S9 の discount / discountFromCost1)
const s9Discount = (from) => (from === 1 ? CARDS.S9.discountFromCost1 : CARDS.S9.discount);
const s9Cost = (state, uid, from) => Math.max(0, playCost(state, uid) - s9Discount(from));

// S7の対象になるパワーの上限(cards.js の maxPower)
const s7Max = () => CARDS.S7.maxPower;
const s7Targets = (state, p) =>
  teacherOptions(state, opp(p), (t) => power(state, t.uid) <= s7Max());

// ---- 選択を受け取った後の処理 ----
// (state, pending, value) を受け取る。value は選ばれた選択肢(選ばなければ null)
export const RESOLVERS = {
  tempPower(state, { ctx }, uid) {
    findTeacher(state, uid).t.temp += ctx.amount;
    const sign = ctx.amount > 0 ? '+' : '';
    log(state, `${cardName(state, uid)}の{power}${sign}${ctx.amount}(このターン中)`);
  },
  guard(state, _, uid) {
    findTeacher(state, uid).t.guard = true;
    log(state, `${cardName(state, uid)}に{guard}が付いた`);
  },
  recover(state, { player }, uid) {
    const pl = state.players[player];
    pl.trash.splice(pl.trash.indexOf(uid), 1);
    pl.hand.push(uid);
    log(state, `${pName(player)}が{trash}から${cardName(state, uid)}を{hand}に戻した`);
  },
  discardDraw(state, { player, ctx }, uid) {
    if (uid === null) return;
    discard(state, player, uid);
    draw(state, player, ctx.n);
  },
  bounce(state, _, uid) {
    bounce(state, uid);
  },
  destroyEnemy(state, { player }, uid) {
    destroy(state, uid, player);
  },
  s7Discard(state, { player }, uid) {
    discard(state, player, uid);
    ask(state, player, `S7:{destroy}する相手の{teacher}を選んでください({power}${s7Max()}以下)`,
      s7Targets(state, player), 'destroyEnemy');
  },
  s9Sacrifice(state, { player }, uid) {
    // 撃破時効果 → S9の後半 の順に処理されるよう、後半を先に積む
    pushFront(state, [{ kind: 's9Followup', player, cost: cardOf(state, uid).cost }]);
    destroy(state, uid, player);
  },
  s9Play(state, { player, ctx }, uid) {
    if (uid === null) return;
    state.players[player].mana -= s9Cost(state, uid, ctx.from);
    removeFromHand(state, player, uid);
    enterField(state, player, uid);
  },
  // 5Cの昇格:ctx.uid が5C、選ばれた uid が自壊させる先生
  promote(state, { player, ctx }, uid) {
    removeFromHand(state, player, ctx.uid);
    state.stack.push(ctx.uid); // 場に出るまでの間、一時的に置いておく
    pushFront(state, [{ kind: 'promoteEnter', player, uid: ctx.uid }]);
    log(state, `${pName(player)}が${cardName(state, uid)}を{destroy}して{promote}!`);
    destroy(state, uid, player);
  },
};

// 昇格で5Cが場に出る(自壊した先生の撃破時効果の後)
TASKS.promoteEnter = (state, { player, uid }) => {
  state.stack.splice(state.stack.indexOf(uid), 1);
  enterField(state, player, uid);
};
