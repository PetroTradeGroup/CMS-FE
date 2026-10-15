import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, AlertCircle, Fuel, ArrowLeft, Building2, User, Users, FileSpreadsheet, FileText } from 'lucide-react';
import {
  getRedemptionSummary,
  getRedemptionByAttendant,
  getRedemptionSummaryForAttendant,
  exportRedemptionSummary,
  exportRedemptionSummaryForAttendant,
} from '../services/redemptions';
import type { RedemptionSummary as Summary, RedemptionByAttendant, RedemptionSummaryExportFormat } from '../services/redemptions';
import { getLocations } from '../services/locations';
import { getCompanies } from '../services/companies';
import type { Company } from '../services/companies';
import { RedemptionLog } from '../components/RedemptionLog';
import type { LocationDetail } from '../services/locations';
import { getActiveFuelTypes } from '../services/fuelTypes';
import type { FuelType } from '../services/fuelTypes';
import type { CouponType } from '../services/coupons';
import { getErrorMessage } from '../services/api';
import { hasRole, getLocationCode } from '../services/auth';

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const rangeLabel = (from: string, to: string) => (from === to ? from : `${from} → ${to}`);

// Pop the native month calendar on a plain click anywhere in the field, not just on the small
// calendar icon. showPicker() needs a user gesture (a click qualifies) and throws on older
// browsers — the calendar icon still works there as a fallback.
const openCalendar = (e: React.MouseEvent<HTMLInputElement>) => {
  try {
    e.currentTarget.showPicker();
  } catch { /* unsupported — the icon still opens it */ }
};

