// ============================================================
// ルールエンジンのテスト
// tests/index.html をブラウザで開くと実行される
// ============================================================

import { createGame, applyAction, getLegalActions, power, playCost, CONFIG } from '../js/engine/index.js';
import { CARDS, FIELDS, cardText } from '../js/data/cards.js';
import { DECKS, expandDeck } from '../js/data/decks.js';

// ---- テストの道具 ----
const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function eq(actual, expected, msg) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg}(期待:${JSON.stringify(expected)} / 実際:${JSON.stringify(actual)})`);
  }
}
function throws(fn, msg) {
  try { fn(); } catch { return; }
  throw new Error(msg);
}

// ---- 盤面を自由に組み立てる ----
// players: [{ hand, zone, trash, mana }, ...]  カードはIDで指定
// zone の要素は '1A' または { id: '5B', guard: true, sick: true }
function scenario({ field = 'F1', active = 0, turn = 3, players = [{}, {}] }) {
  // テスト用の盤面は、両者サイド4枚で作る(後攻サイド-1のルールは別のテストで確認)
  const minus = CONFIG.SECOND_PLAYER_SIDE_MINUS;
  CONFIG.SECOND_PLAYER_SIDE_MINUS = false;
  let s = createGame({ deckKeys: ['aggro', 'control'], seed: 1, fieldId: field });
  CONFIG.SECOND_PLAYER_SIDE_MINUS = minus;
  s = applyAction(s, { type: 'mulligan', player: 0, redraw: false });
  s = applyAction(s, { type: 'mulligan', player: 1, redraw: false });
  let n = 0;
  const make = (id, owner) => {
    const uid = `t${n++}`;
    s.cards[uid] = { id, owner };
    return uid;
  };
  players.forEach((spec, p) => {
    const pl = s.players[p];
    pl.hand = (spec.hand ?? []).map((id) => make(id, p));
    pl.trash = (spec.trash ?? []).map((id) => make(id, p));
    pl.zone = (spec.zone ?? []).map((z) => {
      const o = typeof z === 'string' ? { id: z } : z;
      return { uid: make(o.id, p), sick: !!o.sick, attacked: false, temp: 0, guard: !!o.guard };
    });
    pl.mana = pl.manaMax = spec.mana ?? 10;
    pl.turnsTaken = spec.turnsTaken ?? 3;  // そのプレイヤーの何回目のターンか(初期値:3回目)
  });
  s.active = active;
  s.turn = turn;
  s.battleThisTurn = false;
  return s;
}

const act = (s, action) => applyAction(s, action);
const choose = (s, value) => applyAction(s, { type: 'choose', player: s.pending.player, value });
const ids = (s, uids) => uids.map((u) => s.cards[u].id);
const zoneIds = (s, p) => ids(s, s.players[p].zone.map((t) => t.uid));

// ============================================================
// デッキデータ
// ============================================================
// 枚数の決まりは js/data/rules.js の DECK_SIZE・MAX_COPIES(デッキを変えたら、まずここを確認)
test(`デッキの決まり:どのデッキも${CONFIG.DECK_SIZE}枚・同じカードは${CONFIG.MAX_COPIES}枚まで・存在するカードのみ`, () => {
  for (const key of Object.keys(DECKS)) {
    const list = expandDeck(key);
    eq(list.length, CONFIG.DECK_SIZE, `${DECKS[key].name}の枚数`);
    for (const [id, cnt] of Object.entries(DECKS[key].cards)) {
      assert(CARDS[id], `${DECKS[key].name}に存在しないカード${id}`);
      assert(cnt <= CONFIG.MAX_COPIES, `${DECKS[key].name}の${id}が${CONFIG.MAX_COPIES}枚より多い`);
    }
  }
});

test('カードの文章:{@○○} の書き方が、すべて数字に置き換わる', () => {
  for (const c of [...Object.values(CARDS), ...FIELDS]) {
    const text = cardText(c);
    assert(!/\{@/.test(text), `${c.id}の文章に置き換わらない {@…} がある:${text}`);
  }
});

// ============================================================
// 対戦の準備・マリガン
// ============================================================
test('対戦開始時:先攻はサイド4枚・手札5枚・山札11枚、後攻はサイド3枚・手札5枚・山札12枚', () => {
  const s = createGame({ deckKeys: ['aggro', 'control'], seed: 42 });
  const first = s.players[s.active];
  const second = s.players[1 - s.active];
  eq([first.side.length, first.hand.length, first.deck.length], [4, 5, 11], '先攻の枚数');
  eq([second.side.length, second.hand.length, second.deck.length], [3, 5, 12], '後攻の枚数');
});

test('マリガン:枚数は減らず、1回しかできない', () => {
  let s = createGame({ deckKeys: ['aggro', 'control'], seed: 42 });
  s = act(s, { type: 'mulligan', player: 0, redraw: true });
  eq(s.players[0].hand.length, 5, 'マリガン後の手札');
  throws(() => act(s, { type: 'mulligan', player: 0, redraw: true }), '2回目のマリガンができてしまった');
});

test('先攻は1ターン目にドローせず、マナ1で始まる。後攻はドローする', () => {
  let s = createGame({ deckKeys: ['aggro', 'control'], seed: 42 });
  s = act(s, { type: 'mulligan', player: 0, redraw: false });
  s = act(s, { type: 'mulligan', player: 1, redraw: false });
  const pl = s.players[s.active];
  eq([s.turn, pl.hand.length, pl.mana], [1, 5, 1], '先攻:ターン・手札・マナ');
  s = act(s, { type: 'endTurn', player: s.active });
  eq(s.players[s.active].hand.length, 6, '後攻の手札');
});

// ============================================================
// 基本ルール
// ============================================================
test('召喚酔い:出したターンは対決を挑めない', () => {
  let s = scenario({ players: [{ hand: ['1A'] }, { zone: ['1B'] }] });
  s = act(s, { type: 'play', player: 0, uid: s.players[0].hand[0] });
  const attacks = getLegalActions(s, 0).filter((a) => a.type === 'attack');
  eq(attacks.length, 0, '対決の選択肢');
});

test('先生ゾーンは3体まで(体育館なら4体)', () => {
  const spec = [{ hand: ['1A'], zone: ['1A', '1A', '1A'] }, {}];
  const s1 = scenario({ field: 'F4', players: spec });
  assert(!getLegalActions(s1, 0).some((a) => a.type === 'play'), '4体目が出せてしまった');
  const s2 = scenario({ field: 'F1', players: spec });
  assert(getLegalActions(s2, 0).some((a) => a.type === 'play'), '体育館で4体目が出せない');
});

test('常時効果:3Aはコスト2以下に+1000、4Aは自身を含む全員に+500', () => {
  const s = scenario({ players: [{ zone: ['3A', '1A', '4A'] }, {}] });
  const [a3, a1, a4] = s.players[0].zone.map((t) => power(s, t.uid));
  eq([a3, a1, a4], [4000, 3500, 4500], 'パワー');
});

test('スピードアタッカーの仕組み(今は該当カードなし。5Aに一時的に付けて確認)', () => {
  CARDS['5A'].haste = true;
  try {
    let s = scenario({ players: [{ hand: ['5A'] }, { zone: ['1A'] }] });
    s = act(s, { type: 'play', player: 0, uid: s.players[0].hand[0] });
    eq(getLegalActions(s, 0).filter((a) => a.type === 'attack').length, 1, '出したターンに対決できる');
  } finally {
    delete CARDS['5A'].haste;
  }
});

test('5A:召喚酔いあり(出したターンは対決を挑めない)', () => {
  let s = scenario({ players: [{ hand: ['5A'] }, { zone: ['1A'] }] });
  s = act(s, { type: 'play', player: 0, uid: s.players[0].hand[0] });
  eq(getLegalActions(s, 0).filter((a) => a.type === 'attack').length, 0, '対決の選択肢');
});

test('購買:コストが1下がる(最低1)', () => {
  const s = scenario({ field: 'F4', players: [{ hand: ['4B', '1A', 'S8'] }, {}] });
  eq(s.players[0].hand.map((u) => playCost(s, u)), [3, 1, 6], 'コスト');
});

// ============================================================
// 対決
// ============================================================
test('対決:パワーが高い方が勝ち、勝った側がサイドを獲得', () => {
  let s = scenario({ players: [{ zone: ['4B'] }, { zone: ['2A'] }] });
  const [a, t] = [s.players[0].zone[0].uid, s.players[1].zone[0].uid];
  s = act(s, { type: 'attack', player: 0, attacker: a, target: t });
  s = choose(s, 'pass');
  eq([zoneIds(s, 0), zoneIds(s, 1)], [['4B'], []], '場');
  eq(s.players[0].side.length, 3, '攻撃側のサイド');
});

test('対決:同点なら相打ち、両者サイド獲得', () => {
  let s = scenario({ players: [{ zone: ['1A'] }, { zone: ['2C'] }] });  // 2000 vs 2000
  s = act(s, { type: 'attack', player: 0, attacker: s.players[0].zone[0].uid, target: s.players[1].zone[0].uid });
  s = choose(s, 'pass');
  eq([zoneIds(s, 0), zoneIds(s, 1)], [[], []], '場');
  eq([s.players[0].side.length, s.players[1].side.length], [3, 3], 'サイド');
});

test('同じ先生は1ターンに1回しか対決を挑めない', () => {
  let s = scenario({ players: [{ zone: ['5A'] }, { zone: ['1A', '1A'] }] });
  s = act(s, { type: 'attack', player: 0, attacker: s.players[0].zone[0].uid, target: s.players[1].zone[0].uid });
  s = choose(s, 'pass');
  eq(getLegalActions(s, 0).filter((a) => a.type === 'attack').length, 0, '2回目の対決');
});

test('反撃:場にいる3Bは反撃できない', () => {
  let s = scenario({ players: [{ zone: ['4B'] }, { zone: ['3B'] }] });
  s = act(s, { type: 'attack', player: 0, attacker: s.players[0].zone[0].uid, target: s.players[1].zone[0].uid });
  eq(s.pending.options.map((o) => o.value), ['pass'], '選択肢は「受ける」だけ');
  s = choose(s, 'pass');
  eq([zoneIds(s, 0), zoneIds(s, 1)], [['4B'], []], '4B(4500)が3B(3000)に勝つ');
});

test('反撃:手札の3Bを捨てて発動できる(コストなし・場の3B以外が対象でもOK)', () => {
  let s = scenario({ players: [{ zone: ['4B'] }, { zone: ['4A'], hand: ['3B'], mana: 0 }] });
  s = act(s, { type: 'attack', player: 0, attacker: s.players[0].zone[0].uid, target: s.players[1].zone[0].uid });
  s = choose(s, s.players[1].hand[0]);
  eq([zoneIds(s, 0), zoneIds(s, 1)], [[], ['4A']], '4B(4500-2000=2500)が4A(4500)に負ける');
  eq(ids(s, s.players[1].trash), ['3B'], '3Bは墓地へ');
  eq(s.players[1].side.length, 4, '手札の3Bで反撃した対決では、サイドを獲得しない');
});

test('手札の3Bで反撃しても、攻撃側が勝てば攻撃側はサイドを獲得する', () => {
  let s = scenario({ players: [{ zone: ['5A'] }, { zone: ['1A'], hand: ['3B'] }] });
  s = act(s, { type: 'attack', player: 0, attacker: s.players[0].zone[0].uid, target: s.players[1].zone[0].uid });
  s = choose(s, s.players[1].hand[0]);
  eq([zoneIds(s, 0), zoneIds(s, 1)], [['5A'], []], '5A(7000-2000=5000)が1A(2000)に勝つ');
  eq(s.players[0].side.length, 3, '攻撃側のサイド');
});

test('反撃:手札の3Bは、コストに関係なく使える(-2000)', () => {
  let s = scenario({ players: [{ zone: ['2C'] }, { zone: ['1A'], hand: ['3B'] }] });
  s = act(s, { type: 'attack', player: 0, attacker: s.players[0].zone[0].uid, target: s.players[1].zone[0].uid });
  eq(s.pending.options.length, 2, '「受ける」と3Bの2つ');
  s = choose(s, s.players[1].hand[0]);
  eq([zoneIds(s, 0), zoneIds(s, 1)], [[], ['1A']], '2C(2000-2000=0)が1A(2000)に負ける');
});

test('反撃:S5は手札1枚を追加で捨て、対決を無効にする(攻撃側は場に残る)', () => {
  let s = scenario({ players: [{ zone: ['5A'] }, { zone: ['1A'], hand: ['S5', '2A'], mana: 0 }] });
  s = act(s, { type: 'attack', player: 0, attacker: s.players[0].zone[0].uid, target: s.players[1].zone[0].uid });
  const [s5, other] = s.players[1].hand;
  s = choose(s, s5);
  s = choose(s, other);
  eq([zoneIds(s, 0), zoneIds(s, 1)], [['5A'], ['1A']], '両者とも場に残る');
  eq(s.players[0].zone[0].attacked, true, '5Aは対決済み');
  eq(ids(s, s.players[1].trash), ['S5', '2A'], '2枚捨てた');
  eq(s.events.map((e) => e.result), ['nullified'], '無効の記録');
});

test('対決の結果が記録される(画面の演出用)', () => {
  let s = scenario({ players: [{ zone: ['4B'] }, { zone: ['2C'] }] });
  s = act(s, { type: 'attack', player: 0, attacker: s.players[0].zone[0].uid, target: s.players[1].zone[0].uid });
  s = choose(s, 'pass');
  const e = s.events.find((x) => x.type === 'battle');
  eq([e.result, e.a, e.t, e.attackerDown, e.targetDown], ['attacker', 4500, 2000, false, true], '結果');
});

test('教室の効果が働いたらお知らせが記録される(保健室・購買・体育館)', () => {
  let s = scenario({ field: 'F5', players: [{ zone: ['4B'] }, { zone: ['2C'] }] });
  s = act(s, { type: 'attack', player: 0, attacker: s.players[0].zone[0].uid, target: s.players[1].zone[0].uid });
  s = choose(s, 'pass');
  assert(s.events.some((e) => e.type === 'field' && e.field === 'F5'), '保健室のお知らせがない');

  let s2 = scenario({ field: 'F4', players: [{ hand: ['4B'] }, {}] });
  s2 = act(s2, { type: 'play', player: 0, uid: s2.players[0].hand[0] });
  assert(s2.events.some((e) => e.type === 'field' && e.field === 'F4'), '購買のお知らせがない');

  let s3 = scenario({ field: 'F1', players: [{ hand: ['1A'], zone: ['1A', '1A', '1A'] }, {}] });
  s3 = act(s3, { type: 'play', player: 0, uid: s3.players[0].hand[0] });
  assert(s3.events.some((e) => e.type === 'field' && e.field === 'F1'), '体育館のお知らせがない');
});

test('教室なし(F0)でも対戦できる', () => {
  let s = createGame({ deckKeys: ['aggro', 'control'], seed: 3, fieldId: 'F0' });
  s = act(s, { type: 'mulligan', player: 0, redraw: false });
  s = act(s, { type: 'mulligan', player: 1, redraw: false });
  eq([s.field, s.phase], ['F0', 'main'], '教室なしで開始');
});

test('S5の反撃は、手札がS5だけの時は使えない', () => {
  let s = scenario({ players: [{ zone: ['5A'] }, { zone: ['1A'], hand: ['S5'] }] });
  s = act(s, { type: 'attack', player: 0, attacker: s.players[0].zone[0].uid, target: s.players[1].zone[0].uid });
  eq(s.pending.options.map((o) => o.value), ['pass'], '選択肢');
});

test('ガード:撃破を1回防ぐ(撃破報酬もなし)', () => {
  let s = scenario({ players: [{ zone: ['5A'] }, { zone: [{ id: '5B', guard: true }] }] });
  s = act(s, { type: 'attack', player: 0, attacker: s.players[0].zone[0].uid, target: s.players[1].zone[0].uid });
  s = choose(s, 'pass');
  eq(zoneIds(s, 1), ['5B'], '5Bは残る');
  eq(s.players[1].zone[0].guard, false, 'ガードは消費');
  eq(s.players[0].side.length, 4, 'サイドは増えない');
});

test('保健室:コスト3以下の先生は撃破されると手札に戻る', () => {
  let s = scenario({ field: 'F5', players: [{ zone: ['4B'] }, { zone: ['2A'] }] });
  s = act(s, { type: 'attack', player: 0, attacker: s.players[0].zone[0].uid, target: s.players[1].zone[0].uid });
  s = choose(s, 'pass');
  eq(ids(s, s.players[1].hand), ['2A'], '2Aが手札へ');
  eq(s.players[0].side.length, 3, '撃破報酬はある');
});

// ============================================================
// カード効果
// ============================================================
test('5B:場に出た時、自分の先生(自身も可)にガードを付与できる', () => {
  let s = scenario({ players: [{ hand: ['5B'], zone: ['1A'] }, {}] });
  s = act(s, { type: 'play', player: 0, uid: s.players[0].hand[0] });
  eq(s.pending.options.map((o) => s.cards[o.value].id), ['1A', '5B'], '選択肢は1Aと5B自身');
  s = choose(s, s.players[0].zone[1].uid);
  eq(s.players[0].zone[1].guard, true, '5B自身にガード');
});

test('S7:パワー4500より大きい先生しかいなければ使えない', () => {
  const s = scenario({ players: [{ hand: ['S7', '1A'] }, { zone: ['5A', '5B'] }] });
  assert(!getLegalActions(s, 0).some((a) => a.type === 'play' && s.cards[a.uid].id === 'S7'), '使えてしまう');
});

test('S7:捨てる手札がなければ使えない', () => {
  const s = scenario({ players: [{ hand: ['S7'] }, { zone: ['1A'] }] });
  assert(!getLegalActions(s, 0).some((a) => a.type === 'play' && s.cards[a.uid].id === 'S7'), '使えてしまう');
});

test('S7:手札を1枚捨て、パワー4500以下だけが対象(強化込みで判定)', () => {
  // 4A(4000+自身500=4500)は対象、4B(4500+4Aの強化500=5000)と5Aは対象外
  let s = scenario({ players: [{ hand: ['S7', '2A'] }, { zone: ['4A', '4B', '5A'] }] });
  s = act(s, { type: 'play', player: 0, uid: s.players[0].hand[0] });
  s = choose(s, s.players[0].hand[0]);  // 2Aを捨てる
  eq(ids(s, s.players[0].trash), ['2A'], '捨てたカード');
  eq(s.pending.options.map((o) => s.cards[o.value].id), ['4A'], '対象');
});

test('S7:撃破し、反撃は発動しない', () => {
  let s = scenario({ players: [{ hand: ['S7', '1A'], mana: 5 }, { zone: ['3B'], hand: ['3B'] }] });
  s = act(s, { type: 'play', player: 0, uid: s.players[0].hand[0] });
  eq(s.players[0].mana, 0, 'マナ5を消費');
  s = choose(s, s.players[0].hand[0]);
  s = choose(s, s.players[1].zone[0].uid);
  eq(zoneIds(s, 1), [], '3Bは撃破');
  eq(s.players[0].side.length, 3, '撃破報酬');
  eq(s.pending, null, '反撃の選択は来ない');
});

test('S8:手札5枚以上が条件。手札を全部捨て、相手の先生を全員撃破', () => {
  const s4 = scenario({ players: [{ hand: ['S8', '1A', '1A', '2A'] }, { zone: ['1A'] }] });
  assert(!getLegalActions(s4, 0).some((a) => a.type === 'play' && s4.cards[a.uid].id === 'S8'), '手札4枚で使えてしまう');

  let s = scenario({ players: [{ hand: ['S8', '1A', '1A', '2A', '2A'] }, { zone: ['1A', '4B'] }] });
  s = act(s, { type: 'play', player: 0, uid: s.players[0].hand[0] });
  eq(zoneIds(s, 1), [], '相手の場');
  eq(s.players[0].side.length, 2, 'サイドを2枚獲得');
  eq(s.players[0].hand.length, 2, '手札はサイドの2枚だけ');
  eq(s.players[0].trash.length, 5, 'S8と手札4枚が墓地へ');
});

test('S9:自分の1Bを撃破 → 撃破時効果 → コスト3以下の先生をタダで出せる。相手はサイドを獲得', () => {
  let s = scenario({ players: [{ hand: ['S9', '3C'], zone: ['1B'], mana: 0 }, {}] });
  s = act(s, { type: 'play', player: 0, uid: s.players[0].hand[0] });
  s = choose(s, s.players[0].zone[0].uid);           // 1Bを撃破 → 1枚引く
  eq(s.players[0].hand.length, 2, '1Bの撃破時効果で1枚引いた');
  const c3 = s.players[0].hand.find((u) => s.cards[u].id === '3C');
  s = choose(s, c3);                                  // 3Cをタダで出す
  eq(zoneIds(s, 0), ['3C'], '場');
  eq(s.players[0].mana, 0, '単位:0 - S9(0) - 3C(コスト1を撃破したのでタダ)');
  eq(ids(s, s.players[0].trash), ['1B', 'S9'], '職員室');
  eq(s.players[1].side.length, 3, '自分の先生を撃破すると、相手がサイドを獲得する');
});

test('S9:自分の3Cを撃破 → コスト5以下(5Cなど)をコスト-2で出せる', () => {
  let s = scenario({ players: [{ hand: ['S9', '5C'], zone: ['3C'], mana: 3 }, { zone: ['1A'] }] });
  s = act(s, { type: 'play', player: 0, uid: s.players[0].hand[0] });
  s = choose(s, s.players[0].zone[0].uid);           // 3Cを撃破
  s = choose(s, s.players[1].zone[0].uid);           // 3Cの撃破時効果:1Aに-500
  const c5 = s.players[0].hand.find((u) => s.cards[u].id === '5C');
  assert(s.pending.options.some((o) => o.value === c5), '5Cが選択肢にない');
  s = choose(s, c5);
  eq(zoneIds(s, 0), ['5C'], '5Cが登場');
  eq(s.players[0].mana, 0, '単位:3 - S9(0) - 5C(5-2=3)');
});

test('S9:コスト0。購買(コスト-1・最低1)でも0のまま', () => {
  const s = scenario({ field: 'F4', players: [{ hand: ['S9'], zone: ['1B'], mana: 0 }, {}] });
  eq(playCost(s, s.players[0].hand[0]), 0, 'コスト');
  assert(getLegalActions(s, 0).some((a) => a.type === 'play'), '単位0でS9を使えない');
});

test('1D:撃破されても、相手はサイドを獲得しない(対決でもS9でも)', () => {
  let s = scenario({ players: [{ zone: ['4B'] }, { zone: ['1D'] }] });
  s = act(s, { type: 'attack', player: 0, attacker: s.players[0].zone[0].uid, target: s.players[1].zone[0].uid });
  s = choose(s, 'pass');
  eq(zoneIds(s, 1), [], '1Dは撃破された');
  eq(s.players[0].side.length, 4, '対決で撃破しても、サイドは獲得しない');

  let t = scenario({ players: [{ hand: ['S9'], zone: ['1D'], mana: 0 }, {}] });
  t = act(t, { type: 'play', player: 0, uid: t.players[0].hand[0] });
  t = choose(t, t.players[0].zone[0].uid);
  eq(t.players[1].side.length, 4, 'S9で撃破しても、相手はサイドを獲得しない');
});

test('S9:撃破した先生のコスト+2より重い先生は出せない', () => {
  let s = scenario({ players: [{ hand: ['S9', '5C'], zone: ['1B'] }, {}] });
  s = act(s, { type: 'play', player: 0, uid: s.players[0].hand[0] });
  s = choose(s, s.players[0].zone[0].uid);           // 1B(コスト1)を撃破 → コスト3以下のみ
  eq(s.pending, null, '5C(コスト5)は出せないので選択は来ない');
});

test('5C昇格:コスト3以上を撃破 → 単位なしで登場 → 職員室の先生を回収。相手はサイドを獲得', () => {
  let s = scenario({ players: [{ hand: ['5C'], zone: ['3C'], mana: 0 }, { zone: ['1A'] }] });
  s = act(s, { type: 'promote', player: 0, uid: s.players[0].hand[0] });
  s = choose(s, s.players[0].zone[0].uid);           // 3Cを撃破
  eq(s.players[1].side.length, 3, '相手がサイドを獲得');
  s = choose(s, s.players[1].zone[0].uid);           // 3Cの撃破時効果:1Aに-500
  eq(power(s, s.players[1].zone[0].uid), 1500, '1Aのパワー');
  eq(zoneIds(s, 0), ['5C'], '5Cが登場');
  s = choose(s, s.players[0].trash[0]);              // 5Cの効果:3Cを回収
  eq(ids(s, s.players[0].hand).includes('3C'), true, '3Cが手札に');
  eq(s.players[0].hand.length, 2, '3C + 3Cの効果で引いた1枚');
});

test('5C昇格:登場したての先生は自壊させる対象にできない', () => {
  const s = scenario({ players: [{ hand: ['5C'], zone: [{ id: '3C', sick: true }], mana: 0 }, {}] });
  assert(!getLegalActions(s, 0).some((a) => a.type === 'promote'), '登場したての3Cで昇格できてしまう');
  const s2 = scenario({ players: [{ hand: ['5C'], zone: [{ id: '3C', sick: true }, '4B'], mana: 0 }, {}] });
  const s3 = act(s2, { type: 'promote', player: 0, uid: s2.players[0].hand[0] });
  eq(s3.pending.options.map((o) => s3.cards[o.value].id), ['4B'], '選べるのは4Bだけ');
});

test('5C昇格:コスト2以下の先生しかいなければ使えない', () => {
  const s = scenario({ players: [{ hand: ['5C'], zone: ['2A'], mana: 0 }, {}] });
  assert(!getLegalActions(s, 0).some((a) => a.type === 'promote'), '昇格できてしまう');
});

test('2B:撃破時に回収できるのは先生カードだけ', () => {
  let s = scenario({ players: [{ zone: ['4B'] }, { zone: ['2B'], trash: ['S7', '1A'] }] });
  s = act(s, { type: 'attack', player: 0, attacker: s.players[0].zone[0].uid, target: s.players[1].zone[0].uid });
  s = choose(s, 'pass');
  eq(s.pending.options.map((o) => s.cards[o.value].id), ['1A', '2B'], '選択肢(授業のS7は含まない)');
});

test('1D:捨てずに終えることもできる', () => {
  let s = scenario({ players: [{ hand: ['1D', '1A'] }, {}] });
  s = act(s, { type: 'play', player: 0, uid: s.players[0].hand[0] });
  assert(s.pending.optional, '任意になっていない');
  s = choose(s, null);
  eq(ids(s, s.players[0].hand), ['1A'], '手札');
});

test('2C:場に出た時、このターンのマナ+1', () => {
  let s = scenario({ players: [{ hand: ['2C'], mana: 2 }, {}] });
  s = act(s, { type: 'play', player: 0, uid: s.players[0].hand[0] });
  eq(s.players[0].mana, 1, 'マナ');
});

// ============================================================
// ターン終了処理
// ============================================================
test('ターン終了:自分の2ターン目以降、自分の場が空のまま終えたら、相手がサイド獲得・自分は1枚引く', () => {
  let s = scenario({ players: [{ turnsTaken: 2 }, { zone: ['1A'] }] });
  const before = s.players[0].hand.length;
  s = act(s, { type: 'endTurn', player: 0 });
  eq(s.players[1].side.length, 3, '相手がサイドを獲得');
  eq(s.players[0].side.length, 4, '自分のサイドは変わらない');
  eq(s.players[0].hand.length, before + 1, '自分は1枚引く');
  eq(s.active, 1, '相手のターンへ');
});

test('ターン終了:自分の1ターン目は、場が空でも何も起きない(猶予)', () => {
  let s = scenario({ players: [{ turnsTaken: 1 }, { zone: ['1A'] }] });
  const before = s.players[0].hand.length;
  s = act(s, { type: 'endTurn', player: 0 });
  eq(s.players[1].side.length, 4, '相手はサイドを獲得しない');
  eq(s.players[0].hand.length, before, '引かない');
});

test('ターン終了:相手の場が空でも、自分はサイドを獲得しない(以前のルールとの違い)', () => {
  let s = scenario({ players: [{ zone: ['1A'] }, {}] });
  s = act(s, { type: 'endTurn', player: 0 });
  eq(s.players[0].side.length, 4, '自分のサイドは変わらない');
});

test('後攻が1ターン目に先生を出せなくても、次の先攻のターンでサイドを取られない', () => {
  // 後攻(1)の1ターン目 → 先攻(0)の2ターン目 と進めても、後攻の場の空きではサイドは動かない
  let s = scenario({ active: 1, players: [{ zone: ['1A'], turnsTaken: 1 }, { turnsTaken: 1 }] });
  s = act(s, { type: 'endTurn', player: 1 });   // 後攻の1ターン目の終わり:猶予
  s = act(s, { type: 'endTurn', player: 0 });   // 先攻の2ターン目の終わり:先攻の場には先生がいる
  eq([s.players[0].side.length, s.players[1].side.length], [4, 4], 'どちらもサイドは動かない');
});

test('ターン終了:このターン中のパワー増減はリセットされる', () => {
  let s = scenario({ players: [{ hand: ['S3'], zone: ['1A'] }, {}] });
  s = act(s, { type: 'play', player: 0, uid: s.players[0].hand[0] });
  s = choose(s, s.players[0].zone[0].uid);
  eq(power(s, s.players[0].zone[0].uid), 3500, '+1500');
  s = act(s, { type: 'endTurn', player: 0 });
  eq(power(s, s.players[0].zone[0].uid), 2000, 'リセット');
});

test('先攻有利の対策の設定:1ターン目ドローあり・先生を出せない', () => {
  CONFIG.FIRST_TURN_DRAW = true;
  CONFIG.FIRST_TURN_NO_TEACHER = true;
  try {
    let s = createGame({ deckKeys: ['aggro', 'control'], seed: 42 });
    s = act(s, { type: 'mulligan', player: 0, redraw: false });
    s = act(s, { type: 'mulligan', player: 1, redraw: false });
    const p = s.active;
    eq(s.players[p].hand.length, 6, '先攻も1ターン目にドロー');
    const teacherPlays = getLegalActions(s, p).filter((a) => a.type === 'play' && s.cards[a.uid] && CARDS[s.cards[a.uid].id].type === 'teacher');
    eq(teacherPlays.length, 0, '1ターン目は先生を出せない');
  } finally {
    CONFIG.FIRST_TURN_DRAW = false;
    CONFIG.FIRST_TURN_NO_TEACHER = false;
  }
});

test('マナ上限は10で止まる', () => {
  let s = scenario({ players: [{ zone: ['1A'], mana: 10 }, { zone: ['1A'], mana: 10 }] });
  s = act(s, { type: 'endTurn', player: 0 });
  s = act(s, { type: 'endTurn', player: 1 });
  eq([s.players[0].manaMax, s.players[0].mana], [10, 10], 'マナ');
});

test('サイドが0枚になった時点で勝利', () => {
  let s = scenario({ players: [{ zone: ['5A'] }, { zone: ['1A'] }] });
  s.players[0].side = s.players[0].side.slice(0, 1);
  s = act(s, { type: 'attack', player: 0, attacker: s.players[0].zone[0].uid, target: s.players[1].zone[0].uid });
  s = choose(s, 'pass');
  eq([s.winner, s.phase], [0, 'gameover'], '勝者');
});

// ============================================================
// ランダム対戦(全デッキの組み合わせで、エラーやカードの消失がないか)
// ============================================================
function countCards(s, p) {
  const pl = s.players[p];
  const onStack = s.stack.filter((u) => s.cards[u].owner === p).length;
  return pl.deck.length + pl.hand.length + pl.side.length + pl.trash.length + pl.zone.length + onStack;
}

test('ランダム対戦 900戦:エラーなし・カード枚数が常に20枚', () => {
  const keys = Object.keys(DECKS);
  let seed = 1;
  let finished = 0;
  for (const a of keys) {
    for (const b of keys) {
      for (let g = 0; g < 100; g++) {
        let s = createGame({ deckKeys: [a, b], seed: seed++ });
        for (let step = 0; step < 2000 && s.winner === null; step++) {
          const p = s.pending ? s.pending.player : (s.phase === 'mulligan' ? (s.players[0].mulliganDone ? 1 : 0) : s.active);
          const actions = getLegalActions(s, p);
          assert(actions.length > 0, `操作がない状態になった(${a} vs ${b}, seed ${seed - 1})`);
          // ターン終了ばかり選ばないよう、他の操作を優先する
          const others = actions.filter((x) => x.type !== 'endTurn');
          const pool = others.length && Math.random() < 0.8 ? others : actions;
          const action = pool[Math.floor(Math.random() * pool.length)];
          try {
            s = applyAction(s, action);
          } catch (e) {
            throw new Error(`${e.message}(${a} vs ${b}, seed ${seed - 1})`);
          }
          for (const q of [0, 1]) {
            eq(countCards(s, q), 20, `カード枚数(${a} vs ${b})`);
            assert(s.players[q].zone.length <= 4, '先生ゾーンの上限超え');
            assert(s.players[q].mana >= 0, 'マナがマイナス');
          }
        }
        if (s.winner !== null) finished++;
      }
    }
  }
  assert(finished > 800, `決着がついたのは${finished}/900戦のみ`);
});

export { results };
