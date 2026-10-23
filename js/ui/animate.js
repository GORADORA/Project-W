// ============================================================
// 演出(カードの移動・中央表示・撃破・ターン開始の帯)
//
// カードの移動は「描き直す前の位置を覚えておき、描き直した後に
// 前の位置から新しい位置へ滑らせる」方式にしている。
// これなら、どんな効果でカードが動いても自動で動きが付く。
// ============================================================

import { cardFace } from './render.js';
import { TERMS } from '../data/terms.js';

export const MOVE_MS = 420;
const EASE = 'cubic-bezier(.2,.8,.2,1)';

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fxLayer = () => document.getElementById('fx');

// アニメーションの終わりを待つ。画面が裏に回って描画が止まっても
// ゲームが止まらないよう、決まった時間が過ぎたら先に進む
function finish(anim, ms) {
  return Promise.race([anim.finished.catch(() => {}), wait(ms + 100)]);
}

// 本来 to の位置にある要素を、見た目だけ from の位置に置く変形
// (from → to へ滑らせるときの開始地点、または to → from へ飛ばすときの終点に使う)
function fromTo(from, to) {
  return `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;
}
const samePlace = (a, b) =>
  Math.abs(a.left - b.left) < 2 && Math.abs(a.top - b.top) < 2 && Math.abs(a.width - b.width) < 2;

// カードが今どこにあるか
export function where(state, uid) {
  if (state.stack.includes(uid)) return { area: 'stack' };
  for (let p = 0; p < 2; p++) {
    const pl = state.players[p];
    for (const area of ['hand', 'deck', 'side', 'trash']) {
      if (pl[area].includes(uid)) return { area, p };
    }
    if (pl.zone.some((t) => t.uid === uid)) return { area: 'zone', p };
  }
  return null;
}

// 山札・墓地などの「置き場」の位置
function pileRect(root, loc) {
  if (!loc || loc.area === 'zone') return null;
  const sel = loc.area === 'stack' ? '[data-pile="stack"]' : `[data-pile="${loc.area}-${loc.p}"]`;
  const el = root.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (loc.area !== 'hand') return r;
  // 手札の場合は、並びの真ん中あたりにカード1枚分の枠を作る
  const h = r.height * 0.9;
  const w = h / 1.4;
  return { left: r.left + r.width / 2 - w / 2, top: r.top + (r.height - h) / 2, width: w, height: h };
}

// 描き直す前に、すべてのカードの位置を記録する
export function snapshot(root) {
  const map = new Map();
  for (const el of root.querySelectorAll('[data-uid]')) {
    map.set(el.dataset.uid, { rect: el.getBoundingClientRect(), html: el.outerHTML });
  }
  return map;
}

// 描き直した後に、前の位置から新しい位置へ滑らせる
export function flip(root, snap, prev, next) {
  const seen = new Set();
  for (const el of root.querySelectorAll('[data-uid]')) {
    const uid = el.dataset.uid;
    seen.add(uid);
    const to = el.getBoundingClientRect();
    let from = snap.get(uid)?.rect;
    let fade = false;
    if (!from) {
      // 新しく見えるようになったカード(ドローなど)は、元の置き場から出てくる
      from = pileRect(root, where(prev, uid));
      fade = true;
    }
    if (!from || to.width === 0 || samePlace(from, to)) continue;
    el.style.zIndex = '30';
    el.animate(
      [
        { transformOrigin: '0 0', transform: fromTo(from, to), opacity: fade ? 0.4 : 1 },
        { transformOrigin: '0 0', transform: 'none', opacity: 1 },
      ],
      { duration: MOVE_MS, easing: EASE },
    ).finished.then(() => { el.style.zIndex = ''; }, () => {});
  }

  // 見えなくなったカード(山札に戻る・墓地の下に埋もれる等)は、分身を飛ばす
  for (const [uid, { rect, html }] of snap) {
    if (seen.has(uid)) continue;
    const to = pileRect(root, where(next, uid));
    if (to && !samePlace(rect, to)) ghost(html, rect, to);
  }
}

function ghost(html, from, to) {
  const g = document.createElement('div');
  g.className = 'ghost';
  Object.assign(g.style, {
    left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`,
  });
  g.innerHTML = html;
  const inner = g.firstElementChild;
  inner.className = 'cardbox';
  Object.assign(inner.style, { position: 'absolute', inset: '0', visibility: 'visible' });
  fxLayer().appendChild(g);
  g.animate(
    [
      { transformOrigin: '0 0', transform: 'none', opacity: 1 },
      { transformOrigin: '0 0', transform: fromTo(to, from), opacity: 0.15 },
    ],
    { duration: MOVE_MS, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' },
  );
  wait(MOVE_MS + 100).then(() => g.remove());
}

