import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck, AlertCircle, CheckCircle2, X, Printer } from 'lucide-react';
import { getApprovals, getApproval, approveRequest, confirmReceipt, rejectRequest } from '../services/approvals';
import type { ApprovalRequest, ApprovalStatus } from '../services/approvals';
import { ApiError, getErrorMessage } from '../services/api';
import { Modal } from '../components/Modal';
import { generateGrvPdf } from '../utils/grvPdf';
import { hasRole, isCommercialManager } from '../services/auth';

const STATUS_TABS: { label: string; value: ApprovalStatus | '' }[] = [
  { label: 'Pending', value: 'PENDING' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'In Transit', value: 'TRANSFERSHIPMENT' },
  { label: 'Received', value: 'TRANSRECEIPT' },
  { label: 'Rejected', value: 'REJECTED' },
  { label: 'All', value: '' },
];

// TRANSFERSHIPMENT/TRANSRECEIPT are the enum's own names — shown to users as "In Transit"/"Received"
const approvalStatusLabel = (status: ApprovalStatus) => {
  switch (status) {
    case 'TRANSFERSHIPMENT': return 'In Transit';
    case 'TRANSRECEIPT': return 'Received';
    default: return status;
  }
};

const approvalBadge = (status: ApprovalStatus) => {
  switch (status) {
    case 'PENDING': return 'badge-warning';
    case 'APPROVED':
    case 'TRANSRECEIPT': return 'badge-success';
    case 'TRANSFERSHIPMENT': return 'badge-info';
    default: return 'badge-danger'; // REJECTED
  }
};

// TRANSITION requests always carry coupon numbers. TRANSFER requests normally carry a batch +
// position range (re-selected at approval time), but a denomination-pick transfer pins the exact
// coupon numbers it selected at request time — same couponNumbers field, so it takes priority here.
const describeSubject = (req: ApprovalRequest) => {
  const nums = req.couponNumbers || [];
  if (req.requestType === 'TRANSITION' || nums.length > 0) {
    if (nums.length === 0) return '—';
    return nums.length <= 2 ? nums.join(', ') : `${nums[0]} +${nums.length - 1} more`;
  }
  const range = req.rangeStart != null && req.rangeEnd != null ? ` #${req.rangeStart}–${req.rangeEnd}` : '';
  return `${req.batchNumber || '—'}${range}`;
};

// A requisition's transfer is requested by whoever raised the requisition, not the Stocks fulfiller.
const requesterOf = (req: ApprovalRequest) => req.requisitionRequestedBy ?? req.requestedBy;

// A requisition's receipt is confirmed by the Commercial Manager only; other transfers keep the old rules.
const canConfirm = (req: ApprovalRequest) => req.requisitionId == null || isCommercialManager();

