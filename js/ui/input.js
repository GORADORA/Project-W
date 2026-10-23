// ============================================================
// 操作の受け取り(クリック・ドラッグ・マウスを乗せる・キー)
// 何が押されたかを調べて、main.js に伝えるだけの係
// ============================================================

const DRAG_START_PX = 8;  // これ以上動かしたら「ドラッグ」とみなす

export function bindInput(handlers) {
  // ドラッグ直後に「クリック」まで反応しないようにするための時刻
  let ignoreClickUntil = 0;

  document.addEventListener('click', (e) => {
    if (performance.now() < ignoreClickUntil) return;
    // ボタンなど data-act を持つもの
    const act = e.target.closest('[data-act]');
    if (act) {
      if (!act.disabled) handlers.act(act.dataset.act, act.dataset);
      return;
    }
    // 盤面のカード
    const card = e.target.closest('#board [data-uid]');
    if (card) {
      handlers.card(card.dataset.uid, card.dataset.cid);
      return;
    }
    // 盤面の何もないところ
    if (e.target.closest('#board')) handlers.background();
  });

  // ---- ドラッグ(マウスでも指でも動く) ----
  let drag = null;

  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const el = e.target.closest('#board [data-uid]');
    if (!el || el.closest('[data-act]')) return;
    drag = { uid: el.dataset.uid, el, x0: e.clientX, y0: e.clientY, started: false };
  });

  document.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.started) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < DRAG_START_PX) return;
      const r = drag.el.getBoundingClientRect();
      const html = drag.el.outerHTML;
      if (!handlers.dragStart(drag.uid)) {
        drag = null;
        return;
      }
      drag.started = true;
      drag.offX = drag.x0 - r.left;
      drag.offY = drag.y0 - r.top;
      // 指やマウスについてくる分身
      const ghost = document.createElement('div');
      ghost.className = 'drag-ghost';
      Object.assign(ghost.style, { width: `${r.width}px`, height: `${r.height}px` });
      ghost.innerHTML = html;
      ghost.firstElementChild.className = 'cardbox';
      document.getElementById('fx').appendChild(ghost);
      drag.ghost = ghost;
    }
    drag.ghost.style.transform = `translate(${e.clientX - drag.offX}px, ${e.clientY - drag.offY}px)`;
    const under = document.elementFromPoint(e.clientX, e.clientY);
    drag.ghost.classList.toggle('is-valid', handlers.dragOver(drag.uid, under));
  });

  document.addEventListener('pointerup', (e) => {
    const d = drag;
    drag = null;
    if (!d || !d.started) return;
    ignoreClickUntil = performance.now() + 300;
    const rect = d.ghost.getBoundingClientRect();
    d.ghost.remove();
    handlers.drop(d.uid, document.elementFromPoint(e.clientX, e.clientY), rect);
  });

  document.addEventListener('pointercancel', () => {
    if (drag?.ghost) drag.ghost.remove();
    if (drag?.started) handlers.dragCancel();
    drag = null;
  });

  // ---- マウスを乗せたカードを、サイドバーに大きく表示 ----
  let lastKey = null;
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[data-cid]');
    if (!el) return;
    const key = el.dataset.uid ? `${el.dataset.cid}|${el.dataset.uid}` : el.dataset.cid;
    if (key === lastKey) return;
    lastKey = key;
    handlers.hover(key);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') handlers.escape();
  });

  // 入力欄で Enter を押した時は、ページを読み込み直さず、その欄のボタンを押したことにする
  document.addEventListener('submit', (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('[data-act]');
    if (btn) handlers.act(btn.dataset.act, btn.dataset);
  });
}
