// main.js — app shell. Shows the home screen, then runs one of three sessions:
//   Host   — you created the table; you run the authoritative engine.
//   Client — you joined a table; you send actions and render what the host sends.
//   Solo   — ?solo=N single-browser hotseat for testing the game logic.

import * as E from './engine.js';
import { render } from './ui.js';
import * as store from './store.js';
import { openRoom, mySelfId, isConfigured } from './net.js';
import { MODE } from './rules.js';

const root = document.getElementById('app');
let current = null; // { leave() }

function genCode() {
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += alpha[Math.floor(Math.random() * alpha.length)];
  return s;
}

// ---------- home ----------

function renderHome() {
  if (current && current.leave) { try { current.leave(); } catch {} }
  current = null;
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  const prefill = (params.get('room') || store.loadLastCode() || '').toUpperCase();
  const name = store.loadName();

  root.innerHTML = `
    <div class="wrap home">
      <div class="panel hero">
        <h1>Pushup Poker 🃏💪</h1>
        <p class="muted">Texas Hold'em where the chips are pushups. Lose a hand, drop and give me twenty.</p>
        <label class="field">Your name
          <input id="name" maxlength="16" placeholder="e.g. Ethan" value="${name.replace(/"/g, '&quot;')}" />
        </label>
        <div class="home-actions">
          <button id="create" class="btn primary big">Create a table</button>
          <div class="or">or join with a code</div>
          <div class="join-row">
            <input id="code" maxlength="6" placeholder="CODE" value="${prefill}" />
            <button id="join" class="btn big">Join</button>
          </div>
        </div>
      </div>
      <div class="panel rules">
        <h3>How it works</h3>
        <ul>
          <li>One person <strong>creates a table</strong> and shares the 4-letter code (or the link).</li>
          <li>Everyone plays on their own phone/laptop — cards stay private (only your own are sent to you).</li>
          <li>No accounts, no server. Runs entirely from this page over a direct peer-to-peer connection.</li>
        </ul>
        <p class="muted small">Tip: on a very locked-down wifi a connection can fail — try phone data or another network. Want to test solo? <a href="?solo=4">open hotseat dev mode</a>.</p>
      </div>
    </div>`;

  const nameEl = root.querySelector('#name');
  const codeEl = root.querySelector('#code');
  const getName = () => (nameEl.value.trim() || 'Player');

  root.querySelector('#create').addEventListener('click', () => {
    if (!isConfigured) return showSetupNeeded();
    store.saveName(getName());
    const code = genCode();
    startHost(code, getName());
  });
  root.querySelector('#join').addEventListener('click', () => {
    if (!isConfigured) return showSetupNeeded();
    const code = (codeEl.value.trim() || '').toUpperCase();
    if (!code) { codeEl.focus(); return; }
    store.saveName(getName());
    store.saveLastCode(code);
    startClient(code, getName());
  });
  if (prefill) codeEl.focus(); else nameEl.focus();
}

function showSetupNeeded() {
  root.innerHTML = `
    <div class="wrap">
      <div class="panel">
        <h2>One-time setup needed 🔧</h2>
        <p>To play across devices this needs a free Firebase backend (about 5 minutes,
        once). Open <code>js/firebase-config.js</code> and paste in your Firebase project's
        config — the full walkthrough is in the <strong>README</strong> under
        “Set up the free Firebase backend”.</p>
        <ol>
          <li>Create a free project at <a href="https://console.firebase.google.com" target="_blank" rel="noopener">console.firebase.google.com</a>.</li>
          <li>Build → <strong>Realtime Database</strong> → Create (start in test mode).</li>
          <li>Register a <strong>Web app</strong> (the <code>&lt;/&gt;</code> icon) and copy its config.</li>
          <li>Paste the values into <code>js/firebase-config.js</code>, commit, and push.</li>
        </ol>
        <p class="muted small">No account for your friends — just you, once. Want to try the
        game logic right now without any of this? <a href="?solo=4">open hotseat dev mode</a>.</p>
        <button id="back" class="btn ghost">Back</button>
      </div>
    </div>`;
  root.querySelector('#back').addEventListener('click', renderHome);
}

// ---------- host ----------

