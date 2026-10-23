// ============================================================
// 名前・画像の登録ページ(admin.html)
//
// 合言葉でログインして、カードごとに「非公開の名前・画像」を Firebase に登録する。
// 登録したものは js/net/private-cards.js がゲームで読み込む。
// ============================================================

import { CARDS } from './data/cards.js';
import { TERMS } from './data/terms.js';
import { cardFace } from './ui/render.js';
import { privateImages } from './ui/images.js';
import { isConfigured, isLoggedIn, currentEmail, adminLogin, logout } from './net/online.js';
import { ADMIN_EMAIL } from './net/firebase-config.js';
import { refreshPrivate, clearPrivate, savePrivateCard, publicName, publicFlavor } from './net/private-cards.js';

const FLAVOR_MAX = 80;  // フレーバーテキストの最大文字数(長いとゲームでは4行で切れる)

const IMAGE_W = 860;   // カードのイラスト枠に合わせた大きさ(横長 約1.7:1)
const IMAGE_H = 500;

const $ = (id) => document.getElementById(id);
const drafts = {};     // まだ保存していない変更 { カードID: { name, image } }

function showMsg(text, kind = '') {
  $('msg').textContent = text;
  $('msg').className = `msg ${kind ? `is-${kind}` : ''}`;
}

// 今登録されている非公開の名前・フレーバーテキスト(なければ空)
const privateName = (id) => (CARDS[id].name !== publicName(id) ? CARDS[id].name : '');
const privateFlavor = (id) => (CARDS[id].flavor !== publicFlavor(id) ? CARDS[id].flavor ?? '' : '');

// 見本のカードの下に出すフレーバーテキスト(保存前の変更も反映)
function flavorPreview(id) {
  const d = drafts[id] ?? {};
  const text = d.flavor !== undefined ? d.flavor.trim() || publicFlavor(id) : CARDS[id].flavor;
  return text ? `“${esc(text)}”` : '';
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---- 画像を、カードの枠の大きさに切り抜いて小さくする ----
async function toCardImage(file) {
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = IMAGE_W;
  canvas.height = IMAGE_H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  // 枠いっぱいになるように拡大・縮小して、真ん中を残す
  const scale = Math.max(IMAGE_W / bmp.width, IMAGE_H / bmp.height);
  const w = bmp.width * scale;
  const h = bmp.height * scale;
  ctx.drawImage(bmp, (IMAGE_W - w) / 2, (IMAGE_H - h) / 2, w, h);
  let url = canvas.toDataURL('image/webp', 0.8);
  if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/jpeg', 0.85);  // webp が使えないブラウザ
  return url;
}
const sizeKB = (dataUrl) => Math.round((dataUrl.length * 0.75) / 1024);

// ---- カードの見本(保存前の変更も反映して表示する) ----
function preview(id) {
  const d = drafts[id] ?? {};
  const keepName = CARDS[id].name;
  const keepImage = privateImages.get(id);
  if (d.name !== undefined) CARDS[id].name = d.name.trim() || publicName(id);
  if (d.image) privateImages.set(id, d.image);
  const html = cardFace(id);
  CARDS[id].name = keepName;
  if (keepImage) privateImages.set(id, keepImage); else privateImages.delete(id);
  return html;
}

function itemHtml(id) {
  const c = CARDS[id];
  const kind = c.type === 'teacher'
    ? `${TERMS.teacher}・${TERMS.cost}${c.cost}・${TERMS.power}${c.power}` : `${TERMS.lesson}・${TERMS.cost}${c.cost}`;
  const hasImage = privateImages.has(id);
  return `
    <div class="item__side">
      <div class="cardbox">${preview(id)}</div>
      <p class="item__flavor" data-role="flavor-preview">${flavorPreview(id)}</p>
    </div>
    <div class="item__body">
      <div class="item__id">${id} <small>${kind}</small></div>
      <label>名前(公開の名前:${publicName(id)})
        <input type="text" data-role="name" maxlength="16" placeholder="${publicName(id)}">
      </label>
      <label>フレーバーテキスト(${FLAVOR_MAX}文字まで・なくてもOK)
        <textarea data-role="flavor" maxlength="${FLAVOR_MAX}" rows="2" placeholder="例:チャイムが鳴っても、この授業は終わらない。"></textarea>
      </label>
      <label>画像 ${hasImage ? '(登録済み)' : '(なし)'}
        <input type="file" class="item__file" data-role="file" accept="image/*">
      </label>
      <div class="note" data-role="size"></div>
      <div class="item__buttons">
        <button class="abtn abtn--main" data-role="save" disabled>保存</button>
        ${hasImage ? '<button class="abtn abtn--danger" data-role="delete-image">画像を消す</button>' : ''}
      </div>
    </div>`;
}

function renderItem(id) {
  const el = document.querySelector(`.item[data-id="${id}"]`);
  el.innerHTML = itemHtml(id);
  el.querySelector('[data-role="name"]').value = drafts[id]?.name ?? privateName(id);
  el.querySelector('[data-role="flavor"]').value = drafts[id]?.flavor ?? privateFlavor(id);
  el.classList.toggle('is-changed', !!drafts[id]);
  el.querySelector('[data-role="save"]').disabled = !drafts[id];
}

function refreshPreview(id) {
  const el = document.querySelector(`.item[data-id="${id}"]`);
  el.querySelector('.cardbox').innerHTML = preview(id);
  el.querySelector('[data-role="flavor-preview"]').innerHTML = flavorPreview(id);
  el.classList.add('is-changed');
  el.querySelector('[data-role="save"]').disabled = false;
}

function renderEditor() {
  const ids = Object.keys(CARDS);
  for (const [box, type] of [['teachers', 'teacher'], ['lessons', 'lesson']]) {
    $(box).innerHTML = ids.filter((id) => CARDS[id].type === type)
      .map((id) => `<div class="item" data-id="${id}"></div>`).join('');
  }
  ids.forEach(renderItem);
  $('editor').hidden = false;
}

// ---- 読み込み ----
async function loadAll() {
  showMsg('読み込んでいます…');
  const status = await refreshPrivate();
  if (status === 'denied') {
    showMsg('読み込む許可がありません。Firebase の「ルール」に private を追加してください(マニュアル11章)', 'error');
    return;
  }
  if (status === 'offline') {
    showMsg('通信できませんでした。インターネットの接続を確かめて、再読み込みしてください', 'error');
    return;
  }
  const count = Object.keys(CARDS).filter((id) => privateName(id) || privateFlavor(id) || privateImages.has(id)).length;
  showMsg(`ログイン中です。登録済み:${count}枚`, 'ok');
  $('logout').hidden = false;
  renderEditor();
}

async function start() {
  if (!isConfigured()) {
    showMsg('Firebase の設定がありません(js/net/firebase-config.js)', 'error');
    return;
  }
  try {
    // 通信が返ってこない時に「読み込んでいます…」のまま止まらないよう、10秒で諦める
    const loggedIn = await Promise.race([
      isLoggedIn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
    ]);
    if (loggedIn) {
      // 「ログイン済み」なだけでは不十分。管理者アカウントかどうかまで確かめる。
      // (生徒がゲームの合言葉でログインしたまま admin.html を開いた場合、
      //  管理者としてログインしたことにしてしまわないように)
      if (await currentEmail() === ADMIN_EMAIL) return loadAll();
      await logout();
    }
  } catch (e) {
    console.warn(e);
    showMsg('通信できませんでした。インターネットの接続を確かめて、再読み込みしてください', 'error');
    return;
  }
  showMsg('管理者パスワードを入れてログインしてください');
  $('login-box').hidden = false;
}

// ---- 操作 ----
$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  showMsg('ログインしています…');
  try {
    await adminLogin($('password').value);
  } catch (err) {
    console.warn(err);
    showMsg('合言葉が違うか、通信できませんでした', 'error');
    return;
  }
  $('login-box').hidden = true;
  loadAll();
});

