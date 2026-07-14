import { Sphere, getCoinIdBySymbol } from '@unicitylabs/sphere-sdk';
import { createBrowserProviders } from '@unicitylabs/sphere-sdk/impl/browser';
import { createWalletApiProviders } from '@unicitylabs/sphere-sdk/impl/shared/wallet-api';
import { generateSalt, hashMove, isValidMove } from './commitReveal.js';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'ws://localhost:8787';
// Public testnet2 key (documented in the SDK's own README — not a secret).
const ORACLE_API_KEY = import.meta.env.VITE_ORACLE_API_KEY || 'sk_ddc3cfcc001e4a28ac3fad7407f99590';
const WALLET_API_BASE_URL = import.meta.env.VITE_WALLET_API_BASE_URL || 'https://wallet-api.unicity.network';
const STAKE_COIN_FALLBACK = 'UCT';
const MIN_BALANCE = '100000'; // smallest units — used for the self-mint funding check

/**
 * Drives the whole client lifecycle: wallet -> matchmaking -> stake ->
 * commit -> reveal -> settlement. Consumers subscribe with `on(state => ...)`
 * and call the exposed actions (connectWallet, playMove) in response to
 * user input. Keeping this separate from the DOM code makes it easy to
 * re-skin the UI without touching the protocol logic.
 */
function getOrCreateDeviceId() {
  const KEY = 'sphere-duel-device-id';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

export class SphereDuelGame {
  constructor() {
    this.state = { stage: 'setup' }; // see STAGES below for the full lifecycle
    this.listeners = new Set();
    this.sphere = null;
    this.ws = null;
    this._move = null;
    this._salt = null;
    this._matchId = null;
    this._stake = null;
  }

  on(listener) {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  _set(patch) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }

  async connectWallet(nametag) {
    this._set({ stage: 'connecting-wallet', nametag });
    try {
      const deviceId = getOrCreateDeviceId();
      const base = createBrowserProviders({
        network: 'testnet',
        oracle: { apiKey: ORACLE_API_KEY },
      });
      const providers = createWalletApiProviders(base, {
        baseUrl: WALLET_API_BASE_URL,
        network: 'testnet2',
        deviceId,
      });

      const { sphere, created, generatedMnemonic } = await Sphere.init({
        ...providers,
        network: 'testnet',
        autoGenerate: true,
        nametag,
      });
      this.sphere = sphere;

      if (created && generatedMnemonic) {
        this._set({ freshMnemonic: generatedMnemonic });
      }

      const handle = sphere.identity?.nametag ?? nametag;

      // There's no testnet faucet — self-mint if the balance is short.
      const coinId = getCoinIdBySymbol(STAKE_COIN_FALLBACK);
      if (coinId) {
        const [asset] = sphere.payments.getBalance(coinId);
        const current = asset ? BigInt(asset.totalAmount) : 0n;
        if (current < BigInt(MIN_BALANCE)) {
          await sphere.payments.mintFungibleToken(coinId, BigInt(MIN_BALANCE) * 10n);
        }
      }

      const balance = sphere.payments.getBalance();
      this._set({ handle, balance });

      sphere.on('transfer:incoming', async () => {
        await this.sphere.payments.receive();
        this._set({ balance: this.sphere.payments.getBalance() });
      });

      this._connectSignalling(handle);
    } catch (err) {
      this._set({ stage: 'error', error: `Couldn't open a wallet: ${err.message || err}` });
    }
  }

  _connectSignalling(handle) {
    this._set({ stage: 'queueing' });
    this.ws = new WebSocket(SERVER_URL);

    this.ws.addEventListener('open', () => {
      this.ws.send(JSON.stringify({ type: 'join', nametag: handle }));
    });

    this.ws.addEventListener('message', (event) => this._handleMessage(JSON.parse(event.data)));

    this.ws.addEventListener('close', () => {
      if (this.state.stage !== 'result') {
        this._set({ stage: 'error', error: 'Lost connection to the game server.' });
      }
    });

    this.ws.addEventListener('error', () => {
      this._set({ stage: 'error', error: 'Could not reach the game server. Is it running?' });
    });
  }

  async _handleMessage(msg) {
    switch (msg.type) {
      case 'queued':
        this._set({ stage: 'queued' });
        break;

      case 'matched': {
        this._matchId = msg.matchId;
        this._stake = { amount: msg.stakeAmount, coin: msg.stakeCoin, escrow: msg.escrowNametag };
        this._set({ stage: 'staking', opponent: msg.opponent, stake: this._stake });
        try {
          await this.sphere.payments.send({
            recipient: `@${msg.escrowNametag}`,
            coinId: msg.stakeCoin,
            amount: msg.stakeAmount,
          });
          this._set({ ownStakeSent: true });
        } catch (err) {
          this._set({ stage: 'error', error: `Couldn't send your stake: ${err.message || err}` });
        }
        break;
      }

      case 'stake_confirmed':
        this._set({ ownStakeConfirmed: true });
        break;

      case 'opponent_staked':
        this._set({ opponentStakeConfirmed: true });
        break;

      case 'stage':
        if (msg.stage === 'commit') this._set({ stage: 'commit' });
        if (msg.stage === 'reveal') {
          this._set({ stage: 'revealing' });
          this.reveal();
        }
        break;

      case 'error':
        this._set({ stage: 'error', error: msg.message });
        break;

      case 'result':
        this._set({ stage: 'result', outcome: msg.outcome });
        break;

      default:
        break;
    }
  }

  /** Called once the player picks a move on the "commit" stage. */
  async lockInMove(move) {
    if (!isValidMove(move)) return;
    this._move = move;
    this._salt = generateSalt();
    const hash = await hashMove(move, this._salt);
    this._set({ stage: 'sealed', ownMove: move });
    this.ws.send(JSON.stringify({ type: 'commit', matchId: this._matchId, hash }));
  }

  /** Called automatically once both players have committed. */
  reveal() {
    if (!this._move || !this._salt) return;
    this.ws.send(
      JSON.stringify({ type: 'reveal', matchId: this._matchId, move: this._move, salt: this._salt })
    );
  }

  playAgain() {
    this._move = null;
    this._salt = null;
    this._matchId = null;
    const handle = this.state.handle;
    this._set({
      stage: 'queueing',
      opponent: null,
      stake: null,
      ownStakeSent: false,
      ownStakeConfirmed: false,
      opponentStakeConfirmed: false,
      ownMove: null,
      outcome: null,
    });
    this._connectSignalling(handle);
  }
}
