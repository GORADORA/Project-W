// ============================================================
// Firebase の設定
//
// Firebase のコンソールで表示された「firebaseConfig」の中身を、
// 下の firebaseConfig = { ... } に貼り付ける。
// (この値は秘密ではない。守りは Firebase 側の「ルール」と合言葉で行う)
// ============================================================

export const firebaseConfig = {
  apiKey: 'AIzaSyD4Bc1L_8z472wt0AL4CGuzgFa6SP5Egt4',
  authDomain: 'wao-hs-tcg.firebaseapp.com',
  databaseURL: 'https://wao-hs-tcg-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'wao-hs-tcg',
  storageBucket: 'wao-hs-tcg.firebasestorage.app',
  messagingSenderId: '84478778124',
  appId: '1:84478778124:web:dc62aadc53b2a058b04729',
};

// 合言葉でログインするための、部員共通のアカウントのメールアドレス。
// Firebase の Authentication に登録したものと同じにすること。
// (合言葉 = このアカウントのパスワード)
export const SHARED_EMAIL = 'player@sensei-tcg.app';

// 管理者(admin.html)専用のアカウントのメールアドレス。
// これも Firebase の Authentication に登録したものと同じにすること。
// private の書き込み権限は、Realtime Database のルール上、このアカウントだけに
// 絞ってある(合言葉を知っているだけの一般プレイヤーには書き込みをさせないため)。
export const ADMIN_EMAIL = 'admin@sensei-tcg.app';