$('logout').addEventListener('click', async () => {
  await logout();
  clearPrivate();
  location.reload();
});

document.addEventListener('input', (e) => {
  const role = e.target.dataset.role;
  if (role !== 'name' && role !== 'flavor') return;
  const id = e.target.closest('.item').dataset.id;
  drafts[id] = { ...drafts[id], [role]: e.target.value };
  refreshPreview(id);
});

document.addEventListener('change', async (e) => {
  if (e.target.dataset.role !== 'file' || !e.target.files[0]) return;
  const item = e.target.closest('.item');
  const id = item.dataset.id;
  try {
    const image = await toCardImage(e.target.files[0]);
    drafts[id] = { ...drafts[id], image };
    item.querySelector('[data-role="size"]').textContent = `切り抜いた画像:${sizeKB(image)}KB(まだ保存していません)`;
    refreshPreview(id);
  } catch (err) {
    console.warn(err);
    item.querySelector('[data-role="size"]').textContent = 'この画像は読み込めませんでした(jpg / png / webp を使ってください)';
  }
});

document.addEventListener('click', async (e) => {
  const role = e.target.dataset?.role;
  if (role !== 'save' && role !== 'delete-image') return;
  const id = e.target.closest('.item').dataset.id;
  let changes;
  if (role === 'save') {
    const d = drafts[id];
    if (!d) return;
    changes = {};
    if (d.name !== undefined) changes.name = d.name.trim() || null;  // 空なら名前を消す(公開の名前に戻る)
    if (d.flavor !== undefined) changes.flavor = d.flavor.trim() || null;  // 空ならフレーバーテキストを消す
    if (d.image) changes.image = d.image;
  } else {
    if (!confirm(`${id} の画像を消しますか?`)) return;
    changes = { image: null };
  }
  e.target.disabled = true;
  showMsg(`${id} を保存しています…`);
  try {
    await savePrivateCard(id, changes);
    delete drafts[id];
    await refreshPrivate();
    renderItem(id);
    showMsg(`${id} を保存しました`, 'ok');
  } catch (err) {
    console.warn(err);
    e.target.disabled = false;
    showMsg(`${id} を保存できませんでした(通信・Firebase のルールを確かめてください)`, 'error');
  }
});

start();
