import KycWorkspace from './KycWorkspace';
import { useMemo, useState } from 'react';
import {
  useAccount,
  useConnect,
  useDisconnect,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from 'wagmi';

import { formatUnits, parseUnits } from 'viem';

import {
  CONTRACTS,
  ANVIL_CHAIN_ID,
  POOL_KEY,
  erc20Abi,
  hookAbi,
  registryAbi,
  oracleAbi,
  routerAbi,
} from './contracts';

import './App.css';

type Direction = 'USD_TO_INR' | 'INR_TO_USD';

const ZERO = 0n;

const MAX_UINT256 = BigInt(
  '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
);

function shortAddress(address?: string) {
  return address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : '—';
}

function formatNumber(
  value?: bigint,
  decimals = 18,
  places = 4,
) {
  if (value === undefined) return '—';

  const number = Number(formatUnits(value, decimals));

  return Number.isFinite(number)
    ? number.toLocaleString('en-IN', {
        maximumFractionDigits: places,
      })
    : '—';
}

function explainError(error: unknown): string {
  const message =
    error instanceof Error ? error.message : String(error);

  if (message.includes('KYCNotApproved')) {
    return 'Your wallet is not approved for trading. Contact the administrator.';
  }

  if (message.includes('StaleOraclePrice')) {
    return 'The oracle price is outdated according to the on-chain hook. Trading is temporarily blocked.';
  }

  if (message.includes('InvalidOraclePrice')) {
    return 'The oracle returned an invalid price. Trading is temporarily blocked.';
  }

  if (message.includes('UnauthorizedRouter')) {
    return 'The swap was not submitted through the approved router.';
  }

  if (message.toLowerCase().includes('insufficient')) {
    return 'Insufficient token balance or allowance. Check your balance and approve the router.';
  }

  if (message.toLowerCase().includes('user rejected')) {
    return 'You rejected the transaction in MetaMask.';
  }

  return message.slice(0, 240);
}

export default function App() {
  const { address, isConnected, chainId } = useAccount();

  const {
    connect,
    connectors,
    isPending: connecting,
  } = useConnect();

  const { disconnect } = useDisconnect();

  const {
    switchChain,
    isPending: switching,
  } = useSwitchChain();

  const {
    writeContract,
    data: txHash,
    isPending: writing,
    error: writeError,
  } = useWriteContract();

  const [direction, setDirection] =
    useState<Direction>('USD_TO_INR');

  const [amount, setAmount] = useState('1');

  const [notice, setNotice] = useState('');

  const [transactionKind, setTransactionKind] =
    useState<'approval' | 'swap'>('swap');

  const wrongNetwork =
    isConnected && chainId !== ANVIL_CHAIN_ID;

  const inputToken =
    direction === 'USD_TO_INR'
      ? CONTRACTS.usd
      : CONTRACTS.inr;

  const inputSymbol =
    direction === 'USD_TO_INR' ? 'USD' : 'INR';

  const outputSymbol =
    direction === 'USD_TO_INR' ? 'INR' : 'USD';

  // --------------------------------------------------
  // INPUT AMOUNT
  // --------------------------------------------------

  const amountIn = useMemo(() => {
    try {
      if (!amount || Number(amount) <= 0) return ZERO;

      return parseUnits(amount, 18);
    } catch {
      return ZERO;
    }
  }, [amount]);

  // --------------------------------------------------
  // TOKEN BALANCES
  // --------------------------------------------------

  const usdBalance = useReadContract({
    address: CONTRACTS.usd,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      refetchInterval: 5000,
    },
  });

  const inrBalance = useReadContract({
    address: CONTRACTS.inr,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      refetchInterval: 5000,
    },
  });

  // --------------------------------------------------
  // TOKEN ALLOWANCE
  // --------------------------------------------------

  const inputAllowance = useReadContract({
    address: inputToken,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address
      ? [address, CONTRACTS.router]
      : undefined,
    query: {
      enabled: !!address,
      refetchInterval: 5000,
    },
  });

  // --------------------------------------------------
  // KYC REGISTRY
  // --------------------------------------------------

  const kyc = useReadContract({
    address: CONTRACTS.registry,
    abi: registryAbi,
    functionName: 'isApproved',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      refetchInterval: 5000,
    },
  });

  // --------------------------------------------------
  // ADMINISTRATOR
  // --------------------------------------------------

  const registryOwner = useReadContract({
    address: CONTRACTS.registry,
    abi: registryAbi,
    functionName: 'owner',
    query: {
      refetchInterval: 15000,
    },
  });

  // --------------------------------------------------
  // DYNAMIC FEE QUOTE
  // --------------------------------------------------

  const feeQuote = useReadContract({
    address: CONTRACTS.hook,
    abi: hookAbi,
    functionName: 'quoteFee',
    args: [POOL_KEY],
    query: {
      refetchInterval: 5000,
    },
  });

  // --------------------------------------------------
  // CHAINLINK ORACLE
  // --------------------------------------------------

  const oracleData = useReadContract({
    address: CONTRACTS.oracle,
    abi: oracleAbi,
    functionName: 'latestRoundData',
    query: {
      refetchInterval: 5000,
    },
  });

  const oracleDecimals = useReadContract({
    address: CONTRACTS.oracle,
    abi: oracleAbi,
    functionName: 'decimals',
  });

  // --------------------------------------------------
  // TRANSACTION RECEIPT
  // --------------------------------------------------

  const receipt = useWaitForTransactionReceipt({
    hash: txHash,
    query: {
      enabled: !!txHash,
    },
  });

  // --------------------------------------------------
  // WALLET AND KYC STATUS
  // --------------------------------------------------

  const approved = kyc.data === true;

  const isAdmin =
    !!address &&
    !!registryOwner.data &&
    address.toLowerCase() ===
      registryOwner.data.toLowerCase();

  const allowance = inputAllowance.data ?? ZERO;

  const hasAllowance = allowance >= amountIn;

  const balance =
    direction === 'USD_TO_INR'
      ? usdBalance.data
      : inrBalance.data;

  const hasBalance =
    balance !== undefined &&
    balance >= amountIn;

  // --------------------------------------------------
  // DYNAMIC FEE DATA
  // --------------------------------------------------

  const fee = feeQuote.data?.[0];

  const poolPrice = feeQuote.data?.[1];

  const quotedOraclePrice = feeQuote.data?.[2];

  const deviation = feeQuote.data?.[3];

  // --------------------------------------------------
  // ORACLE PRICE AND HEALTH
  // --------------------------------------------------

  const oracleAnswer = oracleData.data?.[1];

  const decimals = Number(oracleDecimals.data ?? 8);

  // IMPORTANT:
  // Chainlink's Polygon INR/USD feed returns USD per INR.
  // We invert it to display INR per USD.

  const oraclePrice =
    oracleAnswer !== undefined &&
    oracleAnswer > ZERO
      ? 1 / Number(formatUnits(oracleAnswer, decimals))
      : undefined;

  // The frontend computer clock is NOT used for freshness.
  //
  // The hook's quoteFee() calls the actual on-chain oracle
  // validation, including its block.timestamp freshness check.
  //
  // This is important because our Anvil fork uses a historical
  // Polygon block timestamp.

  const oracleHealthy =
    feeQuote.data !== undefined &&
    !feeQuote.isError &&
    oracleAnswer !== undefined &&
    oracleAnswer > ZERO;

  // Prefer the oracle price returned by the hook because
  // it is the exact value used in the dynamic fee calculation.

  const indicativePrice =
    quotedOraclePrice !== undefined
      ? Number(formatUnits(quotedOraclePrice, 18))
      : oraclePrice;

  // --------------------------------------------------
  // INDICATIVE OUTPUT
  // --------------------------------------------------

  const estimatedOutput =
    amountIn > ZERO &&
    indicativePrice !== undefined &&
    indicativePrice > 0
      ? direction === 'USD_TO_INR'
        ? Number(formatUnits(amountIn, 18)) *
          indicativePrice
        : Number(formatUnits(amountIn, 18)) /
          indicativePrice
      : undefined;

  // --------------------------------------------------
  // CONNECT WALLET
  // --------------------------------------------------

  function handleConnect() {
    const connector =
      connectors.find((item) => item.id === 'injected') ??
      connectors[0];

    if (connector) {
      connect({ connector });
    }
  }

  // --------------------------------------------------
  // APPROVE TOKEN SPENDING
  // --------------------------------------------------

  function handleApprove() {
    if (!address || wrongNetwork) return;

    setNotice('');

    setTransactionKind('approval');

    writeContract({
      address: inputToken,
      abi: erc20Abi,
      functionName: 'approve',
      args: [
        CONTRACTS.router,
        MAX_UINT256,
      ],
    });
  }

  // --------------------------------------------------
  // EXECUTE SWAP
  // --------------------------------------------------

  function handleSwap() {
    if (
      !address ||
      !approved ||
      !oracleHealthy ||
      !hasBalance ||
      !hasAllowance
    ) {
      return;
    }

    if (
      feeQuote.isError ||
      fee === undefined
    ) {
      setNotice(
        'Unable to retrieve the current dynamic fee. Try refreshing.',
      );
      return;
    }

    setNotice('');

    setTransactionKind('swap');

    writeContract({
      address: CONTRACTS.router,
      abi: routerAbi,
      functionName: 'swapExactTokensForTokens',
      args: [
        amountIn,
        ZERO,
        direction === 'USD_TO_INR',
        POOL_KEY,
        '0x',
        address,
        BigInt(
          Math.floor(Date.now() / 1000) + 1200,
        ),
      ],
    });
  }

  // --------------------------------------------------
  // TRANSACTION STATUS
  // --------------------------------------------------

  const transactionMessage = receipt.isSuccess
    ? transactionKind === 'approval'
      ? 'Token approval confirmed!'
      : 'Swap transaction confirmed!'
    : receipt.isError
      ? 'Transaction confirmation failed.'
      : writing
        ? 'Confirm the transaction in MetaMask...'
        : txHash
          ? 'Waiting for transaction confirmation...'
          : '';

  // --------------------------------------------------
  // UI
  // --------------------------------------------------

  return (
    <main className="app-shell">

      {/* NAVIGATION */}

      <nav className="topbar">

        <a className="brand" href="/">
          <span className="brand-symbol">F</span>

          <span>
            FX
            <span className="brand-muted">
              {' '} / INTELLIGENCE
            </span>
          </span>
        </a>

        <div className="nav-right">

          <span className="network-tag">
            <span className="live-dot" />
            ANVIL LOCAL
          </span>

          {isConnected ? (
            <button
              className="wallet-button"
              onClick={() => disconnect()}
            >
              <span className="live-dot" />

              {shortAddress(address)}

              <span className="disconnect-hint">
                Disconnect
              </span>
            </button>
          ) : (
            <button
              className="wallet-button"
              onClick={handleConnect}
              disabled={connecting}
            >
              {connecting
                ? 'Connecting...'
                : 'Connect wallet ↗'}
            </button>
          )}

        </div>
      </nav>

      {/* HERO */}

      <section className="hero-section">

        <div className="hero-copy">

          <div className="eyebrow">
            <span className="live-dot" />
            DECENTRALIZED FOREIGN EXCHANGE
          </div>

          <h1>
            Currency exchange,
            <br />
            <span>with intelligence.</span>
          </h1>

          <p>
            A KYC-gated USD/INR exchange powered by
            Uniswap v4, oracle-referenced pricing
            and adaptive swap fees.
          </p>

        </div>

        <div className="hero-rate">

          <span className="muted-label">
            ORACLE REFERENCE RATE
          </span>

          <strong>
            {oraclePrice !== undefined
              ? `₹${oraclePrice.toFixed(2)}`
              : '—'}
          </strong>

          <span>1 USD / INR</span>

          <small>
            {oracleHealthy
              ? 'Oracle validated by on-chain hook'
              : 'Oracle validation pending'}
          </small>

        </div>

      </section>

      {/* NETWORK WARNING */}

      {wrongNetwork && (
        <div className="alert alert-warning">

          <span>Wrong network detected.</span>

          <button
            onClick={() =>
              switchChain({ chainId: ANVIL_CHAIN_ID })
            }
            disabled={switching}
          >
            {switching
              ? 'Switching...'
              : 'Switch to Anvil'}
          </button>

        </div>
      )}

      {!isConnected && (
        <div className="alert alert-info">
          Connect MetaMask to access your balances,
          KYC status and swap functions.
        </div>
      )}

      {/* STATISTICS */}

      <section className="stats-grid">

        <article className="stat-card">

          <span className="muted-label">
            POOL PRICE
          </span>

          <strong>
            {poolPrice !== undefined
              ? `₹${formatNumber(poolPrice)}`
              : '—'}
          </strong>

          <small>
            INR per USD · Uniswap v4
          </small>

        </article>

        <article className="stat-card">

          <span className="muted-label">
            CURRENT DYNAMIC FEE
          </span>

          <strong>
            {fee !== undefined
              ? `${(Number(fee) / 10000).toFixed(2)}%`
              : '—'}
          </strong>

          <small>
            {fee !== undefined
              ? `${fee.toString()} fee units`
              : 'Waiting for hook quote'}
          </small>

        </article>

        <article className="stat-card">

          <span className="muted-label">
            PRICE DEVIATION
          </span>

          <strong>
            {deviation !== undefined
              ? `${(Number(deviation) / 100).toFixed(2)}%`
              : '—'}
          </strong>

          <small>
            Pool vs oracle reference
          </small>

        </article>

        <article className="stat-card">

          <span className="muted-label">
            ORACLE HEALTH
          </span>

          <strong
            className={
              oracleHealthy
                ? 'text-success'
                : 'text-danger'
            }
          >
            {oracleHealthy
              ? 'Healthy'
              : 'Check feed'}
          </strong>

          <small>
            {oracleHealthy
              ? 'Validated by on-chain hook'
              : feeQuote.isLoading
                ? 'Checking oracle...'
                : 'Oracle validation unavailable'}
          </small>

        </article>

      </section>

      {/* MAIN CONTENT */}

      <section className="main-grid">

        {/* SWAP PANEL */}

        <article className="panel swap-panel">

          <div className="panel-header">

            <div>
              <span className="muted-label">
                EXCHANGE
              </span>

              <h2>Swap currencies</h2>
            </div>

            <span className="panel-badge">
              UNISWAP V4
            </span>

          </div>

          {/* INPUT CURRENCY */}

          <div className="currency-box">

            <label>You pay</label>

            <div className="currency-input-row">

              <input
                type="number"
                min="0"
                step="any"
                value={amount}
                onChange={(event) =>
                  setAmount(event.target.value)
                }
                placeholder="0.00"
              />

              <div className="currency-chip">

                <span
                  className={`currency-icon ${
                    inputSymbol === 'USD'
                      ? 'usd-icon'
                      : 'inr-icon'
                  }`}
                >
                  {inputSymbol === 'USD' ? '$' : '₹'}
                </span>

                <strong>{inputSymbol}</strong>

              </div>

            </div>

            <div className="balance-line">

              <span>Available balance</span>

              <span>
                {isConnected
                  ? `${formatNumber(balance)} ${inputSymbol}`
                  : 'Connect wallet'}
              </span>

            </div>

          </div>

          {/* DIRECTION SWITCH */}

          <button
            className="direction-switch"
            onClick={() =>
              setDirection(
                direction === 'USD_TO_INR'
                  ? 'INR_TO_USD'
                  : 'USD_TO_INR',
              )
            }
            aria-label="Switch exchange direction"
          >
            ⇅
          </button>

          {/* OUTPUT CURRENCY */}

          <div className="currency-box">

            <label>You receive (indicative)</label>

            <div className="currency-input-row output-row">

              <strong className="output-amount">
                {estimatedOutput !== undefined
                  ? estimatedOutput.toLocaleString(
                      'en-IN',
                      {
                        maximumFractionDigits: 6,
                      },
                    )
                  : '—'}
              </strong>

              <div className="currency-chip">

                <span
                  className={`currency-icon ${
                    outputSymbol === 'USD'
                      ? 'usd-icon'
                      : 'inr-icon'
                  }`}
                >
                  {outputSymbol === 'INR' ? '₹' : '$'}
                </span>

                <strong>{outputSymbol}</strong>

              </div>

            </div>

            <div className="balance-line">

              <span>
                Indicative oracle-based estimate
              </span>

              <span>
                Not a guaranteed execution quote
              </span>

            </div>

          </div>

          {/* SWAP DETAILS */}

          <div className="swap-details">

            <div>
              <span>Reference rate</span>

              <strong>
                {indicativePrice !== undefined
                  ? `₹${indicativePrice.toFixed(4)}`
                  : '—'}
              </strong>
            </div>

            <div>
              <span>Dynamic fee</span>

              <strong>
                {fee !== undefined
                  ? `${(Number(fee) / 10000).toFixed(2)}%`
                  : '—'}
              </strong>
            </div>

            <div>
              <span>Price impact</span>

              <strong>Not yet quoted</strong>
            </div>

          </div>

          {/* ACTION BUTTON */}

          {!isConnected ? (

            <button
              className="primary-button"
              onClick={handleConnect}
              disabled={connecting}
            >
              {connecting
                ? 'Connecting...'
                : 'Connect wallet to swap'}
            </button>

          ) : wrongNetwork ? (

            <button
              className="primary-button"
              onClick={() =>
                switchChain({ chainId: ANVIL_CHAIN_ID })
              }
              disabled={switching}
            >
              Switch to Anvil
            </button>

          ) : !approved ? (

            <button
              className="primary-button"
              disabled
            >
              Wallet not KYC approved
            </button>

          ) : !oracleHealthy ? (

            <button
              className="primary-button"
              disabled
            >
              Oracle unavailable — swaps blocked
            </button>

          ) : !amountIn || !hasBalance ? (

            <button
              className="primary-button"
              disabled
            >
              Enter a valid amount within your balance
            </button>

          ) : !hasAllowance ? (

            <button
              className="primary-button"
              onClick={handleApprove}
              disabled={writing}
            >
              {writing && transactionKind === 'approval'
                ? 'Approving...'
                : `Approve ${inputSymbol}`}
            </button>

          ) : (

            <button
              className="primary-button"
              onClick={handleSwap}
              disabled={
                writing ||
                fee === undefined
              }
            >
              {writing && transactionKind === 'swap'
                ? 'Confirm in MetaMask...'
                : `Swap ${inputSymbol} for ${outputSymbol}`}
            </button>

          )}

          {/* TRANSACTION FEEDBACK */}

          {notice && (
            <p className="error-message">
              {notice}
            </p>
          )}

          {writeError && (
            <p className="error-message">
              {explainError(writeError)}
            </p>
          )}

          {transactionMessage && (
            <p
              className={
                receipt.isError
                  ? 'error-message'
                  : 'success-message'
              }
            >
              {transactionMessage}
            </p>
          )}

          {txHash && (
            <p className="transaction-hash">
              Transaction: {shortAddress(txHash)}
            </p>
          )}

          <p className="disclaimer">
            Local testnet prototype. The displayed output
            is indicative. Swap execution currently uses
            zero minimum output and is not suitable for
            real funds or production deployment.
          </p>

        </article>

        {/* SIDE PANELS */}

        <div className="side-column">

          {/* KYC PANEL */}

          <article className="panel">

            <div className="panel-header">

              <div>
                <span className="muted-label">
                  IDENTITY ACCESS
                </span>

                <h2>KYC verification</h2>
              </div>

              <span
                className={`status-pill ${
                  approved
                    ? 'status-approved'
                    : 'status-pending'
                }`}
              >
                {isConnected
                  ? approved
                    ? 'APPROVED'
                    : 'NOT APPROVED'
                  : 'DISCONNECTED'}
              </span>

            </div>

            <div className="info-row">
              <span>Connected wallet</span>

              <strong>
                {shortAddress(address)}
              </strong>
            </div>

            <div className="info-row">
              <span>Registry approval</span>

              <strong>
                {isConnected
                  ? kyc.isLoading
                    ? 'Checking...'
                    : approved
                      ? 'Granted'
                      : 'Not granted'
                  : '—'}
              </strong>
            </div>

            <div className="info-row">
              <span>Administrator</span>

              <strong>
                {shortAddress(registryOwner.data)}
              </strong>
            </div>

            <p className="panel-note">
              This prototype uses an administrator-managed
              wallet allowlist. It does not perform real
              identity verification.
            </p>

          </article>

          <KycWorkspace
  address={address}
  isAdmin={isAdmin}
  lastError={writeError ? explainError(writeError) : ''}
/>

          {/* ASSET BALANCES */}

          <article className="panel">

            <div className="panel-header">

              <div>
                <span className="muted-label">
                  YOUR ASSETS
                </span>

                <h2>Wallet balances</h2>
              </div>

            </div>

            <div className="asset-row">

              <span className="asset-icon usd-icon">
                $
              </span>

              <div className="asset-name">
                <strong>USD</strong>
                <small>Mock token · USD</small>
              </div>

              <strong>
                {isConnected
                  ? formatNumber(usdBalance.data)
                  : '—'}
              </strong>

            </div>

            <div className="asset-row">

              <span className="asset-icon inr-icon">
                ₹
              </span>

              <div className="asset-name">
                <strong>INR</strong>
                <small>Mock token · INR</small>
              </div>

              <strong>
                {isConnected
                  ? formatNumber(inrBalance.data)
                  : '—'}
              </strong>

            </div>

          </article>

          {/* ADMIN PANEL */}

          {isAdmin && (

            <article className="panel admin-notice">

              <span className="muted-label">
                ADMIN ACCESS
              </span>

              <h2>Administrator detected</h2>

              <p>
                Your wallet owns the KYC registry.
                The wallet approval controls will be
                added in the next stage.
              </p>

            </article>

          )}

        </div>

      </section>

      {/* FOOTER */}

      <footer className="app-footer">

        <span>
          USD/INR · UNISWAP V4 · LOCAL DEVELOPMENT
        </span>

        <span>
          Chain ID 31337 · {shortAddress(CONTRACTS.hook)}
        </span>

      </footer>

    </main>
  );
}
