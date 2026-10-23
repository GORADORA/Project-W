// ============================================================
// カードのイラスト
//
// assets/cards/ に「カードID.拡張子」の画像を置くと、自動で
// そのカードのイラスト枠に表示される(例:assets/cards/1A.png)。
// 画像がないカードは、今までどおり仮の模様で表示される。
// ※ assets/cards/ は公開サイトで誰でも見られる。先生の写真など非公開にしたい画像は
//   admin.html から登録する(合言葉を入れた人にだけ見える)
//
// 対応する拡張子:webp / png / jpg
// 推奨サイズ:横860 × 縦500 ピクセル程度(横長、約1.7:1)
// ============================================================

import { CARDS } from '../data/cards.js';

const DIR = 'assets/cards/';
const EXTENSIONS = ['webp', 'png', 'jpg'];

// カードID → 画像のURL(見つかったものだけ)
export const cardImages = new Map();

// 合言葉で読み込んだ非公開の画像(Firebase に置いたもの。js/net/private-cards.js が入れる)
// assets/cards/ の画像より優先する
export const privateImages = new Map();

// そのカードに表示する画像(なければ undefined)
export const imageOf = (id) => privateImages.get(id) ?? cardImages.get(id);

function exists(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

// 起動時に1回だけ、どのカードに画像があるかを調べる
export async function loadCardImages() {
  await Promise.all(Object.keys(CARDS).map(async (id) => {
    for (const ext of EXTENSIONS) {
      const url = `${DIR}${id}.${ext}`;
      if (await exists(url)) {
        cardImages.set(id, url);
        return;
      }
    }
  }));
}
