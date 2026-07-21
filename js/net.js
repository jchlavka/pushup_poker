// net.js — the ONLY file that knows about the P2P transport. Everything else
// talks to a small message API, so swapping Trystero for PeerJS later is a
// change confined to this file.
//
// Message channels:
//   'state' host -> everyone : the public game snapshot (no hidden info)
//   'hole'  host -> one peer : that player's own two hole cards
//   'act'   client -> host   : an action intent {type, amount?}
//   'join'  client -> host   : {name} when a player sits down
//
// The library is vendored into /vendor, so nothing is fetched from a CDN.

import { joinRoom, selfId } from '../vendor/trystero-torrent.min.js';

// Namespaces this app on the shared public signaling infrastructure. The table
// code namespaces further, so two different tables never see each other.
const APP_ID = 'pushup-poker-v1-x7k2f9';

// Free public STUN servers (no account). Used only to discover each peer's
// public address for the direct WebRTC connection.
const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ],
};

export const mySelfId = selfId;

// Open (or create) the room for `code`. Returns a handle with typed send/receive
// helpers plus peer-presence hooks.
export function openRoom(code) {
  const room = joinRoom({ appId: APP_ID, rtcConfig: RTC_CONFIG }, String(code).toUpperCase());

  const [sendState, getState] = room.makeAction('state');
  const [sendHole, getHole] = room.makeAction('hole');
  const [sendAct, getAct] = room.makeAction('act');
  const [sendJoin, getJoin] = room.makeAction('join');

  return {
    selfId,
    // host -> all (or a specific peer if `to` is given)
    sendState: (view, to) => sendState(view, to),
    onState: (cb) => getState((data, peer) => cb(data, peer)),
    // host -> one peer, private
    sendHole: (cards, to) => sendHole(cards, to),
    onHole: (cb) => getHole((data, peer) => cb(data, peer)),
    // client -> host
    sendAct: (action) => sendAct(action),
    onAct: (cb) => getAct((data, peer) => cb(data, peer)),
    // client -> host, on sit-down
    sendJoin: (info) => sendJoin(info),
    onJoin: (cb) => getJoin((data, peer) => cb(data, peer)),
    // presence
    onPeerJoin: (cb) => room.onPeerJoin(cb),
    onPeerLeave: (cb) => room.onPeerLeave(cb),
    peers: () => Object.keys(room.getPeers()),
    leave: () => room.leave(),
  };
}
