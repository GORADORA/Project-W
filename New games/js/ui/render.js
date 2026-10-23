// ============================================================
// 画面に描く(顔)
// 盤面のデータを受け取って、HTMLを組み立てるだけの係。
// ルールの判断はせず、「今できる操作の一覧(legal)」をもとに
// 光らせる・ボタンを出す、を決めている。
// ============================================================

import { CARDS, FIELDS, cardText } from '../data/cards.js';
import { DECKS } from '../data/decks.js';
import { TERMS, fmt, playerName } from '../data/terms.js';import { power, playCost, zoneLimit } from '../engine/index.js';
import { imageOf } from './images.js';

const MANA_SLOTS = 10;
const HUE = { 1: 16, 2: 38, 3: 148, 4: 205, 5: 272 };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
// プレイヤーの名前(最初の画面で入力したもの。未入力なら「プレイヤー1/2」)
export const pName = (p) => playerName(p);

// ------------------------------------------------------------
// カード1枚
// ------------------------------------------------------------
// 並び:イラスト → 左上にコスト → 名前の帯 → 効果テキスト → 左下に種類・右下にパワー
export function cardFace(id, { power: pw, powerClass = '', cost, costClass = '' } = {}) {
  const c = CARDS[id];
  const text = fmt(cardText(c));
  // 長い名前・効果テキストは、文字を小さくして収める
  const nameLen = [...c.name].length;
  const nameClass = nameLen > 6 ? 'is-xlong' : nameLen > 4 ? 'is-long' : '';
  const textClass = text.length > 85 ? 'is-xlong' : text.length > 60 ? 'is-long' : '';
  return `<div class="card card--${c.type}" style="--hue:${HUE[c.cost] ?? 0}">
    ${art(c.id)}
    <div class="card__cost ${costClass}">${cost ?? c.cost}</div>
    <div class="card__name ${nameClass}">${esc(c.name)}</div>
    <div class="card__text ${textClass}">${esc(text)}</div>
    <div class="card__type">${esc(TERMS[c.type])}</div>
    ${c.type === 'teacher' ? `<div class="card__power ${powerClass}">${pw ?? c.power}</div>` : ''}
  </div>`;
}

// イラスト:画像があれば画像、なければ仮の模様
function art(id) {
  const url = imageOf(id);
  if (url) return `<div class="card__art has-image" style="background-image:url('${url}')"></div>`;
  return '<div class="card__art"></div>';
}

// 裏面の見た目は css/card.css の .card--back(ロゴは assets/card-back-logo.svg)
export const cardBack = () => '<div class="card card--back"></div>';

// ------------------------------------------------------------
// デッキ選択画面
// ------------------------------------------------------------
// デッキを選ぶ欄(名前と説明文)
const deckOptions = (inputName, selected) => Object.entries(DECKS).map(([key, d]) => `
  <label class="deck-option">
    <input type="radio" name="${inputName}" value="${key}" ${selected === key ? 'checked' : ''}>
    <div class="deck-option__body">
      <div class="deck-option__name">${esc(d.name)}</div>
      <div class="deck-option__list">${esc(fmt(d.description ?? ''))}</div>
    </div>
  </label>`).join('');

// 名前の入力欄(空のままなら「プレイヤー1/2」になる)
const nameInput = (inputName, value, placeholder) =>
  `<input class="setup__name" name="${inputName}" value="${esc(value ?? '')}" placeholder="${esc(placeholder)}" maxlength="12" autocomplete="off">`;

// 先生の名前・画像(非公開)の表示状態と、合言葉の入力欄
// status:'checking' | 'on' | 'off' | 'offline' | 'denied' | 'error' | 'noconfig'
export function privateBox(status, count) {
  const logout = '<button class="btn btn--ghost btn--small" data-act="private-logout">ログアウト</button>';
  const loginForm = (lead, error = '') => `
    <span>${lead}</span>
    <form class="setup__private-form" data-form="private">
      <input class="online__input" type="password" name="privatePassword" placeholder="合言葉" autocomplete="current-password">
      <button type="button" class="btn btn--small" data-act="private-login">表示する</button>
    </form>
    ${error ? `<span class="setup__private-error">${esc(error)}</span>` : ''}`;
  switch (status) {
    case 'noconfig': return '';
    case 'checking': return `<span>${fmt('{teacher}の名前・画像')}:確認しています…</span>`;
    case 'on': return count
      ? `<span>${fmt('{teacher}の名前・画像')}:<b>表示中</b>(${count}枚)</span>${logout}`
      : `<span>${fmt('{teacher}の名前・画像')}:まだ登録されていません(admin.html で登録できます)</span>${logout}`;
    case 'offline': return count
      ? `<span>${fmt('{teacher}の名前・画像')}:<b>表示中</b>(前回読み込んだもの・${count}枚)</span>${logout}`
      : loginForm(fmt('{teacher}の名前・画像:通信できませんでした。インターネットにつないで合言葉を入れてください'));
    case 'denied': return `<span>${fmt('{teacher}の名前・画像')}:読み込む許可がありません(Firebase の「ルール」に private を追加してください)</span>${logout}`;
    case 'error': return loginForm(fmt('{teacher}の名前・画像は、部員の合言葉を入れると表示されます'), '合言葉が違うか、通信できませんでした');
    default: return loginForm(fmt('{teacher}の名前・画像は、部員の合言葉を入れると表示されます'));
  }
}

