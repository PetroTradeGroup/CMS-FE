import React, { useCallback, useEffect, useState } from 'react';
import { ShoppingCart, AlertCircle, AlertTriangle, X, Search } from 'lucide-react';
import { getSales, getSale } from '../services/erpSales';
import type { CouponSale, SaleStatus } from '../services/erpSales';
import { ApiError, getErrorMessage } from '../services/api';
import { Modal } from '../components/Modal';

const STATUS_TABS: { label: string; value: SaleStatus | '' }[] = [
  { label: 'Failed', value: 'FAILED' },
  { label: 'Assigned', value: 'ASSIGNED' },
  { label: 'Pushed', value: 'PUSHED' },
  { label: 'All', value: '' },
];

const saleBadge = (status: SaleStatus) => {
  switch (status) {
    case 'PUSHED': return 'badge-success';
    case 'ASSIGNED': return 'badge-warning';
    case 'FAILED': return 'badge-danger';
    default: return 'badge-info'; // RECEIVED — transient, shouldn't normally be seen at rest
  }
};

// A background job retries the BC push every 5 min — a row still ASSIGNED well past that is
// worth a glance (likely BC unreachable), even though the coupons are already correctly ALLOCATED.
const STUCK_THRESHOLD_MS = 5 * 60 * 1000;
const isStuck = (sale: CouponSale) =>
  sale.status === 'ASSIGNED' && Date.now() - new Date(sale.assignedAt || sale.receivedAt).getTime() > STUCK_THRESHOLD_MS;

