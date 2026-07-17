import { SphereDuelGame, getSavedWallet, clearSavedWallet } from './game.js';

const app = document.getElementById('app');
const game = new SphereDuelGame();
let showImport = false;

const ICONS = {
  rock: `<svg viewBox="0 0 48 48"><path d="M14 28c-1-6 2-11 6-13 1-3 4-5 7-4 3-1 6 1 7 4 4 1 7 6 6 13 0 6-6 10-13 10s-13-4-13-10Z"/></svg>`,
  paper: `<svg viewBox="0 0 48 48"><rect x="12" y="8" width="24" height="32" rx="2"/><path d="M17 17h14M17 24h14M17 31h9"/></svg>`,
  scissors: `<svg viewBox="0 0 48 48"><circle cx="15" cy="14" r="4"/><circle cx="15" cy="34" r="4"/><path d="M18 16 36 33M18 32 36 15"/></svg>`,
};

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') node.innerHTML = v;
    else node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

function ledger(stage) {
  const steps = [
    { key: 'stake', label: 'Stake' },
    { key: 'seal', label: 'Seal' },
    { key: 'reveal', label: 'Reveal' },
    { key: 'settle', label: 'Settle' },
  ];
  const order = { staking: 0, commit: 1, sealed: 1, revealing: 2, result: 3 };
  const current = order[stage] ?? -1;

  const row = el('div', { class: 'ledger' });
  steps.forEach((step, i) => {
    const status = i < current ? 'done' : i === current ? 'active' : '';
    row.appendChild(
      el('div', { class: `ledger-step ${status}` }, [el('span', { class: 'dot' }), step.label])
    );
    if (i < steps.length - 1) row.appendChild(el('div', { class: 'ledger-rule' }));
  });
  return row;
}

function header() {
  return el('div', {}, [
    el('p', { class: 'eyebrow' }, 'Sphere Testnet · Games Track'),
    el('h1', { class: 'title' }, 'Sphere Duel'),
    el(
      'p',
      { class: 'subtitle' },
      'Stake tokens, seal a move under a cryptographic commitment, then break the seal together. Winner takes the pot — settled peer-to-peer on Sphere.'
    ),
  ]);
}

function render(state) {
  app.innerHTML = '';
  app.appendChild(header());

  if (['staking', 'commit', 'sealed', 'revealing', 'result'].includes(state.stage)) {
    app.appendChild(ledger(state.stage));
  }

  const card = el('div', { class: 'card' });
  app.appendChild(card);

  if (state.stage === 'error') {
    card.appendChild(el('h2', {}, 'Something went sideways'));
    card.appendChild(el('div', { class: 'error-box' }, state.error));
    card.appendChild(
      el('button', { class: 'primary', onClick: () => location.reload() }, 'Start over')
    );
    return;
  }

  if (state.stage === 'setup' || state.stage === 'connecting-wallet') {
    renderSetup(card, state);
    return;
  }

  if (state.stage === 'queueing' || state.stage === 'queued') {
    card.appendChild(el('h2', {}, 'Finding an opponent'));
    card.appendChild(
      el('p', { class: 'hint' }, `Playing as @${state.handle}. Waiting for another builder to join...`)
    );
    card.appendChild(el('div', {}, [el('span', { class: 'spinner' }), 'Searching the queue']));
    card.appendChild(waitingList(state));
    if (state.freshMnemonic) card.appendChild(mnemonicBox(state.freshMnemonic));
    return;
  }

  if (state.stage === 'staking') {
    renderStaking(card, state);
    return;
  }

  if (state.stage === 'commit') {
    renderCommit(card, state);
    return;
  }

  if (state.stage === 'sealed') {
    renderSealed(card, state, false);
    return;
  }

  if (state.stage === 'revealing') {
    renderSealed(card, state, true);
    return;
  }

  if (state.stage === 'result') {
    renderResult(card, state);
    return;
  }

  app.appendChild(footer(state));
}

