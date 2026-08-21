import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, AlertCircle, CheckCircle2, X, PackageCheck, Ban, Zap } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { getRequisition, fulfillRequisition, rejectRequisition, autoFulfillRequisition } from '../services/requisitions';
import type { Requisition } from '../services/requisitions';
import { getBatches } from '../services/batches';
import type { CouponBatch } from '../services/batches';
import { COUPON_STATUSES } from '../services/coupons';
import type { CouponStatus } from '../services/coupons';
import type { ApprovalRequest } from '../services/approvals';
import { getErrorMessage } from '../services/api';
import { Modal } from '../components/Modal';

const requisitionBadge = (status: Requisition['status']) => {
  switch (status) {
    case 'PENDING': return 'badge-warning';
    case 'PARTIALLY_FULFILLED': return 'badge-info';
    case 'FULFILLED': return 'badge-success';
    default: return 'badge-danger'; // REJECTED
  }
};

// Only FULFILLED/REJECTED are terminal — fulfill and reject both remain callable from PARTIALLY_FULFILLED
const isOpenForAction = (status: Requisition['status']) => status === 'PENDING' || status === 'PARTIALLY_FULFILLED';

interface FulfillLineInput {
  fuelTypeId: number;
  fuelTypeName: string;
  denomination: number;
  outstandingBooks: number;
  outstandingLitres: number;
  books: string; // editable — defaults to outstandingBooks, clamped by the user
  litres: string; // editable — defaults to outstandingLitres, clamped by the user
}

