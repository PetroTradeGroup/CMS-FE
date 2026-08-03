import React, { useEffect, useMemo, useState } from 'react';
import { Banknote, Layers, AlertCircle, CheckCircle2, Plus, Trash2, Scale } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { generateCoupon, generateBulkCoupons } from '../services/coupons';
import type { CouponType, DenominationLine } from '../services/coupons';
import { getActiveFuelTypes } from '../services/fuelTypes';
import type { FuelType } from '../services/fuelTypes';
import { getDepartments } from '../services/departments';
import type { Department } from '../services/departments';
import { getBulkLimit, getValidityPeriod } from '../services/config';
import { getErrorMessage } from '../services/api';

interface LineInput {
  denomination: string;
  count: string;
}

const COMMON_DENOMINATIONS = [5, 10, 20, 50];

export const GenerateCoupons: React.FC = () => {
  const navigate = useNavigate();
  const [fuelTypes, setFuelTypes] = useState<FuelType[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [bulkLimit, setBulkLimit] = useState(20000);
  const [defaultValidityDays, setDefaultValidityDays] = useState<number | null>(null);

  // Form State
  const [generationType, setGenerationType] = useState<'single' | 'bulk'>('single');
  const [selectedFuelType, setSelectedFuelType] = useState<string>('');
  const [singleDenomination, setSingleDenomination] = useState<string>('20');
  const [targetQuantity, setTargetQuantity] = useState<string>('50');
  const [lines, setLines] = useState<LineInput[]>([{ denomination: '20', count: '1' }]);
  const [couponType, setCouponType] = useState<CouponType>('PHYSICAL');
  const [expiryDate, setExpiryDate] = useState<string>('');
  const [departmentId, setDepartmentId] = useState<string>('');
  const [performedBy, setPerformedBy] = useState<string>(() => localStorage.getItem('username') || '');

  // Status State
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const fetchPrerequisites = async () => {
      try {
        const [ftRes, limitRes, deptRes, validityRes] = await Promise.all([
          getActiveFuelTypes(0, 100), // Get up to 100 fuel types for the dropdown
          getBulkLimit().catch(() => ({ data: { maxCount: 20000 } })),
          getDepartments(true).catch(() => ({ data: [] as Department[] })),
          getValidityPeriod().catch(() => ({ data: null }))
        ]);

        const types = ftRes.data?.content || [];
        setFuelTypes(types);
        if (types.length > 0) {
          setSelectedFuelType(types[0].id.toString());
        }
        setBulkLimit(limitRes.data?.maxCount || 20000);
        setDepartments(deptRes.data || []);
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

  // Live breakdown totals for the bulk form
  const breakdown = useMemo(() => {
    const target = parseFloat(targetQuantity) || 0;
    let litres = 0;
    let coupons = 0;
    let hasInvalidLine = false;

    for (const line of lines) {
      const denom = parseFloat(line.denomination);
      const count = parseInt(line.count, 10);
      if (!denom || denom <= 0 || !count || count < 1) {
        hasInvalidLine = true;
        continue;
      }
      litres += denom * count;
      coupons += count;
    }

    return {
      target,
      litres,
      coupons,
      diff: litres - target,
      matched: !hasInvalidLine && target > 0 && litres === target,
      hasInvalidLine,
      overLimit: coupons > bulkLimit
    };
  }, [lines, targetQuantity, bulkLimit]);

  const updateLine = (index: number, field: keyof LineInput, value: string) => {
    setLines(prev => prev.map((line, i) => (i === index ? { ...line, [field]: value } : line)));
  };

  const addLine = (denomination = '') => {
    setLines(prev => [...prev, { denomination, count: '1' }]);
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
    if (!selectedFuelType) {
      setError('Please select a fuel type.');
      return;
    }

    setError(null);
    setSuccess(null);

    const fuelTypeId = parseInt(selectedFuelType, 10);

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
    if (breakdown.target <= 0) {
      setError('Target quantity must be greater than 0 litres.');
      return;
    }
    if (lines.length === 0 || breakdown.hasInvalidLine) {
      setError('Every denomination line needs a denomination > 0 and a count of at least 1.');
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

    const requestLines: DenominationLine[] = lines.map(line => ({
      denomination: parseFloat(line.denomination),
      count: parseInt(line.count, 10)
    }));

    setGenerating(true);
    try {
      const res = await generateBulkCoupons({
        fuelTypeId,
        targetQuantity: breakdown.target,
        lines: requestLines,
        ...buildOptionalFields()
      });
      const batchNumber = res.data[0]?.batchNumber;
      setSuccess(
        `Successfully generated ${res.data.length} coupons (${breakdown.target} L)` +
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
    fuelTypes.length === 0 ||
    (generationType === 'bulk' && (!breakdown.matched || breakdown.overLimit));

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
          </div>

          <form onSubmit={handleGenerate}>
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
                    <strong>{breakdown.litres.toLocaleString()} L</strong> across <strong>{breakdown.coupons.toLocaleString()}</strong> coupon{breakdown.coupons === 1 ? '' : 's'}
                    {breakdown.matched && ' — matches target ✓'}
                    {!breakdown.matched && breakdown.target > 0 && breakdown.diff !== 0 && (
                      <> — {breakdown.diff > 0 ? 'over' : 'under'} target by <strong>{Math.abs(breakdown.diff).toLocaleString()} L</strong></>
                    )}
                    {breakdown.hasInvalidLine && ' — fix incomplete lines'}
                    {breakdown.overLimit && (
                      <> — exceeds bulk limit of {bulkLimit.toLocaleString()} coupons</>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Shared optional fields */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="input-group">
                <label>Coupon Type</label>
                <select className="input-field" value={couponType} onChange={(e) => setCouponType(e.target.value as CouponType)}>
                  <option value="PHYSICAL">Physical</option>
                  <option value="DIGITAL">Digital</option>
                </select>
              </div>
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
              <div className="input-group">
                <label>Department (optional)</label>
                <select className="input-field" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                  <option value="">Default (Stocks)</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                  ))}
                </select>
              </div>
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
                {generating ? 'Generating...' : `Generate ${generationType === 'single' ? 'Coupon' : 'Coupons'}`}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