function waitingList(state) {
  const others = state.queuedPlayers || [];
  const position = state.queuePosition;

  const box = el('div', { class: 'queue-box' });

  if (position) {
    box.appendChild(
      el(
        'p',
        { class: 'queue-position' },
        position === 1 ? "You're first in line" : `You're #${position} in line`
      )
    );
  }

  if (others.length > 0) {
    box.appendChild(el('p', { class: 'hint' }, 'Also waiting:'));
    const list = el('div', { class: 'queue-list' });
    for (const name of others) {
      list.appendChild(el('span', { class: 'queue-chip' }, `@${name}`));
    }
    box.appendChild(list);
  }

  return box;
}

function mnemonicBox(mnemonic) {
  return el('div', { class: 'mnemonic-box' }, [
    el('span', { class: 'warn' }, "New wallet created and saved in this browser. Write this down too — it's the only way to recover it on another device:"),
    mnemonic,
  ]);
}

function renderSetup(card, state) {
  const saved = getSavedWallet();
  const busy = state.stage === 'connecting-wallet';

  if (saved && !showImport) {
    card.appendChild(el('h2', {}, `Welcome back, @${saved.nametag}`));
    card.appendChild(
      el('p', { class: 'hint' }, 'Continue with your saved testnet wallet, or switch to a different one.')
    );

    const continueBtn = el(
      'button',
      {
        class: 'primary',
        onClick: () => game.connectWallet(saved.nametag, saved.mnemonic),
      },
      busy ? 'Opening wallet…' : `Continue as @${saved.nametag}`
    );
    if (busy) continueBtn.disabled = true;
    card.appendChild(continueBtn);

    card.appendChild(
      el(
        'button',
        {
          class: 'ghost',
          onClick: () => {
            clearSavedWallet();
            render(state);
          },
        },
        'Use a different wallet'
      )
    );
    return;
  }

  card.appendChild(el('h2', {}, 'Enter the vault'));
  card.appendChild(
    el(
      'p',
      { class: 'hint' },
      'Connect the Sphere wallet you already use, or spin up a throwaway testnet wallet for this session.'
    )
  );

  const connectBtn = el(
    'button',
    { class: 'primary', onClick: () => game.connectExistingWallet() },
    busy ? 'Connecting…' : 'Connect Sphere Wallet'
  );
  if (busy) connectBtn.disabled = true;
  card.appendChild(connectBtn);
  card.appendChild(el('p', { class: 'or-divider' }, 'or use a test wallet'));

  card.appendChild(el('label', {}, 'Unicity ID'));
  const wrap = el('div', { class: 'nametag-input' });
  const input = el('input', { placeholder: 'alice', maxlength: '20' });
  wrap.appendChild(el('span', { class: 'at' }, '@'));
  wrap.appendChild(input);
  card.appendChild(wrap);

  let mnemonicInput = null;
  if (showImport) {
    card.appendChild(el('label', {}, 'Recovery phrase'));
    mnemonicInput = el('textarea', {
      class: 'mnemonic-input',
      rows: '2',
      placeholder: 'twelve word recovery phrase',
    });
    card.appendChild(mnemonicInput);
  }

  const button = el(
    'button',
    {
      class: 'primary',
      onClick: () => {
        const nametag = input.value.trim().toLowerCase();
        const mnemonic = mnemonicInput ? mnemonicInput.value.trim() : undefined;
        if (nametag) game.connectWallet(nametag, mnemonic || undefined);
      },
    },
    busy ? 'Opening wallet…' : 'Enter'
  );
  if (busy) button.disabled = true;
  card.appendChild(button);

  card.appendChild(
    el(
      'button',
      {
        class: 'ghost',
        onClick: () => {
          showImport = !showImport;
          render(state);
        },
      },
      showImport ? 'Generate a new wallet instead' : 'I already have a recovery phrase'
    )
  );
}

