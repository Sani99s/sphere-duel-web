# Sphere Duel — Browser Client

A browser front end for **Sphere Duel**, the staked rock-paper-scissors
game built on the Sphere SDK (Games track). This talks to the same
`sphere-duel` Node.js signalling/escrow server from the CLI version — it's
a second front end for the same game, not a separate protocol.

## Design

A vault-and-ledger aesthetic: the game's real mechanism — commit before
you reveal — is the whole visual idea. Choosing a move stamps a wax seal
shut (the commitment); once both players are in, the seal cracks open
(the reveal). A ledger strip across the top (`Stake · Seal · Reveal ·
Settle`) tracks the actual protocol stages, not decorative step numbers.

- **Type:** Fraunces (display) + IBM Plex Sans (body) + IBM Plex Mono
  (nametags, hashes, amounts — anything that's really on-chain data)
- **Palette:** ink-blue vault background, brass for stakes/actions, wax-seal
  red for the commit state, muted verify-green for confirmations

## Setup

```bash
npm install
cp .env.example .env   # point VITE_SERVER_URL at your running server
npm run dev
```

Make sure the `sphere-duel` server from the Node.js project is running
first (`npm run server` there) — this client only handles wallet +
rendering, the escrow and matchmaking still live on the server.

Open the printed local URL, pick a Unicity ID, and you're in the queue.
Open a second tab (or send the link to someone else) with a different ID
to get matched.

## Files

```
sphere-duel-web/
├── index.html
├── src/
│   ├── main.js         # DOM rendering for each game stage
│   ├── game.js          # wallet, WebSocket signalling, state machine
│   ├── commitReveal.js  # Web Crypto commit-reveal hashing
│   └── style.css        # design tokens + the wax-seal motif
├── package.json
└── .env.example
```

## Notes

- The wallet is created directly in the browser via
  `createBrowserProviders` — self-custodial, same pattern as the SDK's
  own quick-start example. First run shows a recovery phrase; there's no
  "import an existing wallet" flow in this build, so if you refresh
  after generating one and want it back, you'd need to add that (the
  Node CLI version shows the pattern: pass a `mnemonic` alongside
  `nametag` on `Sphere.init`).
- Production build was verified with `vite build` — the SDK's browser
  entrypoint resolves cleanly, no missing-export warnings.
- Like the Node.js version, double-check the exact wallet-restore field
  name against `docs/` in `sphere-sdk` once you clone it — that specific
  detail was inferred rather than confirmed against source.
