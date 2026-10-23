// ============================================================
// 効果音の対応表
//
// 「どの場面で・どのファイルを・どのくらいの音量で鳴らすか」の一覧。
// 音のファイルは assets/sounds/ に置く。
//
// ・右側の file のファイル名で置けば、そのまま鳴る
// ・ダウンロードした素材の名前のまま使いたいときは、file の部分を
//   そのファイル名に書き換える(例:file: 'kettei-1.mp3')
// ・同じファイルを複数の場面で使ってもOK
// ・ファイルが置かれていない場面は、鳴らないだけ(エラーにはならない)
// ・volume は 0(無音)〜 1(最大)
// ============================================================

export const SOUNDS = {
  click:   { file: 'click.mp3',   volume: 0.5, label: 'ボタンを押した時' },
  select:  { file: 'select.mp3',  volume: 0.5, label: 'カードを選んだ・掴んだ時' },
  play:    { file: 'play.mp3',    volume: 0.8, label: 'カードを出した時(中央に大きく表示)' },
  attack:  { file: 'attack.mp3',  volume: 0.8, label: '対決を挑んだ時' },
  counter: { file: 'counter.mp3', volume: 0.9, label: '反撃した時' },
  // 対決以外で撃破された時(S9・5Cの昇格で自分の先生を撃破/S7・S8)。対決での撃破では鳴らない
  destroy: { file: 'destroy.mp3', volume: 0.8, label: '先生が撃破された時(対決以外)' },
  // 対決の勝ち負け(「勝ち」のハンコが出る時。相打ち・無効の時は鳴らない)
  // 交代で遊ぶ対戦では、どちらが勝っても battleWin。
  // コンピュータ対戦・オンライン対戦では、自分の先生が勝てば battleWin、負ければ battleLose
  battleWin:  { file: 'battle-win.mp3',  volume: 0.8, label: '対決に勝った時' },
  battleLose: { file: 'battle-lose.mp3', volume: 0.8, label: '対決に負けた時(コンピュータ・オンライン対戦で自分が負けた時)' },
  recover: { file: 'recover.mp3', volume: 0.8, label: '職員室からカードを回収した時(2B・5C・S2)' },
  guard:   { file: 'guard.mp3',   volume: 0.8, label: 'ガードで撃破を防いだ時' },
  draw:    { file: 'draw.mp3',    volume: 0.4, label: 'カードを引いた時' },
  side:    { file: 'side.mp3',    volume: 0.8, label: 'サイドを獲得した時' },
  turn:    { file: 'turn.mp3',    volume: 0.7, label: 'ターンが始まった時' },
  win:     { file: 'win.mp3',     volume: 0.9, label: '勝負がついた時' },
};

// BGM(対戦中にくり返し流れる音。教室のガヤガヤなど)。最初の画面と対戦中にオン・オフできる
export const BGM = { file: 'bgm.mp3', volume: 0.3 };