function renderStaking(card, state) {
  card.appendChild(el('h2', {}, `Matched against @${state.opponent}`));
  card.appendChild(
    el('p', { class: 'hint' }, `Each side stakes ${formatAmount(state.stake)} to the escrow wallet @${state.stake.escrow}.`)
  );

  card.appendChild(statusRow('Your stake', state.ownStakeConfirmed ? 'Confirmed' : state.ownStakeSent ? 'Sending…' : 'Preparing…', state.ownStakeConfirmed ? 'confirmed' : 'pending'));
  card.appendChild(statusRow('Opponent stake', state.opponentStakeConfirmed ? 'Confirmed' : 'Waiting…', state.opponentStakeConfirmed ? 'confirmed' : 'pending'));
}

function statusRow(label, value, cls) {
  return el('div', { class: 'status-row' }, [
    el('span', { class: 'label' }, label),
    el('span', { class: `value ${cls}` }, value),
  ]);
}

function renderCommit(card, state) {
  card.appendChild(el('h2', {}, 'Choose your move'));
  card.appendChild(el('p', { class: 'hint' }, 'Your move is sealed under a commitment until both sides are locked in.'));

  let selected = null;
  const buttons = {};
  const movesRow = el('div', { class: 'moves' });
  for (const move of ['rock', 'paper', 'scissors']) {
    const btn = el(
      'button',
      {
        class: 'move-btn',
        html: ICONS[move],
        onClick: () => {
          selected = move;
          for (const m in buttons) buttons[m].classList.toggle('selected', m === move);
          confirmBtn.disabled = false;
        },
      },
      []
    );
    buttons[move] = btn;
    movesRow.appendChild(btn);
  }
  card.appendChild(movesRow);

  const confirmBtn = el(
    'button',
    { class: 'primary', onClick: () => selected && game.lockInMove(selected) },
    'Seal your move'
  );
  confirmBtn.disabled = true;
  card.appendChild(confirmBtn);
}

function renderSealed(card, state, cracking) {
  card.appendChild(el('h2', {}, cracking ? 'Breaking the seal' : 'Move sealed'));
  card.appendChild(
    el('p', { class: 'hint' }, cracking ? 'Both sides locked in — revealing moves now.' : 'Waiting for your opponent to seal their move…')
  );

  const stage = el('div', { class: 'seal-stage' });
  stage.appendChild(el('div', { class: `seal${cracking ? ' cracking' : ''}`, html: ICONS[state.ownMove] }));
  stage.appendChild(el('div', { class: 'seal-caption' }, cracking ? 'Cracking open' : 'Sealed'));
  card.appendChild(stage);
}

function renderResult(card, state) {
  const o = state.outcome;
  const meWon = o.type === 'win' && o.winner === state.handle;
  const draw = o.type === 'draw';

  card.appendChild(el('div', { class: 'result-moves' }, [
    resultMove(o.moveA ?? o.move),
    el('div', { class: 'vs' }, 'vs'),
    resultMove(o.moveB ?? o.move),
  ]));

  if (draw) {
    card.appendChild(el('p', { class: 'verdict draw' }, `Draw — ${o.moveA} vs ${o.moveB}`));
    card.appendChild(el('p', { class: 'verdict-sub' }, `Stakes refunded, ${formatAmount({ ...state.stake, amount: o.refunded })} each.`));
  } else if (o.type === 'win') {
    card.appendChild(
      el('p', { class: `verdict ${meWon ? 'win' : ''}` }, meWon ? 'You win the pot' : `@${o.winner} takes the pot`)
    );
    card.appendChild(el('p', { class: 'verdict-sub' }, `${formatAmount({ ...state.stake, amount: o.payout })} settled on-chain.`));
  } else {
    card.appendChild(el('p', { class: 'verdict' }, 'Round ended'));
    card.appendChild(el('p', { class: 'verdict-sub' }, o.message || ''));
  }

  card.appendChild(el('button', { class: 'primary', onClick: () => game.playAgain() }, 'Play again'));
}

function resultMove(move) {
  return el('div', { class: 'result-move' }, [
    el('div', { class: 'icon-circle', html: ICONS[move] }),
  ]);
}

function formatAmount(stake) {
  if (!stake) return '';
  return `${stake.amount} ${stake.coin}`;
}

function footer(state) {
  return el('footer', { class: 'meta' }, state.handle ? `@${state.handle} · testnet` : 'sphere-duel · testnet');
}

game.on(render);
