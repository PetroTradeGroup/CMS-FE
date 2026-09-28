import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, QrCode, PackageCheck, AlertCircle, CheckCircle2, ArrowRightLeft, X, FileSpreadsheet, Plus, Trash2 } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { getBatch, receiveBatch, downloadBatchQrCodes, downloadBatchPrintCsv, transferCoupons } from '../services/batches';
import type { CouponBatch, TransferResult } from '../services/batches';
import { getStatusBadgeClass, COUPON_STATUSES, getCoupons, formatDenomination, getOriginBadgeClass, formatOrigin } from '../services/coupons';
import type { CouponStatus, Coupon, DenominationLine } from '../services/coupons';
import { getLocations } from '../services/locations';
import type { LocationDetail } from '../services/locations';
import { getDepartments } from '../services/departments';
import type { Department } from '../services/departments';
import type { ApprovalRequest } from '../services/approvals';
import { getErrorMessage } from '../services/api';
import { Modal } from '../components/Modal';

interface DenominationLineInput {
  denomination: string;
  count: string;
}

export const BatchDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const batchId = parseInt(id || '', 10);

  const [batch, setBatch] = useState<CouponBatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [receiving, setReceiving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadingCsv, setDownloadingCsv] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Transfer modal
  const [showTransfer, setShowTransfer] = useState(false);
  const [locations, setLocations] = useState<LocationDetail[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectionMode, setSelectionMode] = useState<'batch' | 'range' | 'denomination'>('batch');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [pickLines, setPickLines] = useState<DenominationLineInput[]>([{ denomination: '', count: '1' }]);
  const [toLocationId, setToLocationId] = useState('');
  const [toDepartmentId, setToDepartmentId] = useState('');
  const [transferStatus, setTransferStatus] = useState<CouponStatus | ''>('');
  const [transferReason, setTransferReason] = useState('');
  const [performedBy, setPerformedBy] = useState<string>(() => localStorage.getItem('username') || '');
  const [transferring, setTransferring] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  useEffect(() => {
    getLocations(true).then(res => setLocations(res.data || [])).catch(() => setLocations([]));
    getDepartments(true).then(res => setDepartments(res.data || [])).catch(() => setDepartments([]));
  }, []);

  // Coupons in this batch, in printed (batchSequence) order.
  // Depends on `batch` so it refreshes whenever loadBatch runs (receive, transfer, ...).
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [couponsPage, setCouponsPage] = useState(0);
  const [couponsTotalPages, setCouponsTotalPages] = useState(0);
  const [couponsTotal, setCouponsTotal] = useState(0);
  const [couponsLoading, setCouponsLoading] = useState(false);

  useEffect(() => {
    if (!batch) return;
    setCouponsLoading(true);
    getCoupons(couponsPage, 20, { batchId: batch.id }, 'batchSequence,asc')
      .then(res => {
        setCoupons(res.data?.content || []);
        setCouponsTotalPages(res.data?.totalPages || 0);
        setCouponsTotal(res.data?.totalElements || 0);
      })
      .catch(() => setCoupons([]))
      .finally(() => setCouponsLoading(false));
  }, [batch, couponsPage]);

  const loadBatch = useCallback(async () => {
    try {
      const res = await getBatch(batchId);
      setBatch(res.data);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load batch.'));
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    if (Number.isNaN(batchId)) {
      setError('Invalid batch ID.');
      setLoading(false);
      return;
    }
    loadBatch();
  }, [batchId, loadBatch]);

  const handleReceive = async () => {
    if (!batch) return;
    setReceiving(true);
    setError(null);
    setSuccess(null);
    try {
      const performedBy = localStorage.getItem('username') || undefined;
      await receiveBatch(batch.id, performedBy);
      setSuccess('Batch received into stock.');
      await loadBatch();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to receive batch.'));
    } finally {
      setReceiving(false);
    }
  };

  const openTransfer = () => {
    setSelectionMode('batch');
    setRangeStart('');
    setRangeEnd('');
    setPickLines([{ denomination: '', count: '1' }]);
    setToLocationId('');
    setToDepartmentId('');
    setTransferStatus('');
    setTransferReason('');
    setModalError(null);
    setShowTransfer(true);
  };

  const handleTransfer = async () => {
    if (!batch) return;

    // Selection is one of three mutually-exclusive modes: whole batch, position range,
    // or one or more denomination lines ("first N eligible 20 L coupons in batch order",
    // mixable — e.g. 5x20L + 3x50L in one call).
    let start: number | undefined;
    let end: number | undefined;
    let denominationLines: DenominationLine[] | undefined;

    if (selectionMode === 'range') {
      start = parseInt(rangeStart, 10);
      end = parseInt(rangeEnd, 10);
      if (!start || !end || start < 1 || end > batch.quantity || start > end) {
        setModalError(`Range must be within 1–${batch.quantity} and start must not exceed end.`);
        return;
      }
    } else if (selectionMode === 'denomination') {
      if (pickLines.some(l => !l.denomination.trim() || !l.count.trim())) {
        setModalError('Every denomination line needs a denomination and a quantity.');
        return;
      }
      denominationLines = pickLines.map(l => ({
        denomination: parseFloat(l.denomination),
        count: parseInt(l.count, 10)
      }));
      if (denominationLines.some(l => !l.denomination || l.denomination <= 0)) {
        setModalError('Denominations must be positive numbers of litres.');
        return;
      }
      if (denominationLines.some(l => !l.count || l.count < 1)) {
        setModalError('Quantities must be at least 1.');
        return;
      }
    }

    if (!transferStatus && !toLocationId && !toDepartmentId) {
      setModalError('Provide at least one of: target status, location, or department.');
      return;
    }
    if ((transferStatus === 'CANCELLED' || transferStatus === 'FLAGGED') && !transferReason.trim()) {
      setModalError(`A reason is required when transitioning to ${transferStatus}.`);
      return;
    }

    setTransferring(true);
    setModalError(null);
    try {
      const res = await transferCoupons({
        batchId: batch.id,
        ...(start !== undefined ? { rangeStart: start, rangeEnd: end } : {}),
        ...(denominationLines !== undefined ? { denominationLines } : {}),
        ...(toLocationId ? { toLocationId: parseInt(toLocationId, 10) } : {}),
        ...(toDepartmentId ? { toDepartmentId: parseInt(toDepartmentId, 10) } : {}),
        ...(transferStatus ? { targetStatus: transferStatus } : {}),
        ...(transferReason.trim() ? { reason: transferReason.trim() } : {}),
        ...(performedBy.trim() ? { performedBy: performedBy.trim() } : {})
      });

      // 202 = deferred to the supervisor queue; 200 = status-only change, applied now
      if (res.status === 202) {
        const approval = res.data as ApprovalRequest;
        setSuccess(`Transfer submitted for approval — request #${approval.id}. Nothing moves until a supervisor approves it.`);
      } else {
        const result = res.data as TransferResult;
        const verb = result.targetStatus ? `moved to ${result.targetStatus.replace('_', ' ')}` : 'moved';
        const nums = result.coupons?.map(c => c.couponNumber) || [];
        const list = nums.length > 0 && nums.length <= 5 ? ` (${nums.join(', ')})` : '';
        setSuccess(`${result.count} coupon${result.count === 1 ? '' : 's'} ${verb}${list}.`);
        await loadBatch();
      }
      setShowTransfer(false);
    } catch (err) {
      setModalError(getErrorMessage(err, 'Failed to submit transfer.'));
    } finally {
      setTransferring(false);
    }
  };

  const handleDownloadQr = async () => {
    if (!batch) return;
    setDownloading(true);
    setError(null);
    try {
      await downloadBatchQrCodes(batch.id, batch.batchNumber);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to download QR codes.'));
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadPrintCsv = async () => {
    if (!batch) return;
    setDownloadingCsv(true);
    setError(null);
    try {
      await downloadBatchPrintCsv(batch.id, batch.batchNumber);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to download print CSV.'));
    } finally {
      setDownloadingCsv(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-center animate-fade-in" style={{ height: '60vh' }}>
        <div style={{ color: 'var(--color-accent-gold)', fontSize: '1.2rem' }}>Loading batch...</div>
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="animate-fade-in">
        <Link to="/batches" className="btn btn-secondary" style={{ marginBottom: '2rem', display: 'inline-flex' }}>
          <ArrowLeft size={18} /> Back to Batches
        </Link>
        <div style={{ padding: '1rem', background: 'rgba(208, 76, 87, 0.1)', border: '1px solid var(--color-accent-red)', borderRadius: '8px', color: 'var(--color-accent-red)' }}>
          {error || 'Batch not found.'}
        </div>
      </div>
    );
  }

  const statusCounts = batch.statusCounts || {};
  const generatedCount = statusCounts.GENERATED || 0;
  // A pure relocation (no targetStatus) only accepts coupons that are currently IN_STOCK — even
  // IN_TRANSIT is rejected (mid-transfer, must be received back first). Hide the action rather
  // than let the user open a modal whose default (no status change) mode can only fail.
  const transferEligibleCount = statusCounts.IN_STOCK || 0;

  const headerFields: [string, React.ReactNode][] = [
    ['Fuel Type', batch.fuelType ? `${batch.fuelType.name} (${batch.fuelType.typeCode})` : '—'],
    ['Batch Sequence', batch.sequenceNumber != null ? `#${batch.sequenceNumber} for ${batch.fuelType?.name ?? 'fuel type'}` : '—'],
    ['Coupon Type', batch.couponType],
    ['Coupons', batch.quantity?.toLocaleString()],
    ['Target Quantity', batch.targetQuantity ? `${batch.targetQuantity.toLocaleString()} L` : '—'],
    ['Origin Location', batch.originLocation?.name ?? '—'],
    ['Expiry Date', batch.expiryDate ? new Date(batch.expiryDate).toLocaleDateString() : '—'],
    ['Created By', batch.createdBy || '—'],
    ['Created At', new Date(batch.createdAt).toLocaleString()],
  ];

  return (
    <div className="animate-fade-in">
      <Link to="/batches" className="btn btn-secondary" style={{ marginBottom: '1.5rem', display: 'inline-flex' }}>
        <ArrowLeft size={18} /> Back to Batches
      </Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ letterSpacing: '0.03em' }}>{batch.batchNumber}</h1>
          <p style={{ margin: 0 }}>Batch detail, stock receipt and print handoff.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {generatedCount > 0 && (
            <button className="btn btn-primary" onClick={handleReceive} disabled={receiving}>
              <PackageCheck size={18} />
              {receiving ? 'Receiving...' : `Receive into stock (${generatedCount})`}
            </button>
          )}
          {transferEligibleCount > 0 && (
            <button className="btn btn-secondary" onClick={openTransfer}>
              <ArrowRightLeft size={18} />
              Transfer
            </button>
          )}
          <button className="btn btn-secondary" onClick={handleDownloadPrintCsv} disabled={downloadingCsv} title="Variable-data-printing CSV — the preferred handoff for print vendors">
            <FileSpreadsheet size={18} />
            {downloadingCsv ? 'Preparing CSV...' : 'Download print CSV'}
          </button>
          <button className="btn btn-secondary" onClick={handleDownloadQr} disabled={downloading} title="Legacy handoff — one QR PNG per coupon">
            <QrCode size={18} />
            {downloading ? 'Preparing ZIP...' : 'Download QR ZIP'}
          </button>
        </div>
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '2rem', alignItems: 'start' }}>
        <div className="glass-panel" style={{ padding: '2rem' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1.5rem', color: 'var(--color-accent-gold)' }}>Batch Information</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}>
            {headerFields.map(([label, value]) => (
              <div key={label}>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>{label}</div>
                <div style={{ fontWeight: 500 }}>{value}</div>
              </div>
            ))}
          </div>
          {batch.couponType === 'DIGITAL' && (
            <p style={{ marginTop: '1.5rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              Digital batches start as In Stock and never need receiving.
            </p>
          )}
        </div>

        {/* Status breakdown widget */}
        <div className="glass-panel" style={{ padding: '1.5rem', background: 'rgba(0,0,0,0.3)' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--color-accent-gold)' }}>Status Breakdown</h3>
          {Object.keys(statusCounts).length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {Object.entries(statusCounts).map(([status, count]) => (
                <div key={status} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className={`badge ${getStatusBadgeClass(status)}`}>{status.replace('_', ' ')}</span>
                  <span style={{ fontWeight: 600 }}>{count?.toLocaleString()}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: 0 }}>No status data available.</p>
          )}
        </div>
      </div>

      {/* Coupons in this batch */}
      <div className="glass-panel" style={{ marginTop: '2rem', overflow: 'hidden' }}>
        <div style={{ padding: '1.5rem 2rem 0' }}>
          <h3 style={{ fontSize: '1.1rem', margin: 0, color: 'var(--color-accent-gold)' }}>
            Coupons in this Batch {couponsTotal > 0 && <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', fontWeight: 400 }}>({couponsTotal.toLocaleString()})</span>}
          </h3>
        </div>
        {couponsLoading ? (
          <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--color-accent-gold)' }}>Loading coupons...</div>
        ) : coupons.length > 0 ? (
          <>
            <div className="table-container" style={{ border: 'none', borderRadius: 0, marginTop: '1rem' }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '60px' }}>#</th>
                    <th>Coupon Number</th>
                    <th>Denomination</th>
                    <th>Status</th>
                    <th>Origin</th>
                    <th>Location</th>
                    <th>Department</th>
                  </tr>
                </thead>
                <tbody>
                  {coupons.map(coupon => (
                    <tr key={coupon.id}>
                      <td style={{ color: 'var(--color-text-muted)' }}>{coupon.batchSequence ?? '—'}</td>
                      <td style={{ fontWeight: 500, color: 'var(--color-accent-gold)', letterSpacing: '0.05em' }}>
                        {coupon.couponNumber}
                      </td>
                      <td>{formatDenomination(coupon.denomination)}</td>
                      <td>
                        <span className={`badge ${getStatusBadgeClass(coupon.status)}`}>
                          {coupon.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${getOriginBadgeClass(coupon.origin)}`}>
                          {formatOrigin(coupon.origin)}
                        </span>
                      </td>
                      <td>{coupon.location?.name ?? '—'}</td>
                      <td>{coupon.department?.name ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {couponsTotalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.5rem', padding: '1rem 2rem' }}>
                <button className="btn btn-secondary" style={{ padding: '0.35rem 0.8rem' }} disabled={couponsPage === 0} onClick={() => setCouponsPage(p => Math.max(0, p - 1))}>
                  Previous
                </button>
                <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                  Page {couponsPage + 1} of {couponsTotalPages}
                </span>
                <button className="btn btn-secondary" style={{ padding: '0.35rem 0.8rem' }} disabled={couponsPage >= couponsTotalPages - 1} onClick={() => setCouponsPage(p => Math.min(couponsTotalPages - 1, p + 1))}>
                  Next
                </button>
              </div>
            )}
          </>
        ) : (
          <p style={{ padding: '1.5rem 2rem', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>No coupons found for this batch.</p>
        )}
      </div>

      {/* Transfer modal */}
      {showTransfer && (
        <Modal onClose={() => setShowTransfer(false)} width="min(560px, 92vw)">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, color: 'var(--color-accent-gold)' }}>Transfer from {batch.batchNumber}</h3>
              <button className="btn btn-secondary" style={{ padding: '0.3rem 0.5rem' }} onClick={() => setShowTransfer(false)}>
                <X size={16} />
              </button>
            </div>

            {modalError && (
              <div style={{ padding: '0.75rem 1rem', background: 'rgba(208, 76, 87, 0.1)', border: '1px solid var(--color-accent-red)', borderRadius: '8px', color: 'var(--color-accent-red)', marginBottom: '1.25rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertCircle size={16} /> {modalError}
              </div>
            )}

            <div className="input-group">
              <label>Select Coupons</label>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                {([
                  ['batch', 'Whole batch'],
                  ['range', 'Position range'],
                  ['denomination', 'By denomination'],
                ] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    className={`btn ${selectionMode === mode ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1, padding: '0.5rem', fontSize: '0.85rem' }}
                    onClick={() => setSelectionMode(mode)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {selectionMode === 'batch' && (
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0 }}>
                  All {batch.quantity} coupons in this batch.
                </p>
              )}

              {selectionMode === 'range' && (
                <>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <input
                      type="number"
                      className="input-field"
                      placeholder="From (1)"
                      min={1}
                      max={batch.quantity}
                      value={rangeStart}
                      onChange={(e) => setRangeStart(e.target.value)}
                    />
                    <span style={{ color: 'var(--color-text-muted)' }}>→</span>
                    <input
                      type="number"
                      className="input-field"
                      placeholder={`To (${batch.quantity})`}
                      min={1}
                      max={batch.quantity}
                      value={rangeEnd}
                      onChange={(e) => setRangeEnd(e.target.value)}
                    />
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.4rem' }}>
                    Positions are 1-indexed by generation order (each coupon's batch sequence), inclusive on both ends.
                  </p>
                </>
              )}

              {selectionMode === 'denomination' && (
                <>
                  {pickLines.map((line, index) => (
                    <div key={index} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.6rem' }}>
                      <input
                        type="number"
                        className="input-field"
                        placeholder="Denomination (L)"
                        min={1}
                        step="any"
                        value={line.denomination}
                        onChange={(e) => setPickLines(prev => prev.map((l, i) => i === index ? { ...l, denomination: e.target.value } : l))}
                      />
                      <span style={{ color: 'var(--color-text-muted)' }}>×</span>
                      <input
                        type="number"
                        className="input-field"
                        placeholder="Quantity"
                        min={1}
                        value={line.count}
                        onChange={(e) => setPickLines(prev => prev.map((l, i) => i === index ? { ...l, count: e.target.value } : l))}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '0.4rem 0.6rem' }}
                        onClick={() => setPickLines(prev => prev.filter((_, i) => i !== index))}
                        disabled={pickLines.length === 1}
                        title="Remove line"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}
                    onClick={() => setPickLines(prev => [...prev, { denomination: '', count: '1' }])}
                  >
                    <Plus size={16} /> Add denomination
                  </button>
                </>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="input-group">
                <label>To Location (optional)</label>
                <select className="input-field" value={toLocationId} onChange={(e) => setToLocationId(e.target.value)}>
                  <option value="">Keep current</option>
                  {locations.map(l => (
                    <option key={l.id} value={l.id}>{l.name} ({l.code})</option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label>To Department (optional)</label>
                <select className="input-field" value={toDepartmentId} onChange={(e) => setToDepartmentId(e.target.value)}>
                  <option value="">Keep current</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="input-group">
              <label>Target Status</label>
              <select className="input-field" value={transferStatus} onChange={(e) => setTransferStatus(e.target.value as CouponStatus | '')}>
                <option value="">Keep current status</option>
                {COUPON_STATUSES.map(s => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
              {!transferStatus && (
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.4rem' }}>
                  A pure move (no status change) only applies to coupons currently In Stock — Allocated,
                  Redeemed, and even In Transit (mid-transfer — must be received back first) are not eligible.
                  {selectionMode === 'denomination'
                    ? ' Ineligible coupons are skipped when picking by denomination.'
                    : ' If any selected coupon isn’t eligible, the whole transfer fails.'}
                </p>
              )}
            </div>

            <div className="input-group">
              <label>Reason {transferStatus === 'CANCELLED' || transferStatus === 'FLAGGED' ? '(required)' : '(optional)'}</label>
              <input
                className="input-field"
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                maxLength={255}
                placeholder="Recorded in the audit trail"
              />
            </div>

            <div className="input-group">
              <label>Performed By</label>
              <input className="input-field" value={performedBy} onChange={(e) => setPerformedBy(e.target.value)} maxLength={100} />
            </div>

            {(toLocationId || toDepartmentId) && (
              <p style={{ fontSize: '0.8rem', color: '#60a5fa', marginBottom: '1rem' }}>
                Location/department changes require supervisor approval — nothing moves until the request is approved.
                {toDepartmentId && ' A department change also needs a second sign-off: approval only puts the coupons In Transit, and the receiving department must confirm receipt before they actually land there.'}
                {selectionMode === 'denomination' && ' The exact coupons picked now are pinned into the approval request, so the supervisor sees precisely which ones.'}
              </p>
            )}

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleTransfer} disabled={transferring}>
                {transferring ? 'Submitting...' : (toLocationId || toDepartmentId) ? 'Submit for Approval' : 'Apply Transfer'}
              </button>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowTransfer(false)} disabled={transferring}>
                Cancel
              </button>
            </div>
        </Modal>
      )}
    </div>
  );
};
