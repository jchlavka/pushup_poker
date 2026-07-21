// rules.js — all Pushup Poker betting constants and the pure legal-action
// calculator. Everything here is a plain value or a pure function, so both the
// host engine (authoritative) and each client (to render buttons) can call it
// and agree. Tweak a constant here to change the house rules.

export const MODE = { LIMIT: 'limit', NOLIMIT: 'nolimit' };

// Single forced blind, posted by the seat left of the button (big-blind style,
// no small blind). Rotates with the button each hand.
export const BLIND = 4;

// Fixed bet/raise increment per street (limit mode). All limit-mode wagers are
// exactly this size on the given street.
export const INCREMENTS = { preflop: 3, flop: 3, turn: 6, river: 6 };

// Limit mode: at most this many voluntary bets/raises may lift the level each
// street. The forced preflop blind does NOT count toward this.
export const MAX_BETS_PER_ROUND = 2;

// Hard ceiling on a single player's TOTAL contribution across the whole hand.
// (In limit mode the maximal betting line lands on exactly 40 anyway.)
export const CEILING = { limit: 40, nolimit: 50 };

// No-limit mode: any bet down to this minimum, no raise-count cap.
export const NOLIMIT_MIN_BET = 1;

export function streetIncrement(phase) {
  return INCREMENTS[phase] ?? 0;
}

export function ceilingFor(mode) {
  return CEILING[mode] ?? CEILING.limit;
}

// Compute what the acting player may legally do.
//   ctx = { mode, level, myContributed, betsMade, inc, ceiling }
//     level         current total-contribution required to stay in the hand
//     myContributed what this player has already put in this hand
//     betsMade      voluntary bets/raises made this street (limit cap)
//     inc           this street's fixed increment (limit)
//     ceiling       per-player total cap for the active mode
// Returns an object describing available actions:
//   { fold:true,
//     check?:true,
//     call?:  { amount, to },
//     bet?:   { to, amount, fixed:true } | { min, max, fixed:false },
//     raise?: (same shape as bet) }
// `bet` is offered when there is nothing to call (level already matched);
// `raise` when facing a wager. Only one of the two is ever present.
export function computeLegal(ctx) {
  const { mode, level, myContributed, betsMade, inc, ceiling } = ctx;
  const toCall = level - myContributed;
  const out = { fold: true };

  if (toCall <= 0) out.check = true;
  else out.call = { amount: Math.min(toCall, ceiling - myContributed), to: Math.min(level, ceiling) };

  const atCeiling = myContributed >= ceiling;
  if (!atCeiling) {
    const label = toCall <= 0 ? 'bet' : 'raise';
    if (mode === MODE.LIMIT) {
      if (betsMade < MAX_BETS_PER_ROUND) {
        const to = Math.min(level + inc, ceiling);
        if (to > level) out[label] = { to, amount: to - myContributed, fixed: true };
      }
    } else {
      const min = level + NOLIMIT_MIN_BET;
      const max = ceiling;
      if (min <= max) out[label] = { min, max, fixed: false };
    }
  }
  return out;
}