export const ErpSales: React.FC = () => {
  const [sales, setSales] = useState<CouponSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusTab, setStatusTab] = useState<SaleStatus | ''>('FAILED');
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);

  const [detailSale, setDetailSale] = useState<CouponSale | null>(null);

  // Document-number lookup — the path a support person actually has in hand from a BC
  // screenshot or ops ticket, rather than paging through the list.
  const [lookupNumber, setLookupNumber] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const loadSales = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getSales(page, 20, statusTab || undefined);
      setSales(res.data?.content || []);
      setTotalPages(res.data?.totalPages || 0);
      setTotalElements(res.data?.totalElements || 0);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load the ERP sales log.'));
    } finally {
      setLoading(false);
    }
  }, [page, statusTab]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  useEffect(() => {
    setPage(0);
  }, [statusTab]);

  const handleLookup = async () => {
    const docNumber = lookupNumber.trim();
    if (!docNumber) return;

    setLookingUp(true);
    setLookupError(null);
    try {
      const res = await getSale(docNumber);
      setDetailSale(res.data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setLookupError(`No sale found for document number "${docNumber}".`);
      } else {
        setLookupError(getErrorMessage(err, 'Lookup failed.'));
      }
    } finally {
      setLookingUp(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '2rem' }}>
        <h1>ERP Sales Log</h1>
        <p style={{ margin: 0 }}>
          Read-only — Business Central pushes sales in and the CMS assigns serials and confirms back automatically.
          There's nothing to submit here; this view is just visibility into what's come in, what's stuck, and what failed.
        </p>
      </div>

      {error && (
        <div style={{ padding: '1rem', background: 'rgba(208, 76, 87, 0.1)', border: '1px solid var(--color-accent-red)', borderRadius: '8px', color: 'var(--color-accent-red)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertCircle size={20} /> {error}
        </div>
      )}

      <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.4rem', display: 'block' }}>
          Look up by BC document number
        </label>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <input
            className="input-field"
            placeholder="e.g. SI-004512"
            value={lookupNumber}
            onChange={(e) => setLookupNumber(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleLookup(); }}
            style={{ maxWidth: '320px' }}
          />
          <button className="btn btn-secondary" onClick={handleLookup} disabled={lookingUp || !lookupNumber.trim()}>
            <Search size={16} /> {lookingUp ? 'Looking up...' : 'Look Up'}
          </button>
        </div>
        {lookupError && (
          <p style={{ color: 'var(--color-accent-red)', fontSize: '0.85rem', marginTop: '0.6rem', marginBottom: 0 }}>{lookupError}</p>
        )}
      </div>

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
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-accent-gold)' }}>Loading sales...</div>
        ) : sales.length > 0 ? (
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Document #</th>
                  <th>Site</th>
                  <th>Fuel Type</th>
                  <th>Denomination</th>
                  <th>Requested</th>
                  <th>Status</th>
                  <th>Received At</th>
                </tr>
              </thead>
              <tbody>
                {sales.map(sale => (
                  <tr key={sale.id} onClick={() => setDetailSale(sale)} style={{ cursor: 'pointer' }} title="View sale details">
                    <td style={{ color: 'var(--color-accent-gold)', fontWeight: 600, fontFamily: 'monospace' }}>{sale.bcDocumentNumber}</td>
                    <td>{sale.location?.code ?? '—'}</td>
                    <td>{sale.fuelType?.name ?? '—'}</td>
                    <td>{sale.denomination} L</td>
                    <td>{sale.requestedCount.toLocaleString()}</td>
                    <td>
                      <span className={`badge ${saleBadge(sale.status)}`}>{sale.status}</span>
                      {isStuck(sale) && (
                        <span style={{ marginLeft: '0.5rem', color: '#f59e0b', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }} title="Still ASSIGNED well past the retry window — BC may be unreachable">
                          <AlertTriangle size={12} /> stuck
                        </span>
                      )}
                    </td>
                    <td style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                      {new Date(sale.receivedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-text-muted)' }}>
            <div style={{ marginBottom: '1rem', color: 'rgba(255,255,255,0.1)' }}>
              <ShoppingCart size={48} style={{ margin: '0 auto' }} />
            </div>
            <h3>No {statusTab ? statusTab.toLowerCase() : ''} sales</h3>
            <p>Sales pushed in from Business Central will appear here.</p>
          </div>
        )}
      </div>

      <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
        <span style={{ color: 'var(--color-text-muted)' }}>{totalElements.toLocaleString()} sale{totalElements === 1 ? '' : 's'} total</span>
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

      {/* Detail modal — read-only, no actions. Retries/reassignment aren't exposed by the API:
          an ASSIGNED row resolves itself once BC is reachable, and a FAILED row needs a restock,
          not a retry, since the shortfall won't change on its own. */}
      {detailSale && (
        <Modal onClose={() => setDetailSale(null)} width="min(640px, 92vw)">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: 0, color: 'var(--color-accent-gold)', fontFamily: 'monospace' }}>{detailSale.bcDocumentNumber}</h3>
            <button className="btn btn-secondary" style={{ padding: '0.3rem 0.5rem' }} onClick={() => setDetailSale(null)}>
              <X size={16} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            <div>
              <strong>Status:</strong>{' '}
              <span className={`badge ${saleBadge(detailSale.status)}`}>{detailSale.status}</span>
              {isStuck(detailSale) && (
                <span style={{ marginLeft: '0.5rem', color: '#f59e0b', fontSize: '0.8rem' }}>
                  <AlertTriangle size={12} style={{ verticalAlign: 'middle' }} /> still assigned well past the usual retry window — BC may be unreachable
                </span>
              )}
            </div>
            <div><strong>Site:</strong> {detailSale.location?.name ?? '—'} ({detailSale.location?.code ?? '—'})</div>
            <div><strong>Fuel type:</strong> {detailSale.fuelType?.name ?? '—'}</div>
            <div><strong>Denomination:</strong> {detailSale.denomination} L</div>
            <div><strong>Requested count:</strong> {detailSale.requestedCount.toLocaleString()}</div>
            {detailSale.customerReference && <div><strong>Customer reference:</strong> {detailSale.customerReference}</div>}
            {detailSale.failureReason && (
              <div style={{ padding: '0.75rem 1rem', background: 'rgba(208, 76, 87, 0.1)', border: '1px solid var(--color-accent-red)', borderRadius: '8px', color: 'var(--color-accent-red)' }}>
                <strong>Failure reason:</strong> {detailSale.failureReason}
              </div>
            )}
            <div><strong>Received at:</strong> {new Date(detailSale.receivedAt).toLocaleString()}</div>
            {detailSale.assignedAt && <div><strong>Assigned at:</strong> {new Date(detailSale.assignedAt).toLocaleString()}</div>}
            {detailSale.pushedAt && <div><strong>Pushed to BC at:</strong> {new Date(detailSale.pushedAt).toLocaleString()}</div>}
            {detailSale.couponNumbers.length > 0 && (
              <div>
                <strong>Coupon numbers ({detailSale.couponNumbers.length}):</strong>
                <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '0.3rem', maxHeight: '160px', overflowY: 'auto', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', padding: '0.5rem' }}>
                  {detailSale.couponNumbers.join(', ')}
                </div>
              </div>
            )}
          </div>

          <button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => setDetailSale(null)}>
            Close
          </button>
        </Modal>
      )}
    </div>
  );
};
