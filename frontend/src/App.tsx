
import { useAccount, useConnect, useDisconnect, useReadContract } from 'wagmi';

const HOOK = '0xd3019d7fCB25D820E9d0c34FF3e007AB64bC8aC0';
const POOL_ID = '0x1fed2d71d042a5b6cb408dd5352d3995b9312173e738de73b953f7522bf144db';

const hookAbi = [
  {
    type: 'function',
    name: 'beforeSwapCount',
    stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'afterSwapCount',
    stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;

function shortAddress(address?: string) {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '';
}

export default function App() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  const before = useReadContract({
    address: HOOK,
    abi: hookAbi,
    functionName: 'beforeSwapCount',
    args: [POOL_ID],
    query: { refetchInterval: 3000 },
  });

  const after = useReadContract({
    address: HOOK,
    abi: hookAbi,
    functionName: 'afterSwapCount',
    args: [POOL_ID],
    query: { refetchInterval: 3000 },
  });

  const wrongNetwork = isConnected && chainId !== 31337;

  return (
    <main className="page">
      <nav className="navbar">
        <a className="brand" href="/">
          <span className="brand-mark">U</span>
          <span>uniswap<span className="muted"> / hook lab</span></span>
        </a>

        {isConnected ? (
          <button className="wallet-button" onClick={() => disconnect()}>
            <span className="status-dot" />
            {shortAddress(address)}
            <span className="disconnect-label">Disconnect</span>
          </button>
        ) : (
          <button
            className="wallet-button"
            disabled={isPending}
            onClick={() => {
              const connector = connectors[0];
              if (connector) connect({ connector });
            }}
          >
            {isPending ? 'Connecting...' : 'Connect wallet ↗'}
          </button>
        )}
      </nav>

      <section className="hero">
        <div className="eyebrow"><span className="status-dot" /> LOCAL TESTNET · CHAIN 31337</div>
        <h1>Swap with a little<br /><span>more intelligence.</span></h1>
        <p className="subtitle">
          An experimental Uniswap v4 environment. Explore token swaps
          and watch your custom hook respond on-chain.
        </p>
      </section>

      {wrongNetwork && (
        <div className="notice">
          Your wallet is connected to the wrong network. Switch MetaMask to
          Anvil Local (chain ID 31337).
        </div>
      )}

      <section className="dashboard">
        <div className="panel swap-panel">
          <div className="panel-heading">
            <div>
              <div className="panel-kicker">EXCHANGE</div>
              <h2>Token swap</h2>
            </div>
            <span className="pill">V4 POOL</span>
          </div>

          <div className="token-box">
            <label>You pay</label>
            <div className="token-row">
              <span className="token-icon token-a">A</span>
              <div><strong>TKA</strong><small>Token A</small></div>
              <span className="amount-placeholder">Enter amount</span>
            </div>
          </div>

          <div className="swap-divider"><span>↓</span></div>

          <div className="token-box">
            <label>You receive</label>
            <div className="token-row">
              <span className="token-icon token-b">B</span>
              <div><strong>TKB</strong><small>Token B</small></div>
              <span className="amount-placeholder">—</span>
            </div>
          </div>

          <button className="swap-button" disabled>
            Swap integration coming next
          </button>

          <p className="helper">
            Swaps will be enabled after we connect approvals and verify the
            router call. No transactions are sent from this panel yet.
          </p>
        </div>

        <div className="right-column">
          <div className="panel activity-panel">
            <div className="panel-kicker">ON-CHAIN TELEMETRY</div>
            <h2>Hook activity</h2>
            <p className="panel-description">
              Automatically refreshes every 3 seconds from your local chain.
            </p>

            <div className="metric">
              <div className="metric-icon purple">↗</div>
              <div className="metric-info">
                <span>Before swap</span>
                <small>beforeSwap callback</small>
              </div>
              <strong>{before.isLoading ? '…' : before.data?.toString() ?? '—'}</strong>
            </div>

            <div className="metric">
              <div className="metric-icon green">↘</div>
              <div className="metric-info">
                <span>After swap</span>
                <small>afterSwap callback</small>
              </div>
              <strong>{after.isLoading ? '…' : after.data?.toString() ?? '—'}</strong>
            </div>

            {(before.isError || after.isError) && (
              <p className="error-text">
                Couldn't read the hook. Check that Anvil is running and the
                deployed addresses match this chain.
              </p>
            )}
          </div>

          <div className="panel contract-panel">
            <div className="panel-kicker">DEPLOYMENT</div>
            <h2>Your contracts</h2>
            <div className="contract-row">
              <span>Network</span><strong>Anvil Local</strong>
            </div>
            <div className="contract-row">
              <span>Chain ID</span><strong>31337</strong>
            </div>
            <div className="contract-row">
              <span>Custom hook</span>
              <code title={HOOK}>{shortAddress(HOOK)}</code>
            </div>
            <div className="contract-row">
              <span>Wallet</span>
              <code>{isConnected ? shortAddress(address) : 'Not connected'}</code>
            </div>
            <div className="contract-row">
              <span>Pool ID</span>
              <code title={POOL_ID}>{shortAddress(POOL_ID)}</code>
            </div>
          </div>
        </div>
      </section>

      <footer>
        <span>UNISWAP V4 · EXPERIMENTAL HOOK LAB</span>
        <span>Local development only</span>
      </footer>
    </main>
  );
}
