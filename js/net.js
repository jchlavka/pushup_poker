// net.js — the ONLY file that knows about the transport. It now routes the game
// through Firebase Realtime Database instead of WebRTC, so there is no direct
// browser-to-browser connection to negotiate: every message travels through
// Firebase's servers and simply works on any wifi/cell network (no NAT/STUN/TURN
// problems). Firebase is free (Spark plan) and the SDK is vendored in /vendor,
// so nothing is loaded from a CDN.
//
// It exposes the same small message API the rest of the app already used:
//   'state' host -> everyone : the public game snapshot (no hidden info)
//   'hole'  host -> one peer : that player's own two hole cards
//   'act'   client -> host   : an action intent {type, amount?}
//   'join'  client -> host   : {name} when a player sits down
// plus peer join/leave presence.
//
// How it maps onto Realtime Database, under /tables/<CODE>:
//   state            single node the host keeps current; clients listen and get
//                    the latest value immediately on join (no targeting needed).
//   hole/<peerId>    each player's cards, written by the host, read only by that
//                    player's own listener.
//   acts             a queue the clients push to and the host drains.
//   peers/<peerId>   presence (auto-removed on disconnect); carries the name.

import {
  initializeApp, getDatabase, connectDatabaseEmulator, ref, child, onValue, set,
  update, push, remove, onChildAdded, onChildRemoved, onChildChanged, onDisconnect,
  serverTimestamp,
} from '../vendor/firebase-db.min.js';
import { firebaseConfig, emulator } from './firebase-config.js';

// Has the user pasted a real config yet?
export const isConfigured =
  !!firebaseConfig && typeof firebaseConfig.databaseURL === 'string' &&
  firebaseConfig.databaseURL.startsWith('http') && !/PASTE/i.test(firebaseConfig.databaseURL);

let db = null;
if (isConfigured) {
  const app = initializeApp(firebaseConfig);
  db = getDatabase(app);
  if (emulator) connectDatabaseEmulator(db, emulator.host, emulator.port);
}

// A stable per-session id used as this player's seat id and (for the host) the
// table's host id.
export const mySelfId = (() => {
  const raw = (globalThis.crypto && crypto.randomUUID)
    ? crypto.randomUUID().replace(/-/g, '')
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return 'p' + raw.slice(0, 14);
})();

// Firebase rejects `undefined`; round-tripping strips it and normalizes arrays.
const clean = (o) => JSON.parse(JSON.stringify(o));

export function openRoom(code) {
  if (!isConfigured) throw new Error('firebase-not-configured');
  const CODE = String(code).toUpperCase();
  const base = ref(db, 'tables/' + CODE);
  const selfId = mySelfId;

  // Announce presence; auto-clean if the tab closes/crashes.
  const meRef = child(base, 'peers/' + selfId);
  set(meRef, { ts: serverTimestamp(), name: null });
  onDisconnect(meRef).remove();

  const reportedJoin = new Set();
  function maybeJoin(snap, cb) {
    if (snap.key === selfId) return;
    const v = snap.val();
    if (v && v.name && !reportedJoin.has(snap.key)) {
      reportedJoin.add(snap.key);
      cb({ name: v.name }, snap.key);
    }
  }

  return {
    selfId,

    // host -> everyone (the `to` arg is unused: a single live node serves all,
    // including late joiners, automatically).
    sendState: (view) => set(child(base, 'state'), clean(view)),
    onState: (cb) => onValue(child(base, 'state'), (snap) => {
      const v = snap.val(); if (v) cb(v, 'host');
    }),

    // host -> one peer, private path
    sendHole: (cards, to) => set(child(base, 'hole/' + to), clean(cards)),
    onHole: (cb) => onValue(child(base, 'hole/' + selfId), (snap) => {
      const v = snap.val(); if (v) cb(v, 'host');
    }),

    // client -> host queue; host drains each message
    sendAct: (action) => push(child(base, 'acts'), { from: selfId, action: clean(action), ts: serverTimestamp() }),
    onAct: (cb) => onChildAdded(child(base, 'acts'), (snap) => {
      const m = snap.val();
      remove(snap.ref); // consume it so it isn't reprocessed
      if (m && m.action) cb(m.action, m.from);
    }),

    // client announces its name (updates its presence node)
    sendJoin: (info) => update(meRef, { name: (info && info.name) || 'Player', ts: serverTimestamp() }),
    onJoin: (cb) => {
      onChildAdded(child(base, 'peers'), (snap) => maybeJoin(snap, cb));
      onChildChanged(child(base, 'peers'), (snap) => maybeJoin(snap, cb));
    },

    // presence
    onPeerJoin: (cb) => onChildAdded(child(base, 'peers'), (snap) => { if (snap.key !== selfId) cb(snap.key); }),
    onPeerLeave: (cb) => onChildRemoved(child(base, 'peers'), (snap) => { if (snap.key !== selfId) cb(snap.key); }),
    peers: () => [],
    leave: () => { try { remove(meRef); } catch {} },
  };
}
