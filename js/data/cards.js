// ============================================================
// カードデータ(辞書)
//
// カードの数値を変えたいときは、このファイルだけを直せばOK。
// ・cost(コスト)、power(パワー)のほか、効果の数字もすべてここにある
//   (例:S1 の amount: 1000 を 1500 にすると、効果も文章も -1500 になる)
// ・文章の中の {@amount} のような書き方は、そのカードの数字(amount)に自動で置き換わる。
//   数字を変える時は、文章ではなく「数字の項目」の方を書き換える
// ・文章の中の {trash} などは用語集(terms.js)の名前に置き換わる
// ・効果の「中身の処理」は js/engine/effects.js に書いてある
// ============================================================

// 先生カード(ユニット)
const TEACHERS = [
  { id: '1A', cost: 1, power: 2000, text: '効果なし:このカードには効果がない' },
  { id: '1B', cost: 1, power: 1000,
    draw: 1,              // 撃破時に引く枚数
    text: '{destroy}時:カードを{@draw}枚引く' },
  { id: '1C', cost: 1, power: 1500,
    amount: 500,          // 他の先生のパワーを上げる量
    text: '場に出た時:自分の他の{teacher}1体の{power}+{@amount}(このターン中)' },
  { id: '1D', cost: 1, power: 500,
    draw: 1,              // 1枚捨てた時に引く枚数
    noSide: true,         // true = 撃破されても、相手はサイドを獲得しない
    text: '場に出た時:カードを1枚捨て、{@draw}枚引いてもよい / {destroy}されても、相手は{side}を獲得しない' },
  { id: '2A', cost: 2, power: 2500,
    draw: 1,              // 場に出た時に引く枚数
    text: '場に出た時:カードを{@draw}枚引く' },
  { id: '2B', cost: 2, power: 2000, text: '{destroy}時:{trash}から{teacher}を1体選び、{hand}に戻す' },
  { id: '2C', cost: 2, power: 2000,
    mana: 1,              // 場に出た時に増える単位(このターンだけ)
    draw: 1,              // 撃破時に引く枚数
    text: '場に出た時:このターンだけ使える{mana}+{@mana} / {destroy}時:カードを{@draw}枚引く' },
  { id: '3A', cost: 3, power: 3500,
    amount: 1000,         // 仲間のパワーを上げる量
    maxCost: 2,           // この{cost}以下の先生が対象
    text: '常時:自分の場の{cost}{@maxCost}以下の{teacher}全員の{power}+{@amount}' },
  { id: '3B', cost: 3, power: 3000,
    counterPower: 2000,   // 反撃で下げるパワー
    counterMinCost: 0,    // 反撃できる相手(攻撃側)のコストの下限(0 = 制限なし。変えた時は文章も直す)
    text: '{counter}:{hand}にある時、{battle}を仕掛けられたら公開して捨てることで発動({cost}なし)。攻撃してきた{teacher}の{power}-{@counterPower}。この{battle}で攻撃側を{destroy}しても{side}は獲得しない。場にいる時は発動しない' },
  { id: '3C', cost: 3, power: 3000,
    amount: 500,          // 相手のパワーを下げる量
    draw: 1,              // 撃破時に引く枚数
    text: '{destroy}時:相手の{teacher}1体の{power}-{@amount}(このターン中)、カードを{@draw}枚引く' },
  { id: '4A', cost: 4, power: 4000,
    amount: 500,          // 仲間全員(自身も)のパワーを上げる量
    text: '常時:自分の場の{teacher}全員(自身を含む)の{power}+{@amount}' },
  { id: '4B', cost: 4, power: 4500, text: '効果なし:このカードには効果がない' },
  { id: '5A', cost: 5, power: 7000, text: '効果なし:このカードには効果がない' },
  { id: '5B', cost: 5, power: 5000, text: '場に出た時:自分の{teacher}1体(自身も可)に{guard}を付与' },
  { id: '5C', cost: 5, power: 5000,
    minCost: 3,           // 昇格で撃破できる先生のコストの下限
    text: '{promote}:{cost}{@minCost}以上の自分の{teacher}(登場したてを除く)を{destroy}し、{cost}無視で登場 / 場に出た時:{trash}から{teacher}を1体、{hand}に戻す' },
];

