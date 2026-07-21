// engine.js — the authoritative Pushup Poker game, run ONLY on the host's
// machine. It owns the shuffled deck and everyone's hole cards; clients send
// action intents and receive a sanitized public view (see publicView) plus,
// privately and individually, their own two hole cards.
//
// Betting uses a CUMULATIVE level model: `level` is the total a player must have
// contributed across the whole hand to stay in. A street doesn't reset the
// level — at the start of a new street everyone is already matched, so "to call"
// is 0 and they may check. A bet/raise lifts the level. This makes the per-hand
// ceiling a simple clamp and means no one is ever asked to contribute past it,
// so there are no side pots (which we don't need anyway: the winner owes 0 and
// every loser owes exactly what they put in — in pushups).

import { makeDeck, shuffle, decideWinners } from './poker.js';
import {
  MODE, BLIND, streetIncrement, ceilingFor, computeLegal, MAX_BETS_PER_ROUND,
} from './rules.js';

const STREETS = ['preflop', 'flop', 'turn', 'river', 'showdown'];

export function createGame(code, hostId, mode = MODE.LIMIT) {
  return {
    code,
    hostId,
    mode,
    status: 'lobby', // 'lobby' | 'hand' | 'settle'
    players: [], // [{id, name, connected, sessionPushups}] in seating order
    buttonPos: -1, // index into hand.seats of the previous button (rotates)
    hand: null,
    settle: null,
    handNumber: 0,
  };
}

export function addPlayer(G, id, name) {
  let p = G.players.find((x) => x.id === id);
  if (p) {
    p.name = name || p.name;
    p.connected = true;
    return p;
  }
  p = { id, name: name || 'Player', connected: true, sessionPushups: 0 };
  G.players.push(p);
  return p;
}

export function setConnected(G, id, connected) {
  const p = G.players.find((x) => x.id === id);
  if (p) p.connected = connected;
}

export function setMode(G, mode) {
  if (G.status === 'lobby' || G.status === 'settle') G.mode = mode;
  else G.pendingMode = mode; // applied at next hand
}

function seatedIds(G) {
  return G.players.filter((p) => p.connected).map((p) => p.id);
}

// ---- starting a hand ----

export function startHand(G, rng = Math.random) {
  const seats = seatedIds(G);
  if (seats.length < 2) return { ok: false, error: 'need at least 2 players' };
  if (G.pendingMode) { G.mode = G.pendingMode; G.pendingMode = null; }

  G.handNumber++;
  const button = (G.buttonPos + 1) % seats.length;
  const ceiling = ceilingFor(G.mode);

  const deck = shuffle(makeDeck(), rng);
  const hole = {};
  for (const id of seats) hole[id] = [];
  // Deal two rounds, one card each, starting left of button.
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < seats.length; i++) {
      const id = seats[(button + 1 + i) % seats.length];
      hole[id].push(deck.pop());
    }
  }

  const contributed = {};
  const folded = {};
  for (const id of seats) { contributed[id] = 0; folded[id] = false; }

  const h = {
    number: G.handNumber,
    seats,
    button,
    ceiling,
    phase: 'preflop',
    board: [],
    deck,
    hole,
    folded,
    contributed,
    level: 0,
    betsMade: 0,
    inc: streetIncrement('preflop'),
    pending: {},
    lastAggressor: null,
    actingIdx: -1,
    reveal: {},
    winByFold: false,
    blindSeat: (button + 1) % seats.length,
  };
  G.hand = h;
  G.settle = null;
  G.buttonPos = button;
  G.status = 'hand';

  // Post the single blind (left of button).
  const blindId = seats[h.blindSeat];
  const blindAmt = Math.min(BLIND, ceiling);
  contributed[blindId] = blindAmt;
  h.level = blindAmt;

  // Preflop first to act is left of the blind. Everyone still owes action
  // (blind gets the option). betsMade starts at 0 (blind is not a raise).
  h.pending = {};
  for (const id of seats) h.pending[id] = true;
  h.actingIdx = (h.blindSeat + 1) % seats.length;
  advanceToActable(G);
  return { ok: true };
}

// ---- action context / legality ----

