import React, { useCallback, useEffect, useState } from 'react';
import { ShoppingCart, AlertCircle, AlertTriangle, X, Search, ChevronRight, ChevronDown, PackagePlus } from 'lucide-react';
import { getSales, getSale, saleNeedsRestock, saleRequestedTotal, saleLineSummary } from '../services/erpSales';
import type { CouponSale, SaleLine, SaleStatus } from '../services/erpSales';
import { ApiError, getErrorMessage } from '../services/api';
import { Modal } from '../components/Modal';

const STATUS_TABS: { label: string; value: SaleStatus | '' }[] = [
  { label: 'Failed', value: 'FAILED' },
  { label: 'Partial', value: 'PARTIALLY_ASSIGNED' },
  { label: 'Assigned', value: 'ASSIGNED' },
  { label: 'Pushed', value: 'PUSHED' },
  { label: 'All', value: '' },
];

const saleBadge = (status: SaleStatus) => {
  switch (status) {
    case 'PUSHED': return 'badge-success';
    case 'ASSIGNED': return 'badge-warning';
    case 'PARTIALLY_ASSIGNED': return 'badge-warning';
    case 'FAILED': return 'badge-danger';
    default: return 'badge-info'; // RECEIVED — transient, shouldn't normally be seen at rest
  }
};

const lineBadge = (status: SaleLine['status']) =>
  status === 'FAILED' ? 'badge-danger' : 'badge-success';

// A background job retries the BC push every 5 min — a sale with assigned lines still not PUSHED
// well past that is worth a glance (likely BC unreachable), even though the coupons are already
// correctly ALLOCATED. Applies to ASSIGNED and PARTIALLY_ASSIGNED alike.
const STUCK_THRESHOLD_MS = 5 * 60 * 1000;
const isStuck = (sale: CouponSale) =>
  (sale.status === 'ASSIGNED' || sale.status === 'PARTIALLY_ASSIGNED') &&
  Date.now() - new Date(sale.assignedAt || sale.receivedAt).getTime() > STUCK_THRESHOLD_MS;