export const RedemptionSummary: React.FC = () => {
  // A retail caller (Attendant/Team Leader) carries a locationCode claim and is locked to that
  // station server-side. Only Admin/Stocks (no claim) may look across sites. The by-attendant
  // breakdown is Team-Leader-only on the backend (Admin gets 403 there).
  const stationCode = getLocationCode();
  const isAdmin = hasRole('ADMIN', 'STOCKS_CONTROLLER', 'STOCKS_CLERK', 'REGIONAL_REP', 'RETAIL_MANAGER'); // back office — may pick any site
  const isTeamLeader = hasRole('TEAM_LEADER');
  const canPickSite = isAdmin && !stationCode;
  // The Regional Rep also gets each site's attendants (with names) and the live redemption log.
  const isRep = hasRole('REGIONAL_REP', 'RETAIL_MANAGER') && !stationCode;
  const canSeeLog = hasRole('ATTENDANT', 'TEAM_LEADER', 'REGIONAL_REP', 'RETAIL_MANAGER', 'ADMIN', 'STOCKS_CONTROLLER');

  const [dateFrom, setDateFrom] = useState(todayISO());
  const [dateTo, setDateTo] = useState(todayISO());
  const [companyId, setCompanyId] = useState<number | ''>('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [locationId, setLocationId] = useState<number | ''>('');
  const [fuelTypeId, setFuelTypeId] = useState<number | ''>('');
  const [couponType, setCouponType] = useState<'' | CouponType>('');
  const [attendant, setAttendant] = useState('');
  const forOneAttendant = isTeamLeader && attendant !== '';

  const [sites, setSites] = useState<LocationDetail[]>([]);
  const [fuelTypes, setFuelTypes] = useState<FuelType[]>([]);
  // There's no endpoint that lists a station's attendants, so the picker is built from whoever
  // has redemptions in the current range. Kept as a growing union so selecting one attendant
  // doesn't collapse the list.
  const [attendantOptions, setAttendantOptions] = useState<string[]>([]);
  const knownAttendants = useRef<Set<string>>(new Set());

  const [summary, setSummary] = useState<Summary | null>(null);
  const [byAttendant, setByAttendant] = useState<RedemptionByAttendant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<RedemptionSummaryExportFormat | null>(null);

  useEffect(() => {
    getActiveFuelTypes(0, 100).then((res) => setFuelTypes(res.data?.content || [])).catch(() => setFuelTypes([]));
    if (canPickSite) {
      getLocations(true).then((res) => setSites(res.data || [])).catch(() => setSites([]));
      getCompanies().then((res) => setCompanies(res.data || [])).catch(() => setCompanies([]));
    }
  }, [canPickSite]);

  // Picking a company narrows the station list to its sites; a station from another company is cleared.
  const sitesInCompany = companyId ? sites.filter((s) => s.companyId === companyId) : sites;
  const onCompanyChange = (id: number | '') => {
    setCompanyId(id);
    if (id && locationId && sites.find((s) => s.id === locationId)?.companyId !== id) setLocationId('');
  };

  // Keep the attendant picker populated from the unfiltered station-wide list, independent of
  // which attendant is currently selected.
  useEffect(() => {
    if (!isTeamLeader) return;
    getRedemptionByAttendant({ dateFrom, dateTo })
      .then((res) => {
        (res.data?.byAttendant ?? []).forEach((a) => knownAttendants.current.add(a.requestedBy));
        setAttendantOptions([...knownAttendants.current].sort());
      })
      .catch(() => { /* keep whatever options we already have */ });
  }, [isTeamLeader, dateFrom, dateTo]);

  // State is set only in the promise callbacks (react-hooks/set-state-in-effect) — the previous
  // numbers stay up until the new ones land.
  const load = useCallback(() => {
    const base = {
      dateFrom,
      dateTo,
      fuelTypeId: fuelTypeId ? Number(fuelTypeId) : undefined,
      couponType: couponType || undefined,
    };
    const request: Promise<{ summary: Summary; byAttendant: RedemptionByAttendant | null }> =
      isTeamLeader && attendant
        // One attendant only — their own fuel-type breakdown, nobody else's numbers fetched.
        ? getRedemptionSummaryForAttendant(attendant, base).then((res) => ({ summary: res.data, byAttendant: null }))
        : isTeamLeader
          ? Promise.all([getRedemptionSummary(base), getRedemptionByAttendant(base)])
              .then(([sumRes, attRes]) => ({ summary: sumRes.data, byAttendant: attRes.data }))
          : Promise.all([
              getRedemptionSummary({
                ...base,
                locationId: canPickSite && locationId ? Number(locationId) : undefined,
                companyId: canPickSite && companyId ? Number(companyId) : undefined,
              }),
              // A Regional Rep sees who redeemed at the chosen site.
              isRep && locationId ? getRedemptionByAttendant({ ...base, locationId: Number(locationId) }) : null,
            ]).then(([sumRes, attRes]) => ({ summary: sumRes.data, byAttendant: attRes?.data ?? null }));
    return request
      .then(({ summary, byAttendant }) => {
        setSummary(summary);
        setByAttendant(byAttendant);
        setError(null);
      })
      .catch((err) => {
        setError(getErrorMessage(err, 'Failed to load the redemption summary.'));
        setSummary(null);
        setByAttendant(null);
      })
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo, fuelTypeId, couponType, locationId, companyId, attendant, canPickSite, isTeamLeader, isRep]);

  useEffect(() => {
    load();
  }, [load]);

  const onFromChange = (v: string) => {
    setDateFrom(v);
    if (v > dateTo) setDateTo(v);
  };
  const onToChange = (v: string) => {
    setDateTo(v);
    if (v < dateFrom) setDateFrom(v);
  };

  // Export follows exactly what's on screen: one attendant's report when an attendant is
  // selected, otherwise the whole-scope (station, or one site for Admin) report.
  const runExport = async (format: RedemptionSummaryExportFormat) => {
    setExporting(format);
    setError(null);
    const base = {
      dateFrom,
      dateTo,
      fuelTypeId: fuelTypeId ? Number(fuelTypeId) : undefined,
      couponType: couponType || undefined,
    };
    try {
      if (forOneAttendant) {
        await exportRedemptionSummaryForAttendant(attendant, format, base);
      } else {
        await exportRedemptionSummary(format, {
          ...base,
          locationId: canPickSite && locationId ? Number(locationId) : undefined,
          companyId: canPickSite && companyId ? Number(companyId) : undefined,
        });
      }
    } catch (err) {
      setError(getErrorMessage(err, `Failed to export as ${format === 'excel' ? 'Excel' : 'PDF'}.`));
    } finally {
      setExporting(null);
    }
  };

  const baseScope = stationCode
    ? isTeamLeader
      ? `Station ${stationCode}${attendant ? ` — ${attendant}` : ' — every attendant'}`
      : `Your redemptions at ${stationCode}`
    : canPickSite && locationId
      ? sites.find((s) => s.id === Number(locationId))?.name ?? 'Selected site'
      : companyId ? 'All its sites' : 'All sites';
  // Every scope names its company — the station's own for station staff, the picked one for the Rep.
  const scopeLabel = summary?.companyName ? `${summary.companyName} · ${baseScope}` : baseScope;

  const headlineCoupons = summary?.totalCoupons ?? 0;
  const headlineLitres = summary?.totalLitres ?? 0;
  const empty = !summary || summary.totalCoupons === 0;

  const exportTitle = (label: string) =>
    empty
      ? 'Nothing to export for this range'
      : forOneAttendant
        ? `Download ${attendant}'s redemption report as ${label}`
        : `Download the fuel-type breakdown as ${label}`;

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div><h1>Redemption Summary</h1></div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary"
            onClick={() => runExport('excel')}
            disabled={loading || empty || exporting !== null}
            title={exportTitle('an Excel workbook')}
          >
            <FileSpreadsheet size={16} /> {exporting === 'excel' ? 'Exporting…' : 'Excel'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => runExport('pdf')}
            disabled={loading || empty || exporting !== null}
            title={exportTitle('a PDF')}
          >
            <FileText size={16} /> {exporting === 'pdf' ? 'Exporting…' : 'PDF'}
          </button>
          <Link to="/redemptions" className="btn btn-secondary">
            <ArrowLeft size={16} /> Redemptions
          </Link>
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem',
        padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)',
        borderRadius: '8px', color: 'var(--color-text-secondary)', fontSize: '0.9rem',
      }}>
        {forOneAttendant || (stationCode && !isTeamLeader) ? <User size={16} /> : <Building2 size={16} />}
        <span>Scope: <strong>{scopeLabel}</strong></span>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="input-group" style={{ marginBottom: 0, width: '170px' }}>
          <label htmlFor="rs-from">From</label>
          <input id="rs-from" type="date" className="input-field" value={dateFrom} max={todayISO()} onClick={openCalendar} onChange={(e) => onFromChange(e.target.value)} />
        </div>
        <div className="input-group" style={{ marginBottom: 0, width: '170px' }}>
          <label htmlFor="rs-to">To</label>
          <input id="rs-to" type="date" className="input-field" value={dateTo} min={dateFrom} max={todayISO()} onClick={openCalendar} onChange={(e) => onToChange(e.target.value)} />
        </div>
        <div className="input-group" style={{ marginBottom: 0, width: '200px' }}>
          <label htmlFor="rs-fuel">Fuel type</label>
          <select id="rs-fuel" className="input-field" value={fuelTypeId} onChange={(e) => setFuelTypeId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">All fuel types</option>
            {fuelTypes.map((ft) => (
              <option key={ft.id} value={ft.id}>{ft.name}</option>
            ))}
          </select>
        </div>
        <div className="input-group" style={{ marginBottom: 0, width: '170px' }}>
          <label htmlFor="rs-ctype">Coupon type</label>
          <select id="rs-ctype" className="input-field" value={couponType} onChange={(e) => setCouponType(e.target.value as '' | CouponType)}>
            <option value="">Physical &amp; digital</option>
            <option value="PHYSICAL">Physical</option>
            <option value="DIGITAL">Digital</option>
          </select>
        </div>
        {isTeamLeader && (
          <div className="input-group" style={{ marginBottom: 0, width: '220px' }}>
            <label htmlFor="rs-att">Attendant</label>
            <select id="rs-att" className="input-field" value={attendant} onChange={(e) => setAttendant(e.target.value)}>
              <option value="">Every attendant</option>
              {attendantOptions.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
        )}
        {canPickSite && (
          <div className="input-group" style={{ marginBottom: 0, width: '200px' }}>
            <label htmlFor="rs-company">Company</label>
            <select id="rs-company" className="input-field" value={companyId} onChange={(e) => onCompanyChange(e.target.value ? Number(e.target.value) : '')}>
              <option value="">All companies</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}
        {canPickSite && (
          <div className="input-group" style={{ marginBottom: 0, width: '240px' }}>
            <label htmlFor="rs-site">Station</label>
            <select id="rs-site" className="input-field" value={locationId} onChange={(e) => setLocationId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">{companyId ? 'All its sites' : 'All sites'}</option>
              {sitesInCompany.map((s) => (
                <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && (
        <div style={{ padding: '1rem', background: 'rgba(208, 76, 87, 0.1)', border: '1px solid var(--color-accent-red)', borderRadius: '8px', color: 'var(--color-accent-red)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertCircle size={20} /> {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-accent-gold)' }}>Loading summary…</div>
      ) : empty ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-text-muted)' }}>
          <div style={{ marginBottom: '1rem', color: 'rgba(255,255,255,0.1)' }}>
            <BarChart3 size={48} style={{ margin: '0 auto' }} />
          </div>
          <h3>
            Nothing redeemed{forOneAttendant ? ` by ${attendant}` : ''} for {rangeLabel(dateFrom, dateTo)}
          </h3>
          <p>Adjust the date range or filters to see totals.</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            <div className="glass-panel" style={{ padding: '1.25rem 1.5rem', flex: 1, minWidth: '200px' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Coupons redeemed{forOneAttendant ? ` — ${attendant}` : ''}
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-accent-gold)' }}>{fmt(headlineCoupons)}</div>
            </div>
            <div className="glass-panel" style={{ padding: '1.25rem 1.5rem', flex: 1, minWidth: '200px' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Litres{forOneAttendant ? ` — ${attendant}` : ''}
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 700 }}>{fmt(headlineLitres)}</div>
            </div>
          </div>

          <h3 style={{ margin: '0 0 0.75rem' }}>
            By fuel type
            {forOneAttendant && (
              <span style={{ fontWeight: 400, fontSize: '0.85rem', color: 'var(--color-text-muted)' }}> — {attendant} only</span>
            )}
          </h3>
          <div className="glass-panel" style={{ overflow: 'hidden', marginBottom: isTeamLeader && !attendant ? '2rem' : 0 }}>
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
                  {summary.byFuelType.map((ft) => (
                    <React.Fragment key={ft.fuelTypeId}>
                      {ft.byDenomination.map((d, i) => (
                        <tr key={`${ft.fuelTypeId}-${d.denomination}`}>
                          {i === 0 && (
                            <td rowSpan={ft.byDenomination.length} style={{ fontWeight: 600, verticalAlign: 'top' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                                <Fuel size={14} /> {ft.fuelTypeName}
                              </span>
                            </td>
                          )}
                          <td style={{ fontFamily: 'monospace' }}>{fmt(d.denomination)} L</td>
                          <td style={{ textAlign: 'right' }}>{fmt(d.count)}</td>
                          <td style={{ textAlign: 'right' }}>{fmt(d.litres)}</td>
                        </tr>
                      ))}
                      <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                        <td colSpan={2} style={{ textAlign: 'right', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                          {ft.fuelTypeName} subtotal
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(ft.count)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(ft.litres)}</td>
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {canPickSite && !locationId && summary.bySite.length > 0 && (
            <>
              <h3 style={{ margin: '2rem 0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Building2 size={16} /> By site
              </h3>
              <div className="glass-panel" style={{ overflow: 'hidden', marginBottom: '2rem' }}>
                <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Company</th>
                        <th>Site</th>
                        <th style={{ textAlign: 'right' }}>Coupons</th>
                        <th style={{ textAlign: 'right' }}>Litres</th>
                        <th style={{ textAlign: 'right' }}>Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.bySite.map((s) => (
                        <tr key={s.locationId}>
                          <td style={{ color: 'var(--color-text-muted)' }}>{s.companyName}</td>
                          <td style={{ fontWeight: 600 }}>{s.locationCode} — {s.locationName}</td>
                          <td style={{ textAlign: 'right' }}>{fmt(s.count)}</td>
                          <td style={{ textAlign: 'right' }}>{fmt(s.litres)}</td>
                          <td style={{ textAlign: 'right' }}>
                            <button className="btn btn-secondary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                              onClick={() => setLocationId(s.locationId)}>
                              Open
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {((isTeamLeader && !attendant) || isRep) && byAttendant && (
            <>
              <h3 style={{ margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Users size={16} /> By attendant
              </h3>
              <div className="glass-panel" style={{ overflow: 'hidden' }}>
                {byAttendant.byAttendant.length > 0 ? (
                  <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Attendant</th>
                          <th>Username</th>
                          <th style={{ textAlign: 'right' }}>Coupons</th>
                          <th style={{ textAlign: 'right' }}>Litres</th>
                          {isTeamLeader && <th style={{ textAlign: 'right' }}>Report</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {byAttendant.byAttendant.map((a) => (
                          <tr key={a.requestedBy}>
                            <td style={{ fontWeight: 600 }}>{a.attendantName ?? '—'}</td>
                            <td style={{ fontFamily: 'monospace', color: 'var(--color-text-muted)' }}>{a.requestedBy}</td>
                            <td style={{ textAlign: 'right' }}>{fmt(a.count)}</td>
                            <td style={{ textAlign: 'right' }}>{fmt(a.litres)}</td>
                            {isTeamLeader && (
                              <td style={{ textAlign: 'right' }}>
                                <button
                                  className="btn btn-secondary"
                                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                                  onClick={() => setAttendant(a.requestedBy)}
                                >
                                  Open
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    No redemptions in this range.
                  </div>
                )}
              </div>
            </>
          )}

          {forOneAttendant && (
            <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              Showing <strong>{attendant}</strong> only. Use the Excel / PDF buttons above for their report, or{' '}
              <button
                onClick={() => setAttendant('')}
                style={{ background: 'none', border: 'none', color: 'var(--color-accent-gold)', cursor: 'pointer', padding: 0, font: 'inherit', textDecoration: 'underline' }}
              >
                back to every attendant
              </button>.
            </p>
          )}
        </>
      )}

      {/* Includes redemptions still waiting on the ERP, which the posted totals above don't count yet. */}
      {canSeeLog && (
        <RedemptionLog
          showSite={!stationCode}
          params={{
            dateFrom,
            dateTo,
            companyId: canPickSite && companyId ? Number(companyId) : undefined,
            locationId: canPickSite && locationId ? Number(locationId) : undefined,
            attendantUsername: isTeamLeader && attendant ? attendant : undefined,
            couponType: couponType || undefined,
          }}
        />
      )}
    </div>
  );
};