// 授業カード(サポート)
const LESSONS = [
  { id: 'S1', cost: 1,
    amount: 1000,         // 相手のパワーを下げる量
    text: '相手の{teacher}1体の{power}-{@amount}(このターン中)' },
  { id: 'S2', cost: 1, text: '{trash}からカードを1枚選び、{hand}に戻す' },
  { id: 'S3', cost: 2,
    amount: 1500,         // 自分の先生のパワーを上げる量
    text: '自分の{teacher}1体の{power}+{@amount}(このターン中)' },
  { id: 'S4', cost: 2,
    draw: 2,              // 引く枚数
    text: 'カードを{@draw}枚引く' },
  { id: 'S5', cost: 4, text: '相手の{teacher}1体を{hand}に戻す / {counter}:{battle}を仕掛けられた時、{hand}を1枚追加で捨てて発動。その{battle}を無効にする' },
  { id: 'S6', cost: 1,
    draw: 2,              // 1枚捨てた後に引く枚数
    text: '{hand}を1枚捨てて、カードを{@draw}枚引く' },
  { id: 'S7', cost: 5,
    maxPower: 4500,       // 撃破できる相手のパワーの上限
    text: '{hand}を1枚捨てて発動。{power}{@maxPower}以下の相手の{teacher}1体を{destroy}する({guard}は有効)' },
  { id: 'S8', cost: 7,
    minHand: 5,           // 使うのに必要な手札の枚数(S8自身も数える)
    text: '{hand}が{@minHand}枚以上の時のみ使える。{hand}をすべて捨て、相手の場の{teacher}を全員{destroy}する' },
  { id: 'S9', cost: 0,
    step: 2,              // 出せる先生は「撃破した先生のコスト+step以下」
    discount: 2,          // 出す先生のコストをいくつ下げるか
    discountFromCost1: 3, // 撃破したのがコスト1だった時の下げる量
    // ※「(コスト1を撃破した時はコスト0)」の文は、discountFromCost1 が 1+step 以上の間だけ正しい
    //   (コスト1を撃破→コスト1+step以下を出せる→それより多く下がるので0になる)
    text: '自分の{teacher}1体を{destroy}。その{teacher}の{cost}+{@step}以下の{teacher}1体を、{hand}から{cost}-{@discount}で出せる({cost}1を{destroy}した時は{cost}0)' },
];

// バーチャルキャンパス(フィールド。デッキには入れない。以前の呼び名:教室)
export const FIELDS = [
  { id: 'F0', name: 'なし', text: '{field}カードの効果はない' },
  { id: 'F1', name: 'Stadium',                     // 旧:体育館
    zoneLimit: 4,         // 先生ゾーンの上限(ふだんは rules.js の ZONE_LIMIT)
    text: '{zone}の上限が{@zoneLimit}体になる(双方)' },
  { id: 'F4', name: 'Knowledge-Tree',              // 旧:購買
    costDown: 1,          // 下がるコスト
    minCost: 1,           // これより下には下がらない(元からコスト0のカードは0のまま)
    text: 'すべてのカードの{cost}が{@costDown}下がる(最低{@minCost}・双方)' },
  { id: 'F5', name: 'Knowledge-House',             // 旧:保健室
    maxCost: 3,           // この{cost}以下の先生が対象
    text: '{cost}{@maxCost}以下の{teacher}が{destroy}された時、{trash}に送らず持ち主の{hand}に戻す' },
];
export const FIELD = Object.fromEntries(FIELDS.map((f) => [f.id, f]));

// ID → カード情報 の早見表
export const CARDS = {};
for (const c of TEACHERS) CARDS[c.id] = { ...c, type: 'teacher', name: c.name ?? c.id };
for (const c of LESSONS)  CARDS[c.id] = { ...c, type: 'lesson',  name: c.name ?? c.id };

// 文章の {@amount} などを、そのカード(バーチャルキャンパス)の数字に置き換える
// ({trash} などの用語は、このあと terms.js の fmt で置き換える)
export const cardText = (c) => String(c.text).replace(/\{@(\w+)\}/g, (m, key) => c[key] ?? m);