function ctxFor(G, id) {
  const h = G.hand;
  return {
    mode: G.mode,
    level: h.level,
    myContributed: h.contributed[id],
    betsMade: h.betsMade,
    inc: h.inc,
    ceiling: h.ceiling,
  };
}

export function legalFor(G, id) {
  const h = G.hand;
  if (!h || G.status !== 'hand') return null;
  if (h.seats[h.actingIdx] !== id) return null;
  return computeLegal(ctxFor(G, id));
}

function activeSeatIds(h) {
  return h.seats.filter((id) => !h.folded[id]);
}
function canActId(h, id) {
  return !h.folded[id] && h.contributed[id] < h.ceiling;
}

// Advance actingIdx to the next seat that still owes action; if none, close the
// street. Also skip seats that can't act (folded / at ceiling).
function advanceToActable(G) {
  const h = G.hand;
  const n = h.seats.length;
  for (let step = 0; step < n; step++) {
    const idx = (h.actingIdx + step) % n;
    const id = h.seats[idx];
    if (h.pending[id] && canActId(h, id)) { h.actingIdx = idx; return; }
  }
  // Nobody left to act this street.
  closeStreet(G);
}

function nextIdx(h, from) {
  return (from + 1) % h.seats.length;
}

// ---- applying an action ----

export function applyAction(G, id, action) {
  const h = G.hand;
  if (!h || G.status !== 'hand') return { ok: false, error: 'no active hand' };
  if (h.seats[h.actingIdx] !== id) return { ok: false, error: 'not your turn' };
  const legal = computeLegal(ctxFor(G, id));

  switch (action.type) {
    case 'fold': {
      h.folded[id] = true;
      delete h.pending[id];
      break;
    }
    case 'check': {
      if (!legal.check) return { ok: false, error: 'cannot check' };
      delete h.pending[id];
      break;
    }
    case 'call': {
      if (!legal.call) return { ok: false, error: 'cannot call' };
      h.contributed[id] += legal.call.amount;
      delete h.pending[id];
      break;
    }
    case 'bet':
    case 'raise': {
      const opt = legal.bet || legal.raise;
      if (!opt) return { ok: false, error: 'cannot raise' };
      let to;
      if (opt.fixed) {
        to = opt.to;
      } else {
        to = Math.round(action.amount);
        if (!(to >= opt.min && to <= opt.max)) return { ok: false, error: 'bad amount' };
      }
      h.contributed[id] = to;
      h.level = to;
      h.betsMade++;
      h.lastAggressor = id;
      // Everyone else still in the hand who can act must respond.
      h.pending = {};
      for (const sid of activeSeatIds(h)) if (sid !== id && canActId(h, sid)) h.pending[sid] = true;
      break;
    }
    default:
      return { ok: false, error: 'unknown action' };
  }

  // Hand ends immediately if only one player remains unfolded.
  if (activeSeatIds(h).length === 1) {
    h.winByFold = true;
    return finishHand(G);
  }

  // Move to the next player who owes action, else close the street.
  h.actingIdx = nextIdx(h, h.actingIdx);
  advanceToActable(G);
  return { ok: true };
}

// ---- streets ----

function dealBoard(G, count) {
  const h = G.hand;
  for (let i = 0; i < count; i++) h.board.push(h.deck.pop());
}

function closeStreet(G) {
  const h = G.hand;
  const phaseIdx = STREETS.indexOf(h.phase);

  // If at most one player can still act, run the rest of the board out with no
  // further betting.
  const runOut = activeSeatIds(h).filter((id) => canActId(h, id)).length <= 1;

  let next = STREETS[phaseIdx + 1];
  while (next && next !== 'showdown') {
    if (next === 'flop') dealBoard(G, 3);
    else dealBoard(G, 1);
    h.phase = next;
    h.inc = streetIncrement(next);
    h.betsMade = 0;
    h.lastAggressor = null;
    if (!runOut) {
      // Open the new street: everyone active owes action, first to act is left
      // of the button.
      h.pending = {};
      for (const id of activeSeatIds(h)) if (canActId(h, id)) h.pending[id] = true;
      h.actingIdx = (h.button + 1) % h.seats.length;
      advanceToActable(G);
      return;
    }
    // else: keep dealing to showdown
    next = STREETS[STREETS.indexOf(next) + 1];
  }
  // Reached showdown.
  h.phase = 'showdown';
  finishHand(G);
}

