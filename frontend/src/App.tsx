
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
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '—';
}

function formatNumber(value?: bigint, decimals = 18, places = 4) {
  if (value === undefined) return '—';
  const number = Number(formatUnits(value, decimals));
  return Number.isFinite(number)
    ? number.toLocaleString('en-IN', { maximumFractionDigits: places })
    : '—';
}

function explainError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes('KYCNotApproved')) {
    return 'Your wallet is not approved for trading. Contact the administrator.';
  }
  if (message.includes('StaleOraclePrice')) {
    return 'The oracle price is outdated. The administrator must refresh the oracle.';
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
  const { connect, connectors, isPending: connecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { writeContract, data: txHash, isPending: writing, error: writeError } =
    useWriteContract();

  const [direction, setDirection] = useState<Direction>('USD_TO_INR');
  const [amount, setAmount] = useState('1');
  const [notice, setNotice] = useState('');
  const [transactionKind, setTransactionKind] = useState<'approval' | 'swap'>('swap');

  const wrongNetwork = isConnected && chainId !== ANVIL_CHAIN_ID;

  const inputToken = direction === 'USD_TO_INR'
    ? CONTRACTS.usd
    : CONTRACTS.inr;


  const inputSymbol = direction === 'USD_TO_INR' ? 'USD' : 'INR';
  const outputSymbol = direction === 'USD_TO_INR' ? 'INR' : 'USD';

  const amountIn = useMemo(() => {
    try {
      if (!amount || Number(amount) <= 0) return ZERO;
      return parseUnits(amount, 18);
    } catch {
      return ZERO;
    }
  }, [amount]);

  // Wallet token balances.
  const usdBalance = useReadContract({
    address: CONTRACTS.usd,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 5000 },
  });

  const inrBalance = useReadContract({
    address: CONTRACTS.inr,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 5000 },
  });

  // Router allowances.
  const inputAllowance = useReadContract({
    address: inputToken,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, CONTRACTS.router] : undefined,
    query: { enabled: !!address, refetchInterval: 5000 },
  });

  // KYC approval.
  const kyc = useReadContract({
    address: CONTRACTS.registry,
    abi: registryAbi,
    functionName: 'isApproved',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 5000 },
  });

  // Administrator address.
  const registryOwner = useReadContract({
    address: CONTRACTS.registry,
    abi: registryAbi,
    functionName: 'owner',
    query: { refetchInterval: 15000 },
  });

  // Actual dynamic fee quote from our new hook.
  const feeQuote = useReadContract({
    address: CONTRACTS.hook,
    abi: hookAbi,
    functionName: 'quoteFee',
    args: [POOL_KEY],
    query: { refetchInterval: 5000 },
  });

  // Oracle reference price and freshness.
  const oracleData = useReadContract({
    address: CONTRACTS.oracle,
    abi: oracleAbi,
    functionName: 'latestRoundData',
    query: { refetchInterval: 5000 },
  });

  const oracleDecimals = useReadContract({
    address: CONTRACTS.oracle,
    abi: oracleAbi,
    functionName: 'decimals',
  });

  const receipt = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash },
  });

  const approved = kyc.data === true;
  const isAdmin = !!address &&
    !!registryOwner.data &&
    address.toLowerCase() === registryOwner.data.toLowerCase();

  const allowance = inputAllowance.data ?? ZERO;
  const hasAllowance = allowance >= amountIn;
  const balance = direction === 'USD_TO_INR'
    ? usdBalance.data
    : inrBalance.data;

  const hasBalance = balance !== undefined && balance >= amountIn;

  const fee = feeQuote.data?.[0];
  const poolPrice = feeQuote.data?.[1];
  const quotedOraclePrice = feeQuote.data?.[2];
  const deviation = feeQuote.data?.[3];

  const oracleAnswer = oracleData.data?.[1];
  const oracleUpdatedAt = oracleData.data?.[3];
  const decimals = Number(oracleDecimals.data ?? 8);

  const oraclePrice = oracleAnswer && oracleAnswer > ZERO
    ? Number(formatUnits(oracleAnswer, decimals))
    : undefined;

  const oracleAge = oracleUpdatedAt !== undefined
    ? Math.max(0, Math.floor(Date.now() / 1000 - Number(oracleUpdatedAt)))
    : undefined;

  const oracleHealthy = oracleAge !== undefined &&
    oracleAge <= 3600 &&
    oracleAge >= 0 &&
    oracleAnswer !== undefined &&
    oracleAnswer > ZERO;

  const indicativePrice = quotedOraclePrice !== undefined
    ? Number(formatUnits(quotedOraclePrice, 18))
    : oraclePrice;

  const estimatedOutput = amountIn > ZERO && indicativePrice !== undefined &&
    indicativePrice > 0
    ? direction === 'USD_TO_INR'
      ? (Number(formatUnits(amountIn, 18)) * indicativePrice)
      : (Number(formatUnits(amountIn, 18)) / indicativePrice)
    : undefined;

  function handleConnect() {
    const connector = connectors.find((item) => item.id === 'injected')
      ?? connectors[0];

    if (connector) connect({ connector });
  }

  function handleApprove() {
    if (!address || wrongNetwork) return;

    setNotice('');
    setTransactionKind('approval');

    writeContract({
      address: inputToken,
      abi: erc20Abi,
      functionName: 'approve',
      args: [CONTRACTS.router, MAX_UINT256],
    });
  }

  function handleSwap() {
    if (!address || !approved || !oracleHealthy || !hasBalance || !hasAllowance) {
      return;
    }

    if (feeQuote.isError || fee === undefined) {
      setNotice('Unable to retrieve the current dynamic fee. Try refreshing.');
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
        ZERO, // Local prototype: zero minimum output. Add a reliable quoter before production.
        direction === 'USD_TO_INR',
        POOL_KEY,
        '0x',
        address,
        BigInt(Math.floor(Date.now() / 1000) + 1200),
      ],
    });
  }

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

  return (
    <main className="app-shell">
      <nav className="topbar">
        <a className="brand" href="/">
          <span className="brand-symbol">F</span>
          <span>FX<span className="brand-muted"> / INTELLIGENCE</span></span>
        </a>

        <div className="nav-right">
          <span className="network-tag">
            <span className="live-dot" />
            ANVIL LOCAL
          </span>

          {isConnected ? (
            <button className="wallet-button" onClick={() => disconnect()}>
              <span className="live-dot" />
              {shortAddress(address)}
              <span className="disconnect-hint">Disconnect</span>
            </button>
          ) : (
            <button
              className="wallet-button"
              onClick={handleConnect}
              disabled={connecting}
            >
              {connecting ? 'Connecting...' : 'Connect wallet ↗'}
            </button>
          )}
        </div>
      </nav>

      <section className="hero-section">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="live-dot" />
            DECENTRALIZED FOREIGN EXCHANGE
          </div>
          <h1>Currency exchange,<br /><span>with intelligence.</span></h1>
          <p>
            A KYC-gated USD/INR exchange powered by Uniswap v4,
            oracle-referenced pricing and adaptive swap fees.
          </p>
        </div>

        <div className="hero-rate">
          <span className="muted-label">ORACLE REFERENCE RATE</span>
          <strong>
            {oraclePrice !== undefined
              ? `₹${oraclePrice.toFixed(2)}`
              : '—'}
          </strong>
          <span>1 USD / INR</span>
          <small>{oracleHealthy ? 'Oracle reporting fresh data' : 'Oracle status unavailable or stale'}</small>
        </div>
      </section>

      {wrongNetwork && (
        <div className="alert alert-warning">
          <span>Wrong network detected.</span>
          <button onClick={() => switchChain({ chainId: ANVIL_CHAIN_ID })} disabled={switching}>
            {switching ? 'Switching...' : 'Switch to Anvil'}
          </button>
        </div>
      )}

      {!isConnected && (
        <div className="alert alert-info">
          Connect MetaMask to access your balances, KYC status and swap functions.
        </div>
      )}

      <section className="stats-grid">
        <article className="stat-card">
          <span className="muted-label">POOL PRICE</span>
          <strong>{poolPrice !== undefined ? `₹${formatNumber(poolPrice)} ` : '—'}</strong>
          <small>INR per USD · Uniswap v4</small>
        </article>

        <article className="stat-card">
          <span className="muted-label">CURRENT DYNAMIC FEE</span>
          <strong>{fee !== undefined ? `${(Number(fee) / 10000).toFixed(2)}%` : '—'}</strong>
          <small>{fee !== undefined ? `${fee.toString()} fee units` : 'Waiting for hook quote'}</small>
        </article>

        <article className="stat-card">
          <span className="muted-label">PRICE DEVIATION</span>
          <strong>{deviation !== undefined ? `${(Number(deviation) / 100).toFixed(2)}%` : '—'}</strong>
          <small>Pool vs oracle reference</small>
        </article>

        <article className="stat-card">
          <span className="muted-label">ORACLE HEALTH</span>
          <strong className={oracleHealthy ? 'text-success' : 'text-danger'}>
            {oracleHealthy ? 'Healthy' : 'Check feed'}
          </strong>
          <small>{oracleAge !== undefined ? `Updated ${oracleAge}s ago` : 'No timestamp available'}</small>
        </article>
      </section>

      <section className="main-grid">
        <article className="panel swap-panel">
          <div className="panel-header">
            <div>
              <span className="muted-label">EXCHANGE</span>
              <h2>Swap currencies</h2>
            </div>
            <span className="panel-badge">UNISWAP V4</span>
          </div>

          <div className="currency-box">
            <label>You pay</label>
            <div className="currency-input-row">
              <input
                type="number"
                min="0"
                step="any"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
              />
              <div className="currency-chip">
                <span className="currency-icon usd-icon">
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

          <button
            className="direction-switch"
            onClick={() => setDirection(
              direction === 'USD_TO_INR' ? 'INR_TO_USD' : 'USD_TO_INR',
            )}
            aria-label="Switch exchange direction"
          >
            ⇅
          </button>

          <div className="currency-box">
            <label>You receive (indicative)</label>
            <div className="currency-input-row output-row">
              <strong className="output-amount">
                {estimatedOutput !== undefined
                  ? estimatedOutput.toLocaleString('en-IN', {
                    maximumFractionDigits: 6,
                  })
                  : '—'}
              </strong>
              <div className="currency-chip">
                <span className="currency-icon inr-icon">
                  {outputSymbol === 'INR' ? '₹' : '$'}
                </span>
                <strong>{outputSymbol}</strong>
              </div>
            </div>
            <div className="balance-line">
              <span>Indicative oracle-based estimate</span>
              <span>Not a guaranteed execution quote</span>
            </div>
          </div>

          <div className="swap-details">
            <div>
              <span>Reference rate</span>
              <strong>{indicativePrice !== undefined ? `₹${indicativePrice.toFixed(4)}` : '—'}</strong>
            </div>
            <div>
              <span>Dynamic fee</span>
              <strong>{fee !== undefined ? `${(Number(fee) / 10000).toFixed(2)}%` : '—'}</strong>
            </div>
            <div>
              <span>Price impact</span>
              <strong>Not yet quoted</strong>
            </div>
          </div>

          {!isConnected ? (
            <button className="primary-button" onClick={handleConnect} disabled={connecting}>
              {connecting ? 'Connecting...' : 'Connect wallet to swap'}
            </button>
          ) : wrongNetwork ? (
            <button
              className="primary-button"
              onClick={() => switchChain({ chainId: ANVIL_CHAIN_ID })}
              disabled={switching}
            >
              Switch to Anvil
            </button>
          ) : !approved ? (
            <button className="primary-button" disabled>
              Wallet not KYC approved
            </button>
          ) : !oracleHealthy ? (
            <button className="primary-button" disabled>
              Oracle unavailable — swaps blocked
            </button>
          ) : !amountIn || !hasBalance ? (
            <button className="primary-button" disabled>
              Enter a valid amount within your balance
            </button>
          ) : !hasAllowance ? (
            <button className="primary-button" onClick={handleApprove} disabled={writing}>
              {writing && transactionKind === 'approval'
                ? 'Approving...'
                : `Approve ${inputSymbol}`}
            </button>
          ) : (
            <button
              className="primary-button"
              onClick={handleSwap}
              disabled={writing || fee === undefined}
            >
              {writing && transactionKind === 'swap'
                ? 'Confirm in MetaMask...'
                : `Swap ${inputSymbol} for ${outputSymbol}`}
            </button>
          )}

          {notice && <p className="error-message">{notice}</p>}
          {writeError && (
            <p className="error-message">{explainError(writeError)}</p>
          )}
          {transactionMessage && (
            <p className={receipt.isError ? 'error-message' : 'success-message'}>
              {transactionMessage}
            </p>
          )}
          {txHash && (
            <p className="transaction-hash">
              Transaction: {shortAddress(txHash)}
            </p>
          )}

          <p className="disclaimer">
            Local testnet prototype. The displayed output is indicative.
            Swap execution currently uses zero minimum output and is not
            suitable for real funds or production deployment.
          </p>
        </article>

        <div className="side-column">
          <article className="panel">
            <div className="panel-header">
              <div>
                <span className="muted-label">IDENTITY ACCESS</span>
                <h2>KYC verification</h2>
              </div>
              <span className={`status-pill ${approved ? 'status-approved' : 'status-pending'}`}>
                {isConnected ? (approved ? 'APPROVED' : 'NOT APPROVED') : 'DISCONNECTED'}
              </span>
            </div>

            <div className="info-row">
              <span>Connected wallet</span>
              <strong>{shortAddress(address)}</strong>
            </div>
            <div className="info-row">
              <span>Registry approval</span>
              <strong>{isConnected ? (kyc.isLoading ? 'Checking...' : approved ? 'Granted' : 'Not granted') : '—'}</strong>
            </div>
            <div className="info-row">
              <span>Administrator</span>
              <strong>{shortAddress(registryOwner.data)}</strong>
            </div>
            <p className="panel-note">
              This prototype uses an administrator-managed wallet allowlist.
              It does not perform real identity verification.
            </p>
          </article>

          <article className="panel">
            <div className="panel-header">
              <div>
                <span className="muted-label">YOUR ASSETS</span>
                <h2>Wallet balances</h2>
              </div>
            </div>
            <div className="asset-row">
              <span className="asset-icon usd-icon">$</span>
              <div className="asset-name">
                <strong>USD</strong>
                <small>Mock token · TKB</small>
              </div>
              <strong>{isConnected ? formatNumber(usdBalance.data) : '—'}</strong>
            </div>
            <div className="asset-row">
              <span className="asset-icon inr-icon">₹</span>
              <div className="asset-name">
                <strong>INR</strong>
                <small>Mock token · TKA</small>
              </div>
              <strong>{isConnected ? formatNumber(inrBalance.data) : '—'}</strong>
            </div>
          </article>

          {isAdmin && (
            <article className="panel admin-notice">
              <span className="muted-label">ADMIN ACCESS</span>
              <h2>Administrator detected</h2>
              <p>
                Your wallet owns the KYC registry. The wallet approval
                controls will be added in the next stage.
              </p>
            </article>
          )}
        </div>
      </section>

      <footer className="app-footer">
        <span>USD/INR · UNISWAP V4 · LOCAL DEVELOPMENT</span>
        <span>Chain ID 31337 · {shortAddress(CONTRACTS.hook)}</span>
      </footer>
    </main>
  );
}
