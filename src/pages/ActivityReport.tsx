import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, AlertCircle, Fuel, FileSpreadsheet } from 'lucide-react';
import { getCouponActivity, exportCouponActivity, getCouponBalance, exportCouponBalance } from '../services/redemptions';
import type { CouponActivity } from '../services/redemptions';
import { COUPON_STATUSES, getStatusBadgeClass } from '../services/coupons';
import type { CouponStatus } from '../services/coupons';
import { getActiveFuelTypes } from '../services/fuelTypes';
import type { FuelType } from '../services/fuelTypes';
import { getErrorMessage } from '../services/api';

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

/** Total volume per status over a day or a range — aggregated, never one line per coupon. */
export const ActivityReport: React.FC = () => {
  // day / range = activity (what moved into each status); balance = where coupons stood at the end of the date.
  const [mode, setMode] = useState<'day' | 'range' | 'balance'>('day');
  const singleDay = mode !== 'range';
  const isBalance = mode === 'balance';
  const [dateFrom, setDateFrom] = useState(todayISO());
  const [dateTo, setDateTo] = useState(todayISO());
  const [status, setStatus] = useState<CouponStatus | ''>('REDEEMED');
  const [fuelTypeId, setFuelTypeId] = useState<number | ''>('');
  const [fuelTypes, setFuelTypes] = useState<FuelType[]>([]);

  const [report, setReport] = useState<CouponActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getActiveFuelTypes(0, 100).then((res) => setFuelTypes(res.data?.content || [])).catch(() => setFuelTypes([]));
  }, []);

  const params = useCallback(() => ({
    dateFrom,
    dateTo: singleDay ? dateFrom : dateTo,
    status: status || undefined,
    fuelTypeId: fuelTypeId ? Number(fuelTypeId) : undefined,
  }), [dateFrom, dateTo, singleDay, status, fuelTypeId]);

  const fetchReport = useCallback(() => {
    const p = params();
    return isBalance ? getCouponBalance({ asAt: p.dateFrom, status: p.status, fuelTypeId: p.fuelTypeId }) : getCouponActivity(p);
  }, [params, isBalance]);

  // State is only set in the promise callbacks — the previous report stays up until the new one lands.
  useEffect(() => {
    fetchReport()
      .then((res) => { setReport(res.data); setError(null); })
      .catch((err) => { setError(getErrorMessage(err, 'Failed to load the report.')); setReport(null); })
      .finally(() => setLoading(false));
  }, [fetchReport]);

  const runExport = async () => {
    setExporting(true);
    setError(null);
    try {
      const p = params();
      await (isBalance
        ? exportCouponBalance({ asAt: p.dateFrom, status: p.status, fuelTypeId: p.fuelTypeId })
        : exportCouponActivity(p));
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to export as Excel.'));
    } finally {
      setExporting(false);
    }
  };

  const empty = !report || report.byStatus.length === 0;

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1>Volume Report</h1>
          {!isBalance && <p style={{ margin: 0 }}>Coupons and litres that moved into each status over the period</p>}
        </div>
        <button className="btn btn-secondary" onClick={runExport} disabled={loading || empty || exporting}>
          <FileSpreadsheet size={16} /> {exporting ? 'Exporting…' : 'Excel'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="input-group" style={{ marginBottom: 0, width: '150px' }}>
          <label htmlFor="ar-mode">Period</label>
          <select id="ar-mode" className="input-field" value={mode} onChange={(e) => { const m = e.target.value as typeof mode; setMode(m); if (m === 'balance') setStatus(''); }}>
            <option value="day">Single day</option>
            <option value="range">Date range</option>
            <option value="balance">Balance as at</option>
          </select>
        </div>
        <div className="input-group" style={{ marginBottom: 0, width: '170px' }}>
          <label htmlFor="ar-from">{isBalance ? 'As at end of' : singleDay ? 'Date' : 'From'}</label>
          <input id="ar-from" type="date" className="input-field" value={dateFrom} max={todayISO()}
            onChange={(e) => { setDateFrom(e.target.value); if (e.target.value > dateTo) setDateTo(e.target.value); }} />
        </div>
        {!singleDay && (
          <div className="input-group" style={{ marginBottom: 0, width: '170px' }}>
            <label htmlFor="ar-to">To</label>
            <input id="ar-to" type="date" className="input-field" value={dateTo} min={dateFrom} max={todayISO()}
              onChange={(e) => setDateTo(e.target.value)} />
          </div>
        )}
        <div className="input-group" style={{ marginBottom: 0, width: '180px' }}>
          <label htmlFor="ar-status">Status</label>
          <select id="ar-status" className="input-field" value={status} onChange={(e) => setStatus(e.target.value as CouponStatus | '')}>
            <option value="">All statuses</option>
            {COUPON_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
        </div>
        <div className="input-group" style={{ marginBottom: 0, width: '200px' }}>
          <label htmlFor="ar-fuel">Fuel type</label>
          <select id="ar-fuel" className="input-field" value={fuelTypeId} onChange={(e) => setFuelTypeId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">All fuel types</option>
            {fuelTypes.map((ft) => <option key={ft.id} value={ft.id}>{ft.name}</option>)}
          </select>
        </div>
      </div>

      {error && (
        <div style={{ padding: '1rem', background: 'rgba(208, 76, 87, 0.1)', border: '1px solid var(--color-accent-red)', borderRadius: '8px', color: 'var(--color-accent-red)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertCircle size={20} /> {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-accent-gold)' }}>Loading report…</div>
      ) : empty ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-text-muted)' }}>
          <BarChart3 size={48} style={{ margin: '0 auto 1rem', color: 'rgba(255,255,255,0.1)' }} />
          <h3>{isBalance ? 'No coupons held at this date' : 'No coupon activity for this period'}</h3>
          <p>Adjust the date or filters.</p>
        </div>
      ) : report.byStatus.map((s) => (
        <div key={s.status} style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'baseline', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            <span className={`badge ${getStatusBadgeClass(s.status)}`}>{s.status.replace('_', ' ')}</span>
            <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-accent-gold)' }}>{fmt(s.litres)} L</span>
            <span style={{ color: 'var(--color-text-muted)' }}>{fmt(s.count)} coupons</span>
          </div>
          <div className="glass-panel" style={{ overflow: 'hidden' }}>
            <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Fuel type</th>
                    <th>Denomination</th>
                    <th style={{ textAlign: 'right' }}>Coupons</th>
                    <th style={{ textAlign: 'right' }}>Litres</th>
                  </tr>
                </thead>
                <tbody>
                  {s.byFuelType.map((ft) => (
                    <React.Fragment key={ft.fuelTypeId}>
                      {ft.byDenomination.map((d, i) => (
                        <tr key={`${ft.fuelTypeId}-${d.denomination}`}>
                          {i === 0 && (
                            <td rowSpan={ft.byDenomination.length} style={{ fontWeight: 600, verticalAlign: 'top' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}><Fuel size={14} /> {ft.fuelTypeName}</span>
                            </td>
                          )}
                          <td style={{ fontFamily: 'monospace' }}>{fmt(d.denomination)} L</td>
                          <td style={{ textAlign: 'right' }}>{fmt(d.count)}</td>
                          <td style={{ textAlign: 'right' }}>{fmt(d.litres)}</td>
                        </tr>
                      ))}
                      <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                        <td colSpan={2} style={{ textAlign: 'right', fontWeight: 600, color: 'var(--color-text-muted)' }}>{ft.fuelTypeName} subtotal</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(ft.count)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(ft.litres)}</td>
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
