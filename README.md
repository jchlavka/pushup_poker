# Pushup Poker 🃏💪

Texas Hold'em where the chips are **pushups**. Nothing to win — when a hand ends,
**everyone except the winner immediately does the pushups they put in the pot**
(fold early, do fewer). The site keeps a running session leaderboard of pushups
done. Play on your own phones/laptops, no accounts, no server — it runs entirely
from a static page over a direct peer-to-peer connection.

## The rules

- **Bets are pushups** (1 chip = 1 pushup).
- **Single 4-pushup blind**, posted by the player left of the dealer button (rotates each hand).
- **Limit mode (default):** raises are a fixed **3** preflop/flop and **6** turn/river,
  **max 2 bets per betting round**, and no one ever contributes more than **40** in a hand.
- **No-limit mode** (host can switch, e.g. when you're running out of time): bet anything
  up to **50**, no minimum bet, no raise cap.
- **Deck has 2 wild jokers.** A joker can be any card. **Five of a kind beats everything**
  (including a royal flush). If two hands otherwise tie, **the hand using more jokers loses**.
- Payout each hand: winner does **0** pushups; everyone else (including folders) does
  **exactly what they put in**. Tap **Done** to confirm your pushups; the next hand deals
  once everyone has confirmed.

## Play it

1. One person clicks **Create a table** and shares the 4-letter code (or the link).
2. Everyone else opens the site, enters a name, and **Joins** with the code.
3. The host clicks **Deal**. Your two cards are sent only to you.

> Connection note: peers find each other over free public infrastructure and connect
> directly (WebRTC + public STUN). This works on the vast majority of home/phone
> networks. On a very locked-down wifi (some corporate/university networks) a peer may
> fail to connect — try phone data or a different network. There are no accounts and
> nothing to host or pay for.

## Host it on GitHub Pages (free, no accounts beyond GitHub)

1. Create a new **public** GitHub repo and add all these files (keep the folder layout).
2. Push to the `main` branch.
3. Repo **Settings → Pages → Build and deployment → Deploy from a branch →** `main` / `/ (root)`.
4. Wait a minute; your site is live at `https://<your-username>.github.io/<repo>/`.
5. Share that URL. Everything (including the P2P library in `/vendor`) is served from Pages.

The included empty `.nojekyll` file tells GitHub Pages to serve `/vendor` and `/js`
verbatim (no Jekyll processing).

## Test / develop without friends

- **Hotseat dev mode:** open `index.html?solo=4` (or `?solo=2..8`). One browser runs a full
  game; it shows the current player's cards and controls so you can drive a whole hand,
  reach showdown, and watch the pushup tally — no networking needed.
- **Hand-evaluator tests:** serve the folder locally and open `tests/poker.test.html`.
  Any static server works, e.g.:

  ```
  python3 -m http.server 8000
  # then open http://localhost:8000/            (the game)
  #      and http://localhost:8000/tests/poker.test.html   (the tests)
  ```

## Project layout

```
index.html                     entry page
css/styles.css                 all styling
js/main.js                     app shell: home screen, host/client/solo sessions
js/net.js                      P2P transport (Trystero). Swap point for PeerJS.
js/engine.js                   authoritative game + betting state machine (host)
js/rules.js                    betting constants + legal-action calculator
js/poker.js                    54-card deck, wild-joker hand evaluator
js/ui.js                       rendering + controls
js/store.js                    remembers your name/last code (localStorage)
vendor/trystero-nostr.min.js vendored P2P library (no CDN)
tests/poker.test.html          in-browser evaluator tests
```

## Swapping the networking (optional)

All transport lives in `js/net.js` behind a small message API
(`sendState`/`onState`, `sendHole`/`onHole`, `sendAct`/`onAct`, `sendJoin`/`onJoin`,
peer join/leave). To use PeerJS or another WebRTC library instead of Trystero, reimplement
just that file — nothing else needs to change.
