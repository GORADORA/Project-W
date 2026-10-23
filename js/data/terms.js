// ============================================================
// 用語集
// ゲーム内の呼び名は、すべてここで決めている。
// 名前を変えたいときは、右側の文字を書き換えるだけでOK。
//
// 文章の中では {trash} のように書いておくと、表示するときに
// ここの名前(例:職員室)に置き換わる。
// ============================================================

export const TERMS = {
  teacher: '先生',       // ユニット
  lesson:  '授業',       // サポート
  field:   'バーチャルキャンパス', // フィールド(以前の名前:教室)
  zone:    '先生ゾーン', // ユニットを置く場所
  deck:    '山札',
  hand:    '手札',
  trash:   '職員室',     // 使い終わったカード・撃破された先生の置き場(以前の名前:墓地)
  side:    'サイド',
  mana:    '単位',       // カードを使うのに払うもの(以前の名前:マナ)
  cost:    'コスト',
  power:   'パワー',
  guard:   'ガード',
  counter: '反撃',
  promote: '昇格',
  haste:   'スピードアタッカー',
  mulligan: '引き直し',
  battle:  '対決',       // 先生どうしの勝負
  destroy: '撃破',       // 先生を場から職員室へ送ること
};

// ---- プレイヤーの名前 ----
// ルール処理の文章では、プレイヤーの名前を {p0}(プレイヤー1)・{p1}(プレイヤー2)と
// 書いておき、表示する時に入力された名前に置き換える
const DEFAULT_NAMES = ['プレイヤー1', 'プレイヤー2'];
const playerNames = [...DEFAULT_NAMES];

export function setPlayerNames(names) {
  [0, 1].forEach((p) => {
    const name = String(names?.[p] ?? '').trim().slice(0, 12);
    playerNames[p] = name || DEFAULT_NAMES[p];
  });
}
export const playerName = (p) => playerNames[p];

// '{trash}から1枚' → '職員室から1枚'、'{p0}のターン' → '(入力した名前)のターン'
export function fmt(text) {
  return String(text).replace(/\{(\w+)\}/g, (m, key) => {
    if (key === 'p0' || key === 'p1') return playerNames[Number(key[1])];
    return TERMS[key] ?? m;
  });
}
