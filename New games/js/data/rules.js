// ============================================================
// 基本ルールの数値
// 数字を書き換えるだけで、ルールが変わる。
// (カードごとの数値は cards.js、デッキの中身は decks.js)
// ============================================================

export const CONFIG = {
  // ---- 対戦の準備 ----
  HAND_SIZE: 5,      // 初手の枚数
  SIDE_SIZE: 4,      // サイドの枚数(これが0枚になったら勝ち)
  DECK_SIZE: 20,     // 1デッキの枚数(decks.js の確認用)
  MAX_COPIES: 2,     // 同じカードを入れられる枚数(decks.js の確認用)

  // ---- ターン ----
  DRAW_PER_TURN: 1,  // ターンの始めに引く枚数
  MANA_PER_TURN: 1,  // ターンごとに増える単位の上限
  MANA_CAP: 10,      // 単位の上限の最大値(null にすると上限なし)
  ZONE_LIMIT: 3,     // 先生ゾーンに置ける先生の数(Stadium の時は cards.js の F1 の zoneLimit)

  // ---- 先攻有利の対策(先攻の1ターン目だけに適用) ----
  FIRST_TURN_DRAW: false,       // true = 先攻も1ターン目にドローする
  FIRST_TURN_NO_TEACHER: false, // true = 先攻は1ターン目に先生を出せない
  SECOND_PLAYER_BONUS_SIDE: false,  // true = 後攻は最初からサイドを1枚獲得した状態で始まる
  SECOND_PLAYER_SIDE_MINUS: true,   // true = 後攻はサイドが1枚少ない(その1枚は山札に戻す。手札には加えない)【正式ルール】

  // ---- 場が空のままターンを終えた時 ----
  // 「自分の場に先生がいないままターンを終えたら、相手がサイド獲得・自分はカードを引く」が
  // 自分の何回目のターンから働くか(2 = 自分の2ターン目の終わりから)
  EMPTY_FIELD_RULE_FROM_OWN_TURN: 2,
  EMPTY_FIELD_DRAW: 1,          // その時に自分が引く枚数
};
