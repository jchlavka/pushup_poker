// poker.js — 54-card deck (52 + 2 wild jokers), shuffle, and a best-5-of-7
// hand evaluator that supports wild jokers plus the house "more-jokers-loses"
// tiebreak. Pure and deterministic (except makeShuffledDeck, which uses the RNG
// you pass in). No dependencies — safe to open directly in a browser or a test
// page.

// Card wire format:
//   normal card = rank char + suit char, e.g. "As", "Td", "9c", "2h"
//   jokers       = "*1" and "*2"  (any string starting with "*")
// Ranks:  2 3 4 5 6 7 8 9 T J Q K A   (values 2..14, Ace high = 14)
// Suits:  s h d c

export const RANK_CHARS = '23456789TJQKA';
export const SUIT_CHARS = 'shdc';
export const JOKERS = ['*1', '*2'];

// Hand categories, higher = stronger. Five of a kind is only reachable with
// wilds, and it beats a straight flush.
export const CAT = {
  HIGH_CARD: 1,
  ONE_PAIR: 2,
  TWO_PAIR: 3,
  THREE_KIND: 4,
  STRAIGHT: 5,
  FLUSH: 6,
  FULL_HOUSE: 7,
  FOUR_KIND: 8,
  STRAIGHT_FLUSH: 9,
  FIVE_KIND: 10,
};

const CAT_NAME = {
  10: 'Five of a Kind',
  9: 'Straight Flush',
  8: 'Four of a Kind',
  7: 'Full House',
  6: 'Flush',
  5: 'Straight',
  4: 'Three of a Kind',
  3: 'Two Pair',
  2: 'One Pair',
  1: 'High Card',
};

export function isJoker(card) {
  return typeof card === 'string' && card[0] === '*';
}

// Parse a normal card string into {r, s}. Ace = 14. Throws on a joker.
function parseCard(card) {
  const r = RANK_CHARS.indexOf(card[0]);
  const s = SUIT_CHARS.indexOf(card[1]);
  if (r < 0 || s < 0) throw new Error('bad card: ' + card);
  return { r: r + 2, s };
}

export function rankValue(card) {
  return parseCard(card).r;
}

// Human label for a rank value (for UI / winner text).
export function rankLabel(v) {
  return RANK_CHARS[v - 2];
}

// The 52 concrete cards a joker can become (all rank/suit combos).
const ALL52 = (() => {
  const out = [];
  for (let r = 2; r <= 14; r++) for (let s = 0; s < 4; s++) out.push({ r, s });
  return out;
})();

export function makeDeck() {
  const deck = [];
  for (const rc of RANK_CHARS) for (const sc of SUIT_CHARS) deck.push(rc + sc);
  deck.push(JOKERS[0], JOKERS[1]);
  return deck; // 54 cards
}

// Fisher–Yates. rng() should return a float in [0,1); defaults to Math.random.
export function shuffle(deck, rng = Math.random) {
  const a = deck.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---- 5-card ranking (no jokers; inputs are {r,s}) ----

// Returns a comparable score array [category, ...tiebreakers]. Longer/values
// higher = stronger. Within a category the tiebreaker length is fixed, so plain
// lexicographic comparison across two hands is always well-defined.
function rankFive(cards) {
  // cards: array of 5 {r,s}
  const rankCount = new Map();
  const suitCount = [0, 0, 0, 0];
  for (const c of cards) {
    rankCount.set(c.r, (rankCount.get(c.r) || 0) + 1);
    suitCount[c.s]++;
  }
  const isFlush = suitCount.some((n) => n === 5);

  // Distinct ranks descending, for straight detection.
  const distinct = [...rankCount.keys()].sort((a, b) => b - a);
  let straightHigh = 0;
  if (distinct.length === 5) {
    if (distinct[0] - distinct[4] === 4) straightHigh = distinct[0];
    // wheel: A,5,4,3,2 -> 5-high straight
    else if (
      distinct[0] === 14 &&
      distinct[1] === 5 &&
      distinct[2] === 4 &&
      distinct[3] === 3 &&
      distinct[4] === 2
    )
      straightHigh = 5;
  }
  const isStraight = straightHigh > 0;

  // Groups sorted by (count desc, rank desc): e.g. [[3,queen],[2,seven]].
  const groups = [...rankCount.entries()]
    .map(([r, n]) => ({ r, n }))
    .sort((a, b) => (b.n - a.n) || (b.r - a.r));
  const counts = groups.map((g) => g.n);

  if (counts[0] === 5) return [CAT.FIVE_KIND, groups[0].r];
  if (isStraight && isFlush) return [CAT.STRAIGHT_FLUSH, straightHigh];
  if (counts[0] === 4) return [CAT.FOUR_KIND, groups[0].r, groups[1].r];
  if (counts[0] === 3 && counts[1] === 2)
    return [CAT.FULL_HOUSE, groups[0].r, groups[1].r];
  if (isFlush) return [CAT.FLUSH, ...groups.map((g) => g.r)];
  if (isStraight) return [CAT.STRAIGHT, straightHigh];
  if (counts[0] === 3)
    return [CAT.THREE_KIND, groups[0].r, groups[1].r, groups[2].r];
  if (counts[0] === 2 && counts[1] === 2)
    return [CAT.TWO_PAIR, groups[0].r, groups[1].r, groups[2].r];
  if (counts[0] === 2)
    return [CAT.ONE_PAIR, groups[0].r, groups[1].r, groups[2].r, groups[3].r];
  return [CAT.HIGH_CARD, ...groups.map((g) => g.r)];
}

// Compare two score arrays lexicographically. >0 if a beats b.
export function compareScores(a, b) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const av = a[i] ?? -Infinity;
    const bv = b[i] ?? -Infinity;
    if (av !== bv) return av - bv;
  }
  return 0;
}

