import React, { useEffect, useState } from 'react';
import { Clock, FileSpreadsheet, RefreshCw, X } from 'lucide-react';
import { getRedemptionLog, getRedemptionLogTotals, getRedemption, exportRedemptionLog } from '../services/redemptions';
import type { RedemptionLogEntry, RedemptionLogParams, RedemptionLogTotals, RedemptionRequest } from '../services/redemptions';
import { getErrorMessage } from '../services/api';
import { Modal } from './Modal';

const REFRESH_MS = 30_000;
const PAGE_SIZE = 50;

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const time = (iso: string) => new Date(iso).toLocaleString(undefined, {
  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
});
const fullTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

/**
 * Every redemption in the report's range, newest first, with its exact time — refreshed every 30s so
 * the page shows redemptions as they happen. Totals cover the whole range, not just the page; click a
 * row for its full detail (every coupon). The backend scopes it: a Team Leader sees their site, an
 * Attendant only their own, back office (Rep, Admin, Stocks Controller) whatever the filters say.
 */
export const RedemptionLog: React.FC<{ params: RedemptionLogParams; showSite: boolean }> = ({ params, showSite }) => {
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<RedemptionLogEntry[] | null>(null);
  const [totals, setTotals] = useState<RedemptionLogTotals | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [tick, setTick] = useState(0);
  const [selected, setSelected] = useState<RedemptionLogEntry | null>(null);
  const [detail, setDetail] = useState<RedemptionRequest | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const key = JSON.stringify(params);
  const [prevKey, setPrevKey] = useState(key);
  if (prevKey !== key) { // filters changed → back to the first page (adjusted during render, not in an effect)
    setPrevKey(key);
    setPage(0);
  }

  useEffect(() => {
    getRedemptionLog(JSON.parse(key) as RedemptionLogParams, page, PAGE_SIZE)
      .then((res) => {
        setRows(res.data?.content ?? []);
        setTotalPages(res.data?.totalPages ?? 0);
        setTotalElements(res.data?.totalElements ?? 0);
        setUpdatedAt(new Date());
        setError(null);
      })
      .catch((err) => setError(getErrorMessage(err, 'Failed to load the redemption log.')));
  }, [key, page, tick]);

  // Totals don't change with the page, only with the filters (and the live refresh).
  useEffect(() => {
    getRedemptionLogTotals(JSON.parse(key) as RedemptionLogParams)
      .then((res) => setTotals(res.data ?? null))
      .catch(() => setTotals(null));
  }, [key, tick]);

  // Live: re-fetch on a timer while the tab is visible.
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) setTick((t) => t + 1); }, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const openDetail = (r: RedemptionLogEntry) => {
    setSelected(r);
    setDetail(null);
    setDetailError(null);
    getRedemption(r.id)
      .then((res) => setDetail(res.data))
      .catch((err) => setDetailError(getErrorMessage(err, 'Failed to load the redemption.')));
  };

  const runExport = async () => {
    setExporting(true);
    try {
      await exportRedemptionLog(params);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to export the log.'));
    } finally {
      setExporting(false);
    }
  };

  const stat = (label: string, value: string) => (
    <div style={{ padding: '0.6rem 1rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.04)', minWidth: 130 }}>
      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{label}</div>
      <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>{value}</div>
    </div>
  );

  return (
    <div style={{ marginTop: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Clock size={16} /> Redemption log
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', fontWeight: 500, color: '#4ade80', marginLeft: '0.5rem' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 8px #4ade80' }} /> Live
          </span>
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {updatedAt && <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Updated {updatedAt.toLocaleTimeString()}</span>}
          <button className="btn btn-secondary" style={{ padding: '0.35rem 0.6rem' }} onClick={() => setTick((t) => t + 1)} title="Refresh now">
            <RefreshCw size={14} />
          </button>
          <button className="btn btn-secondary" onClick={runExport} disabled={exporting || totalElements === 0}>
            <FileSpreadsheet size={16} /> {exporting ? 'Exporting…' : 'Excel'}
          </button>
        </div>
      </div>

      {totals && (
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem', alignItems: 'center' }}>
          {stat('Redemptions', fmt(totals.redemptions))}
          {stat('Coupons', fmt(totals.coupons))}
          {stat('Litres', fmt(totals.litres))}
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Whole range, all pages · includes redemptions still pending ERP posting</span>
        </div>
      )}

      {error && <div style={{ color: 'var(--color-accent-red)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{error}</div>}

      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        {rows === null ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-accent-gold)' }}>Loading log…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>No redemptions in this range.</div>
        ) : (
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  {showSite && <th>Site</th>}
                  <th>Attendant</th>
                  <th>Vehicle</th>
                  <th>Fuel</th>
                  <th style={{ textAlign: 'right' }}>Coupons</th>
                  <th style={{ textAlign: 'right' }}>Litres</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => openDetail(r)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{time(r.redeemedAt)}</td>
                    {showSite && (
                      <td>
                        <div>{r.locationCode} — {r.locationName}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{r.companyName}</div>
                      </td>
                    )}
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.attendantName ?? r.attendantUsername}</div>
                      {r.attendantName && <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{r.attendantUsername}</div>}
                    </td>
                    <td style={{ fontFamily: 'monospace' }}>{r.carRegistrationNumber ?? '—'}</td>
                    <td>{r.fuelTypes.join(', ') || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(r.couponCount)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(r.litres)}</td>
                    <td>
                      <span className={`badge ${r.status === 'POSTED' ? 'badge-success' : 'badge-warning'}`}>{r.status}</span>
                      {r.documentNumber && <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{r.documentNumber}</div>}
                    </td>
                    <td>
                      <button className="btn btn-secondary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                        onClick={(e) => { e.stopPropagation(); openDetail(r); }}>Details</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalElements > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem', fontSize: '0.85rem' }}>
          <span style={{ color: 'var(--color-text-muted)' }}>
            {totalElements.toLocaleString()} redemptions · showing {page * PAGE_SIZE + 1}–{Math.min(totalElements, (page + 1) * PAGE_SIZE)}
          </span>
          {totalPages > 1 && (
            <>
              <button className="btn btn-secondary" style={{ padding: '0.3rem 0.7rem' }} disabled={page === 0} onClick={() => setPage(0)}>« First</button>
              <button className="btn btn-secondary" style={{ padding: '0.3rem 0.7rem' }} disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <span>Page {page + 1} of {totalPages}</span>
              <button className="btn btn-secondary" style={{ padding: '0.3rem 0.7rem' }} disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
              <button className="btn btn-secondary" style={{ padding: '0.3rem 0.7rem' }} disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>Last »</button>
            </>
          )}
        </div>
      )}

      {selected && (
        <Modal onClose={() => setSelected(null)} width="min(720px, 94vw)">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ margin: 0 }}>Redemption #{selected.id}</h2>
            <button className="btn btn-secondary" style={{ padding: '0.3rem 0.5rem' }} onClick={() => setSelected(null)} aria-label="Close">
              <X size={16} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem 1.5rem', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
            {([
              ['Redeemed at', fullTime(selected.redeemedAt)],
              ['Site', `${selected.locationCode ?? ''} — ${selected.locationName ?? ''}`],
              ['Company', selected.companyName ?? '—'],
              ['Attendant', selected.attendantName ? `${selected.attendantName} (${selected.attendantUsername})` : selected.attendantUsername],
              ['Vehicle', selected.carRegistrationNumber ?? '—'],
              ['Fuel', selected.fuelTypes.join(', ') || '—'],
              ['Coupons', fmt(selected.couponCount)],
              ['Litres', fmt(selected.litres)],
              ['Status', selected.status],
              ['Posted to ERP at', fullTime(selected.postedAt)],
              ['ERP document', selected.documentNumber ?? '—'],
              ...(detail?.decisionReason ? [['Reason', detail.decisionReason]] : []),
            ] as [string, string][]).map(([label, value]) => (
              <div key={label}>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{label}</div>
                <div style={{ fontWeight: 600 }}>{value}</div>
              </div>
            ))}
          </div>

          {detailError && <div style={{ color: 'var(--color-accent-red)', fontSize: '0.85rem' }}>{detailError}</div>}
          {!detail && !detailError && <div style={{ color: 'var(--color-accent-gold)' }}>Loading coupons…</div>}
          {detail && (
            <>
              <h4 style={{ margin: '0 0 0.5rem' }}>By denomination</h4>
              <div className="table-container" style={{ marginBottom: '1rem' }}>
                <table>
                  <thead><tr><th>Denomination</th><th style={{ textAlign: 'right' }}>Coupons</th><th style={{ textAlign: 'right' }}>Litres</th></tr></thead>
                  <tbody>
                    {detail.denominations.map((d) => (
                      <tr key={d.denomination}>
                        <td>{fmt(d.denomination)} L</td>
                        <td style={{ textAlign: 'right' }}>{fmt(d.count)}</td>
                        <td style={{ textAlign: 'right' }}>{fmt(d.litres ?? d.denomination * d.count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h4 style={{ margin: '0 0 0.5rem' }}>Coupon numbers ({detail.couponNumbers.length})</h4>
              <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: '0.4rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                {detail.couponNumbers.map((n) => (
                  <span key={n} style={{ padding: '0.2rem 0.5rem', borderRadius: 6, border: '1px solid var(--color-border)' }}>{n}</span>
                ))}
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
};
