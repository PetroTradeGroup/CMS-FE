import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, ArrowUpRight, PackageCheck, Printer, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { getRequisitions, REQUISITION_STATUS_LABELS } from '../services/requisitions';
import type { Requisition, RequisitionStatus } from '../services/requisitions';
import { getApprovals, confirmReceipt } from '../services/approvals';
import type { ApprovalRequest } from '../services/approvals';
import { getErrorMessage } from '../services/api';
import { getUsername } from '../services/auth';
import { previewVoucher } from '../utils/grvPdf';
import type { VoucherKind } from '../utils/grvPdf';
import { Modal } from '../components/Modal';

// Sales Clerk's home: their requisitions, plus the issues Stocks has sent against them — to confirm
// receipt of (GRV) and reprint vouchers for. Relies on the backend scoping GET /requisitions and
// GET /approvals to the caller for SALES_CLERK — this page doesn't filter.
const STATUSES: { label: string; value: RequisitionStatus; color: string }[] = [
  { label: 'Awaiting Commercial', value: 'PENDING', color: '#CEA620' },
  { label: 'Awaiting Stocks', value: 'COMMERCIAL_APPROVED', color: '#CEA620' },
  { label: 'Approved', value: 'APPROVED', color: '#60a5fa' },
  { label: 'Partially Fulfilled', value: 'PARTIALLY_FULFILLED', color: '#60a5fa' },
  { label: 'Fulfilled', value: 'FULFILLED', color: '#4ade80' },
  { label: 'Rejected', value: 'REJECTED', color: '#D04C57' },
];