const RestockFlag: React.FC<{ small?: boolean }> = ({ small }) => (
  <span
    style={{ marginLeft: '0.5rem', color: '#f59e0b', fontSize: small ? '0.75rem' : '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
    title="At least one line FAILED — needs a restock and a BC resend, even if the sale is PUSHED"
  >
    <PackagePlus size={small ? 12 : 14} /> restock
  </span>
);

const LineTable: React.FC<{ lines: SaleLine[] }> = ({ lines }) => (
  <table style={{ width: '100%', fontSize: '0.85rem' }}>
    <thead>
      <tr>
        <th>#</th>
        <th>Fuel Type</th>
        <th>Denomination</th>
        <th>Requested</th>
        <th>Whole Books</th>
        <th>Status</th>
        <th>Coupons</th>
      </tr>
    </thead>
    <tbody>
      {lines.map(line => (
        <React.Fragment key={line.id}>
          <tr>
            <td>{line.lineNumber}</td>
            <td>{line.fuelType?.name ?? '—'}</td>
            <td>{line.denomination} L</td>
            <td>{line.requestedCount.toLocaleString()}</td>
            <td>{line.wholeBooks ? 'Yes' : 'No'}</td>
            <td>
              <span className={`badge ${lineBadge(line.status)}`}>{line.status}</span>
            </td>
            <td>{line.couponNumbers.length.toLocaleString()}</td>
          </tr>
          {line.failureReason && (
            <tr>
              <td colSpan={7} style={{ color: 'var(--color-accent-red)', fontSize: '0.8rem', paddingTop: 0 }}>
                {line.failureReason}
              </td>
            </tr>
          )}
        </React.Fragment>
      ))}
    </tbody>
  </table>
);

export const ErpSales: React.FC = () => {
  const [sales, setSales] = useState<CouponSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusTab, setStatusTab] = useState<SaleStatus | ''>('FAILED');
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

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
      setExpanded(new Set());
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

  const toggleExpanded = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

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
          Each document can carry multiple lines (one per fuel type / denomination) — expand a row to see them.
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
                  <th style={{ width: '2rem' }}></th>
                  <th>Document #</th>
                  <th>Site</th>
                  <th>Lines</th>
                  <th>Fuel / Denom</th>
                  <th>Requested</th>
                  <th>Status</th>
                  <th>Received At</th>
                </tr>
              </thead>
              <tbody>
                {sales.map(sale => {
                  const isOpen = expanded.has(sale.id);
                  return (
                    <React.Fragment key={sale.id}>
                      <tr style={{ cursor: 'pointer' }} title="View sale details">
                        <td
                          onClick={(e) => { e.stopPropagation(); toggleExpanded(sale.id); }}
                          style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}
                          title={isOpen ? 'Collapse lines' : 'Expand lines'}
                        >
                          {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </td>
                        <td onClick={() => setDetailSale(sale)} style={{ color: 'var(--color-accent-gold)', fontWeight: 600, fontFamily: 'monospace' }}>{sale.bcDocumentNumber}</td>
                        <td onClick={() => setDetailSale(sale)}>{sale.location?.code ?? '—'}</td>
                        <td onClick={() => setDetailSale(sale)}>{(sale.lines?.length ?? 0).toLocaleString()}</td>
                        <td onClick={() => setDetailSale(sale)} style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>{saleLineSummary(sale)}</td>
                        <td onClick={() => setDetailSale(sale)}>{saleRequestedTotal(sale).toLocaleString()}</td>
                        <td onClick={() => setDetailSale(sale)}>
                          <span className={`badge ${saleBadge(sale.status)}`}>{sale.status}</span>
                          {isStuck(sale) && (
                            <span style={{ marginLeft: '0.5rem', color: '#f59e0b', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }} title="Assigned lines not pushed to BC well past the retry window — BC may be unreachable">
                              <AlertTriangle size={12} /> stuck
                            </span>
                          )}
                          {saleNeedsRestock(sale) && <RestockFlag small />}
                        </td>
                        <td onClick={() => setDetailSale(sale)} style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                          {new Date(sale.receivedAt).toLocaleString()}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={8} style={{ background: 'rgba(255,255,255,0.02)' }}>
                            <LineTable lines={sale.lines || []} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-text-muted)' }}>
            <div style={{ marginBottom: '1rem', color: 'rgba(255,255,255,0.1)' }}>
              <ShoppingCart size={48} style={{ margin: '0 auto' }} />
            </div>
            <h3>No {statusTab ? statusTab.toLowerCase().replace('_', ' ') : ''} sales</h3>
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
          assigned lines resolve themselves once BC is reachable, and a FAILED line needs a restock,
          not a retry, since the shortfall won't change on its own. */}
      {detailSale && (
        <Modal onClose={() => setDetailSale(null)} width="min(760px, 94vw)">
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
                  <AlertTriangle size={12} style={{ verticalAlign: 'middle' }} /> assigned lines not pushed to BC well past the usual retry window — BC may be unreachable
                </span>
              )}
              {saleNeedsRestock(detailSale) && <RestockFlag />}
            </div>
            <div><strong>Site:</strong> {detailSale.location?.name ?? '—'} ({detailSale.location?.code ?? '—'})</div>
            {detailSale.customerReference && <div><strong>Customer reference:</strong> {detailSale.customerReference}</div>}
            <div><strong>Received at:</strong> {new Date(detailSale.receivedAt).toLocaleString()}</div>
            {detailSale.assignedAt && <div><strong>Assigned at:</strong> {new Date(detailSale.assignedAt).toLocaleString()}</div>}
            {detailSale.pushedAt && <div><strong>Pushed to BC at:</strong> {new Date(detailSale.pushedAt).toLocaleString()}</div>}
          </div>

          <h4 style={{ margin: '0 0 0.75rem' }}>Lines ({detailSale.lines?.length ?? 0})</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {(detailSale.lines || []).map(line => (
              <div key={line.id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '0.9rem 1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <strong>Line {line.lineNumber} — {line.fuelType?.name ?? '—'} @ {line.denomination} L</strong>
                  <span className={`badge ${lineBadge(line.status)}`}>{line.status}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem' }}>
                  <div><strong>Requested count:</strong> {line.requestedCount.toLocaleString()}{line.wholeBooks ? ' (whole books)' : ''}</div>
                  {line.failureReason && (
                    <div style={{ padding: '0.6rem 0.8rem', background: 'rgba(208, 76, 87, 0.1)', border: '1px solid var(--color-accent-red)', borderRadius: '6px', color: 'var(--color-accent-red)' }}>
                      <strong>Failure reason:</strong> {line.failureReason}
                    </div>
                  )}
                  {line.couponNumbers.length > 0 && (
                    <div>
                      <strong>Coupon numbers ({line.couponNumbers.length}):</strong>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '0.3rem', maxHeight: '160px', overflowY: 'auto', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', padding: '0.5rem' }}>
                        {line.couponNumbers.join(', ')}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <button className="btn btn-secondary" style={{ width: '100%', marginTop: '1.5rem' }} onClick={() => setDetailSale(null)}>
            Close
          </button>
        </Modal>
      )}
    </div>
  );
};
