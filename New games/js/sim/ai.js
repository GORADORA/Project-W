// ============================================================
// コンピュータの対戦相手(簡易AI)
//
// 考え方:今できる操作をすべて「試しにやってみて」、盤面の点数が
// 一番上がるものを選ぶ。点数が上がる操作がなくなったらターン終了。
// ・先読みは「その操作+直後の対決1回」まで
// ・相手の選択(反撃など)も、相手にとって一番良いものを選ぶと仮定する
// 人間ほど賢くはないので、勝率は「目安」として見ること。
// ============================================================

import { applyAction, getLegalActions, power, cardOf } from '../engine/index.js';

// 盤面の点数の重み
const W = {
  side: 4,       // サイド1枚の差
  hand: 0.6,     // 手札1枚の差
  board: 1,      // 場の先生のパワー1000あたり
  body: 0.5,     // 場の先生1体あたり(並んでいること自体の価値)
  guard: 1.5,    // ガード
  win: 1000,
};

// ---- デッキごとの戦い方 ----
// oppSidePenalty:相手のサイドが「残り n 枚」になった時の、こちらにとってのマイナス。
//   null なら普通(1枚ごとに W.side ずつ同じだけマイナス)。
// board:場の先生のパワーをどれだけ重く見るか / invest:場の先生のコスト1あたりの価値
export const STYLES = {
  default: { oppSidePenalty: null, board: 1, invest: 0 },
  // スピードデッキ:「相手にサイドを与えてでも、素早く強い先生を並べて勝ち切る」
  // 相手のサイドがまだ多いうちは、1枚渡すのを気にしない(相手が勝ちに近づいたら慎重に)
  ascension: { oppSidePenalty: { 4: 0, 3: 1, 2: 3, 1: 8, 0: 0 }, board: 1.2, invest: 0.4 },
};

// プレイヤーpから見た盤面の点数
export function evaluate(s, p) {
  if (s.winner !== null) return s.winner === p ? W.win : -W.win;
  const me = s.players[p];
  const op = s.players[1 - p];
  const style = STYLES[me.deckKey] ?? STYLES.default;
  // 相手の勝利への近さ(サイドが減るほどマイナス)
  const oppProgress = style.oppSidePenalty
    ? style.oppSidePenalty[op.side.length] ?? 0
    : (4 - op.side.length) * W.side;
  return (4 - me.side.length) * W.side - oppProgress
    + (me.hand.length - op.hand.length) * W.hand
    + boardValue(s, p, style) - boardValue(s, 1 - p, STYLES.default);
}

function boardValue(s, p, style) {
  let v = 0;
  for (const t of s.players[p].zone) {
    // 「このターン中」の増減は、ターンが終われば消えるので数えない
    v += ((power(s, t.uid) - t.temp) / 1000) * W.board * style.board
      + W.body + (t.guard ? W.guard : 0)
      + cardOf(s, t.uid).cost * style.invest;
  }
  return v;
}

// 選択待ちがなくなるまで、各プレイヤーが自分に一番良い選択をしたと仮定して進める
function settle(s) {
  for (let i = 0; i < 12 && s.pending && s.winner === null; i++) {
    const c = s.pending.player;
    let best = null;
    let bestV = -Infinity;
    for (const a of getLegalActions(s, c)) {
      const n = applyAction(s, a);
      const v = evaluate(n, c);
      if (v > bestV) { bestV = v; best = n; }
    }
    s = best;
  }
  return s;
}

const tryAction = (s, a) => settle(applyAction(s, a));

// 初手の引き直し:コスト3以下の先生が2枚未満なら引き直す
function mulliganDecision(s, p) {
  const cheap = s.players[p].hand.filter((uid) => {
    const c = cardOf(s, uid);
    return c.type === 'teacher' && c.cost <= 3;
  }).length;
  return { type: 'mulligan', player: p, redraw: cheap < 2 };
}

// ---- 公平モード:見えないはずの情報を「想像」に置き換える ----
// 相手の手札・山札・サイド、自分の山札・サイドの中身をシャッフルした
// 「ありえる盤面」を作る。AIはこの盤面で考えるので、本当の手札は分からない。
const FAIR_SAMPLES = 3;  // 想像する盤面の数(多いほど賢いが遅い)

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function imagine(s, p) {
  const d = structuredClone(s);
  const reassign = (uids) => {
    const ids = shuffled(uids.map((u) => d.cards[u].id));
    uids.forEach((u, i) => { d.cards[u].id = ids[i]; });
  };
  const op = d.players[1 - p];
  const me = d.players[p];
  reassign([...op.hand, ...op.deck, ...op.side]);
  reassign([...me.deck, ...me.side]);
  d.rng = Math.floor(Math.random() * 2 ** 31);  // この先の乱数も分からないようにする
  return d;
}

// 操作aの点数(複数の想像盤面があれば、その平均)
// lookAhead:同じターン中の「次の一手」まで見る。
//   例:S3で強化してから殴る / S9で安く出して、浮いた単位でもう1枚出す
const FOLLOW_TYPES = new Set(['play', 'promote', 'attack']);
function score(samples, a, p, lookAhead) {
  let total = 0;
  for (const s of samples) {
    const n = tryAction(s, a);
    let v = evaluate(n, p);
    if (lookAhead && n.winner === null && n.active === p && !n.pending) {
      for (const f of getLegalActions(n, p)) {
        if (!FOLLOW_TYPES.has(f.type)) continue;
        v = Math.max(v, evaluate(tryAction(n, f), p) - 0.01);
      }
    }
    total += v;
  }
  return total / samples.length;
}

// プレイヤーpの次の操作を決める
// banned: 実験用。このAIが使わないカードIDの集合(手札に来ても使わない)
// fair: true なら相手の手札などを見ずに考える(公平モード)
export function chooseAction(s, p, banned = new Set(), { fair = false } = {}) {
  if (s.phase === 'mulligan') return mulliganDecision(s, p);
  const samples = fair ? Array.from({ length: FAIR_SAMPLES }, () => imagine(s, p)) : [s];

  const cardId = (a) => {
    const uid = a.type === 'choose' ? a.value : a.uid;
    return uid && s.cards[uid] ? s.cards[uid].id : null;
  };
  const isBannedUse = (a) => banned.has(cardId(a))
    && (a.type === 'play' || a.type === 'promote' || (a.type === 'choose' && s.pending?.resolve === 'counter'));
  const actions = getLegalActions(s, p).filter((a) => !isBannedUse(a));

  // 選択待ち:一番点数が高くなる選択肢
  if (s.pending) {
    let best = actions[0];
    let bestV = -Infinity;
    for (const a of actions) {
      const v = score(samples, a, p, false);
      if (v > bestV) { bestV = v; best = a; }
    }
    return best;
  }

  // メイン:点数が上がる操作があればそれを、なければターン終了
  const base = evaluate(s, p);
  let best = null;
  let bestV = base + 0.05;
  for (const a of actions) {
    if (a.type === 'endTurn') continue;
    const v = score(samples, a, p, true);
    if (v > bestV) { bestV = v; best = a; }
  }
  return best ?? { type: 'endTurn', player: p };
}