export const SalesDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [recent, setRecent] = useState<Requisition[]>([]);
  const [loading, setLoading] = useState(true);

  // Issues from Stocks: in transit (to receive) and recently received
  const [inTransit, setInTransit] = useState<ApprovalRequest[]>([]);
  const [received, setReceived] = useState<ApprovalRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [receiving, setReceiving] = useState<ApprovalRequest | null>(null);
  const [receiveNote, setReceiveNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all(STATUSES.map(s =>
      getRequisitions(0, 1, s.value).then(r => [s.value, r.data?.totalElements ?? 0] as const).catch(() => [s.value, 0] as const)
    )).then(entries => setCounts(Object.fromEntries(entries)));
    getApprovals(0, 20, 'TRANSFERSHIPMENT')
      .then(r => setInTransit(r.data?.content || []))
      .catch(() => setInTransit([]));
    getApprovals(0, 5, 'TRANSRECEIPT')
      .then(r => setReceived(r.data?.content || []))
      .catch(() => setReceived([]));
    return getRequisitions(0, 5)
      .then(r => setRecent(r.data?.content || []))
      .catch(() => setRecent([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openReceive = (approval: ApprovalRequest) => {
    setReceiving(approval);
    setReceiveNote('');
    setModalError(null);
  };

  const handleConfirm = async () => {
    if (!receiving) return;
    const receivedBy = getUsername() || localStorage.getItem('username') || '';
    if (!receivedBy) {
      setModalError('Could not determine your username — sign in again.');
      return;
    }
    setConfirming(true);
    setModalError(null);
    try {
      await confirmReceipt(receiving.id, receivedBy, receiveNote.trim() || undefined);
      setSuccess(`Receipt confirmed for GIV #${receiving.id} — print the GRV from Recent Receipts below.`);
      setReceiving(null);
      await load();
    } catch (err) {
      setModalError(getErrorMessage(err, 'Failed to confirm receipt.'));
    } finally {
      setConfirming(false);
    }
  };

  const handlePrint = async (approval: ApprovalRequest, kind: VoucherKind) => {
    setError(null);
    try {
      await previewVoucher(approval, kind);
    } catch (err) {
      setError(getErrorMessage(err, `Failed to generate the ${kind}.`));
    }
  };

  const totalBooks = (approval: ApprovalRequest) => approval.denominations.length > 0
    ? approval.denominations.map(d => d.count % 100 === 0
        ? `${d.count / 100} × ${d.denomination} L`
        : `${d.count} coupons × ${d.denomination} L`).join(', ')
    : `${approval.count} coupons`;

  const issueTable = (rows: ApprovalRequest[], kind: 'transit' | 'received') => (
    <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
      <table>
        <thead>
          <tr>
            <th>GIV #</th>
            <th>Requisition</th>
            <th>Books</th>
            <th>Issued By</th>
            <th>{kind === 'transit' ? 'Issued At' : 'Received At'}</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(a => (
            <tr key={a.id}>
              <td style={{ color: 'var(--color-accent-gold)', fontWeight: 600 }}>{a.id}</td>
              <td>{a.requisitionId != null ? <Link to={`/requisitions/${a.requisitionId}`}>#{a.requisitionId}</Link> : '—'}</td>
              <td>{totalBooks(a)}</td>
              <td>{a.requestedBy}</td>
              <td style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                {new Date((kind === 'transit' ? a.decidedAt : a.receivedAt) ?? a.requestedAt).toLocaleString()}
              </td>
              <td style={{ textAlign: 'right' }}>
                <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                  {kind === 'transit' && (
                    <button className="btn btn-primary" style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem' }} onClick={() => openReceive(a)}>
                      <PackageCheck size={14} /> Confirm Receipt
                    </button>
                  )}
                  <button className="btn btn-secondary" style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem' }} onClick={() => handlePrint(a, 'GIV')}>
                    <Printer size={14} /> GIV
                  </button>
                  {kind === 'received' && (
                    <button className="btn btn-secondary" style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem' }} onClick={() => handlePrint(a, 'GRV')}>
                      <Printer size={14} /> GRV
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1>My Requisitions</h1>
          <p style={{ margin: 0 }}>What you've requested and where it stands.</p>
        </div>
        <Link to="/requisitions" className="btn btn-primary">
          <Plus size={18} /> New Requisition
        </Link>
      </div>

      {error && (
        <div style={{ padding: '1rem', background: 'rgba(208, 76, 87, 0.1)', border: '1px solid var(--color-accent-red)', borderRadius: '8px', color: 'var(--color-accent-red)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertCircle size={20} /> {error}
        </div>
      )}
      {success && (
        <div style={{ padding: '1rem', background: 'rgba(74, 222, 128, 0.1)', border: '1px solid #4ade80', borderRadius: '8px', color: '#4ade80', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle2 size={20} /> {success}
        </div>
      )}

      <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', margin: '0 0 0.25rem' }}>To Receive</h2>
        <p style={{ margin: '0 0 1.25rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
          Coupons Stocks has issued against your requisitions. Count them against the GIV, then confirm receipt.
        </p>
        {inTransit.length > 0 ? issueTable(inTransit, 'transit') : (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-muted)' }}>Nothing in transit to you.</div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
        {STATUSES.map(s => (
          <div key={s.value} className="glass-panel" style={{ padding: '1.5rem' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>{s.label}</p>
            <h2 style={{ margin: '0.5rem 0 0', color: s.color }}>{(counts[s.value] ?? 0).toLocaleString()}</h2>
          </div>
        ))}
      </div>

      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Recent Requisitions</h2>
          <Link to="/requisitions" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.9rem' }}>
            View all <ArrowUpRight size={16} />
          </Link>
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-accent-gold)' }}>Loading...</div>
        ) : recent.length > 0 ? (
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Department</th>
                  <th>Location</th>
                  <th>Books</th>
                  <th>Requested At</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(req => (
                  <tr key={req.id} onClick={() => navigate(`/requisitions/${req.id}`)} style={{ cursor: 'pointer' }}>
                    <td style={{ color: 'var(--color-accent-gold)', fontWeight: 600 }}>{req.id}</td>
                    <td>{req.department?.name ?? '—'}</td>
                    <td>{req.location?.name ?? '—'}</td>
                    <td>{req.lines.reduce((sum, l) => sum + l.requestedBooks, 0).toLocaleString()}</td>
                    <td style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>{new Date(req.requestedAt).toLocaleString()}</td>
                    <td>{REQUISITION_STATUS_LABELS[req.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>No requisitions raised yet.</div>
        )}
      </div>

      <div className="glass-panel" style={{ padding: '1.5rem', marginTop: '2.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', margin: '0 0 1.5rem' }}>Recent Receipts</h2>
        {received.length > 0 ? issueTable(received, 'received') : (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-muted)' }}>No receipts confirmed yet.</div>
        )}
      </div>

      {receiving && (
        <Modal onClose={() => setReceiving(null)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: 0, color: 'var(--color-accent-gold)' }}>Confirm Receipt — GIV #{receiving.id}</h3>
            <button className="btn btn-secondary" style={{ padding: '0.3rem 0.5rem' }} onClick={() => setReceiving(null)}>
              <X size={16} />
            </button>
          </div>

          {modalError && (
            <div style={{ padding: '0.75rem 1rem', background: 'rgba(208, 76, 87, 0.1)', border: '1px solid var(--color-accent-red)', borderRadius: '8px', color: 'var(--color-accent-red)', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
              {modalError}
            </div>
          )}

          <p style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
            {totalBooks(receiving)} for requisition #{receiving.requisitionId}, issued by {receiving.requestedBy}.
            Confirm only once you've counted what physically arrived — this records the GRV and credits your requisition.
          </p>

          <div className="input-group">
            <label>Note (optional)</label>
            <input className="input-field" value={receiveNote} onChange={(e) => setReceiveNote(e.target.value)} maxLength={255} placeholder="e.g. counted at the Commercial office" />
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleConfirm} disabled={confirming}>
              {confirming ? 'Confirming...' : 'Confirm Receipt'}
            </button>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setReceiving(null)} disabled={confirming}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};