export function renderSetup(el, settings, privateStatus = 'noconfig', privateCount = 0) {
  el.innerHTML = `
    <div class="setup__panel chalkboard">
      <div class="setup__logo-wrap">
        <img src="assets/logo.png" alt="センセイバトル" class="setup__logo"
          onerror="this.style.display='none'; this.nextElementSibling.style.display='';">
        <h1 class="setup__title chalk-text" style="display:none;">センセイバトル</h1>
      </div>
      <p class="setup__subtitle">1台のパソコンで2人対戦</p>
      <div class="setup__players">
        ${[0, 1].map((p) => `
          <section class="setup__player">
            <h2 class="chalk-text">プレイヤー${p + 1}
              <select name="ctrl${p}" class="setup__ctrl">
                <option value="human" ${settings.controllers[p] === 'human' ? 'selected' : ''}>人間</option>
                <option value="cpu" ${settings.controllers[p] === 'cpu' ? 'selected' : ''}>コンピュータ</option>
              </select>
            </h2>
            <label class="setup__name-label">名前 ${nameInput(`name${p}`, settings.names?.[p], `プレイヤー${p + 1}`)}</label>
            ${deckOptions(`deck${p}`, settings.decks[p])}
          </section>`).join('')}
      </div>
      <div class="setup__options">
        <label>${esc(TERMS.field)}:
          <select name="field">
            <option value="random">ランダム</option>
            ${FIELDS.map((f) => `<option value="${f.id}" ${settings.field === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}
          </select>
        </label>
        <label>
          <input type="checkbox" name="curtain" ${settings.curtain ? 'checked' : ''}>
          ${esc(fmt('交代画面を表示する(相手に{hand}を見せない)'))}
        </label>
        <label>
          <input type="checkbox" name="confirmEnd" ${settings.confirmEnd ? 'checked' : ''}>
          ターン終了前に確認する
        </label>
        <label>
          <input type="checkbox" name="sfx" ${settings.sfx ? 'checked' : ''}>
          効果音
        </label>
        <label>
          <input type="checkbox" name="bgm" ${settings.bgm ? 'checked' : ''}>
          BGM
        </label>
      </div>
      <div class="setup__start">
        <button class="btn btn--primary" data-act="start">対戦開始</button>
      </div>
      <div class="setup__online">
        <button class="btn" data-act="online-open">別々のパソコンで対戦する(オンライン)</button>
      </div>
      <div class="setup__private">${privateBox(privateStatus, privateCount)}</div>
      <p class="setup__version"></p>
    </div>`;
}

// ------------------------------------------------------------
// オンライン対戦の画面
// info.step:
//   'noconfig' Firebase の設定がまだ / 'login' 合言葉の入力 / 'lobby' ルームを作る・入る
//   'waiting'  相手の参加待ち / 'busy' 通信中
// ------------------------------------------------------------
export function renderOnline(el, info, settings) {
  const back = '<button class="btn btn--ghost" data-act="online-back">もどる</button>';
  const error = info.error ? `<p class="online__error">${esc(info.error)}</p>` : '';
  let body = '';

  if (info.step === 'noconfig') {
    body = `<p class="online__lead">オンライン対戦の準備(Firebase の設定)がまだ終わっていません。</p>
      <div class="online__row">${back}</div>`;
  } else if (info.step === 'login') {
    body = `<p class="online__lead">部員に教えてもらった<b>合言葉</b>を入れてください。</p>
      <form class="online__row" data-form="login">
        <input class="online__input" type="password" name="password" placeholder="合言葉" autocomplete="current-password" required>
        <button type="button" class="btn btn--primary" data-act="online-login">入る</button>
      </form>
      ${error}<div class="online__row">${back}</div>`;
  } else if (info.step === 'lobby') {
    body = `
      <p class="online__lead">名前とデッキを選んで、ルームを作るか、相手のルームに入ってください。</p>
      <div class="online__row"><label class="setup__name-label">名前 ${nameInput('onlineName', settings.onlineName, 'プレイヤー')}</label></div>
      <div class="online__decks">${deckOptions('onlineDeck', settings.onlineDeck ?? 'aggro')}</div>
      <div class="online__cols">
        <section class="online__box">
          <h3>ルームを作る</h3>
          <p>4文字の合言葉が出るので、相手に伝えてください。</p>
          <button class="btn btn--primary" data-act="online-create">ルームを作る</button>
        </section>
        <section class="online__box">
          <h3>ルームに入る</h3>
          <p>相手から聞いた4文字を入れてください。</p>
          <form class="online__row" data-form="join">
            <input class="online__input online__input--code" name="code" maxlength="4" placeholder="ABCD" required>
            <button type="button" class="btn btn--primary" data-act="online-join">入る</button>
          </form>
        </section>
      </div>
      ${info.saved ? `<div class="online__row"><button class="btn" data-act="online-rejoin">前の対戦に戻る(ルーム ${esc(info.saved)})</button></div>` : ''}
      ${error}
      <div class="online__row">${back}<button class="btn btn--ghost" data-act="online-logout">ログアウト</button></div>`;
  } else if (info.step === 'waiting') {
    body = `<p class="online__lead">相手にこの4文字を伝えてください。相手が入ると、対戦が始まります。</p>
      <p class="online__code">${esc(info.code)}</p>
      <p class="online__wait">相手の参加を待っています…</p>
      <div class="online__row"><button class="btn btn--ghost" data-act="online-cancel">やめる</button></div>`;
  } else {
    body = '<p class="online__wait">通信しています…</p>';
  }

  el.innerHTML = `
    <div class="setup__panel chalkboard online">
      <h1 class="setup__title chalk-text">オンライン対戦</h1>
      ${body}
    </div>`;
  el.querySelector('input')?.focus();
}

export function readSetup(el) {
  return {
    decks: [0, 1].map((p) => el.querySelector(`input[name="deck${p}"]:checked`).value),
    names: [0, 1].map((p) => el.querySelector(`input[name="name${p}"]`).value.trim()),
    controllers: [0, 1].map((p) => el.querySelector(`select[name="ctrl${p}"]`).value),
    field: el.querySelector('select[name="field"]').value,
    curtain: el.querySelector('input[name="curtain"]').checked,
    confirmEnd: el.querySelector('input[name="confirmEnd"]').checked,
    sfx: el.querySelector('input[name="sfx"]').checked,
    bgm: el.querySelector('input[name="bgm"]').checked,
  };
}

// ------------------------------------------------------------
// 対戦画面
// ------------------------------------------------------------
export function renderBoard(el, state, ui, legal) {
  const v = ui.viewer;
  const o = 1 - v;
  const ctx = buildContext(state, ui, legal);

  el.innerHTML = `
    <div class="hand hand--top" data-pile="hand-${o}" style="--n:${state.players[o].hand.length}">
      ${state.players[o].hand.map((uid) => `<div class="cardbox" data-uid="${uid}">${cardBack()}</div>`).join('')}
    </div>
    ${half(state, o, 'top', ctx)}
    ${midline(state, ctx)}
    ${half(state, v, 'bottom', ctx)}
    <div class="hand hand--bottom" data-pile="hand-${v}" style="--n:${state.players[v].hand.length}">
      ${state.players[v].hand.map((uid) => handCard(state, uid, ctx)).join('')}
    </div>
    ${choicePanel(state, ctx)}`;
}

// 今できる操作から、「光らせるカード」などをまとめておく
function buildContext(state, ui, legal) {
  const ctx = {
    v: ui.viewer,
    selected: ui.selected,
    dragging: ui.dragging,
    cpu: ui.cpu ?? [false, false],
    // オンライン対戦の相手(自分以外の席)
    remote: ui.online ? [ui.online.seat !== 0, ui.online.seat !== 1] : [false, false],
    playable: new Set(),
    promotable: new Set(),
    attackers: new Set(),
    targets: new Set(),
    choice: new Set(),
    isMain: legal.some((a) => a.type === 'endTurn'),
    // 演出中(選び終わった直後など)は、選択画面を出さない
    isChooser: !ui.busy && !!state.pending && state.pending.player === ui.viewer && !ui.cpu?.[ui.viewer],
    // 反撃を選んでいる間は、対決中の2体を赤く光らせる
    battle: state.pending?.resolve === 'counter' ? [state.pending.ctx.attacker, state.pending.ctx.target] : [],
  };
  for (const a of legal) {
    if (a.type === 'play') ctx.playable.add(a.uid);
    if (a.type === 'promote') ctx.promotable.add(a.uid);
    if (a.type === 'attack') {
      ctx.attackers.add(a.attacker);
      if (a.attacker === ui.selected) ctx.targets.add(a.target);
    }
    if (a.type === 'choose' && a.value !== null) ctx.choice.add(a.value);
  }
  return ctx;
}

// 自分・相手の場の一列
function half(state, p, pos, ctx) {
  return `
    <div class="half half--${pos}">
      <div class="area-trash">${trashPile(state, p)}</div>
      <div class="area-side">${sidePile(state, p)}</div>
      <div class="area-zone">${zone(state, p, ctx)}</div>
      <div class="area-deck">${deckPile(state, p)}</div>
      <div class="area-mana">${nameplate(state, p, ctx)}${mana(state.players[p])}</div>
    </div>`;
}

function nameplate(state, p, ctx) {
  const active = state.phase === 'main' && state.active === p;
  return `<div class="nameplate ${active ? 'is-active' : ''}">
    <b>${pName(p)}${ctx.cpu[p] ? '(コンピュータ)' : ''}${ctx.remote[p] ? '(相手)' : ''}</b>${esc(DECKS[state.players[p].deckKey].name)}
  </div>`;
}

function zone(state, p, ctx) {
  const pl = state.players[p];
  let html = '';
  for (let i = 0; i < zoneLimit(state); i++) {
    const t = pl.zone[i];
    html += `<div class="zone__slot">${t ? teacherBox(state, t, p, ctx) : ''}</div>`;
  }
  // 手札の先生をドラッグ中は、自分の空いている枠を光らせる
  const drop = p === ctx.v && ctx.dragging && ctx.playable.has(ctx.dragging)
    && CARDS[state.cards[ctx.dragging].id].type === 'teacher';
  return `<div class="zone ${drop ? 'is-drop' : ''}">${html}</div>`;
}

function teacherBox(state, t, p, ctx) {
  const id = state.cards[t.uid].id;
  const base = CARDS[id].power;
  const pw = power(state, t.uid);
  const cls = ['cardbox'];
  if (ctx.attackers.has(t.uid) && ctx.selected !== t.uid) cls.push('can-attack');
  if (ctx.selected === t.uid) cls.push('is-selected');
  if (ctx.targets.has(t.uid)) cls.push('is-target');
  if (ctx.choice.has(t.uid)) cls.push('is-choice');
  if (ctx.battle.includes(t.uid)) cls.push('is-battle');
  if (ctx.dragging === t.uid) cls.push('is-dragging');
  if (t.sick) cls.push('is-sick');
  if (t.attacked) cls.push('is-spent');

  const badges = [];
  if (t.guard) badges.push(`<span class="badge badge--guard">${esc(TERMS.guard)}</span>`);
  if (t.attacked) badges.push('<span class="badge badge--spent">' + esc(fmt('{battle}済み')) + '</span>');
  else if (t.sick) badges.push('<span class="badge badge--sick">登場したて</span>');

  const powerClass = pw > base ? 'is-up' : pw < base ? 'is-down' : '';
  return `<div class="${cls.join(' ')}" data-uid="${t.uid}" data-cid="${id}">
    ${cardFace(id, { power: pw, powerClass })}
    ${badges.length ? `<div class="badges">${badges.join('')}</div>` : ''}
  </div>`;
}

function handCard(state, uid, ctx) {
  const id = state.cards[uid].id;
  const cls = ['cardbox'];
  const usable = ctx.playable.has(uid) || ctx.promotable.has(uid);
  if (ctx.isMain && ctx.selected !== uid) cls.push(usable ? 'is-playable' : 'is-unplayable');
  if (ctx.selected === uid) cls.push('is-selected');
  if (ctx.choice.has(uid)) cls.push('is-choice');
  if (ctx.dragging === uid) cls.push('is-dragging');
  const cost = playCost(state, uid);
  return `<div class="${cls.join(' ')}" data-uid="${uid}" data-cid="${id}">
    ${cardFace(id, { cost, costClass: cost < CARDS[id].cost ? 'is-down' : '' })}
  </div>`;
}

// ---- 山札・サイド・墓地 ----
function backPile(kind, p, count, extraClass = '') {
  const name = esc(TERMS[kind]);
  return `<div class="pile ${extraClass} ${count ? '' : 'pile--empty'}" data-pile="${kind}-${p}">
    <span class="pile__name">${name}</span>
    ${count ? `<div class="pile__stack" style="--depth:${Math.min(4, Math.ceil(count / 4))}">${cardBack()}</div>` : ''}
    <span class="pile__count">${count}</span>
  </div>`;
}
const deckPile = (state, p) => backPile('deck', p, state.players[p].deck.length);
const sidePile = (state, p) => backPile('side', p, state.players[p].side.length, 'pile--side');

function trashPile(state, p) {
  const trash = state.players[p].trash;
  const top = trash[trash.length - 1];
  const name = esc(TERMS.trash);
  return `<div class="pile pile--trash ${top ? '' : 'pile--empty'}" data-pile="trash-${p}" data-act="open-trash" data-p="${p}"
      title="クリックで${name}の一覧">
    <span class="pile__name">${name}</span>
    ${top ? `<div class="cardbox" data-uid="${top}" data-cid="${state.cards[top].id}">${cardFace(state.cards[top].id)}</div>` : ''}
    <span class="pile__count">${trash.length}</span>
  </div>`;
}

// ---- マナ(5×2) ----
function mana(pl) {
  const full = Math.min(pl.mana, pl.manaMax);
  const orbs = [];
  for (let i = 0; i < MANA_SLOTS; i++) {
    const cls = i < full ? 'is-full' : i < pl.manaMax ? 'is-used' : 'is-locked';
    orbs.push(`<i class="mana__orb ${cls}"></i>`);
  }
  const extra = pl.mana - pl.manaMax;
  return `<div class="mana">
    <div class="mana__label">${esc(TERMS.mana)} <b>${pl.mana}</b>/${pl.manaMax}</div>
    <div class="mana__grid">${orbs.join('')}</div>
    ${extra > 0 ? `<div class="mana__extra">+${extra}(このターンのみ)</div>` : ''}
  </div>`;
}

// ---- 真ん中の帯 ----
function midline(state, ctx) {
  const f = FIELDS.find((x) => x.id === state.field);
  const stack = state.stack.map((uid) =>
    `<div class="cardbox" data-uid="${uid}" data-cid="${state.cards[uid].id}">${cardFace(state.cards[uid].id)}</div>`).join('');
  const { text, prompt } = statusText(state, ctx);

  return `<div class="midline">
    <div class="field-chip" data-cid="field:${f.id}">
      <small>${esc(TERMS.field)}</small><b>${esc(f.name)}</b>
    </div>
    <div class="stack-spot" data-pile="stack">
      ${stack}${state.stack.length ? '<span class="stack-spot__label">処理中…</span>' : ''}
    </div>
    <div class="midline__status">
      <span class="status-text ${prompt ? 'is-prompt' : ''}">${esc(text)}</span>
    </div>
    <div class="midline__actions">${actionButtons(state, ctx)}</div>
  </div>`;
}

function statusText(state, ctx) {
  if (ctx.isChooser) return { text: fmt(state.pending.prompt), prompt: true };
  if (ctx.dragging) return { text: dragHint(state, ctx), prompt: true };
  const sel = ctx.selected;
  if (sel && ctx.attackers.has(sel)) {
    return { text: fmt('{battle}する相手の{teacher}を選んでください'), prompt: true };
  }
  if (sel && state.cards[sel]) {
    const c = CARDS[state.cards[sel].id];
    if (ctx.playable.has(sel) || ctx.promotable.has(sel)) return { text: `${c.name} を使いますか?`, prompt: true };
    return { text: whyUnplayable(state, sel, ctx), prompt: false };
  }
  if (state.winner !== null) return { text: '対戦終了', prompt: false };
  const actor = state.phase === 'mulligan'
    ? (state.players[0].mulliganDone ? 1 : 0)
    : (state.pending ? state.pending.player : state.active);
  if (ctx.cpu[actor]) return { text: `${pName(actor)}(コンピュータ)が考え中…`, prompt: false };
  if (ctx.remote[actor]) {
    return { text: state.phase === 'mulligan' ? fmt('相手が{mulligan}をするか考えています…') : '相手が操作しています…', prompt: false };
  }
  if (state.phase !== 'main') return { text: '準備中', prompt: false };
  return { text: `${state.turn}ターン目 ・ ${pName(state.active)}のターン`, prompt: false };
}

function dragHint(state, ctx) {
  const uid = ctx.dragging;
  if (ctx.attackers.has(uid)) return fmt('相手の{teacher}に重ねると{battle}');
  const c = CARDS[state.cards[uid].id];
  const hints = [];
  if (ctx.playable.has(uid)) hints.push(c.type === 'teacher' ? fmt('{zone}に放すと場に出す') : '盤面に放すと使う');
  if (ctx.promotable.has(uid)) hints.push(fmt(`{cost}${CARDS['5C'].minCost}以上の自分の{teacher}(登場したてを除く)に重ねると{promote}`));
  return hints.join(' / ');
}

function whyUnplayable(state, uid, ctx) {
  const pl = state.players[ctx.v];
  if (!ctx.isMain) return '今は使えません';
  if (pl.mana < playCost(state, uid)) return fmt('{mana}が足りません');
  if (CARDS[state.cards[uid].id].type === 'teacher') return fmt('{zone}がいっぱいです');
  return '今は使えません(条件を満たしていません)';
}

function actionButtons(state, ctx) {
  const sel = ctx.selected;
  if (sel && state.cards[sel] && !ctx.attackers.has(sel)) {
    const isTeacher = CARDS[state.cards[sel].id].type === 'teacher';
    let html = '';
    if (ctx.playable.has(sel)) {
      html += `<button class="btn btn--primary" data-act="play">${isTeacher ? '場に出す' : '使う'}</button>`;
    }
    if (ctx.promotable.has(sel)) {
      html += `<button class="btn btn--primary" data-act="promote">${esc(TERMS.promote)}で出す</button>`;
    }
    return html + '<button class="btn btn--ghost btn--small" data-act="cancel">やめる</button>';
  }
  if (sel) return '<button class="btn btn--ghost btn--small" data-act="cancel">やめる</button>';
  if (ctx.isMain) return '<button class="btn btn--primary" data-act="end-turn">ターン終了</button>';
  return '';
}

// ---- 反撃の選択(画面の真ん中に大きく) ----
function duelPanel(state) {
  const p = state.pending;
  const { attacker, target } = p.ctx;
  const a = power(state, attacker);
  const t = power(state, target);
  // 防御側から見た結果の予想
  const outcome = (atk, def) => (def > atk ? ['win', '守りきれる'] : def < atk ? ['lose', fmt('{destroy}される')] : ['draw', '相打ち']);
  const hint = (value) => {
    if (value === 'pass') return outcome(a, t);
    if (state.cards[value].id === '3B') {
      const [kind, text] = outcome(a - CARDS['3B'].counterPower, t);
      return [kind, kind === 'lose' ? text : `${text}(${TERMS.side}は獲得しない)`];
    }
    return ['win', fmt('{battle}を無効にする')];
  };
  const face = (uid) => {
    const id = state.cards[uid].id;
    const pw = power(state, uid);
    const base = CARDS[id].power;
    return `<div class="cardbox duel__card" data-cid="${id}">
      ${cardFace(id, { power: pw, powerClass: pw > base ? 'is-up' : pw < base ? 'is-down' : '' })}
    </div>`;
  };
  const options = p.options.map((o) => {
    const [kind, text] = hint(o.value);
    // 反撃するボタンはクリック音を鳴らさない(反撃の音と重ならないように)
    const counter = o.value !== 'pass';
    return `<button class="btn duel__option ${counter ? 'is-counter' : ''}" data-act="choose" data-value="${esc(o.value)}" ${counter ? 'data-silent="1"' : ''}>
      <span>${esc(fmt(o.label))}</span><em class="duel__hint is-${kind}">→ ${text}</em>
    </button>`;
  });
  return `<div class="duel-backdrop"></div>
    <div class="duel">
      <p class="duel__title chalk-text">${esc(fmt('{battle}を挑まれました!'))}</p>
      <div class="duel__cards">
        <div class="duel__side"><span>相手</span>${face(attacker)}</div>
        <div class="duel__vs chalk-text">VS</div>
        <div class="duel__side"><span>あなた</span>${face(target)}</div>
      </div>
      <p class="duel__question">${esc(fmt('{counter}しますか?'))}</p>
      <div class="duel__options">${options.join('')}</div>
    </div>`;
}

// ---- 墓地から選ぶ(真ん中に墓地の中身を大きく並べる) ----
function trashPanel(state) {
  const p = state.pending;
  const trash = state.players[p.player].trash;
  const selectable = new Set(p.options.map((o) => o.value));
  const cards = trash.map((uid) => {
    const id = state.cards[uid].id;
    return selectable.has(uid)
      // クリック音の代わりに、回収の音(recover)が鳴る
      ? `<button class="trash-pick__card cardbox is-choice" data-act="choose" data-value="${uid}" data-cid="${id}" data-silent="1"
          aria-label="${esc(CARDS[id].name)}を選ぶ">${cardFace(id)}</button>`
      : `<div class="trash-pick__card cardbox is-disabled" data-cid="${id}">${cardFace(id)}</div>`;
  }).join('');
  return `<div class="duel-backdrop"></div>
    <div class="trash-pick">
      <p class="trash-pick__title chalk-text">${esc(fmt(p.prompt))}</p>
      <p class="trash-pick__sub">${esc(fmt(`${pName(p.player)}の{trash}(${trash.length}枚)・光っているカードを選べます`))}</p>
      <div class="trash-pick__grid">${cards}</div>
      ${p.optional ? '<button class="btn btn--ghost" data-act="choose" data-null="1">選ばずに進む</button>' : ''}
    </div>`;
}

// ---- 選択パネル ----
function choicePanel(state, ctx) {
  if (!ctx.isChooser) return '';
  const p = state.pending;
  if (p.resolve === 'counter') return duelPanel(state);
  if (p.resolve === 'recover') return trashPanel(state);
  const options = p.options.map((o) => {
    const card = state.cards[o.value];
    const thumb = card ? `<span class="choice__thumb cardbox">${cardFace(card.id)}</span>` : '';
    return `<button class="btn choice__option" data-act="choose" data-value="${esc(o.value)}">
      ${thumb}<span>${esc(fmt(o.label))}</span>
    </button>`;
  });
  if (p.optional) {
    options.push('<button class="btn btn--ghost choice__option" data-act="choose" data-null="1">選ばずに進む</button>');
  }
  return `<div class="choice">
    <p class="choice__prompt">${esc(fmt(p.prompt))}</p>
    <div class="choice__list">${options.join('')}</div>
  </div>`;
}

// ------------------------------------------------------------
// サイドバー
// ------------------------------------------------------------
export function renderLog(el, state) {
  el.innerHTML = state.log.slice(-150).map((line) =>
    `<li class="${line.startsWith('――') ? 'is-turn' : ''}">${esc(fmt(line))}</li>`).join('');
  el.scrollTop = el.scrollHeight;
}

// key: 'field:F1' または 'カードID|uid'
export function renderPreview(el, state, key) {
  if (!key) {
    el.innerHTML = '<p class="preview__empty">カードにマウスを乗せると<br>ここに大きく表示されます</p>';
    return;
  }
  if (key.startsWith('field:')) {
    const f = FIELDS.find((x) => x.id === key.slice(6));
    el.innerHTML = `<div class="preview__field">
      <small>${esc(TERMS.field)}</small><b>${esc(f.name)}</b>${esc(fmt(cardText(f)))}
    </div>`;
    return;
  }
  const [cid, uid] = key.split('|');
  let opts = {};
  const onBoard = uid && state.players.some((pl) => pl.zone.some((t) => t.uid === uid));
  if (onBoard) {
    const pw = power(state, uid);
    const base = CARDS[cid].power;
    opts = { power: pw, powerClass: pw > base ? 'is-up' : pw < base ? 'is-down' : '' };
  }
  // フレーバーテキスト(登録ページで入れたもの)は、カードの下に小さな引用として出す
  // (カードの中は効果の文章でいっぱいなので、中には入れない)
  const flavor = CARDS[cid].flavor;
  el.innerHTML = `<div class="preview__stack ${flavor ? 'has-flavor' : ''}">
    <div class="preview__card cardbox">${cardFace(cid, opts)}</div>
    ${flavor ? `<p class="preview__flavor">${esc(flavor)}</p>` : ''}
  </div>`;
}

// ------------------------------------------------------------
// 全画面の案内
// ------------------------------------------------------------
let lastOverlayKey = null;

export function renderOverlay(el, state, ui) {
  const ov = ui.overlay;
  const key = ov ? JSON.stringify(ov) + (ov.kind === 'mulligan' ? state.players[ui.viewer].hand.join() : '') : null;
  if (key === lastOverlayKey) return;
  lastOverlayKey = key;

  if (!ov) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  el.hidden = false;
  el.className = `overlay${ov.kind === 'curtain' ? ' overlay--curtain' : ''}`;
  el.innerHTML = OVERLAYS[ov.kind](state, ui, ov);
  el.querySelector('.btn--primary')?.focus();
}

const cardList = (state, uids) =>
  uids.map((uid) => `<div class="cardbox">${cardFace(state.cards[uid].id)}</div>`).join('');

const OVERLAYS = {
  curtain: (state, ui, ov) => `
    <div class="curtain">
      <p class="curtain__why">画面を交代してください</p>
      <p class="curtain__who chalk-text">${pName(ov.player)}の番です</p>
      <p class="curtain__why">${esc(ov.reason)}</p>
      <button class="btn btn--primary" data-act="curtain-ok">準備OK</button>
    </div>`,

  mulligan: (state, ui) => `
    <div class="modal chalkboard">
      <h2 class="chalk-text">${pName(ui.viewer)}:${esc(TERMS.mulligan)}をしますか?</h2>
      <p>最初の${esc(TERMS.hand)}を見て、1回だけ${esc(TERMS.deck)}に戻して引き直せます(枚数は減りません)。</p>
      <div class="modal__cards">${cardList(state, state.players[ui.viewer].hand)}</div>
      <div class="modal__buttons">
        <button class="btn" data-act="mulligan-redraw">引き直す</button>
        <button class="btn btn--primary" data-act="mulligan-keep">このままでOK</button>
      </div>
    </div>`,

  trash: (state, ui, ov) => {
    const trash = state.players[ov.p].trash;
    return `
      <div class="modal chalkboard">
        <h2 class="chalk-text">${pName(ov.p)}の${esc(TERMS.trash)}(${trash.length}枚)</h2>
        ${trash.length ? `<div class="modal__cards">${cardList(state, trash)}</div>` : `<p>まだ何もありません</p>`}
        <div class="modal__buttons"><button class="btn btn--primary" data-act="close-overlay">閉じる</button></div>
      </div>`;
  },

  endConfirm: (state, ui, ov) => `
    <div class="modal chalkboard">
      <h2 class="chalk-text">ターンを終了しますか?</h2>
      <ul class="confirm-list">
        ${ov.attackers ? `<li>まだ${esc(TERMS.battle)}していない${esc(TERMS.teacher)}が <b>${ov.attackers}体</b> います</li>` : ''}
        ${ov.playable ? `<li>まだ使えるカードが <b>${ov.playable}枚</b> あります</li>` : ''}
      </ul>
      <label class="confirm-skip"><input type="checkbox" name="skip-confirm"> 今後この確認を表示しない</label>
      <div class="modal__buttons">
        <button class="btn" data-act="close-overlay">戻る</button>
        <button class="btn btn--primary" data-act="end-turn-yes">ターン終了</button>
      </div>
    </div>`,

  concede: (state, ui) => `
    <div class="modal chalkboard">
      <h2 class="chalk-text">降参しますか?</h2>
      <p>${pName(ui.viewer)}の負けとして、対戦を終了します。</p>
      <div class="modal__buttons">
        <button class="btn" data-act="close-overlay">やめる</button>
        <button class="btn btn--primary" data-act="concede-yes">降参する</button>
      </div>
    </div>`,

  gameover: (state, ui) => {
    const cpu = ui.cpu ?? [false, false];
    const vsCpu = cpu[0] !== cpu[1];  // 人間とコンピュータの対戦
    let title = `${pName(state.winner)}の勝利!`;
    if (vsCpu) title = cpu[state.winner] ? 'コンピュータの勝ち…' : 'あなたの勝ち!';
    if (ui.online) title = state.winner === ui.online.seat ? 'あなたの勝ち!' : '相手の勝ち…';
    const buttons = ui.online
      ? '<button class="btn btn--primary" data-act="online-back">オンライン対戦の画面へ</button>'
      : `<button class="btn" data-act="to-setup">デッキ選択へ</button>
         <button class="btn btn--primary" data-act="rematch">同じデッキでもう一度</button>`;
    return `
    <div class="modal chalkboard">
      <h2 class="chalk-text gameover__title">${title}</h2>
      <p>${vsCpu || ui.online ? `${pName(state.winner)}の勝利。` : ''}${state.turn}ターンで決着しました。</p>
      <div class="modal__buttons">${buttons}</div>
    </div>`;
  },
};