// Best concrete 5-card score from `fixed` naturals ({r,s}) plus `nWild` wilds,
// choosing wild cards to maximize. `fixed.length + nWild === 5`.
function bestFiveWithWilds(fixed, nWild) {
  if (nWild === 0) return rankFive(fixed);
  let best = null;
  if (nWild === 1) {
    for (const w of ALL52) {
      const s = rankFive([...fixed, w]);
      if (!best || compareScores(s, best) > 0) best = s;
    }
  } else {
    // nWild === 2 (max: only two jokers exist)
    for (let i = 0; i < ALL52.length; i++) {
      for (let j = i; j < ALL52.length; j++) {
        const s = rankFive([...fixed, ALL52[i], ALL52[j]]);
        if (!best || compareScores(s, best) > 0) best = s;
      }
    }
  }
  return best;
}

// All 5-card index subsets of 7 slots (C(7,5) = 21).
const SUBSETS_7C5 = (() => {
  const out = [];
  const idx = [0, 1, 2, 3, 4];
  const n = 7, k = 5;
  while (true) {
    out.push(idx.slice());
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) break;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
  return out;
})();

// Evaluate the best hand from up to 7 cards (typically 2 hole + 5 board), with
// wild jokers. Returns { score, jokersUsed, category, name }.
//   score      = [category, ...tiebreakers, -jokersUsed]
// The trailing -jokersUsed makes plain "bigger score wins" also implement the
// house rule: when the rank prefix ties, fewer jokers wins (more jokers loses).
export function evaluate(cards) {
  if (cards.length < 5) throw new Error('need at least 5 cards');
  // Use exactly 7 slots when available; with fewer than 7 (never in this game)
  // fall back to all C(n,5) subsets.
  const useSubsets =
    cards.length === 7
      ? SUBSETS_7C5
      : combos(cards.length, 5);

  let best = null; // { rank: number[], jokersUsed: number }
  for (const subset of useSubsets) {
    const chosen = subset.map((i) => cards[i]);
    const wilds = chosen.filter(isJoker).length;
    const naturals = chosen.filter((c) => !isJoker(c)).map(parseCard);
    const rank = bestFiveWithWilds(naturals, wilds);
    if (
      !best ||
      compareScores(rank, best.rank) > 0 ||
      (compareScores(rank, best.rank) === 0 && wilds < best.jokersUsed)
    ) {
      best = { rank, jokersUsed: wilds };
    }
  }
  return {
    score: [...best.rank, -best.jokersUsed],
    jokersUsed: best.jokersUsed,
    category: best.rank[0],
    name: CAT_NAME[best.rank[0]],
  };
}

// Generic combinations of `k` indices from `n` (fallback only).
function combos(n, k) {
  const out = [];
  const idx = Array.from({ length: k }, (_, i) => i);
  if (k > n) return out;
  while (true) {
    out.push(idx.slice());
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) break;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
  return out;
}

// Given a map of playerId -> 7 cards, return the id(s) of the winner(s). Ties
// (equal rank AND equal jokers used) split.
export function decideWinners(hands) {
  const scored = Object.entries(hands).map(([id, cards]) => ({
    id,
    ...evaluate(cards),
  }));
  let bestScore = null;
  for (const s of scored)
    if (!bestScore || compareScores(s.score, bestScore) > 0) bestScore = s.score;
  const winners = scored.filter((s) => compareScores(s.score, bestScore) === 0);
  return { winners: winners.map((w) => w.id), scored };
}