export const RequisitionDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const requisitionId = parseInt(id || '', 10);

  const [requisition, setRequisition] = useState<Requisition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fulfill modal
  const [showFulfill, setShowFulfill] = useState(false);
  const [batches, setBatches] = useState<CouponBatch[]>([]);
  const [batchId, setBatchId] = useState('');
  const [fulfillUnit, setFulfillUnit] = useState<'books' | 'litres'>('books');
  const [fulfillLines, setFulfillLines] = useState<FulfillLineInput[]>([]);
  const [fulfillStatus, setFulfillStatus] = useState<CouponStatus | ''>('');
  const [fulfillReason, setFulfillReason] = useState('');
  const [performedBy, setPerformedBy] = useState<string>(() => localStorage.getItem('username') || '');
  const [fulfilling, setFulfilling] = useState(false);
  const [fulfillError, setFulfillError] = useState<string | null>(null);

  // Reject modal
  const [showReject, setShowReject] = useState(false);
  const [decidedBy, setDecidedBy] = useState<string>(() => localStorage.getItem('username') || '');
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  // Auto-fulfill modal
  const [showAutoFulfill, setShowAutoFulfill] = useState(false);
  const [autoFulfillBy, setAutoFulfillBy] = useState<string>(() => localStorage.getItem('username') || '');
  const [autoFulfillReason, setAutoFulfillReason] = useState('');
  const [autoFulfillTargetStatus, setAutoFulfillTargetStatus] = useState<CouponStatus | ''>('');
  const [autoFulfilling, setAutoFulfilling] = useState(false);
  const [autoFulfillError, setAutoFulfillError] = useState<string | null>(null);

  const loadRequisition = useCallback(async () => {
    try {
      const res = await getRequisition(requisitionId);
      setRequisition(res.data);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load requisition.'));
    } finally {
      setLoading(false);
    }
  }, [requisitionId]);

  useEffect(() => {
    if (Number.isNaN(requisitionId)) {
      setError('Invalid requisition ID.');
      setLoading(false);
      return;
    }
    loadRequisition();
  }, [requisitionId, loadRequisition]);

  const openFulfill = () => {
    if (!requisition) return;
    setBatchId('');
    setFulfillUnit('books');
    setFulfillLines(
      requisition.lines
        .filter(l => l.outstandingLitres > 0)
        .map(l => ({
          fuelTypeId: l.fuelType.id,
          fuelTypeName: l.fuelType.name,
          denomination: l.denomination,
          outstandingBooks: l.outstandingBooks,
          outstandingLitres: l.outstandingLitres,
          books: l.outstandingBooks.toString(),
          litres: l.outstandingLitres.toString()
        }))
    );
    setFulfillStatus('');
    setFulfillReason('');
    setFulfillError(null);
    setShowFulfill(true);
    // hasStock=true so the picker only offers batches that actually have coupons to draw from
    getBatches(0, 100, {
      hasStock: true,
      ...(requisition.location ? { locationId: requisition.location.id } : {})
    })
      .then(res => setBatches(res.data?.content || []))
      .catch(() => setBatches([]));
  };

  const updateFulfillLine = (index: number, field: 'books' | 'litres', value: string) => {
    setFulfillLines(prev => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  };

  const selectedBatch = batches.find(b => String(b.id) === batchId);

  const handleFulfill = async () => {
    if (!requisition) return;
    if (!batchId || !selectedBatch) {
      setFulfillError('Select a batch to draw from.');
      return;
    }
    if (!performedBy.trim()) {
      setFulfillError('Performed by is required.');
      return;
    }

    // A batch is always a single fuel type, so only lines matching it can be part of this call —
    // lines of a different fuel type stay outstanding for a fulfill against a different batch.
    const linesToSend = fulfillLines
      .filter(l => l.fuelTypeId === selectedBatch.fuelType.id)
      .map(l => ({
        fuelTypeId: l.fuelTypeId,
        denomination: l.denomination,
        amount: fulfillUnit === 'books' ? (parseInt(l.books, 10) || 0) : (parseFloat(l.litres) || 0),
        outstanding: fulfillUnit === 'books' ? l.outstandingBooks : l.outstandingLitres
      }))
      .filter(l => l.amount > 0);

    const unitLabel = fulfillUnit === 'books' ? 'books' : 'L';
    if (linesToSend.length === 0) {
      setFulfillError(`Enter ${fulfillUnit === 'books' ? 'books' : 'litres'} to issue on at least one ${selectedBatch.fuelType.name} line.`);
      return;
    }
    for (const l of linesToSend) {
      if (l.amount > l.outstanding) {
        setFulfillError(`Cannot issue ${l.amount} ${unitLabel} of ${l.denomination} L coupons — only ${l.outstanding} ${unitLabel} outstanding.`);
        return;
      }
      if (fulfillUnit === 'litres' && l.amount % l.denomination !== 0) {
        setFulfillError(`${l.amount} L doesn't divide evenly into ${l.denomination} L coupons.`);
        return;
      }
    }

    setFulfilling(true);
    setFulfillError(null);
    try {
      const res = await fulfillRequisition(requisition.id, {
        batchId: parseInt(batchId, 10),
        lines: linesToSend.map(({ fuelTypeId, denomination, amount }) => ({
          fuelTypeId,
          denomination,
          ...(fulfillUnit === 'books' ? { books: amount } : { litres: amount })
        })),
        ...(fulfillStatus ? { targetStatus: fulfillStatus } : {}),
        ...(fulfillReason.trim() ? { reason: fulfillReason.trim() } : {}),
        performedBy: performedBy.trim()
      });

      if (res.status === 202) {
        const approval = res.data as ApprovalRequest;
        setSuccess(`Issued for approval — request #${approval.id}. Litres only count as fulfilled once the receiving department confirms receipt.`);
      } else {
        setSuccess('Fulfillment applied.');
      }
      setShowFulfill(false);
      await loadRequisition();
    } catch (err) {
      setFulfillError(getErrorMessage(err, 'Failed to fulfil requisition.'));
    } finally {
      setFulfilling(false);
    }
  };

  const openReject = () => {
    setRejectReason('');
    setRejectError(null);
    setShowReject(true);
  };

  const openAutoFulfill = () => {
    setAutoFulfillReason('');
    setAutoFulfillTargetStatus('');
    setAutoFulfillError(null);
    setShowAutoFulfill(true);
  };

  const handleAutoFulfill = async () => {
    if (!requisition) return;
    if (!autoFulfillBy.trim()) {
      setAutoFulfillError('Your name is required.');
      return;
    }

    setAutoFulfilling(true);
    setAutoFulfillError(null);
    try {
      const res = await autoFulfillRequisition(requisition.id, {
        performedBy: autoFulfillBy.trim(),
        ...(autoFulfillReason.trim() ? { reason: autoFulfillReason.trim() } : {}),
        ...(autoFulfillTargetStatus ? { targetStatus: autoFulfillTargetStatus } : {})
      });
      const transferCount = res.data.transfers?.length || 0;
      setSuccess(
        `Auto-fulfill planned ${transferCount} transfer${transferCount === 1 ? '' : 's'} across the outstanding lines` +
        ' — each waits in Approvals like a manual fulfill.'
      );
      setShowAutoFulfill(false);
      await loadRequisition();
    } catch (err) {
      setAutoFulfillError(getErrorMessage(err, 'Failed to auto-fulfil requisition.'));
    } finally {
      setAutoFulfilling(false);
    }
  };

  const handleReject = async () => {
    if (!requisition) return;
    if (!decidedBy.trim()) {
      setRejectError('Your name is required.');
      return;
    }
    if (!rejectReason.trim()) {
      setRejectError('A reason is required to reject a requisition.');
      return;
    }

    setRejecting(true);
    setRejectError(null);
    try {
      await rejectRequisition(requisition.id, decidedBy.trim(), rejectReason.trim());
      setSuccess('Requisition rejected.');
      setShowReject(false);
      await loadRequisition();
    } catch (err) {
      setRejectError(getErrorMessage(err, 'Failed to reject requisition.'));
    } finally {
      setRejecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-center animate-fade-in" style={{ height: '60vh' }}>
        <div style={{ color: 'var(--color-accent-gold)', fontSize: '1.2rem' }}>Loading requisition...</div>
      </div>
    );
  }

  if (!requisition) {
    return (
      <div className="animate-fade-in">
        <Link to="/requisitions" className="btn btn-secondary" style={{ marginBottom: '2rem', display: 'inline-flex' }}>
          <ArrowLeft size={18} /> Back to Requisitions
        </Link>
        <div style={{ padding: '1rem', background: 'rgba(208, 76, 87, 0.1)', border: '1px solid var(--color-accent-red)', borderRadius: '8px', color: 'var(--color-accent-red)' }}>
          {error || 'Requisition not found.'}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <Link to="/requisitions" className="btn btn-secondary" style={{ marginBottom: '1.5rem', display: 'inline-flex' }}>
        <ArrowLeft size={18} /> Back to Requisitions
      </Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1>Requisition #{requisition.id}</h1>
          <p style={{ margin: 0 }}>
            {requisition.department?.name ?? '—'} → {requisition.location?.name ?? '—'} · <span className={`badge ${requisitionBadge(requisition.status)}`}>{requisition.status.replace('_', ' ')}</span>
          </p>
        </div>
        {isOpenForAction(requisition.status) && (
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={openAutoFulfill}>
              <Zap size={18} /> Auto Fulfill
            </button>
            <button className="btn btn-secondary" onClick={openFulfill}>
              <PackageCheck size={18} /> Fulfill
            </button>
            <button className="btn btn-secondary" style={{ color: 'var(--color-accent-red)' }} onClick={openReject}>
              <Ban size={18} /> Reject
            </button>
          </div>
        )}
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

      <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem' }}>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '1.5rem', color: 'var(--color-accent-gold)' }}>Requisition Information</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>Department</div>
            <div style={{ fontWeight: 500 }}>{requisition.department?.name ?? '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>Location</div>
            <div style={{ fontWeight: 500 }}>{requisition.location?.name ?? '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>Requested By</div>
            <div style={{ fontWeight: 500 }}>{requisition.requestedBy}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>Requested At</div>
            <div style={{ fontWeight: 500 }}>{new Date(requisition.requestedAt).toLocaleString()}</div>
          </div>
          {requisition.decidedBy && (
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>Decided By</div>
              <div style={{ fontWeight: 500 }}>{requisition.decidedBy}{requisition.decidedAt ? ` on ${new Date(requisition.decidedAt).toLocaleString()}` : ''}</div>
            </div>
          )}
          {requisition.decisionReason && (
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>Decision Reason</div>
              <div style={{ fontWeight: 500 }}>{requisition.decisionReason}</div>
            </div>
          )}
        </div>

        <h4 style={{ fontSize: '0.95rem', marginBottom: '0.75rem', color: 'var(--color-text-secondary)' }}>Lines</h4>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Fuel Type</th>
                <th>Denomination</th>
                <th>Requested</th>
                <th>Fulfilled</th>
                <th>Outstanding</th>
                <th>Progress</th>
              </tr>
            </thead>
            <tbody>
              {requisition.lines.map((line, i) => {
                const pct = line.requestedLitres > 0 ? Math.min(100, (line.fulfilledLitres / line.requestedLitres) * 100) : 0;
                return (
                  <tr key={i}>
                    <td>{line.fuelType?.name ?? '—'}</td>
                    <td>{line.denomination} L</td>
                    <td>{line.requestedBooks.toLocaleString()} books <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>({line.requestedLitres.toLocaleString()} L)</span></td>
                    <td>{line.fulfilledBooks.toLocaleString()} books <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>({line.fulfilledLitres.toLocaleString()} L)</span></td>
                    <td>{line.outstandingBooks.toLocaleString()} books <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>({line.outstandingLitres.toLocaleString()} L)</span></td>
                    <td style={{ minWidth: '140px' }}>
                      <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '6px', height: '8px', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, background: pct >= 100 ? '#4ade80' : 'var(--color-accent-gold)', height: '100%' }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '1rem', marginBottom: 0 }}>
          Fulfilled litres only update once the receiving department confirms receipt on the resulting transfer
          (see Approvals) — not at fulfill or approve time.
        </p>
      </div>

      {/* Fulfill modal */}
      {showFulfill && (
        <Modal onClose={() => setShowFulfill(false)} width="min(560px, 92vw)">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: 0, color: 'var(--color-accent-gold)' }}>Fulfill Requisition #{requisition.id}</h3>
            <button className="btn btn-secondary" style={{ padding: '0.3rem 0.5rem' }} onClick={() => setShowFulfill(false)}>
              <X size={16} />
            </button>
          </div>

          {fulfillError && (
            <div style={{ padding: '0.75rem 1rem', background: 'rgba(208, 76, 87, 0.1)', border: '1px solid var(--color-accent-red)', borderRadius: '8px', color: 'var(--color-accent-red)', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
              {fulfillError}
            </div>
          )}

          <div className="input-group">
            <label>Batch to draw from</label>
            <select className="input-field" value={batchId} onChange={(e) => setBatchId(e.target.value)} required>
              <option value="">Select a batch...</option>
              {batches.map(b => (
                <option key={b.id} value={b.id}>{b.batchNumber} — {b.fuelType?.name} ({b.quantity} coupons)</option>
              ))}
            </select>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.4rem' }}>
              Filtered to batches with stock on hand{requisition.location ? ` at ${requisition.location.name}` : ''}.
              A batch is a single fuel type, so only lines of that fuel type below will be issued from it.
            </p>
          </div>

          <div className="input-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label style={{ marginBottom: 0 }}>Issue now, per line</label>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button
                  type="button"
                  className={`btn ${fulfillUnit === 'books' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '0.25rem 0.7rem', fontSize: '0.75rem' }}
                  onClick={() => setFulfillUnit('books')}
                >
                  Books
                </button>
                <button
                  type="button"
                  className={`btn ${fulfillUnit === 'litres' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '0.25rem 0.7rem', fontSize: '0.75rem' }}
                  onClick={() => setFulfillUnit('litres')}
                >
                  Litres
                </button>
              </div>
            </div>
            {fulfillLines.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Nothing outstanding on this requisition.</p>
            ) : fulfillLines.map((line, index) => {
              const mismatched = !!selectedBatch && line.fuelTypeId !== selectedBatch.fuelType.id;
              const outstanding = fulfillUnit === 'books' ? line.outstandingBooks : line.outstandingLitres;
              const unitLabel = fulfillUnit === 'books' ? 'books' : 'L';
              return (
                <div key={`${line.fuelTypeId}-${line.denomination}`} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.6rem', opacity: mismatched ? 0.5 : 1 }}>
                  <span style={{ minWidth: '150px', fontSize: '0.9rem' }}>{line.fuelTypeName} · {line.denomination} L</span>
                  <input
                    type="number"
                    className="input-field"
                    min={0}
                    max={outstanding}
                    step={fulfillUnit === 'books' ? 1 : line.denomination}
                    value={fulfillUnit === 'books' ? line.books : line.litres}
                    onChange={(e) => updateFulfillLine(index, fulfillUnit, e.target.value)}
                    disabled={mismatched}
                  />
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', minWidth: '150px' }}>
                    {mismatched ? 'different fuel type' : `of ${outstanding} ${unitLabel} outstanding`}
                  </span>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="input-group">
              <label>Target Status (optional)</label>
              <select className="input-field" value={fulfillStatus} onChange={(e) => setFulfillStatus(e.target.value as CouponStatus | '')}>
                <option value="">Keep current status</option>
                {COUPON_STATUSES.map(s => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label>Performed By</label>
              <input className="input-field" value={performedBy} onChange={(e) => setPerformedBy(e.target.value)} required />
            </div>
          </div>

          <div className="input-group">
            <label>Reason (optional)</label>
            <input className="input-field" value={fulfillReason} onChange={(e) => setFulfillReason(e.target.value)} maxLength={255} placeholder="Recorded in the audit trail" />
          </div>

          <p style={{ fontSize: '0.8rem', color: '#60a5fa', marginBottom: '0.75rem' }}>
            This moves coupons to the requesting department, so it always defers for supervisor approval,
            followed by the receiving department confirming receipt.
          </p>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
            If the batch has fewer eligible coupons of a denomination than the litres above imply, Stock
            still gets what's available rather than the call failing — the rest stays outstanding on the
            requisition (fails only if the batch has none at all for every line here).
          </p>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleFulfill} disabled={fulfilling || fulfillLines.length === 0 || !batchId}>
              {fulfilling ? 'Submitting...' : 'Issue Coupons'}
            </button>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowFulfill(false)} disabled={fulfilling}>
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* Auto-fulfill modal */}
      {showAutoFulfill && (
        <Modal onClose={() => setShowAutoFulfill(false)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: 0, color: 'var(--color-accent-gold)' }}>Auto Fulfill Requisition #{requisition.id}</h3>
            <button className="btn btn-secondary" style={{ padding: '0.3rem 0.5rem' }} onClick={() => setShowAutoFulfill(false)}>
              <X size={16} />
            </button>
          </div>

          {autoFulfillError && (
            <div style={{ padding: '0.75rem 1rem', background: 'rgba(208, 76, 87, 0.1)', border: '1px solid var(--color-accent-red)', borderRadius: '8px', color: 'var(--color-accent-red)', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
              {autoFulfillError}
            </div>
          )}

          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1.25rem' }}>
            Plans the whole requisition against its outstanding lines automatically, walking each fuel
            type's batches oldest-first — no batch or line picking needed. Always defers for approval,
            one transfer per batch drawn.
          </p>

          <div className="input-group">
            <label>Target Status (optional)</label>
            <select className="input-field" value={autoFulfillTargetStatus} onChange={(e) => setAutoFulfillTargetStatus(e.target.value as CouponStatus | '')}>
              <option value="">Keep current status</option>
              {COUPON_STATUSES.map(s => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
          <div className="input-group">
            <label>Performed By</label>
            <input className="input-field" value={autoFulfillBy} onChange={(e) => setAutoFulfillBy(e.target.value)} required />
          </div>
          <div className="input-group">
            <label>Reason (optional)</label>
            <input className="input-field" value={autoFulfillReason} onChange={(e) => setAutoFulfillReason(e.target.value)} maxLength={255} placeholder="Recorded in the audit trail" />
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleAutoFulfill} disabled={autoFulfilling}>
              {autoFulfilling ? 'Planning...' : 'Auto Fulfill'}
            </button>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowAutoFulfill(false)} disabled={autoFulfilling}>
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* Reject modal */}
      {showReject && (
        <Modal onClose={() => setShowReject(false)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: 0, color: 'var(--color-accent-red)' }}>Reject Requisition #{requisition.id}</h3>
            <button className="btn btn-secondary" style={{ padding: '0.3rem 0.5rem' }} onClick={() => setShowReject(false)}>
              <X size={16} />
            </button>
          </div>

          {rejectError && (
            <div style={{ padding: '0.75rem 1rem', background: 'rgba(208, 76, 87, 0.1)', border: '1px solid var(--color-accent-red)', borderRadius: '8px', color: 'var(--color-accent-red)', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
              {rejectError}
            </div>
          )}

          <div className="input-group">
            <label>Your Name</label>
            <input className="input-field" value={decidedBy} onChange={(e) => setDecidedBy(e.target.value)} required />
          </div>
          <div className="input-group">
            <label>Reason (required)</label>
            <textarea
              className="input-field"
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Why is this requisition being rejected?"
              style={{ resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
            <button
              className="btn btn-primary"
              style={{ flex: 1, background: 'var(--color-accent-red)', color: '#fff' }}
              onClick={handleReject}
              disabled={rejecting}
            >
              {rejecting ? 'Submitting...' : 'Confirm Rejection'}
            </button>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowReject(false)} disabled={rejecting}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};
