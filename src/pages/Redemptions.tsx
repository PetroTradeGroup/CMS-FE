import React, { useCallback, useEffect, useState } from 'react';
import { Receipt, AlertCircle, CheckCircle2, X, QrCode, BarChart3, Building2, User, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getRedemptions, postRedemption } from '../services/redemptions';
import type { RedemptionRequest, RedemptionStatus } from '../services/redemptions';
import { getLocations } from '../services/locations';
import type { LocationDetail } from '../services/locations';
import { ApiError, getErrorMessage } from '../services/api';
import { hasRole, getLocationCode } from '../services/auth';
import { Modal } from '../components/Modal';
import { VerifyCouponModal } from '../components/VerifyCouponModal';

const STATUS_TABS: { label: string; value: RedemptionStatus | '' }[] = [
  { label: 'Pending', value: 'PENDING' },
  { label: 'Posted', value: 'POSTED' },
  { label: 'All', value: '' },
];

const redemptionBadge = (status: RedemptionStatus) => (status === 'POSTED' ? 'badge-success' : 'badge-warning');

const describeCoupons = (req: RedemptionRequest) => {
  const nums = req.couponNumbers || [];
  if (nums.length === 0) return '—';
  return nums.length <= 2 ? nums.join(', ') : `${nums[0]} +${nums.length - 1} more`;
};