export const Approvals: React.FC = () => {
  // A Commercial Manager only receives — no approve/reject — and lands on what's In Transit.
  const canDecide = !isCommercialManager() || hasRole('ADMIN', 'STOCKS_CONTROLLER');
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [statusTab, setStatusTab] = useState<ApprovalStatus | ''>(canDecide ? 'PENDING' : 'TRANSFERSHIPMENT');
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);

  // Detail modal (read-only view opened by clicking a row)
  const [detailRequest, setDetailRequest] = useState<ApprovalRequest | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [printingGrvId, setPrintingGrvId] = useState<number | null>(null);

  // Decision modal
  const [selected, setSelected] = useState<ApprovalRequest | null>(null);
  const [decision, setDecision] = useState<'approve' | 'reject' | 'confirm-receipt'>('approve');
  const [actorName, setActorName] = useState<string>(() => localStorage.getItem('username') || '');
  const [reason, setReason] = useState('');
  const [deciding, setDeciding] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getApprovals(page, 20, statusTab || undefined);
      setRequests(res.data?.content || []);
      setTotalPages(res.data?.totalPages || 0);
      setTotalElements(res.data?.totalElements || 0);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load approval requests.'));
    } finally {
      setLoading(false);
    }
  }, [page, statusTab]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  useEffect(() => {
    setPage(0);
  }, [statusTab]);

  const openDetail = (req: ApprovalRequest) => {
    // Show the row's data immediately, then refresh in the background in case it
    // was decided elsewhere since the list last loaded.
    setDetailRequest(req);
    setDetailError(null);
    setDetailLoading(true);
    getApproval(req.id)
      .then(res => setDetailRequest(res.data))
      .catch(err => setDetailError(getErrorMessage(err, 'Failed to load the latest request details.')))
      .finally(() => setDetailLoading(false));
  };

  const closeDetail = () => setDetailRequest(null);

  const handlePrintGrv = async (req: ApprovalRequest) => {
    // Open the tab synchronously, inside the click handler — opening it after the await below
    // would no longer count as a user gesture to most browsers and get popup-blocked.
    const previewWindow = window.open('', '_blank');
    setPrintingGrvId(req.id);
    setError(null);
    try {
      const url = await generateGrvPdf(req);
      if (previewWindow) {
        previewWindow.location.href = url;
      } else {
        setError('The GRV preview was blocked by the browser — allow pop-ups for this site and try again.');
      }
    } catch (err) {
      previewWindow?.close();
      setError(getErrorMessage(err, 'Failed to generate the GRV.'));
    } finally {
      setPrintingGrvId(null);
    }
  };

  const openDecision = (req: ApprovalRequest, kind: 'approve' | 'reject' | 'confirm-receipt') => {
    setDetailRequest(null);
    setSelected(req);
    setDecision(kind);
    setReason('');
    setModalError(null);
  };

  const closeModal = () => {
    setSelected(null);
    setModalError(null);
  };

  const handleDecide = async () => {
    if (!selected) return;
    if (!actorName.trim()) {
      setModalError(decision === 'confirm-receipt' ? 'The receiving name is required.' : 'Your name is required.');
      return;
    }
    if (decision === 'reject' && !reason.trim()) {
      setModalError('A reason is required to reject a request.');
      return;
    }

    setDeciding(true);
    setModalError(null);
    try {
      if (decision === 'approve') {
        const res = await approveRequest(selected.id, actorName.trim(), reason.trim() || undefined);
        const moved = res.data.transferredCoupons?.length || 0;
        const noteInTransit = res.data.status === 'TRANSFERSHIPMENT'
          ? ' Coupons are now in transit — the receiving department must confirm receipt to finish the move.'
          : '';
        setSuccess(`Request #${selected.id} approved — ${moved > 0 ? `${moved} coupon${moved === 1 ? '' : 's'} moved.` : 'the move has been executed.'}${noteInTransit}`);
      } else if (decision === 'confirm-receipt') {
        const res = await confirmReceipt(selected.id, actorName.trim(), reason.trim() || undefined);
        const moved = res.data.transferredCoupons?.length || 0;
        setSuccess(`Request #${selected.id} — receipt confirmed. ${moved} coupon${moved === 1 ? '' : 's'} moved to their new location/department.`);
      } else {
        await rejectRequest(selected.id, actorName.trim(), reason.trim());
        setSuccess(`Request #${selected.id} rejected.`);
      }
      closeModal();
      await loadRequests();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Either already decided/received by someone else, wrong status for this action, or
        // coupon state drifted and the move is no longer legal. Surface the message; a refresh
        // shows the current state.
        setModalError(`${err.message} — refreshing may show the latest state.`);
      } else {
        setModalError(getErrorMessage(err, 'Failed to submit decision.'));
      }
    } finally {
      setDeciding(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '2rem' }}>
        <h1>Approvals</h1>
        <p style={{ margin: 0 }}>Location and department moves wait here until a supervisor decides.</p>
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

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {STATUS_TABS.map(tab => (
          <button
            key={tab.label}
            className={`btn ${statusTab === tab.value ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.5rem 1.2rem', fontSize: '0.9rem' }}
            onClick={() => setStatusTab(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-accent-gold)' }}>Loading requests...</div>
        ) : requests.length > 0 ? (
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Type</th>
                  <th>Subject</th>
                  <th>Target</th>
                  <th>Requested By</th>
                  <th>Requested At</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map(req => (
                  <tr key={req.id} onClick={() => openDetail(req)} style={{ cursor: 'pointer' }} title="View request details">
                    <td style={{ color: 'var(--color-accent-gold)', fontWeight: 600 }}>{req.id}</td>
                    <td>{req.requestType}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{describeSubject(req)}</td>
                    <td style={{ fontSize: '0.85rem' }}>
                      {[
                        req.targetStatus ? `→ ${req.targetStatus.replace('_', ' ')}` : null,
                        req.toLocation ? `Loc: ${req.toLocation.name}` : null,
                        req.toDepartment ? `Dept: ${req.toDepartment.name}` : null,
                      ].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td>{requesterOf(req)}</td>
                    <td style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                      {new Date(req.requestedAt).toLocaleString()}
                    </td>
                    <td>
                      <span className={`badge ${approvalBadge(req.status)}`} title={req.decisionReason || undefined}>
                        {approvalStatusLabel(req.status)}
                      </span>
                      {req.status !== 'PENDING' && req.decidedBy && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
                          by {req.decidedBy}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      {req.status === 'PENDING' && canDecide ? (
                        <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                          <button className="btn btn-primary" style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem' }} onClick={() => openDecision(req, 'approve')}>
                            Approve
                          </button>
                          <button className="btn btn-secondary" style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem', color: 'var(--color-accent-red)' }} onClick={() => openDecision(req, 'reject')}>
                            Reject
                          </button>
                        </div>
                      ) : req.status === 'TRANSFERSHIPMENT' && canConfirm(req) ? (
                        <button className="btn btn-primary" style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem' }} onClick={() => openDecision(req, 'confirm-receipt')}>
                          Confirm Receipt
                        </button>
                      ) : req.status === 'TRANSRECEIPT' ? (
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem' }}
                          onClick={() => handlePrintGrv(req)}
                          disabled={printingGrvId === req.id}
                          title="Print Goods Received Voucher"
                        >
                          <Printer size={14} /> {printingGrvId === req.id ? 'Preparing...' : 'Print GRV'}
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                          {req.decisionReason || '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-text-muted)' }}>
            <div style={{ marginBottom: '1rem', color: 'rgba(255,255,255,0.1)' }}>
              <ClipboardCheck size={48} style={{ margin: '0 auto' }} />
            </div>
            <h3>No {statusTab ? approvalStatusLabel(statusTab).toLowerCase() : ''} requests</h3>
            <p>Location and department moves submitted for approval will appear here.</p>
          </div>
        )}
      </div>

      <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
        <span style={{ color: 'var(--color-text-muted)' }}>{totalElements.toLocaleString()} request{totalElements === 1 ? '' : 's'} total</span>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem' }} disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>
            Previous
          </button>
          <span style={{ margin: '0 0.5rem', color: 'var(--color-text-muted)' }}>Page {page + 1} of {totalPages || 1}</span>
          <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem' }} disabled={page >= totalPages - 1} onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}>
            Next
          </button>
        </div>
      </div>

      {/* Detail modal (read-only, opened by clicking a row) */}
      {detailRequest && (
        <Modal onClose={closeDetail}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, color: 'var(--color-accent-gold)' }}>
                Request #{detailRequest.id}
                {detailLoading && <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 400, marginLeft: '0.6rem' }}>refreshing…</span>}
              </h3>
              <button className="btn btn-secondary" style={{ padding: '0.3rem 0.5rem' }} onClick={closeDetail}>
                <X size={16} />
              </button>
            </div>

            {detailError && (
              <div style={{ padding: '0.75rem 1rem', background: 'rgba(208, 76, 87, 0.1)', border: '1px solid var(--color-accent-red)', borderRadius: '8px', color: 'var(--color-accent-red)', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
                {detailError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              <div>
                <strong>Status:</strong>{' '}
                <span className={`badge ${approvalBadge(detailRequest.status)}`}>{approvalStatusLabel(detailRequest.status)}</span>
              </div>
              <div><strong>Type:</strong> {detailRequest.requestType}</div>
              <div>
                <strong>Coupons:</strong> {detailRequest.count.toLocaleString()}
                {detailRequest.denominations.length > 0 && (
                  <span style={{ color: 'var(--color-text-muted)' }}>
                    {' '}({detailRequest.denominations.map(d => `${d.count}×${d.denomination}L${d.books != null ? ` (${d.books} bk)` : ''}`).join(', ')})
                  </span>
                )}
              </div>
              <div><strong>Subject:</strong> <span style={{ fontFamily: 'monospace' }}>{describeSubject(detailRequest)}</span></div>
              {detailRequest.couponNumbers && detailRequest.couponNumbers.length > 1 && (
                <div>
                  <strong>Coupon numbers:</strong>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '0.3rem', maxHeight: '120px', overflowY: 'auto', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', padding: '0.5rem' }}>
                    {detailRequest.couponNumbers.join(', ')}
                  </div>
                </div>
              )}
              {detailRequest.targetStatus && <div><strong>Target status:</strong> {detailRequest.targetStatus.replace('_', ' ')}</div>}
              {detailRequest.toLocation && <div><strong>To location:</strong> {detailRequest.toLocation.name} ({detailRequest.toLocation.code})</div>}
              {detailRequest.toDepartment && <div><strong>To department:</strong> {detailRequest.toDepartment.name} ({detailRequest.toDepartment.code})</div>}
              {detailRequest.reason && <div><strong>Reason:</strong> {detailRequest.reason}</div>}
              {detailRequest.requisitionId != null && <div><strong>Raised from:</strong> Requisition #{detailRequest.requisitionId}</div>}
              <div><strong>Requested by:</strong> {requesterOf(detailRequest)} on {new Date(detailRequest.requestedAt).toLocaleString()}</div>
              {detailRequest.requisitionRequestedBy && <div><strong>Fulfilled by:</strong> {detailRequest.requestedBy}</div>}
              {detailRequest.status !== 'PENDING' && (
                <>
                  <div><strong>Decided by:</strong> {detailRequest.decidedBy || '—'}{detailRequest.decidedAt ? ` on ${new Date(detailRequest.decidedAt).toLocaleString()}` : ''}</div>
                  {detailRequest.decisionReason && <div><strong>Decision reason:</strong> {detailRequest.decisionReason}</div>}
                </>
              )}
              {detailRequest.receivedBy && (
                <div><strong>Received by:</strong> {detailRequest.receivedBy}{detailRequest.receivedAt ? ` on ${new Date(detailRequest.receivedAt).toLocaleString()}` : ''}</div>
              )}
              {detailRequest.status === 'TRANSFERSHIPMENT' && (
                <p style={{ fontSize: '0.8rem', color: '#60a5fa', margin: 0 }}>
                  Coupons are off Stock's books but not yet at the receiving department — the receiving
                  department must confirm receipt before they land in the new location/department.
                </p>
              )}
              {(detailRequest.status === 'APPROVED' || detailRequest.status === 'TRANSRECEIPT') && detailRequest.transferredCoupons.length > 0 && (
                <div>
                  <strong>Coupons moved ({detailRequest.transferredCoupons.length}):</strong>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '0.3rem', maxHeight: '120px', overflowY: 'auto', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', padding: '0.5rem' }}>
                    {detailRequest.transferredCoupons.map(c => c.couponNumber).join(', ')}
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              {detailRequest.status === 'PENDING' && canDecide ? (
                <>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => openDecision(detailRequest, 'approve')}>
                    Approve
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ flex: 1, color: 'var(--color-accent-red)' }}
                    onClick={() => openDecision(detailRequest, 'reject')}
                  >
                    Reject
                  </button>
                </>
              ) : detailRequest.status === 'TRANSFERSHIPMENT' && canConfirm(detailRequest) ? (
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => openDecision(detailRequest, 'confirm-receipt')}>
                  Confirm Receipt
                </button>
              ) : detailRequest.status === 'TRANSRECEIPT' ? (
                <>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    onClick={() => handlePrintGrv(detailRequest)}
                    disabled={printingGrvId === detailRequest.id}
                  >
                    <Printer size={16} /> {printingGrvId === detailRequest.id ? 'Preparing...' : 'Print GRV'}
                  </button>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={closeDetail}>
                    Close
                  </button>
                </>
              ) : (
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={closeDetail}>
                  Close
                </button>
              )}
            </div>
        </Modal>
      )}

      {/* Decision modal */}
      {selected && (
        <Modal onClose={closeModal}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, color: decision === 'reject' ? 'var(--color-accent-red)' : 'var(--color-accent-gold)' }}>
                {decision === 'approve' ? 'Approve' : decision === 'confirm-receipt' ? 'Confirm Receipt for' : 'Reject'} Request #{selected.id}
              </h3>
              <button className="btn btn-secondary" style={{ padding: '0.3rem 0.5rem' }} onClick={closeModal}>
                <X size={16} />
              </button>
            </div>

            <div style={{ fontSize: '0.9rem', marginBottom: '1.5rem', color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <div><strong>Type:</strong> {selected.requestType}</div>
              <div><strong>Subject:</strong> <span style={{ fontFamily: 'monospace' }}>{describeSubject(selected)}</span></div>
              {selected.targetStatus && <div><strong>Target status:</strong> {selected.targetStatus.replace('_', ' ')}</div>}
              {selected.toLocation && <div><strong>To location:</strong> {selected.toLocation.name}</div>}
              {selected.toDepartment && <div><strong>To department:</strong> {selected.toDepartment.name}</div>}
              <div><strong>Requested by:</strong> {requesterOf(selected)} on {new Date(selected.requestedAt).toLocaleString()}</div>
            </div>

            {modalError && (
              <div style={{ padding: '0.75rem 1rem', background: 'rgba(208, 76, 87, 0.1)', border: '1px solid var(--color-accent-red)', borderRadius: '8px', color: 'var(--color-accent-red)', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
                {modalError}
              </div>
            )}

            <div className="input-group">
              <label>{decision === 'confirm-receipt' ? 'Received By' : 'Your Name'}</label>
              <input className="input-field" value={actorName} onChange={(e) => setActorName(e.target.value)} required />
            </div>
            <div className="input-group">
              <label>Reason {decision === 'reject' ? '(required)' : '(optional)'}</label>
              <textarea
                className="input-field"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={decision === 'reject' ? 'Why is this request being rejected?' : 'Optional note'}
                style={{ resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1, ...(decision === 'reject' ? { background: 'var(--color-accent-red)', color: '#fff' } : {}) }}
                onClick={handleDecide}
                disabled={deciding}
              >
                {deciding ? 'Submitting...' : decision === 'approve' ? 'Confirm Approval' : decision === 'confirm-receipt' ? 'Confirm Receipt' : 'Confirm Rejection'}
              </button>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={closeModal} disabled={deciding}>
                Cancel
              </button>
            </div>
        </Modal>
      )}
    </div>
  );
};
