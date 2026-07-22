# Pushup Poker 🃏💪

Texas Hold'em where the chips are **pushups**. Nothing to win — when a hand ends,
**everyone except the winner immediately does the pushups they put in the pot**
(fold early, do fewer). The site keeps a running session leaderboard of pushups
done. Play on your own phones/laptops. The site itself is hosted free on GitHub
Pages; game data syncs through a free Firebase backend (no server for you to run,
and no accounts for your friends).

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

## Set up the free Firebase backend (one time, ~5 min, only you)

The game talks through **Firebase Realtime Database** — a free Google service that
relays the messages. This works on any wifi/cell network (unlike a direct
peer-to-peer connection, which fails on many networks). Your friends never make an
account; only you do this setup, once.

1. Go to **[console.firebase.google.com](https://console.firebase.google.com)** and
   **Add project** (any name, e.g. `pushup-poker`). You can turn Google Analytics off.
2. In the left sidebar: **Build → Realtime Database → Create Database**. Pick a
   location, and choose **Start in test mode**.
3. On the Realtime Database page, note the URL at the top — it looks like
   `https://pushup-poker-default-rtdb.firebaseio.com`. That's your `databaseURL`.
4. Go to **Project settings** (gear icon) → scroll to **Your apps** → click the
   **`</>` (Web)** icon to register a web app (any nickname, **no** Firebase Hosting
   needed). Firebase shows a `const firebaseConfig = { ... }` snippet.
5. Open **`js/firebase-config.js`** in this repo and paste the values from that
   snippet into the object (make sure `databaseURL` is filled in — if it's not in
   the snippet, use the URL from step 3).
6. **Keep it working past 30 days:** test mode locks the database after 30 days. In
   Realtime Database → **Rules**, set the rules to this and **Publish**:

   ```json
   { "rules": { ".read": true, ".write": true } }
   ```

7. Commit and push (`git add -A && git commit -m "add firebase config" && git push`).

That's it — the site is now fully working for everyone.

> **Privacy note (honor system):** with the simple public rules above, your own hole
> cards are only ever shown to you in the app, but a *technically-inclined* friend
> could open the Firebase console and peek at the raw data. For a friendly pushup
> game that's usually fine. If you want it locked down so cards are cryptographically
> private, that's a follow-up (Firebase Anonymous Auth + per-user rules) — ask and it
> can be added.

## Host it on GitHub Pages (free)

1. Put these files in a **public** GitHub repo (keep the folder layout) and push to `main`.
2. Repo **Settings → Pages → Build and deployment → Deploy from a branch →** `main` / `/ (root)`.
3. Wait a minute; your site is live at `https://<your-username>.github.io/<repo>/`.
4. Share that URL. The included empty `.nojekyll` file makes Pages serve `/vendor` and
   `/js` verbatim.

## Play it

1. One person clicks **Create a table** and shares the 4-letter code (or the link).
2. Everyone else opens the site, enters a name, and **Joins** with the code.
3. The host clicks **Deal**. Your two cards are sent only to you.

Everyone will see a live "Found the table — syncing…" and land in the lobby within a
second or two.

## Test / develop without friends

- **Hotseat dev mode:** open `index.html?solo=4` (or `?solo=2..8`). One browser runs a
  full game (no Firebase needed) — drive a whole hand, reach showdown, watch the tally.
- **Hand-evaluator tests:** serve the folder locally and open `tests/poker.test.html`.

  ```
  python3 -m http.server 8000
  # http://localhost:8000/                          (the game)
  # http://localhost:8000/tests/poker.test.html     (evaluator tests)
  ```

## Project layout

```
index.html                     entry page
css/styles.css                 all styling
js/main.js                     app shell: home screen, host/client/solo sessions
js/net.js                      transport over Firebase Realtime Database
js/firebase-config.js          <-- YOU paste your Firebase project config here
js/engine.js                   authoritative game + betting state machine (host)
js/rules.js                    betting constants + legal-action calculator
js/poker.js                    54-card deck, wild-joker hand evaluator
js/ui.js                       rendering + controls
js/store.js                    remembers your name/last code (localStorage)
vendor/firebase-db.min.js      vendored Firebase SDK (app + Realtime Database), no CDN
tests/poker.test.html          in-browser evaluator tests
```

## Swapping the backend (optional)

All transport lives in `js/net.js` behind a small message API
(`sendState`/`onState`, `sendHole`/`onHole`, `sendAct`/`onAct`, `sendJoin`/`onJoin`,
peer join/leave). To use a different backend, reimplement just that file — nothing
else changes.