export const Redemptions: React.FC = () => {
  // The backend scopes this list by the caller's token: an Attendant sees only redemptions they
  // submitted at their station; a Team Leader sees every redemption at their station; Admin/Stocks
  // see all sites. This banner just makes that scope visible — it isn't what enforces it.
  // An Admin isn't bound to a station (no locationCode claim), so they may narrow the list to one
  // site via the picker below; everyone else is locked to their own station server-side.
  const stationCode = getLocationCode();
  const isTeamLeader = hasRole('TEAM_LEADER');
  const canPickSite = hasRole('ADMIN') && !stationCode;

  const [requests, setRequests] = useState<RedemptionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [statusTab, setStatusTab] = useState<RedemptionStatus | ''>('PENDING');
  const [locationId, setLocationId] = useState<number | ''>('');
  const [sites, setSites] = useState<LocationDetail[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);

  const scopeLabel = stationCode
    ? isTeamLeader
      ? `All redemptions at ${stationCode} — every attendant`
      : `Your redemptions at ${stationCode}`
    : canPickSite && locationId
      ? sites.find((s) => s.id === Number(locationId))?.name ?? 'Selected site'
      : 'All sites';

  // Only Admin gets the picker — pull the active sites once for it.
  useEffect(() => {
    if (!canPickSite) return;
    getLocations(true).then((res) => setSites(res.data || [])).catch(() => setSites([]));
  }, [canPickSite]);

  // Detail modal (read-only view opened by clicking a row)
  const [detailRequest, setDetailRequest] = useState<RedemptionRequest | null>(null);

  // Verify Coupon modal — a standalone lookup against /redemptions/scan and
  // /redemptions/scan/{couponNumber}, independent of the row list above.
  const [verifyOpen, setVerifyOpen] = useState(false);

  // Post modal
  const [selected, setSelected] = useState<RedemptionRequest | null>(null);
  const [documentNumber, setDocumentNumber] = useState('');
  const [performedBy, setPerformedBy] = useState<string>(() => localStorage.getItem('username') || '');
  const [posting, setPosting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getRedemptions(
        page,
        20,
        statusTab || undefined,
        canPickSite && locationId ? Number(locationId) : undefined,
      );
      setRequests(res.data?.content || []);
      setTotalPages(res.data?.totalPages || 0);
      setTotalElements(res.data?.totalElements || 0);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load redemption requests.'));
    } finally {
      setLoading(false);
    }
  }, [page, statusTab, canPickSite, locationId]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  useEffect(() => {
    setPage(0);
  }, [statusTab, locationId]);

  // Redemptions now auto-post to the ERP in the background after submit, so a PENDING row can
  // flip to POSTED without anyone touching this page — poll quietly while any are visible. Manual
  // Post stays available as the documented fallback if the background job is still retrying.
  const hasPending = requests.some(r => r.status === 'PENDING');
  useEffect(() => {
    if (!hasPending) return;
    const interval = setInterval(() => {
      getRedemptions(page, 20, statusTab || undefined, canPickSite && locationId ? Number(locationId) : undefined)
        .then(res => {
          setRequests(res.data?.content || []);
          setTotalPages(res.data?.totalPages || 0);
          setTotalElements(res.data?.totalElements || 0);
        })
        .catch(() => { /* silent — retried on the next tick */ });
    }, 10000);
    return () => clearInterval(interval);
  }, [hasPending, page, statusTab, canPickSite, locationId]);

  const openDetail = (req: RedemptionRequest) => setDetailRequest(req);
  const closeDetail = () => setDetailRequest(null);

  const openPost = (req: RedemptionRequest) => {
    setDetailRequest(null);
    setSelected(req);
    setDocumentNumber('');
    setModalError(null);
  };

  const closeModal = () => {
    setSelected(null);
    setModalError(null);
  };

  const handlePost = async () => {
    if (!selected) return;
    if (!performedBy.trim()) {
      setModalError('Your name is required.');
      return;
    }
    if (!documentNumber.trim()) {
      setModalError('The ERP document number is required.');
      return;
    }

    setPosting(true);
    setModalError(null);
    try {
      await postRedemption(selected.id, { documentNumber: documentNumber.trim(), performedBy: performedBy.trim() });
      setSuccess(`Request #${selected.id} posted — coupons moved to REDEEMED.`);
      closeModal();
      await loadRequests();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setModalError(`${err.message} — refreshing may show the latest state.`);
      } else {
        setModalError(getErrorMessage(err, 'Failed to post redemption.'));
      }
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1>Redemptions</h1>
          <p style={{ margin: 0 }}>Coupons submitted for redemption wait here until the coupon section posts them against an ERP document.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-secondary" onClick={() => setVerifyOpen(true)}>
            <ShieldCheck size={18} /> Verify Coupon
          </button>
          <Link to="/redemptions/summary" className="btn btn-secondary">
            <BarChart3 size={18} /> Summary
          </Link>
          {/* Redeeming is Attendant / Team Leader only — the backend 403s everyone else. */}
          {hasRole('ATTENDANT', 'TEAM_LEADER') && (
            <Link to="/redemptions/scan" className="btn btn-primary">
              <QrCode size={18} /> Scan &amp; Redeem
            </Link>
          )}
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem',
        padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)',
        borderRadius: '8px', color: 'var(--color-text-secondary)', fontSize: '0.9rem',
      }}>
        {stationCode && !isTeamLeader ? <User size={16} /> : <Building2 size={16} />}
        <span>Showing: <strong>{scopeLabel}</strong></span>
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

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
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
        {hasPending && (
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            Auto-refreshing while pending redemptions post to the ERP...
          </span>
        )}
        {canPickSite && (
          <select
            className="input-field"
            style={{ width: 'auto', marginLeft: 'auto', padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
            value={locationId}
            onChange={(e) => setLocationId(e.target.value ? Number(e.target.value) : '')}
            aria-label="Filter redemptions by site"
          >
            <option value="">All sites</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
            ))}
          </select>
        )}
      </div>

      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-accent-gold)' }}>Loading redemptions...</div>
        ) : requests.length > 0 ? (
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Coupons</th>
                  <th>Site</th>
                  <th>Requested By</th>
                  <th>Requested At</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map(req => (
                  <tr key={req.id} onClick={() => openDetail(req)} style={{ cursor: 'pointer' }} title="View redemption details">
                    <td style={{ color: 'var(--color-accent-gold)', fontWeight: 600 }}>{req.id}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                      {req.count} — {describeCoupons(req)}
                    </td>
                    <td>{req.toLocation?.name ?? '—'}</td>
                    <td>{req.requestedBy}</td>
                    <td style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                      {new Date(req.requestedAt).toLocaleString()}
                    </td>
                    <td>
                      <span className={`badge ${redemptionBadge(req.status)}`}>{req.status}</span>
                      {req.status === 'POSTED' && req.documentNumber && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
                          {req.documentNumber}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      {req.status === 'PENDING' ? (
                        <button className="btn btn-primary" style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem' }} onClick={() => openPost(req)}>
                          Post
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                          by {req.decidedBy || '—'}
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
              <Receipt size={48} style={{ margin: '0 auto' }} />
            </div>
            <h3>No {statusTab ? statusTab.toLowerCase() : ''} redemptions</h3>
            <p>Coupons submitted from the scan &amp; redeem screen will appear here.</p>
          </div>
        )}
      </div>

      <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
        <span style={{ color: 'var(--color-text-muted)' }}>{totalElements.toLocaleString()} redemption{totalElements === 1 ? '' : 's'} total</span>
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
            <h3 style={{ margin: 0, color: 'var(--color-accent-gold)' }}>Redemption #{detailRequest.id}</h3>
            <button className="btn btn-secondary" style={{ padding: '0.3rem 0.5rem' }} onClick={closeDetail}>
              <X size={16} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            <div>
              <strong>Status:</strong>{' '}
              <span className={`badge ${redemptionBadge(detailRequest.status)}`}>{detailRequest.status}</span>
            </div>
            <div>
              <strong>Coupons:</strong> {detailRequest.count.toLocaleString()}
              {detailRequest.denominations.length > 0 && (
                <span style={{ color: 'var(--color-text-muted)' }}>
                  {' '}({detailRequest.denominations.map(d => `${d.count}×${d.denomination}L${d.books != null ? ` (${d.books} bk)` : ''}`).join(', ')})
                </span>
              )}
            </div>
            {detailRequest.couponNumbers.length > 0 && (
              <div>
                <strong>Coupon numbers:</strong>
                <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '0.3rem', maxHeight: '120px', overflowY: 'auto', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', padding: '0.5rem' }}>
                  {detailRequest.couponNumbers.join(', ')}
                </div>
              </div>
            )}
            <div><strong>Site:</strong> {detailRequest.toLocation?.name ?? '—'} ({detailRequest.toLocation?.code ?? '—'})</div>
            <div><strong>Vehicle:</strong> {detailRequest.carRegistrationNumber || '—'}</div>
            <div><strong>Requested by:</strong> {detailRequest.requestedBy} on {new Date(detailRequest.requestedAt).toLocaleString()}</div>
            {detailRequest.status === 'POSTED' && (
              <>
                <div><strong>Posted by:</strong> {detailRequest.decidedBy || '—'}{detailRequest.decidedAt ? ` on ${new Date(detailRequest.decidedAt).toLocaleString()}` : ''}</div>
                <div><strong>Document number:</strong> {detailRequest.documentNumber || '—'}</div>
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            {detailRequest.status === 'PENDING' ? (
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => openPost(detailRequest)}>
                Post
              </button>
            ) : (
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={closeDetail}>
                Close
              </button>
            )}
          </div>
        </Modal>
      )}

      {/* Post modal */}
      {selected && (
        <Modal onClose={closeModal}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: 0, color: 'var(--color-accent-gold)' }}>Post Redemption #{selected.id}</h3>
            <button className="btn btn-secondary" style={{ padding: '0.3rem 0.5rem' }} onClick={closeModal}>
              <X size={16} />
            </button>
          </div>

          <div style={{ fontSize: '0.9rem', marginBottom: '1.5rem', color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <div><strong>Coupons:</strong> {selected.count} — <span style={{ fontFamily: 'monospace' }}>{describeCoupons(selected)}</span></div>
            <div><strong>Site:</strong> {selected.toLocation?.name ?? '—'}</div>
            <div><strong>Vehicle:</strong> {selected.carRegistrationNumber || '—'}</div>
            <div><strong>Requested by:</strong> {selected.requestedBy} on {new Date(selected.requestedAt).toLocaleString()}</div>
          </div>

          {modalError && (
            <div style={{ padding: '0.75rem 1rem', background: 'rgba(208, 76, 87, 0.1)', border: '1px solid var(--color-accent-red)', borderRadius: '8px', color: 'var(--color-accent-red)', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
              {modalError}
            </div>
          )}

          <div className="input-group">
            <label>ERP Document Number</label>
            <input className="input-field" value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} placeholder="e.g. ERP-2026-00967" required />
          </div>
          <div className="input-group">
            <label>Your Name</label>
            <input className="input-field" value={performedBy} onChange={(e) => setPerformedBy(e.target.value)} required />
          </div>

          <p style={{ fontSize: '0.8rem', color: '#60a5fa', marginBottom: '1rem' }}>
            Posting re-validates every coupon and moves it from ALLOCATED to REDEEMED.
          </p>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handlePost} disabled={posting}>
              {posting ? 'Submitting...' : 'Confirm Post'}
            </button>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={closeModal} disabled={posting}>
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {verifyOpen && <VerifyCouponModal onClose={() => setVerifyOpen(false)} />}
    </div>
  );
};
