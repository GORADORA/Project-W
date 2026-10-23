// ============================================================
// 非公開のカード情報(先生の名前・画像)
//
// 公開サイト(GitHub Pages)には誰でも見られるファイルしか置けないので、
// 本物の名前・写真は Firebase に置き、合言葉でログインした人にだけ見せる。
// 登録は admin.html から行う。
//
// データの形(Realtime Database):
//   private/
//     version: 最後に登録・変更した時刻(変わっていなければ、覚えておいたものを使う)
//     cards/{カードID}: { name: '山田先生', flavor: 'フレーバーテキスト', image: 'data:image/webp;base64,…' }
//
// 一度読み込んだら、このパソコンのブラウザに覚えておく(ネットが切れても表示できるように)。
// ログアウトすると消える。
// ============================================================

import { CARDS } from '../data/cards.js';
import { privateImages } from '../ui/images.js';
import { load, isConfigured, isLoggedIn, release } from './online.js';

const CACHE_KEY = 'sensei-tcg.private';
const TIMEOUT_MS = 10000;

// cards.js に書いてある名前・フレーバーテキスト(公開してよいもの。ログアウトしたらこれに戻す)
const publicNames = Object.fromEntries(Object.entries(CARDS).map(([id, c]) => [id, c.name]));
const publicFlavors = Object.fromEntries(Object.entries(CARDS).map(([id, c]) => [id, c.flavor ?? '']));
export const publicName = (id) => publicNames[id];
export const publicFlavor = (id) => publicFlavors[id];

// 今表示している非公開情報の状態
export const privateInfo = { count: 0, version: null };

function reset() {
  for (const [id, name] of Object.entries(publicNames)) CARDS[id].name = name;
  for (const [id, flavor] of Object.entries(publicFlavors)) CARDS[id].flavor = flavor;
  privateImages.clear();
  privateInfo.count = 0;
}

function apply(cards) {
  reset();
  for (const [id, c] of Object.entries(cards ?? {})) {
    if (!CARDS[id] || !c) continue;
    if (c.name) CARDS[id].name = c.name;
    if (c.flavor) CARDS[id].flavor = c.flavor;
    if (c.image) privateImages.set(id, c.image);
    privateInfo.count++;
  }
}

// 通信が返ってこない時(ネットが切れている時など)に、待ち続けないように
const withTimeout = (promise) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)),
]);

// 起動時:前に読み込んで覚えておいたものを、すぐに表示に使う(通信なし)
export function loadCachedPrivate() {
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (!cache) return;
    apply(cache.cards);
    privateInfo.version = cache.version ?? null;
  } catch { /* 覚えておけない環境では、毎回読み込むだけ */ }
}

// Firebase から最新を読み込む。戻り値:
//   'on'      読み込めた(ログイン中)
//   'off'     ログインしていない(非公開情報は消す)
//   'offline' 通信できない(覚えておいたものがあれば、それを使い続ける)
//   'denied'  読む許可がない(Firebase のルールに private がまだない)
export async function refreshPrivate() {
  if (!isConfigured()) return 'off';
  try {
    if (!(await withTimeout(isLoggedIn()))) {
      clearPrivate();
      return 'off';
    }
    const { db, D } = await load();
    const version = (await withTimeout(D.get(D.ref(db, 'private/version')))).val();
    if (version !== null && version === privateInfo.version) return 'on';
    const cards = (await withTimeout(D.get(D.ref(db, 'private/cards')))).val() ?? {};
    apply(cards);
    privateInfo.version = version;
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ version, cards }));
    } catch { /* 容量が足りない時などは、覚えないだけ(次回また読み込む) */ }
    return 'on';
  } catch (e) {
    console.warn(e);
    if (String(e?.message ?? e).toLowerCase().includes('permission')) return 'denied';
    return 'offline';
  } finally {
    release();  // 読み終わったら切断する(無料プランの「同時100人まで」を使い切らないように)
  }
}

// ログアウトした時:非公開情報を消して、公開の名前・画像に戻す
export function clearPrivate() {
  reset();
  privateInfo.version = null;
  try { localStorage.removeItem(CACHE_KEY); } catch { /* 無視 */ }
}

// ---- 登録用(admin.html) ----
export async function fetchPrivateCards() {
  const { db, D } = await load();
  return (await D.get(D.ref(db, 'private/cards'))).val() ?? {};
}

// changes:{ name: '山田先生' } や { image: 'data:…' }。null を入れるとその項目を消す
export async function savePrivateCard(id, changes) {
  const { db, D } = await load();
  const updates = { 'private/version': Date.now() };
  for (const [key, value] of Object.entries(changes)) updates[`private/cards/${id}/${key}`] = value;
  await D.update(D.ref(db), updates);
}
