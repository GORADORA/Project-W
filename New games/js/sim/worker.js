// ============================================================
// 自動対戦を裏で動かす係(画面が固まらないように、別の作業場で動く)
// ============================================================

import { playGame } from './simulate.js';
import { CARDS } from '../data/cards.js';
import { DECKS } from '../data/decks.js';
import { CONFIG } from '../engine/index.js';
import { STYLES } from './ai.js';

self.onmessage = (e) => {
  // jobs: [{ decks: ['aggro','control'], seed, field, banned, fair }, ...]
  // overrides: 実験用。この作業場の中だけで、カードの数値やデッキの中身を一時的に変える
  //   { cards: { '2C': { power: 1500 } }, decks: { ascension: { 'S5': 0, 'S1': 2 } } }
  //   config: ルール設定(例:{ FIRST_TURN_DRAW: true })
  const { jobs, overrides } = e.data;
  if (overrides?.config) Object.assign(CONFIG, overrides.config);
  //   styles: AIの戦い方(例:{ ascension: { invest: 0.6 } })
  if (overrides?.styles) {
    for (const [key, change] of Object.entries(overrides.styles)) {
      STYLES[key] = { ...(STYLES[key] ?? STYLES.default), ...change };
    }
  }
  if (overrides?.cards) {
    for (const [id, change] of Object.entries(overrides.cards)) Object.assign(CARDS[id], change);
  }
  if (overrides?.decks) {
    for (const [key, change] of Object.entries(overrides.decks)) {
      const cards = DECKS[key].cards;
      for (const [id, n] of Object.entries(change)) {
        if (n) cards[id] = n; else delete cards[id];
      }
    }
  }
  for (const job of jobs) {
    const r = playGame(job.decks, job.seed, job.field ?? null, job.banned ?? [[], []], job.fair ?? [false, false]);
    self.postMessage({ type: 'result', job, result: r });
  }
  self.postMessage({ type: 'done' });
};