function startHost(code, myName) {
  location.hash = 'room=' + code;
  store.saveLastCode(code);
  const G = E.createGame(code, mySelfId, MODE.LIMIT);
  E.addPlayer(G, mySelfId, myName);
  const room = openRoom(code);

  const myHole = () => (G.status === 'hand' ? E.holeFor(G, mySelfId) : null);
  const draw = () => render(root, {
    view: E.publicView(G), myId: mySelfId, myHole: myHole(), isHost: true, handlers,
  });

  function dealHoles() {
    for (const p of G.players) {
      if (p.id === mySelfId) continue;
      const hc = E.holeFor(G, p.id);
      if (hc) room.sendHole(hc, p.id);
    }
  }
  function broadcast() {
    room.sendState(E.publicView(G));
    draw();
  }
  function dispatch(peerId, action) {
    if (action.type === 'confirm') { E.confirmPushups(G, peerId); broadcast(); return; }
    if (action.type === 'reveal') { if (peerId === mySelfId) { E.advanceReveal(G); broadcast(); } return; }
    if (['fold', 'check', 'call', 'bet', 'raise'].includes(action.type)) {
      E.applyAction(G, peerId, action); // out-of-turn / illegal is ignored inside
      broadcast();
    }
  }

  const handlers = {
    onDeal: () => { const r = E.startHand(G); if (!r.ok) { toast(r.error); return; } dealHoles(); broadcast(); },
    onSetMode: (m) => { E.setMode(G, m); broadcast(); },
    onAction: (a) => dispatch(mySelfId, a),
    onConfirm: () => dispatch(mySelfId, { type: 'confirm' }),
    onReveal: () => dispatch(mySelfId, { type: 'reveal' }),
    onForceFold: () => { if (G.hand) dispatch(G.hand.seats[G.hand.actingIdx], { type: 'fold' }); },
    onLeave: () => renderHome(),
  };

  room.onJoin((info, peer) => { E.addPlayer(G, peer, (info && info.name) || 'Player'); broadcast(); });
  room.onAct((action, peer) => dispatch(peer, action));
  room.onPeerJoin((peer) => { console.log('[pushup] peer joined', peer, '— sending table state'); room.sendState(E.publicView(G), peer); });
  room.onPeerLeave((peer) => { console.log('[pushup] peer left', peer); E.setConnected(G, peer, false); broadcast(); });

  current = { leave: () => room.leave() };
  broadcast(); // publish the lobby immediately so joiners see the table
}

// ---------- client ----------

function startClient(code, myName) {
  location.hash = 'room=' + code;
  const room = openRoom(code);
  let view = null;
  let hole = null;
  let peers = 0;
  let seconds = 0;
  let ticker = setInterval(() => { seconds += 1; if (!view) draw(); }, 1000);
  const stopTicker = () => { if (ticker) { clearInterval(ticker); ticker = null; } };

  const draw = () => {
    if (!view) {
      const status = peers > 0
        ? 'Found the table — syncing your seat…'
        : 'Searching for the table over the network…';
      const hint = seconds > 20 && peers === 0
        ? `<p class="muted small">Still searching after ${seconds}s. Double-check the code, make sure the host still has the tab open, and try refreshing. On a very locked-down wifi, try phone data.</p>`
        : `<p class="muted small">${seconds}s — this usually takes a few seconds.</p>`;
      root.innerHTML = `<div class="wrap"><div class="panel"><h2>Joining table ${code}…</h2>
        <p>${status}</p>${hint}
        <button id="back" class="btn ghost">Back</button></div></div>`;
      root.querySelector('#back').addEventListener('click', () => { stopTicker(); renderHome(); });
      return;
    }
    render(root, { view, myId: room.selfId, myHole: hole, isHost: false, handlers });
  };

  const handlers = {
    onAction: (a) => room.sendAct(a),
    onConfirm: () => room.sendAct({ type: 'confirm' }),
    onLeave: () => { stopTicker(); renderHome(); },
  };

  room.onState((v) => { view = E.normalizeView(v); stopTicker(); draw(); });
  room.onHole((cards) => { hole = cards; draw(); });
  room.onPeerJoin((peer) => { peers += 1; console.log('[pushup] peer joined', peer, '— announcing name'); room.sendJoin({ name: myName }); draw(); });
  room.onPeerLeave((peer) => { peers = Math.max(0, peers - 1); console.log('[pushup] peer left', peer); draw(); });

  current = { leave: () => { stopTicker(); room.leave(); } };
  draw();
}

// ---------- solo / dev hotseat ----------

function startSolo(n) {
  const G = E.createGame('SOLO', 'P1', MODE.LIMIT);
  for (let i = 1; i <= n; i++) E.addPlayer(G, 'P' + i, 'P' + i);

  const draw = () => {
    const view = E.publicView(G);
    let myId = 'P1';
    let myHole = null;
    if (G.status === 'hand') { myId = view.hand.acting; myHole = E.holeFor(G, myId); }
    else if (G.status === 'settle') { myId = (view.hand.seats || ['P1'])[0]; }
    root.innerHTML = '<div class="solo-banner">SOLO / DEV — hotseat: showing the current player’s cards & controls. <a href="./">exit</a></div><div id="soloRoot"></div>';
    render(root.querySelector('#soloRoot'), { view, myId, myHole, isHost: true, handlers });
  };

  const handlers = {
    onDeal: () => { const r = E.startHand(G); if (!r.ok) toast(r.error); draw(); },
    onSetMode: (m) => { E.setMode(G, m); draw(); },
    onAction: (a) => { const id = G.hand.seats[G.hand.actingIdx]; E.applyAction(G, id, a); draw(); },
    onReveal: () => { E.advanceReveal(G); draw(); },
    onForceFold: () => { if (G.hand) { E.applyAction(G, G.hand.seats[G.hand.actingIdx], { type: 'fold' }); draw(); } },
    onConfirm: () => { for (const id of G.settle ? Object.keys(G.settle.owed) : []) E.confirmPushups(G, id); draw(); },
    onLeave: () => { location.search = ''; },
  };

  current = null;
  draw();
}

// ---------- misc ----------

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

// ---------- boot ----------

const soloN = new URLSearchParams(location.search).get('solo');
if (soloN) startSolo(Math.max(2, Math.min(8, parseInt(soloN, 10) || 4)));
else renderHome();

window.addEventListener('hashchange', () => {
  // Only react to hash clears (leaving a table via back button).
  if (!location.hash && current) { current = null; }
});