// ---- resolution / settlement ----

function finishHand(G) {
  const h = G.hand;
  const contenders = activeSeatIds(h);
  let winners;
  let scored = [];

  if (contenders.length === 1 || h.winByFold) {
    winners = [contenders[0]];
  } else {
    const hands = {};
    for (const id of contenders) {
      hands[id] = [...h.hole[id], ...h.board];
      h.reveal[id] = h.hole[id]; // reveal only players who reached showdown
    }
    const res = decideWinners(hands);
    winners = res.winners;
    scored = res.scored.map((s) => ({ id: s.id, name: s.name, jokersUsed: s.jokersUsed }));
  }

  const owed = {};
  const pot = Object.values(h.contributed).reduce((a, b) => a + b, 0);
  for (const id of h.seats) {
    owed[id] = winners.includes(id) ? 0 : h.contributed[id];
  }

  G.settle = {
    handNumber: h.number,
    winners,
    owed,
    pot,
    scored,
    board: h.board.slice(),
    reveal: { ...h.reveal },
    contributed: { ...h.contributed },
    winByFold: !!h.winByFold,
    confirmed: {},
  };
  G.status = 'settle';
  return { ok: true, done: true };
}

// A player taps "Done" after their pushups (or a winner just acknowledges).
export function confirmPushups(G, id) {
  if (G.status !== 'settle' || !G.settle) return { ok: false };
  if (G.settle.confirmed[id]) return { ok: true };
  G.settle.confirmed[id] = true;
  const owed = G.settle.owed[id] || 0;
  if (owed > 0) {
    const p = G.players.find((x) => x.id === id);
    if (p) p.sessionPushups += owed;
  }
  return { ok: true };
}

export function allConfirmed(G) {
  if (!G.settle) return false;
  const need = seatedIds(G).filter((id) => G.hand && G.hand.seats.includes(id));
  return need.every((id) => G.settle.confirmed[id]);
}

// ---- views ----

// The two hole cards for a single player (host sends this privately to them).
export function holeFor(G, id) {
  return G.hand && G.hand.hole[id] ? G.hand.hole[id].slice() : null;
}

// Public, hidden-info-free snapshot broadcast to everyone. Never contains the
// deck or any player's hole cards (except reveals at showdown/settle).
export function publicView(G) {
  const base = {
    code: G.code,
    hostId: G.hostId,
    mode: G.mode,
    pendingMode: G.pendingMode || null,
    status: G.status,
    handNumber: G.handNumber,
    players: G.players.map((p) => ({
      id: p.id, name: p.name, connected: p.connected, sessionPushups: p.sessionPushups,
    })),
  };

  if (G.status === 'hand' && G.hand) {
    const h = G.hand;
    base.hand = {
      number: h.number,
      phase: h.phase,
      board: h.board.slice(),
      seats: h.seats.slice(),
      button: h.button,
      blindSeat: h.blindSeat,
      level: h.level,
      betsMade: h.betsMade,
      inc: h.inc,
      ceiling: h.ceiling,
      pot: Object.values(h.contributed).reduce((a, b) => a + b, 0),
      contributed: { ...h.contributed },
      folded: { ...h.folded },
      acting: h.seats[h.actingIdx],
      maxBets: MAX_BETS_PER_ROUND,
    };
  }
  if (G.status === 'settle' && G.settle) {
    base.settle = {
      handNumber: G.settle.handNumber,
      winners: G.settle.winners.slice(),
      owed: { ...G.settle.owed },
      pot: G.settle.pot,
      scored: G.settle.scored.slice(),
      board: G.settle.board.slice(),
      reveal: { ...G.settle.reveal },
      contributed: { ...G.settle.contributed },
      winByFold: G.settle.winByFold,
      confirmed: { ...G.settle.confirmed },
    };
    base.hand = { seats: (G.hand && G.hand.seats.slice()) || [] };
  }
  return base;
}

export { MODE };
