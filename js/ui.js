// ui.js — renders the current public game view into the DOM and wires the
// player's controls. Pure "view" layer: it never touches the engine directly,
// it just calls the handlers it's given (onAction, onDeal, onConfirm, ...).

import { computeLegal, MODE, MAX_BETS_PER_ROUND } from './rules.js';

const SUIT = { s: '♠', h: '♥', d: '♦', c: '♣' };

function cardHtml(card, faceUp = true) {
  if (!card || !faceUp) return '<span class="card back"></span>';
  if (card[0] === '*') return '<span class="card joker" title="Joker (wild)">🃏</span>';
  const r = card[0] === 'T' ? '10' : card[0];
  const s = card[1];
  const red = s === 'h' || s === 'd';
  return `<span class="card ${red ? 'red' : 'black'}"><b>${r}</b><i>${SUIT[s]}</i></span>`;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function leaderboardHtml(players) {
  const sorted = [...players].sort((a, b) => b.sessionPushups - a.sessionPushups);
  const rows = sorted.map((p) => `
    <div class="lb-row">
      <span class="lb-name">${esc(p.name)}${p.connected ? '' : ' <em>(away)</em>'}</span>
      <span class="lb-count">${p.sessionPushups}</span>
    </div>`).join('');
  return `<div class="panel leaderboard">
    <h3>Pushups done 💪</h3>
    ${rows || '<div class="muted">No pushups yet.</div>'}
  </div>`;
}

// ---- lobby ----

function renderLobby(root, ctx) {
  const { view, myId, isHost, handlers } = ctx;
  const link = location.origin + location.pathname + '#room=' + view.code;
  const players = view.players.map((p) => `
    <li>${esc(p.name)}${p.id === view.hostId ? ' <span class="tag">host</span>' : ''}${p.id === myId ? ' <span class="tag you">you</span>' : ''}${p.connected ? '' : ' <em class="muted">(away)</em>'}</li>`).join('');

  root.innerHTML = `
    <div class="wrap">
      <div class="panel">
        <h2>Table <span class="code">${esc(view.code)}</span></h2>
        <p class="muted">Share this code or link so friends can join:</p>
        <div class="share">
          <input id="shareLink" readonly value="${esc(link)}" />
          <button id="copyLink" class="btn">Copy link</button>
        </div>
        <h3>Players (${view.players.length})</h3>
        <ul class="players">${players}</ul>
        <p class="mode-line">Mode: <strong>${view.mode === MODE.NOLIMIT ? 'No-limit (out of time)' : 'Limit'}</strong></p>
        ${isHost ? `
          <div class="host-controls">
            <button id="toggleMode" class="btn ghost">Switch to ${view.mode === MODE.NOLIMIT ? 'Limit' : 'No-limit'} mode</button>
            <button id="dealBtn" class="btn primary" ${view.players.filter((p) => p.connected).length < 2 ? 'disabled' : ''}>Deal first hand</button>
            ${view.players.filter((p) => p.connected).length < 2 ? '<p class="muted">Waiting for at least 2 players…</p>' : ''}
          </div>` : '<p class="muted">Waiting for the host to deal…</p>'}
      </div>
      ${leaderboardHtml(view.players)}
      ${rulesCardHtml(view.mode)}
    </div>`;

  bind(root, '#copyLink', 'click', () => {
    const el = root.querySelector('#shareLink');
    el.select(); navigator.clipboard?.writeText(el.value);
    root.querySelector('#copyLink').textContent = 'Copied!';
  });
  if (isHost) {
    bind(root, '#dealBtn', 'click', handlers.onDeal);
    bind(root, '#toggleMode', 'click', () => handlers.onSetMode(view.mode === MODE.NOLIMIT ? MODE.LIMIT : MODE.NOLIMIT));
  }
}

function rulesCardHtml(mode) {
  return `<div class="panel rules">
    <h3>House rules</h3>
    <ul>
      <li>Bets are <strong>pushups</strong> (1 chip = 1 pushup). Nothing to win — when a hand ends, <strong>everyone but the winner does the pushups they put in</strong> (fold early, do less).</li>
      <li>Single <strong>4-pushup blind</strong>, left of the dealer.</li>
      <li>${mode === MODE.NOLIMIT
        ? 'No-limit: bet anything up to <strong>50</strong>, no raise cap.'
        : 'Limit: raises are <strong>3</strong> (preflop/flop) or <strong>6</strong> (turn/river), max <strong>2 bets</strong> per round, ceiling <strong>40</strong>.'}</li>
      <li>Deck has <strong>2 wild jokers</strong>. <strong>Five of a kind</strong> beats everything. If two hands tie, the one using <strong>more jokers loses</strong>.</li>
    </ul>
  </div>`;
}

// ---- table (a hand in progress) ----

function seatRowHtml(view, p, h, myId) {
  const seatIdx = h.seats.indexOf(p.id);
  const inHand = seatIdx >= 0;
  const isButton = inHand && seatIdx === h.button;
  const isBlind = inHand && seatIdx === h.blindSeat;
  const folded = h.folded[p.id];
  const acting = h.acting === p.id;
  const contributed = h.contributed[p.id] || 0;
  const tags = [];
  if (isButton) tags.push('<span class="chip d">D</span>');
  if (isBlind) tags.push('<span class="chip b">B</span>');
  return `<div class="seat ${acting ? 'acting' : ''} ${folded ? 'folded' : ''} ${!inHand ? 'sitout' : ''}">
    <div class="seat-main">
      <span class="seat-name">${esc(p.name)} ${tags.join('')}${p.id === myId ? '<span class="tag you">you</span>' : ''}</span>
      <span class="seat-status">${folded ? 'folded' : (!inHand ? 'sitting out' : (contributed ? contributed + ' in' : ''))}</span>
    </div>
    ${acting ? '<div class="turn-dot">● acting</div>' : ''}
  </div>`;
}

function actionPanelHtml(view, myId) {
  const h = view.hand;
  if (h.acting !== myId) {
    const who = view.players.find((p) => p.id === h.acting);
    return `<div class="panel action wait"><p class="muted">Waiting for <strong>${esc(who ? who.name : '…')}</strong> to act…</p></div>`;
  }
  const legal = computeLegal({
    mode: view.mode, level: h.level, myContributed: h.contributed[myId] || 0,
    betsMade: h.betsMade, inc: h.inc, ceiling: h.ceiling,
  });
  const btns = [];
  btns.push('<button class="btn danger" data-act="fold">Fold</button>');
  if (legal.check) btns.push('<button class="btn" data-act="check">Check</button>');
  if (legal.call) btns.push(`<button class="btn primary" data-act="call">Call ${legal.call.to}</button>`);
  const rr = legal.bet || legal.raise;
  const label = legal.bet ? 'Bet' : 'Raise to';
  let raiseUi = '';
  if (rr) {
    if (rr.fixed) {
      btns.push(`<button class="btn warn" data-act="raise" data-amount="${rr.to}">${label} ${rr.to}</button>`);
    } else {
      raiseUi = `<div class="raise-row">
        <input id="raiseAmt" type="number" min="${rr.min}" max="${rr.max}" value="${rr.min}" />
        <button class="btn warn" data-act="raise-input">${label} (min ${rr.min}, max ${rr.max})</button>
      </div>`;
    }
  }
  return `<div class="panel action"><div class="btn-row">${btns.join('')}</div>${raiseUi}</div>`;
}

function revealPanelHtml(h, isHost) {
  const n = h.board.length;
  const label = n === 0 ? 'Deal the flop' : n === 3 ? 'Deal the turn' : n === 4 ? 'Deal the river' : 'Show the winner';
  if (isHost) return `<div class="panel action"><div class="btn-row"><button class="btn primary big" data-reveal="1">${label} 🃏</button></div></div>`;
  return `<div class="panel action wait"><p class="muted">Everyone’s all in — waiting for the host to ${label.toLowerCase()}…</p></div>`;
}

function middlePanelHtml(view, myId, isHost) {
  const h = view.hand;
  if (h.awaitingReveal) return revealPanelHtml(h, isHost);
  if (!h.seats.includes(myId)) return '';
  if (h.folded[myId]) return '<div class="panel action wait"><p class="muted">You folded.</p></div>';
  return actionPanelHtml(view, myId);
}

function renderTable(root, ctx) {
  const { view, myId, myHole, isHost, handlers } = ctx;
  const h = view.hand;
  const board = h.board.map((c) => cardHtml(c, true)).join('');
  const seats = view.players.map((p) => seatRowHtml(view, p, h, myId)).join('');
  const hole = (myHole && myHole.length ? myHole : [null, null]).map((c) => cardHtml(c, !!c)).join('');
  const inThisHand = h.seats.includes(myId);

  root.innerHTML = `
    <div class="wrap game">
      <div class="topbar">
        <span class="code">Table ${esc(view.code)}</span>
        <span class="hand-no">Hand #${h.number}</span>
        <span class="mode-badge">${view.mode === MODE.NOLIMIT ? 'NO-LIMIT' : 'LIMIT'}</span>
      </div>
      <div class="felt">
        <div class="board">${board || '<span class="muted">— board —</span>'}</div>
      </div>
      <div class="seats">${seats}</div>
      <div class="myhand">
        <div class="myhand-label">${inThisHand ? 'Your cards' : 'You’re sitting out this hand'}</div>
        <div class="cards">${inThisHand ? hole : ''}</div>
      </div>
      ${middlePanelHtml(view, myId, isHost)}
      ${leaderboardHtml(view.players)}
      ${isHost ? '<div class="host-mini">'
        + (!h.awaitingReveal && h.acting && h.acting !== myId ? `<button id="forceFold" class="btn ghost small">Force-fold ${esc((view.players.find((p) => p.id === h.acting) || {}).name || 'player')} (if stuck/away)</button>` : '')
        + '<button id="toggleMode" class="btn ghost small">Switch to ' + (view.mode === MODE.NOLIMIT ? 'Limit' : 'No-limit') + ' (next hand)</button></div>' : ''}
    </div>`;

  const revealBtn = root.querySelector('[data-reveal]');
  if (revealBtn) revealBtn.addEventListener('click', () => handlers.onReveal && handlers.onReveal());
  root.querySelectorAll('[data-act]').forEach((b) => {
    b.addEventListener('click', () => {
      const act = b.getAttribute('data-act');
      if (act === 'raise-input') {
        const amt = parseInt(root.querySelector('#raiseAmt').value, 10);
        handlers.onAction({ type: 'raise', amount: amt });
      } else if (act === 'raise') {
        handlers.onAction({ type: 'raise', amount: parseInt(b.getAttribute('data-amount'), 10) });
      } else {
        handlers.onAction({ type: act });
      }
    });
  });
  if (isHost) {
    bind(root, '#toggleMode', 'click', () => handlers.onSetMode(view.mode === MODE.NOLIMIT ? MODE.LIMIT : MODE.NOLIMIT));
    bind(root, '#forceFold', 'click', () => handlers.onForceFold && handlers.onForceFold());
  }
}

// ---- settle (pushup payout) ----

function renderSettle(root, ctx) {
  const { view, myId, isHost, handlers } = ctx;
  const s = view.settle;
  const seats = (view.hand && view.hand.seats) || Object.keys(s.owed);
  const nameOf = (id) => (view.players.find((p) => p.id === id) || {}).name || id;
  const winnerNames = s.winners.map(nameOf).join(' & ');

  const scoredById = {};
  s.scored.forEach((x) => { scoredById[x.id] = x; });

  const reveals = seats.filter((id) => s.reveal[id]).map((id) => {
    const cards = s.reveal[id].map((c) => cardHtml(c, true)).join('');
    const sc = scoredById[id];
    const win = s.winners.includes(id);
    return `<div class="reveal ${win ? 'win' : ''}">
      <span class="reveal-name">${esc(nameOf(id))}${win ? ' 🏆' : ''}</span>
      <span class="reveal-cards">${cards}</span>
      ${sc ? `<span class="reveal-hand">${esc(sc.name)}${sc.jokersUsed ? ` · ${sc.jokersUsed} joker${sc.jokersUsed > 1 ? 's' : ''}` : ''}</span>` : ''}
    </div>`;
  }).join('');

  const myOwed = s.owed[myId] ?? 0;
  const iConfirmed = !!s.confirmed[myId];
  const inHand = seats.includes(myId);

  let myPanel = '';
  if (inHand) {
    if (iConfirmed) {
      myPanel = '<div class="panel owe done"><p>✅ Confirmed. Waiting for others…</p></div>';
    } else if (myOwed > 0) {
      myPanel = `<div class="panel owe">
        <p class="big">Do <strong>${myOwed}</strong> pushups now 💪</p>
        <button id="confirmBtn" class="btn primary big">Done — I did ${myOwed}</button>
      </div>`;
    } else {
      myPanel = `<div class="panel owe win">
        <p class="big">${s.winners.includes(myId) ? 'You won — no pushups! 🏆' : 'No pushups for you.'}</p>
        <button id="confirmBtn" class="btn primary">Ready for next hand</button>
      </div>`;
    }
  }

  const waiting = seats.filter((id) => !s.confirmed[id]).map(nameOf);
  const board = s.board.map((c) => cardHtml(c, true)).join('');

  root.innerHTML = `
    <div class="wrap game">
      <div class="topbar">
        <span class="code">Table ${esc(view.code)}</span>
        <span class="hand-no">Hand #${s.handNumber} result</span>
      </div>
      <div class="panel result">
        <h2>${s.winByFold ? 'Everyone folded to' : 'Winner:'} ${esc(winnerNames)} 🏆</h2>
        <div class="board small">${board || ''}</div>
        <div class="reveals">${reveals || '<p class="muted">(won on a fold — cards not shown)</p>'}</div>
      </div>
      ${myPanel}
      <div class="panel confirm-status">
        <p class="muted">${waiting.length ? 'Waiting on: ' + waiting.map(esc).join(', ') : 'Everyone confirmed — ready!'}</p>
        ${isHost ? `<button id="nextBtn" class="btn primary" ${waiting.length ? '' : ''}>Deal next hand${waiting.length ? ' (force)' : ''}</button>` : ''}
      </div>
      ${leaderboardHtml(view.players)}
    </div>`;

  bind(root, '#confirmBtn', 'click', handlers.onConfirm);
  if (isHost) bind(root, '#nextBtn', 'click', handlers.onDeal);
}

// ---- entry ----

export function render(root, ctx) {
  const st = ctx.view.status;
  if (st === 'lobby') return renderLobby(root, ctx);
  if (st === 'settle') return renderSettle(root, ctx);
  return renderTable(root, ctx);
}

function bind(root, sel, evt, fn) {
  const el = root.querySelector(sel);
  if (el && fn) el.addEventListener(evt, fn);
}
