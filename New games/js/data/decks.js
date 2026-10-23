// ============================================================
// デッキレシピ(各20枚・同じカードは2枚まで)
// name:デッキ選択画面に出る名前 / description:その下に出る説明文
// (説明文の {teacher} などは、用語集 terms.js の名前に置き換わる)
// (説明文にカードIDや先生の名前を書くと、名前を変えた時に直す必要があるので避けている)
// ============================================================

export const DECKS = {
  aggro: {
    name: 'パワーデッキ',
    description: '低{cost}の{teacher}を並べ、仲間全体を強化する{teacher}でまとめてパワーアップ。最後は切り札の大型の{teacher}で、正面から押し切るデッキ。',
    cards: {
      '1A': 2, '1C': 2, '2C': 2, '3A': 2, '4A': 2, '5A': 2,
      'S1': 2, 'S3': 2, 'S4': 2, 'S6': 2,
    },
  },
  control: {
    name: 'プロテクトデッキ',
    description: '{counter}と{guard}で相手の攻撃を受け止め、除去の{lesson}で1体ずつ対処。最後は全体除去で盤面をひっくり返す、守りのデッキ。',
    cards: {
      '1B': 2, '2B': 2, '3B': 2, '5B': 2,
      'S1': 2, 'S2': 2, 'S3': 2, 'S5': 2, 'S6': 1, 'S7': 2, 'S8': 1,
    },
  },
  ascension: {
    name: 'スピードデッキ',
    description: '自分の{teacher}をあえて{destroy}し、より強い{teacher}へ次々と{promote}。{hand}を入れ替えながらコンボを組み立て、素早く展開するデッキ。',
    cards: {
      '1B': 2, '1D': 2, '2A': 2, '3C': 2, '4B': 2, '5C': 2,
      'S1': 1, 'S3': 2, 'S5': 1, 'S6': 2, 'S9': 2,
    },
  },
};

// レシピ → カードIDの並び(例:['1A','1A','1C',...])
export function expandDeck(deckKey) {
  const list = [];
  for (const [id, n] of Object.entries(DECKS[deckKey].cards)) {
    for (let i = 0; i < n; i++) list.push(id);
  }
  return list;
}
