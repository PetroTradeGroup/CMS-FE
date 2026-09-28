import React, { useEffect, useMemo, useState } from 'react';
import { Banknote, Layers, History, FileSpreadsheet, AlertCircle, CheckCircle2, Plus, Trash2, Scale } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { generateCoupon, generateBulkCoupons, importLegacyCoupon, importLegacyCouponsBulk } from '../services/coupons';
import type { CouponType, BulkDenominationLineInput, LegacyBulkImportResult } from '../services/coupons';
import { getActiveFuelTypes } from '../services/fuelTypes';
import type { FuelType } from '../services/fuelTypes';
import { getDepartments } from '../services/departments';
import type { Department } from '../services/departments';
import { getLocations } from '../services/locations';
import type { LocationDetail } from '../services/locations';
import { getBulkLimit, getValidityPeriod } from '../services/config';
import { getErrorMessage } from '../services/api';

interface LineInput {
  denomination: string;
  books: string;
  count: string;
}

const COMMON_DENOMINATIONS = [5, 10, 20, 50];

export const GenerateCoupons: React.FC = () => {
  const navigate = useNavigate();
  const [fuelTypes, setFuelTypes] = useState<FuelType[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [locations, setLocations] = useState<LocationDetail[]>([]);
  const [bulkLimit, setBulkLimit] = useState(20000);
  const [defaultValidityDays, setDefaultValidityDays] = useState<number | null>(null);

  // Form State
  const [generationType, setGenerationType] = useState<'single' | 'bulk' | 'legacy' | 'legacyBulk'>('single');
  const [selectedFuelType, setSelectedFuelType] = useState<string>('');
  const [singleDenomination, setSingleDenomination] = useState<string>('20');
  const [targetQuantity, setTargetQuantity] = useState<string>('50');
  const [bulkUnit, setBulkUnit] = useState<'books' | 'count'>('books');
  const [lines, setLines] = useState<LineInput[]>([{ denomination: '20', books: '1', count: '1' }]);
  const [couponType, setCouponType] = useState<CouponType>('PHYSICAL');
  const [expiryDate, setExpiryDate] = useState<string>('');
  const [departmentId, setDepartmentId] = useState<string>('');
  const [performedBy, setPerformedBy] = useState<string>(() => localStorage.getItem('username') || '');
  const [legacyCouponNumber, setLegacyCouponNumber] = useState<string>('');
  const [legacyLocationId, setLegacyLocationId] = useState<string>('');
  const [legacyBulkFile, setLegacyBulkFile] = useState<File | null>(null);
  const [legacyBulkDryRun, setLegacyBulkDryRun] = useState(false);

  // Status State
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [bulkImportResult, setBulkImportResult] = useState<LegacyBulkImportResult | null>(null);

  useEffect(() => {
    const fetchPrerequisites = async () => {
      try {
        const [ftRes, limitRes, deptRes, locRes, validityRes] = await Promise.all([
          getActiveFuelTypes(0, 100), // Get up to 100 fuel types for the dropdown
          getBulkLimit().catch(() => ({ data: { maxCount: 20000 } })),
          getDepartments(true).catch(() => ({ data: [] as Department[] })),
          getLocations(true).catch(() => ({ data: [] as LocationDetail[] })),
          getValidityPeriod().catch(() => ({ data: null }))
        ]);

        const types = ftRes.data?.content || [];
        setFuelTypes(types);
        if (types.length > 0) {
          setSelectedFuelType(types[0].id.toString());
        }
        setBulkLimit(limitRes.data?.maxCount || 20000);
        setDepartments(deptRes.data || []);
        setLocations(locRes.data || []);
        setDefaultValidityDays(validityRes.data?.defaultValidityDays ?? null);
      } catch (err) {
        console.error('Failed to load prerequisites', err);
        setError('Failed to load active fuel types. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchPrerequisites();
  }, []);

  // Live breakdown totals for the bulk form. In "books" mode the book→coupon conversion is
  // server-side, so there's no litres/coupon-count math to mirror here — just tally books and
  // let the backend derive targetQuantity and enforce the bulk limit.
  const breakdown = useMemo(() => {
    const target = parseFloat(targetQuantity) || 0;
    let litres = 0;
    let coupons = 0;
    let books = 0;
    let hasInvalidLine = false;

    for (const line of lines) {
      const denom = parseFloat(line.denomination);
      if (!denom || denom <= 0) {
        hasInvalidLine = true;
        continue;
      }
      if (bulkUnit === 'books') {
        const b = parseInt(line.books, 10);
        if (!b || b < 1) {
          hasInvalidLine = true;
          continue;
        }
        books += b;
      } else {
        const count = parseInt(line.count, 10);
        if (!count || count < 1) {
          hasInvalidLine = true;
          continue;
        }
        litres += denom * count;
        coupons += count;
      }
    }

    if (bulkUnit === 'books') {
      return { target, litres, coupons, books, diff: 0, matched: !hasInvalidLine && books > 0, hasInvalidLine, overLimit: false };
    }

    return {
      target,
      litres,
      coupons,
      books,
      diff: litres - target,
      matched: !hasInvalidLine && target > 0 && litres === target,
      hasInvalidLine,
      overLimit: coupons > bulkLimit
    };
  }, [lines, targetQuantity, bulkLimit, bulkUnit]);

  const updateLine = (index: number, field: keyof LineInput, value: string) => {
    setLines(prev => prev.map((line, i) => (i === index ? { ...line, [field]: value } : line)));
  };

  const addLine = (denomination = '') => {
    setLines(prev => [...prev, { denomination, books: '1', count: '1' }]);
  };

  const removeLine = (index: number) => {
    setLines(prev => prev.filter((_, i) => i !== index));
  };

  const buildOptionalFields = () => ({
    ...(departmentId ? { departmentId: parseInt(departmentId, 10) } : {}),
    couponType,
    ...(expiryDate ? { expiryDate } : {}),
    ...(performedBy.trim() ? { performedBy: performedBy.trim() } : {})
  });

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    // Fuel type is per-row in a bulk legacy spreadsheet (fuelTypeCode column) — not selected here.
    if (generationType !== 'legacyBulk' && !selectedFuelType) {
      setError('Please select a fuel type.');
      return;
    }

    setError(null);
    setSuccess(null);
    setBulkImportResult(null);

    if (generationType === 'legacyBulk') {
      if (!legacyBulkFile) {
        setError('Choose an .xlsx file to import.');
        return;
      }
      setGenerating(true);
      try {
        const res = await importLegacyCouponsBulk(legacyBulkFile, {
          dryRun: legacyBulkDryRun,
          performedBy: performedBy.trim() || undefined
        });
        setBulkImportResult(res.data);
        setSuccess(res.message || `${res.data.succeeded} of ${res.data.totalRows} row(s) registered`);
      } catch (err) {
        setError(getErrorMessage(err, 'Failed to import the spreadsheet.'));
      } finally {
        setGenerating(false);
      }
      return;
    }

    const fuelTypeId = parseInt(selectedFuelType, 10);

    if (generationType === 'legacy') {
      if (!legacyCouponNumber.trim()) {
        setError('The coupon\'s existing barcode/number is required.');
        return;
      }
      if (!legacyLocationId) {
        setError('Select the location this coupon is being registered at.');
        return;
      }
      const denomination = parseFloat(singleDenomination);
      if (!denomination || denomination <= 0) {
        setError('Denomination must be a positive number of litres.');
        return;
      }

      setGenerating(true);
      try {
        const res = await importLegacyCoupon({
          couponNumber: legacyCouponNumber.trim(),
          fuelTypeId,
          denomination,
          locationId: parseInt(legacyLocationId, 10),
          ...(departmentId ? { departmentId: parseInt(departmentId, 10) } : {}),
          ...(expiryDate ? { expiryDate } : {}),
          ...(performedBy.trim() ? { performedBy: performedBy.trim() } : {})
        });
        setSuccess(`Imported legacy coupon ${res.data.couponNumber} — now ALLOCATED.`);
        setTimeout(() => navigate('/coupons'), 2500);
      } catch (err) {
        setError(getErrorMessage(err, 'Failed to import legacy coupon.'));
      } finally {
        setGenerating(false);
      }
      return;
    }

    if (generationType === 'single') {
      const denomination = parseFloat(singleDenomination);
      if (!denomination || denomination <= 0) {
        setError('Denomination must be a positive number of litres.');
        return;
      }

      setGenerating(true);
      try {
        const res = await generateCoupon({ fuelTypeId, denomination, ...buildOptionalFields() });
        setSuccess(`Successfully generated coupon: ${res.data.couponNumber} (${denomination} L)`);
        setTimeout(() => navigate('/coupons'), 2500);
      } catch (err) {
        setError(getErrorMessage(err, 'An error occurred during generation.'));
      } finally {
        setGenerating(false);
      }
      return;
    }

    // Bulk — mirror server-side validation before submitting
    if (lines.length === 0 || breakdown.hasInvalidLine) {
      setError(`Every denomination line needs a denomination > 0 and a ${bulkUnit === 'books' ? 'book count' : 'count'} of at least 1.`);
      return;
    }

    if (bulkUnit === 'count') {
      if (breakdown.target <= 0) {
        setError('Target quantity must be greater than 0 litres.');
        return;
      }
      if (!breakdown.matched) {
        const dir = breakdown.diff > 0 ? 'over' : 'under';
        setError(`Denomination breakdown totals ${breakdown.litres} L but target is ${breakdown.target} L (${dir} by ${Math.abs(breakdown.diff)} L).`);
        return;
      }
      if (breakdown.overLimit) {
        setError(`Total coupon count (${breakdown.coupons.toLocaleString()}) exceeds the bulk limit of ${bulkLimit.toLocaleString()}.`);
        return;
      }
    }

    const requestLines: BulkDenominationLineInput[] = lines.map(line => ({
      denomination: parseFloat(line.denomination),
      ...(bulkUnit === 'books' ? { books: parseInt(line.books, 10) } : { count: parseInt(line.count, 10) })
    }));

    setGenerating(true);
    try {
      const res = await generateBulkCoupons({
        fuelTypeId,
        ...(bulkUnit === 'count' ? { targetQuantity: breakdown.target } : {}), // derived server-side in books mode
        lines: requestLines,
        ...buildOptionalFields()
      });
      const batchNumber = res.data[0]?.batchNumber;
      setSuccess(
        `Successfully generated ${res.data.length} coupons` +
        (bulkUnit === 'count' ? ` (${breakdown.target} L)` : ` (${breakdown.books} books)`) +
        (batchNumber ? ` in batch ${batchNumber}.` : '.')
      );
      setTimeout(() => navigate('/coupons'), 3000);
    } catch (err) {
      setError(getErrorMessage(err, 'An error occurred during generation.'));
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-center animate-fade-in" style={{ height: '60vh' }}>
        <div style={{ color: 'var(--color-accent-gold)', fontSize: '1.2rem' }}>Loading fuel types...</div>
      </div>
    );
  }

  const submitDisabled =
    generating ||
    (generationType !== 'legacyBulk' && fuelTypes.length === 0) ||
    (generationType === 'bulk' && (!breakdown.matched || breakdown.overLimit)) ||
    (generationType === 'legacyBulk' && !legacyBulkFile);

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '2rem' }}>
        <h1>Generate Coupons</h1>
        <p style={{ margin: 0 }}>Order coupons by fuel volume with a denomination breakdown.</p>
      </div>

      <div style={{ maxWidth: '860px' }}>

        <div className="glass-panel" style={{ padding: '2rem' }}>

          {error && (
            <div style={{ padding: '1rem', background: 'rgba(208, 76, 87, 0.1)', border: '1px solid var(--color-accent-red)', borderRadius: '8px', color: 'var(--color-accent-red)', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertCircle size={20} />
              {error}
            </div>
          )}

          {success && (
            <div style={{ padding: '1rem', background: 'rgba(74, 222, 128, 0.1)', border: '1px solid #4ade80', borderRadius: '8px', color: '#4ade80', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle2 size={20} />
              {success}
            </div>
          )}

          {generationType === 'legacyBulk' && bulkImportResult && (
            <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem', background: 'rgba(0,0,0,0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--color-accent-gold)' }}>
                  Import Result {bulkImportResult.dryRun && <span className="badge badge-warning" style={{ marginLeft: '0.5rem' }}>DRY RUN</span>}
                </h3>
                <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                  {bulkImportResult.succeeded} succeeded · {bulkImportResult.failed} failed · {bulkImportResult.totalRows} total
                </span>
              </div>
              {bulkImportResult.results.length > 0 && (
                <div className="table-container" style={{ maxHeight: '360px', overflowY: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Row</th>
                        <th>Coupon Number</th>
                        <th>Result</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkImportResult.results.map(r => (
                        <tr key={r.row}>
                          <td style={{ color: 'var(--color-text-muted)' }}>{r.row}</td>
                          <td style={{ fontFamily: 'monospace' }}>{r.couponNumber}</td>
                          <td>
                            <span className={`badge ${r.success ? 'badge-success' : 'badge-danger'}`}>
                              {r.success ? 'OK' : 'Failed'}
                            </span>
                          </td>
                          <td style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>{r.reason || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
            <button
              className={`btn ${generationType === 'single' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1 }}
              onClick={() => setGenerationType('single')}
              type="button"
            >
              <Banknote size={18} /> Single Coupon
            </button>
            <button
              className={`btn ${generationType === 'bulk' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1 }}
              onClick={() => setGenerationType('bulk')}
              type="button"
            >
              <Layers size={18} /> Bulk Generation
            </button>
            <button
              className={`btn ${generationType === 'legacy' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1 }}
              onClick={() => setGenerationType('legacy')}
              type="button"
            >
              <History size={18} /> Legacy Import
            </button>
            <button
              className={`btn ${generationType === 'legacyBulk' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1 }}
              onClick={() => setGenerationType('legacyBulk')}
              type="button"
            >
              <FileSpreadsheet size={18} /> Bulk Legacy Import
            </button>
          </div>

          <form onSubmit={handleGenerate}>
            {generationType !== 'legacyBulk' && (
              <div className="input-group">
                <label>Fuel Type</label>
                <select
                  className="input-field"
                  value={selectedFuelType}
                  onChange={(e) => setSelectedFuelType(e.target.value)}
                  required
                >
                  {fuelTypes.map(ft => (
                    <option key={ft.id} value={ft.id}>{ft.name} ({ft.typeCode})</option>
                  ))}
                </select>
                {fuelTypes.length === 0 && (
                  <p style={{ color: 'var(--color-accent-red)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                    No active fuel types found. Please activate one in Fuel Types management.
                  </p>
                )}
              </div>
            )}

            {generationType === 'single' && (
              <div className="input-group animate-fade-in">
                <label>Denomination (Litres)</label>
                <input
                  type="number"
                  className="input-field"
                  min={1}
                  step="any"
                  value={singleDenomination}
                  onChange={(e) => setSingleDenomination(e.target.value)}
                  required
                />
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  {COMMON_DENOMINATIONS.map(d => (
                    <button
                      key={d}
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}
                      onClick={() => setSingleDenomination(d.toString())}
                    >
                      {d} L
                    </button>
                  ))}
                </div>
              </div>
            )}

            {generationType === 'bulk' && (
              <div className="animate-fade-in">
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                  <button
                    type="button"
                    className={`btn ${bulkUnit === 'books' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}
                    onClick={() => setBulkUnit('books')}
                  >
                    Books
                  </button>
                  <button
                    type="button"
                    className={`btn ${bulkUnit === 'count' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}
                    onClick={() => setBulkUnit('count')}
                  >
                    Coupon Count
                  </button>
                </div>

                {bulkUnit === 'count' && (
                  <div className="input-group">
                    <label>Target Quantity (Litres)</label>
                    <input
                      type="number"
                      className="input-field"
                      min={1}
                      step="any"
                      value={targetQuantity}
                      onChange={(e) => setTargetQuantity(e.target.value)}
                      required
                    />
                  </div>
                )}
                {bulkUnit === 'books' && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '-0.25rem', marginBottom: '1rem' }}>
                    Physical batches must form whole books — target quantity is derived from the lines below.
                  </p>
                )}

                <div className="input-group">
                  <label>Denomination Breakdown</label>
                  {lines.map((line, index) => (
                    <div key={index} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <input
                        type="number"
                        className="input-field"
                        placeholder="Litres"
                        min={1}
                        step="any"
                        style={{ flex: 1 }}
                        value={line.denomination}
                        onChange={(e) => updateLine(index, 'denomination', e.target.value)}
                        required
                      />
                      <span style={{ color: 'var(--color-text-muted)' }}>×</span>
                      {bulkUnit === 'books' ? (
                        <input
                          type="number"
                          className="input-field"
                          placeholder="Books"
                          min={1}
                          step={1}
                          style={{ flex: 1 }}
                          value={line.books}
                          onChange={(e) => updateLine(index, 'books', e.target.value)}
                          required
                        />
                      ) : (
                        <>
                          <input
                            type="number"
                            className="input-field"
                            placeholder="Count"
                            min={1}
                            style={{ flex: 1 }}
                            value={line.count}
                            onChange={(e) => updateLine(index, 'count', e.target.value)}
                            required
                          />
                          <span style={{ color: 'var(--color-text-muted)', minWidth: '70px', textAlign: 'right', fontSize: '0.9rem' }}>
                            = {((parseFloat(line.denomination) || 0) * (parseInt(line.count, 10) || 0)).toLocaleString()} L
                          </span>
                        </>
                      )}
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '0.4rem 0.6rem' }}
                        onClick={() => removeLine(index)}
                        disabled={lines.length === 1}
                        title="Remove line"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-secondary" style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }} onClick={() => addLine()}>
                      <Plus size={16} /> Add line
                    </button>
                    {COMMON_DENOMINATIONS.map(d => (
                      <button
                        key={d}
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                        onClick={() => addLine(d.toString())}
                      >
                        + {d} L
                      </button>
                    ))}
                  </div>
                </div>

                {/* Live running total / over-under indicator */}
                <div style={{
                  padding: '1rem',
                  borderRadius: '8px',
                  marginBottom: '1.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  background: breakdown.matched ? 'rgba(74, 222, 128, 0.08)' : 'rgba(208, 76, 87, 0.08)',
                  border: `1px solid ${breakdown.matched ? '#4ade80' : 'var(--color-accent-red)'}`,
                  color: breakdown.matched ? '#4ade80' : 'var(--color-accent-red)'
                }}>
                  <Scale size={20} />
                  <div style={{ fontSize: '0.9rem' }}>
                    {bulkUnit === 'books' ? (
                      <>
                        <strong>{breakdown.books.toLocaleString()}</strong> book{breakdown.books === 1 ? '' : 's'} across {lines.length} line{lines.length === 1 ? '' : 's'}
                        {breakdown.matched && !breakdown.hasInvalidLine && ' — ready to submit ✓'}
                        {breakdown.hasInvalidLine && ' — fix incomplete lines'}
                      </>
                    ) : (
                      <>
                        <strong>{breakdown.litres.toLocaleString()} L</strong> across <strong>{breakdown.coupons.toLocaleString()}</strong> coupon{breakdown.coupons === 1 ? '' : 's'}
                        {breakdown.matched && ' — matches target ✓'}
                        {!breakdown.matched && breakdown.target > 0 && breakdown.diff !== 0 && (
                          <> — {breakdown.diff > 0 ? 'over' : 'under'} target by <strong>{Math.abs(breakdown.diff).toLocaleString()} L</strong></>
                        )}
                        {breakdown.hasInvalidLine && ' — fix incomplete lines'}
                        {breakdown.overLimit && (
                          <> — exceeds bulk limit of {bulkLimit.toLocaleString()} coupons</>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {generationType === 'legacy' && (
              <div className="animate-fade-in">
                <div className="input-group">
                  <label>Coupon Number (existing barcode)</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. OLD-BARCODE-004821"
                    value={legacyCouponNumber}
                    onChange={(e) => setLegacyCouponNumber(e.target.value)}
                    required
                  />
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.4rem' }}>
                    Used verbatim as the coupon number — not system-generated. Registers directly at
                    ALLOCATED, skipping generation/receipt. Fails if this number is already registered.
                  </p>
                </div>

                <div className="input-group">
                  <label>Denomination (Litres)</label>
                  <input
                    type="number"
                    className="input-field"
                    min={1}
                    step="any"
                    value={singleDenomination}
                    onChange={(e) => setSingleDenomination(e.target.value)}
                    required
                  />
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    {COMMON_DENOMINATIONS.map(d => (
                      <button
                        key={d}
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}
                        onClick={() => setSingleDenomination(d.toString())}
                      >
                        {d} L
                      </button>
                    ))}
                  </div>
                </div>

                <div className="input-group">
                  <label>Location</label>
                  <select className="input-field" value={legacyLocationId} onChange={(e) => setLegacyLocationId(e.target.value)} required>
                    <option value="">Select...</option>
                    {locations.map(l => (
                      <option key={l.id} value={l.id}>{l.name} ({l.code})</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {generationType === 'legacyBulk' && (
              <div className="animate-fade-in">
                <div className="input-group">
                  <label>Spreadsheet (.xlsx)</label>
                  <input
                    type="file"
                    accept=".xlsx"
                    className="input-field"
                    onChange={(e) => setLegacyBulkFile(e.target.files?.[0] ?? null)}
                    required
                  />
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.4rem' }}>
                    Header row required, columns in order: couponNumber, fuelTypeCode, denomination,
                    locationCode (optional → HQ), departmentCode (optional → Stocks), expiryDate
                    (optional, yyyy-MM-dd → system default). Each row registers directly at ALLOCATED,
                    same as a single legacy import — failures never block the rest of the file.
                  </p>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text-secondary)', cursor: 'pointer', marginBottom: '1.5rem' }}>
                  <input
                    type="checkbox"
                    checked={legacyBulkDryRun}
                    onChange={(e) => setLegacyBulkDryRun(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  Dry run — validate the whole file without registering anything
                </label>
              </div>
            )}

            {/* Shared optional fields */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              {generationType !== 'legacy' && generationType !== 'legacyBulk' && (
                <div className="input-group">
                  <label>Coupon Type</label>
                  <select className="input-field" value={couponType} onChange={(e) => setCouponType(e.target.value as CouponType)}>
                    <option value="PHYSICAL">Physical</option>
                    <option value="DIGITAL">Digital</option>
                  </select>
                </div>
              )}
              {generationType !== 'legacyBulk' && (
                <div className="input-group">
                  <label>Expiry Date (optional)</label>
                  <input
                    type="date"
                    className="input-field"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                  />
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.4rem' }}>
                    Leave blank to use the system default
                    {defaultValidityDays != null ? ` (${defaultValidityDays} days from creation)` : ''} — configurable in Settings.
                  </p>
                </div>
              )}
              {generationType !== 'legacyBulk' && (
                <div className="input-group">
                  <label>Department (optional)</label>
                  <select className="input-field" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                    <option value="">Default (Stocks)</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="input-group">
                <label>Performed By (optional)</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Your name"
                  value={performedBy}
                  onChange={(e) => setPerformedBy(e.target.value)}
                />
              </div>
            </div>

            <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--color-border)' }}>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', padding: '1rem', fontSize: '1.05rem' }}
                disabled={submitDisabled}
              >
                {generating
                  ? (generationType === 'legacy' || generationType === 'legacyBulk' ? 'Importing...' : 'Generating...')
                  : generationType === 'legacy' ? 'Import Coupon'
                  : generationType === 'legacyBulk' ? (legacyBulkDryRun ? 'Validate File (Dry Run)' : 'Import Spreadsheet')
                  : `Generate ${generationType === 'single' ? 'Coupon' : 'Coupons'}`}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