// ------------------------------------------------------------
// プレイしたカードを中央に大きく表示する
// aside: true なら、表示の後に「処理中」の置き場へ移動する(授業カード)
// ------------------------------------------------------------
// fromRect:ドラッグで放した位置(指定がなければ、元のカードの位置から)
export async function reveal(root, uid, cardId, { aside = false, fromRect = null } = {}) {
  const src = root.querySelector(`[data-uid="${uid}"]`);
  const from = fromRect ?? src?.getBoundingClientRect();
  if (src) src.style.visibility = 'hidden';

  const box = document.createElement('div');
  box.className = 'reveal';
  box.innerHTML = cardFace(cardId);
  fxLayer().appendChild(box);
  const center = box.getBoundingClientRect();

  if (from) {
    await finish(box.animate(
      [
        { transformOrigin: '0 0', transform: fromTo(from, center) },
        { transformOrigin: '0 0', transform: 'none' },
      ],
      { duration: 380, easing: 'cubic-bezier(.2,.9,.3,1.1)' },
    ), 380);
  }
  box.classList.add('is-shining');
  await wait(800);
  box.classList.add('is-leaving');

  if (aside) {
    const spot = root.querySelector('[data-pile="stack"]').getBoundingClientRect();
    await finish(box.animate(
      [
        { transformOrigin: '0 0', transform: 'none' },
        { transformOrigin: '0 0', transform: fromTo(spot, center) },
      ],
      { duration: 380, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' },
    ), 380);
  }

  return {
    rect: box.getBoundingClientRect(),
    html: `<div class="cardbox">${cardFace(cardId)}</div>`,
    remove: () => box.remove(),
  };
}

// ------------------------------------------------------------
// 対決:攻撃する先生が相手に向かって飛び込む
// ------------------------------------------------------------
export async function lunge(root, attacker, target) {
  const a = root.querySelector(`[data-uid="${attacker}"]`);
  const t = root.querySelector(`[data-uid="${target}"]`);
  if (!a || !t) return;
  const ra = a.getBoundingClientRect();
  const rt = t.getBoundingClientRect();
  const dx = (rt.left - ra.left) * 0.6;
  const dy = (rt.top - ra.top) * 0.6;
  a.style.zIndex = '30';
  await finish(a.animate(
    [
      { transform: 'none' },
      { transform: `translate(${dx * -0.08}px, ${dy * -0.08}px) scale(1.05)`, offset: 0.25 },
      { transform: `translate(${dx}px, ${dy}px) scale(1.1)`, offset: 0.6 },
      { transform: 'none' },
    ],
    { duration: 520, easing: 'ease-in-out' },
  ), 520);
  a.style.zIndex = '';
}

// 撃破された先生を、赤く光らせて揺らす
export async function hit(root, uids) {
  let any = false;
  for (const uid of uids) {
    const el = root.querySelector(`[data-uid="${uid}"]`);
    if (el) { el.classList.add('is-hit'); any = true; }
  }
  if (any) await wait(520);
}

// ------------------------------------------------------------
// お知らせ(教室の効果が働いた時など)。画面上部に数秒だけ表示
// ------------------------------------------------------------
export function toast(title, text) {
  let box = document.querySelector('.toasts');
  if (!box) {
    box = document.createElement('div');
    box.className = 'toasts';
    fxLayer().appendChild(box);
  }
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<b></b><span></span>`;
  el.querySelector('b').textContent = title;
  el.querySelector('span').textContent = text;
  box.appendChild(el);
  setTimeout(() => el.classList.add('is-leaving'), 3200);
  setTimeout(() => el.remove(), 3700);
}

// ------------------------------------------------------------
// 対決の結果:2体を大きく並べてぶつけ、勝敗のハンコを押す
// ev: エンジンが記録した対決の結果(battle.js)
// labels: [攻撃側の名前, 防御側の名前]
// ------------------------------------------------------------
export async function battleScene(ev, labels) {
  const stampOf = (down, won) => {
    if (ev.result === 'nullified') return ['無効', 'is-null'];
    if (won) return ['勝ち', 'is-win'];
    const guard = [`${TERMS.guard}!`, 'is-guard'];
    if (ev.result === 'draw') return down ? ['相打ち', 'is-lose'] : guard;
    return down ? [`${TERMS.destroy}!`, 'is-lose'] : guard;
  };
  const side = (id, pw, label, down, won, cls) => {
    const [stamp, stampCls] = stampOf(down, won);
    return `<div class="clash__side ${cls} ${down ? 'is-down' : ''}">
      <div class="clash__label"></div>
      <div class="cardbox clash__card">${cardFace(id)}</div>
      <div class="clash__power">${pw ?? ''}</div>
      <div class="clash__stamp ${stampCls}">${stamp}</div>
    </div>`;
  };
  const el = document.createElement('div');
  el.className = 'clash';
  el.innerHTML = `
    ${side(ev.attackerId, ev.a, labels[0], ev.attackerDown, ev.result === 'attacker', 'is-left')}
    <div class="clash__vs">VS</div>
    ${side(ev.targetId, ev.t, labels[1], ev.targetDown, ev.result === 'target', 'is-right')}`;
  const [l0, l1] = el.querySelectorAll('.clash__label');
  l0.textContent = labels[0];
  l1.textContent = labels[1];
  fxLayer().appendChild(el);
  // 登場 → ぶつかる → ハンコ → 退場
  await wait(420);
  el.classList.add('is-hit');
  await wait(380);
  el.classList.add('is-result');
  await wait(1100);
  el.classList.add('is-leaving');
  await wait(260);
  el.remove();
}

// ターン開始の帯
export function banner(text) {
  const el = document.createElement('div');
  el.className = 'banner';
  el.textContent = text;
  fxLayer().appendChild(el);
  setTimeout(() => el.remove(), 1600);
}
