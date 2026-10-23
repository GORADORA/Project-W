// ============================================================
// 効果音・BGMを鳴らす係
// どの場面で何を鳴らすかは js/data/sounds.js で決めている
// ============================================================

import { SOUNDS, BGM } from '../data/sounds.js';

const DIR = 'assets/sounds/';
const loaded = new Map();   // 場面 → 読み込んだ音のデータ(ファイルがなければ登録しない)
let bgmAudio = null;
let ctx = null;             // 効果音を鳴らす仕組み(Web Audio)

export const soundSettings = { sfx: true, bgm: false };

// 起動時に1回だけ、効果音のファイルを読み込んでメモリに置いておく
// (鳴らすたびにファイルを読み直さないので、BGMの読み込み中でもすぐ鳴る)
export function loadSounds() {
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  for (const [key, s] of Object.entries(SOUNDS)) {
    fetch(DIR + s.file)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
      .then((data) => ctx.decodeAudioData(data))
      .then((buffer) => loaded.set(key, buffer))
      .catch(() => { /* ファイルがない場面は鳴らないだけ */ });
  }
}

// 効果音を鳴らす(ファイルがない・オフのときは何もしない)
export function playSound(key) {
  if (!soundSettings.sfx || !ctx) return;
  const buffer = loaded.get(key);
  if (!buffer) return;
  // ブラウザは画面を操作するまで音を止めているので、ここで動かし直す
  if (ctx.state === 'suspended') ctx.resume();
  const src = ctx.createBufferSource();  // 同じ音を重ねて鳴らせるように、毎回新しく作る
  const gain = ctx.createGain();
  src.buffer = buffer;
  gain.gain.value = SOUNDS[key].volume;
  src.connect(gain).connect(ctx.destination);
  src.start();
}

// BGMを流す・止める(1つのファイルをくり返し流す)
export function startBgm() {
  if (!soundSettings.bgm) return;
  if (!bgmAudio) {
    bgmAudio = new Audio(DIR + BGM.file);
    bgmAudio.loop = true;
    bgmAudio.volume = BGM.volume;
  }
  bgmAudio.play().catch(() => {});
}

export function stopBgm() {
  if (bgmAudio) bgmAudio.pause();
}
