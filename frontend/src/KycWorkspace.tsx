import { useEffect, useState } from 'react';
import { usePublicClient, useReadContract, useWriteContract } from 'wagmi';
import { isAddress, parseAbiItem, type Address } from 'viem';
import './KycWorkspace.css';

const REGISTRY = '0x2d6574C11a80e563adcC5705B1EB1044A0C12147' as Address;
const DECISION_LOG = '0xCe00FdeCC946Bd08864E1103AE0A0deFD45E0B69' as Address;
const DEPLOYMENT_BLOCK = 96589731n;
const registryAbi = [
  { type: 'function', name: 'isApproved', stateMutability: 'view', inputs: [{ name: 'wallet', type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'approveWallet', stateMutability: 'nonpayable', inputs: [{ name: 'wallet', type: 'address' }], outputs: [] },
  { type: 'function', name: 'revokeWallet', stateMutability: 'nonpayable', inputs: [{ name: 'wallet', type: 'address' }], outputs: [] },
] as const;
const decisionAbi = [
  { type: 'function', name: 'recordApproval', stateMutability: 'nonpayable', inputs: [{ name: 'wallet', type: 'address' }], outputs: [] },
  { type: 'function', name: 'recordRejection', stateMutability: 'nonpayable', inputs: [{ name: 'wallet', type: 'address' }, { name: 'reason', type: 'string' }], outputs: [] },
  { type: 'function', name: 'recordRevocation', stateMutability: 'nonpayable', inputs: [{ name: 'wallet', type: 'address' }, { name: 'reason', type: 'string' }], outputs: [] },
  { type: 'function', name: 'getRecord', stateMutability: 'view', inputs: [{ name: 'wallet', type: 'address' }], outputs: [{ name: 'decision', type: 'uint8' }, { name: 'reason', type: 'string' }, { name: 'admin', type: 'address' }, { name: 'updatedAt', type: 'uint64' }] },
  { type: 'event', name: 'KycDecisionRecorded', anonymous: false, inputs: [{ indexed: true, name: 'wallet', type: 'address' }, { indexed: true, name: 'admin', type: 'address' }, { indexed: false, name: 'decision', type: 'uint8' }, { indexed: false, name: 'reason', type: 'string' }, { indexed: false, name: 'timestamp', type: 'uint256' }] },
] as const;
const decisionEvent = parseAbiItem('event KycDecisionRecorded(address indexed wallet,address indexed admin,uint8 decision,string reason,uint256 timestamp)');
const labels = ['No decision recorded', 'Approved', 'Rejected', 'Revoked'];

type Props = { address?: Address; isAdmin: boolean; lastError?: string };
type HistoryItem = { decision: number; reason: string; admin: string; timestamp: bigint; tx: string };

export default function KycWorkspace({ address, isAdmin, lastError = '' }: Props) {
  const client = usePublicClient();
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [errorExplanation, setErrorExplanation] = useState('');

  const selectedWallet = isAddress(target) ? target as Address : undefined;
  const walletToInspect = selectedWallet ?? address;
  const approval = useReadContract({ address: REGISTRY, abi: registryAbi, functionName: 'isApproved', args: walletToInspect ? [walletToInspect] : undefined, query: { enabled: !!walletToInspect, refetchInterval: 5000 } });
  const record = useReadContract({ address: DECISION_LOG, abi: decisionAbi, functionName: 'getRecord', args: walletToInspect ? [walletToInspect] : undefined, query: { enabled: !!walletToInspect, refetchInterval: 5000 } });
  const registryWriter = useWriteContract();
  const logWriter = useWriteContract();

  useEffect(() => {
    let cancelled = false;
    async function loadHistory() {
      if (!client || !walletToInspect) { setHistory([]); return; }
      try {
        const logs = await client.getLogs({ address: DECISION_LOG, event: decisionEvent, args: { wallet: walletToInspect }, fromBlock: DEPLOYMENT_BLOCK, toBlock: 'latest' });
        const items = logs.map((log) => ({
          decision: Number(log.args.decision ?? 0),
          reason: log.args.reason ?? '',
          admin: log.args.admin ?? '',
          timestamp: log.args.timestamp ?? 0n,
          tx: log.transactionHash ?? '',
        })).sort((a, b) => Number(b.timestamp - a.timestamp));
        if (!cancelled) { setHistory(items); setHistoryError(''); }
      } catch (e) {
        if (!cancelled) setHistoryError(e instanceof Error ? e.message : 'Could not load event history.');
      }
    }
    void loadHistory();
    return () => { cancelled = true; };
  }, [client, walletToInspect, record.data]);

  const decision = Number(record.data?.[0] ?? 0);
  const recordedReason = record.data?.[1] ?? '';
  const recordAdmin = record.data?.[2] ?? '';
  const recordTime = record.data?.[3] ?? 0n;
  const approved = approval.data === true;
  const canSubmit = !!selectedWallet && reason.trim().length > 0 && reason.trim().length <= 500 && !busy;

  async function sendAdminAction(action: 'approve' | 'reject' | 'revoke') {
    if (!isAdmin || !selectedWallet || !client) return;
    if (action !== 'approve' && !reason.trim()) { setFeedback('Enter the actual administrative reason first.'); return; }
    if (reason.trim().length > 500) { setFeedback('Reason must be 500 characters or fewer.'); return; }
    setBusy(true); setFeedback('');
    try {
      if (action === 'approve') {
        if (!approved) {
          const hash = await registryWriter.writeContractAsync({ address: REGISTRY, abi: registryAbi, functionName: 'approveWallet', args: [selectedWallet] });
          await client.waitForTransactionReceipt({ hash });
        }
        const hash = await logWriter.writeContractAsync({ address: DECISION_LOG, abi: decisionAbi, functionName: 'recordApproval', args: [selectedWallet] });
        await client.waitForTransactionReceipt({ hash });
        setFeedback('Approval and decision record confirmed on-chain.');
      } else if (action === 'reject') {
        if (approved) {
          const hash = await registryWriter.writeContractAsync({ address: REGISTRY, abi: registryAbi, functionName: 'revokeWallet', args: [selectedWallet] });
          await client.waitForTransactionReceipt({ hash });
        }
        const hash = await logWriter.writeContractAsync({ address: DECISION_LOG, abi: decisionAbi, functionName: 'recordRejection', args: [selectedWallet, reason.trim()] });
        await client.waitForTransactionReceipt({ hash });
        setFeedback('Rejection reason recorded on-chain.');
      } else {
        if (approved) {
          const hash = await registryWriter.writeContractAsync({ address: REGISTRY, abi: registryAbi, functionName: 'revokeWallet', args: [selectedWallet] });
          await client.waitForTransactionReceipt({ hash });
        }
        const hash = await logWriter.writeContractAsync({ address: DECISION_LOG, abi: decisionAbi, functionName: 'recordRevocation', args: [selectedWallet, reason.trim()] });
        await client.waitForTransactionReceipt({ hash });
        setFeedback('Revocation and reason confirmed on-chain.');
      }
      setReason('');
      await approval.refetch(); await record.refetch();
    } catch (e) {
      setFeedback(`Action did not fully complete: ${e instanceof Error ? e.message.slice(0, 220) : String(e).slice(0, 220)}. Check both contracts before retrying; the registry and decision log use separate transactions.`);
    } finally { setBusy(false); }
  }

  async function askAi(kind: 'kyc' | 'swap-error') {
    setAiBusy(true); setAiText('');
    try {
      const payload = kind === 'kyc'
        ? { type: 'kyc', wallet: walletToInspect, decision: labels[decision] ?? 'Unknown', approvedOnRegistry: approved, recordedReason, admin: recordAdmin, updatedAt: recordTime.toString() }
        : { type: 'swap-error', wallet: address, error: lastError };
      const response = await fetch('/api/ai/explain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'AI explanation service unavailable.');
      setAiText(data.explanation || 'No explanation was returned.');
    } catch (e) { setAiText(e instanceof Error ? e.message : 'Could not get an AI explanation.'); }
    finally { setAiBusy(false); }
  }

  async function explainSwapError() {
    setErrorExplanation(''); setAiBusy(true);
    try {
      const response = await fetch('/api/ai/explain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'swap-error', wallet: address, error: lastError }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'AI explanation service unavailable.');
      setErrorExplanation(data.explanation || 'No explanation was returned.');
    } catch (e) { setErrorExplanation(e instanceof Error ? e.message : 'Could not get an AI explanation.'); }
    finally { setAiBusy(false); }
  }

  return <section className="kyc-workspace">
    <article className="panel kyc-record-panel">
      <div className="panel-header"><div><span className="muted-label">ON-CHAIN DECISION</span><h2>KYC decision details</h2></div><span className={`status-pill ${approved ? 'status-approved' : 'status-pending'}`}>{approved ? 'APPROVED' : 'NOT APPROVED'}</span></div>
      <div className="info-row"><span>Wallet being inspected</span><strong>{walletToInspect ? `${walletToInspect.slice(0, 6)}...${walletToInspect.slice(-4)}` : 'Connect wallet'}</strong></div>
      <div className="info-row"><span>Recorded decision</span><strong>{labels[decision] ?? 'Unknown'}</strong></div>
      <div className="info-row"><span>Recorded by</span><strong>{recordAdmin ? `${recordAdmin.slice(0, 6)}...${recordAdmin.slice(-4)}` : '—'}</strong></div>
      <div className="info-row"><span>Last updated</span><strong>{recordTime > 0n ? new Date(Number(recordTime) * 1000).toLocaleString() : '—'}</strong></div>
      {recordedReason && <div className="kyc-reason"><span className="muted-label">ADMIN-RECORDED REASON</span><p>{recordedReason}</p></div>}
      <button className="primary-button kyc-ai-button" disabled={!walletToInspect || aiBusy || (decision === 0 && !approved)} onClick={() => void askAi('kyc')}>{aiBusy ? 'Generating explanation...' : 'Explain this KYC decision with AI'}</button>
      {aiText && <div className="kyc-ai-output"><span className="muted-label">AI EXPLANATION</span><p>{aiText}</p></div>}
      <p className="panel-note">AI explains the on-chain decision and the administrator's recorded reason. It does not verify identity or make approval decisions.</p>
    </article>

    {isAdmin && <article className="panel kyc-admin-panel">
      <div className="panel-header"><div><span className="muted-label">ADMIN ACCESS</span><h2>Manage wallet access</h2></div><span className="panel-badge">REGISTRY OWNER</span></div>
      <label className="kyc-field-label">Wallet address</label>
      <input className="kyc-field" value={target} onChange={(e) => setTarget(e.target.value.trim())} placeholder="0x..." spellCheck={false} />
      <label className="kyc-field-label">Reason (required for rejection / revocation)</label>
      <textarea className="kyc-field kyc-textarea" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Enter the actual administrative reason. Do not enter personal identity documents or sensitive KYC data." />
      <div className="kyc-char-count">{reason.length}/500 characters</div>
      <div className="kyc-action-grid">
        <button className="primary-button" disabled={!selectedWallet || busy} onClick={() => void sendAdminAction('approve')}>{busy ? 'Processing...' : 'Approve wallet'}</button>
        <button className="kyc-secondary-button" disabled={!canSubmit} onClick={() => void sendAdminAction('reject')}>Reject with reason</button>
        <button className="kyc-danger-button" disabled={!canSubmit} onClick={() => void sendAdminAction('revoke')}>Revoke access</button>
      </div>
      {selectedWallet && <div className="kyc-target-status">Current registry status: <strong>{approval.isLoading ? 'Checking...' : approved ? 'Approved' : 'Not approved'}</strong></div>}
      {feedback && <p className={feedback.startsWith('Action did not') ? 'error-message' : 'success-message'}>{feedback}</p>}
      <p className="panel-note">Each action may require two MetaMask confirmations because registry access and decision reasons are stored in separate contracts. If the second transaction fails, check the registry and decision log independently before retrying.</p>
    </article>}

    <article className="panel kyc-history-panel">
      <div className="panel-header"><div><span className="muted-label">EVENT LOG</span><h2>KYC decision history</h2></div></div>
      {!walletToInspect ? <p className="panel-note">Connect a wallet or enter a wallet address above as administrator.</p> : history.length === 0 ? <p className="panel-note">No decision events found for this wallet yet.</p> : <div className="kyc-history-list">{history.map((item, i) => <div className="kyc-history-item" key={`${item.tx}-${i}`}><div><strong>{labels[item.decision] ?? 'Unknown decision'}</strong><small>{new Date(Number(item.timestamp) * 1000).toLocaleString()} · Admin {item.admin.slice(0, 6)}...{item.admin.slice(-4)}</small>{item.reason && <p>{item.reason}</p>}</div><a href={`https://polygonscan.com/tx/${item.tx}`} target="_blank" rel="noreferrer">Transaction ↗</a></div>)}</div>}
      {historyError && <p className="panel-note">History lookup: {historyError}</p>}
    </article>

    {lastError && <article className="panel kyc-error-panel"><div className="panel-header"><div><span className="muted-label">TRANSACTION DIAGNOSTICS</span><h2>Understand the swap error</h2></div></div><p className="error-message">{lastError}</p><button className="kyc-secondary-button" disabled={aiBusy} onClick={() => void explainSwapError()}>{aiBusy ? 'Analysing...' : 'Explain error with AI'}</button>{errorExplanation && <div className="kyc-ai-output"><p>{errorExplanation}</p></div>}</article>}
  </section>;
}
