// ============================================================
// オンライン対戦の通信(電話)
//
// しくみ:ルール処理は、同じ操作を同じ順番で行えば、どのパソコンでも
// 同じ結果になる。そこで Firebase には「対戦の設定(乱数のタネ・デッキ)」と
// 「お互いの操作の一覧」だけを置き、両方のパソコンが同じ順番で再生する。
//
// データの形(Realtime Database):
//   rooms/{合言葉4文字}/
//     status:  'waiting'(相手待ち) | 'playing'(対戦中)
//     seed:    乱数のタネ
//     field:   教室('random' ならランダム)
//     players: { 0: { client, deck }, 1: { client, deck } }
//     actions: { 自動の番号: 操作, ... }  ← 操作が起きた順に並ぶ
// ============================================================

import { firebaseConfig, SHARED_EMAIL, ADMIN_EMAIL } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  // 見間違えやすい O/0・I/1 は使わない
const NULL_MARK = '__null__';  // Firebase は null を保存できないので、目印に置き換えて送る

let fb = null;

export const isConfigured = () => !!firebaseConfig;

// Firebase の部品を読み込む(最初に使う時に1回だけ)
// 非公開のカード情報(private-cards.js)からも使う
export async function load() {
  if (fb) {
    fb.D.goOnline(fb.db);  // release() で切っていたら、つなぎ直す
    return fb;
  }
  const [app, auth, db] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-database.js`),
  ]);
  const a = app.initializeApp(firebaseConfig);
  fb = { auth: auth.getAuth(a), db: db.getDatabase(a), A: auth, D: db };
  return fb;
}

// ---- つなぎっぱなしにしない ----
// Firebase の無料プランは「同時に100人まで」しかつながれない。
// 先生の名前・画像を読み込んだだけの人がつながったままにならないよう、
// 見張り(対戦の待ち受け・操作の受け取り)をしていない時は切断する。
let watching = 0;
export function release() {
  if (fb && watching === 0) fb.D.goOffline(fb.db);
}
// 見張りを始めた数を数え、止める時に減らす
function counted(unsubscribe) {
  watching++;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    watching--;
    unsubscribe();
  };
}

// このタブを見分けるための番号(部員は同じアカウントで入るので、アカウントでは区別できない)。
// タブごとに別の番号になるので、1台のパソコンで2つのタブを開いて対戦もできる。
// 同じタブなら再読み込みしても番号は変わらないので、対戦に戻れる。
let memoryId = null;
export function clientId() {
  const KEY = 'sensei-tcg.client';
  try {
    let id = sessionStorage.getItem(KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2, 12);
      sessionStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // 保存できない環境では、ページを開いている間だけの番号を使う
    memoryId ??= Math.random().toString(36).slice(2, 12);
    return memoryId;
  }
}

// ---- 合言葉でのログイン ----
export async function isLoggedIn() {
  const { auth } = await load();
  await auth.authStateReady();
  return !!auth.currentUser;
}

// 今ログインしている人のメールアドレス(ログインしていなければ null)。
// admin.html が「管理者としてログインしているか」を見分けるのに使う。
export async function currentEmail() {
  const { auth } = await load();
  await auth.authStateReady();
  return auth.currentUser?.email ?? null;
}

export async function login(password) {
  const { auth, A } = await load();
  await A.signInWithEmailAndPassword(auth, SHARED_EMAIL, password);
}

// 管理者(admin.html)専用のログイン。合言葉用のアカウントとは別の
// アカウントでログインするので、ここでログインした人だけが private に
// 書き込める(Realtime Database のルールで絞ってある)。
export async function adminLogin(password) {
  const { auth, A } = await load();
  await A.signInWithEmailAndPassword(auth, ADMIN_EMAIL, password);
}

export async function logout() {
  const { auth, A } = await load();
  await A.signOut(auth);
}

// ---- ゲームの版(バージョン) ----
// ルールに関係するファイルの中身から、自動で「版の印」を作る。
// ファイルを1文字でも変えると印が変わるので、手で番号を上げる必要はない。
// オンライン対戦は、2人の版が同じでないと画面がずれるため、ルームに入る時に比べる。
const RULE_FILES = [
  'js/data/cards.js', 'js/data/decks.js', 'js/data/rules.js',
  'js/engine/index.js', 'js/engine/game-state.js', 'js/engine/turn.js', 'js/engine/battle.js', 'js/engine/effects.js',
];
let versionPromise = null;
export function rulesVersion() {
  versionPromise ??= (async () => {
    const texts = await Promise.all(RULE_FILES.map(async (f) => {
      const res = await fetch(new URL(`../../${f}`, import.meta.url));
      return (await res.text()).replace(/\r\n/g, '\n');
    }));
    // 文字列から8けたの印を作る(FNV-1a という計算方法)
    let h = 0x811c9dc5;
    for (const ch of texts.join('\n')) {
      h ^= ch.codePointAt(0);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  })();
  return versionPromise;
}
const VERSION_MISMATCH = 'ルームを作った人と、ゲームの版(バージョン)が違います。'
  + '2人ともページを読み込み直して(Ctrl + F5)、ルームを作り直してください';

// ---- 古いルームのお片付け ----
// ルームを作る時に、1日以上前に作られたルームを消す(終わった対戦がたまらないように)。
// Firebase のルールに ".indexOn": ["createdAt"] と rooms の ".read" が必要(マニュアル11章)。
// うまくいかなくても、ルーム作りは止めない
const OLD_ROOM_MS = 24 * 60 * 60 * 1000;
async function cleanupOldRooms() {
  try {
    const { db, D } = await load();
    const q = D.query(D.ref(db, 'rooms'), D.orderByChild('createdAt'), D.endAt(Date.now() - OLD_ROOM_MS), D.limitToFirst(20));
    const snap = await D.get(q);
    const removes = [];
    snap.forEach((child) => { removes.push(D.remove(child.ref)); });
    await Promise.all(removes);
  } catch (e) {
    console.warn('古いルームを片付けられませんでした(Firebase のルールを確認)', e);
  }
}

// ---- ルーム ----
const newCode = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

// ルームを作る → 4文字の合言葉を返す
export async function createRoom(deck, field, name = '') {
  const { db, D } = await load();
  const version = await rulesVersion();
  cleanupOldRooms();  // 待たずに裏で進める
  for (let i = 0; i < 20; i++) {
    const code = newCode();
    const result = await D.runTransaction(D.ref(db, `rooms/${code}`), (cur) => {
      if (cur !== null) return undefined;  // 使われている合言葉なら作り直す
      return {
        status: 'waiting',
        version,
        createdAt: Date.now(),
        seed: Math.floor(Math.random() * 2 ** 31),
        field,
        players: { 0: { client: clientId(), deck, name } },
      };
    });
    if (result.committed) return code;
  }
  throw new Error('ルームを作れませんでした。もう一度試してください');
}

// ルームに入る → { room, seat } を返す(seat = 自分がプレイヤー1(0)か2(1)か)
export async function joinRoom(code, deck, name = '') {
  const { db, D } = await load();
  code = code.trim().toUpperCase();
  const me = clientId();
  // ゲームの版が違うと、2人の画面で結果がずれるので入らない(入り直しの時も同じ)
  const before = await getRoom(code);
  if (before?.version && before.version !== await rulesVersion()) throw new Error(VERSION_MISMATCH);
  const result = await D.runTransaction(D.ref(db, `rooms/${code}`), (cur) => {
    if (cur === null) return cur;                         // 存在しない(読み込み前もここに来る)
    const players = cur.players || {};
    if (players[0]?.client === me || players[1]?.client === me) return cur;  // 入り直し
    if (cur.status !== 'waiting' || players[1]) return undefined;           // 満員
    cur.players = { ...players, 1: { client: me, deck, name } };
    cur.status = 'playing';
    return cur;
  });
  const room = result.snapshot.val();
  if (!room) throw new Error('そのルームは見つかりません');
  const seat = room.players?.[0]?.client === me ? 0 : room.players?.[1]?.client === me ? 1 : null;
  if (seat === null) throw new Error('そのルームはもう満員です');
  return { room, seat };
}

export async function getRoom(code) {
  const { db, D } = await load();
  return (await D.get(D.ref(db, `rooms/${code}`))).val();
}

// ルームの状態(相手が来たか)を見張る
export async function watchRoom(code, onRoom) {
  const { db, D } = await load();
  return counted(D.onValue(D.ref(db, `rooms/${code}/status`), async (snap) => {
    if (snap.val() === 'playing') onRoom(await getRoom(code));
  }));
}

// 相手待ちのルームを取り消す
export async function cancelRoom(code) {
  const { db, D } = await load();
  const room = await getRoom(code);
  if (room && room.status === 'waiting') await D.remove(D.ref(db, `rooms/${code}`));
}

// ---- 操作のやり取り ----
export async function sendAction(code, action) {
  const { db, D } = await load();
  const data = { ...action };
  if (data.value === null) data.value = NULL_MARK;
  await D.push(D.ref(db, `rooms/${code}/actions`), data);
}

// 操作を見張る。すでにある操作は initial = true で(演出なしで再生する用)、
// そのあと届く操作は initial = false で、起きた順に onAction に渡す。
// すでにある操作を全部渡し終えたら onReady を呼ぶ。
export async function watchActions(code, onAction, onReady) {
  const { db, D } = await load();
  const ref = D.ref(db, `rooms/${code}/actions`);
  const existing = (await D.get(ref)).size;
  let count = 0;
  const unsubscribe = D.onChildAdded(ref, (snap) => {
    const action = snap.val();
    if (action.value === NULL_MARK) action.value = null;
    count++;
    onAction(action, count <= existing);
    if (count === existing) onReady();
  });
  if (existing === 0) onReady();
  return counted(unsubscribe);
}
