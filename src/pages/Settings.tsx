import React, { useEffect, useState } from 'react';
import { Settings as SettingsIcon, Save, AlertCircle, CheckCircle } from 'lucide-react';
import { getBulkLimit, updateBulkLimit, getValidityPeriod, updateValidityPeriod } from '../services/config';
import { getErrorMessage } from '../services/api';

export const Settings: React.FC = () => {
  const [maxCount, setMaxCount] = useState<number>(20000);
  const [validityDays, setValidityDays] = useState<number>(365);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const [limitRes, validityRes] = await Promise.all([
          getBulkLimit(),
          getValidityPeriod()
        ]);
        setMaxCount(limitRes.data.maxCount);
        setValidityDays(validityRes.data.defaultValidityDays);
        // Show the most recent change across both settings
        const updates = [limitRes.data.updatedAt, validityRes.data.updatedAt].filter(Boolean);
        setLastUpdated(updates.sort().pop() || null);
      } catch {
        setError('Failed to load configuration. Default limits assumed.');
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      if (maxCount < 1) {
        throw new Error('Bulk limit must be at least 1.');
      }
      if (validityDays < 1 || validityDays > 3650) {
        throw new Error('Default validity must be between 1 and 3650 days.');
      }
      const [limitRes, validityRes] = await Promise.all([
        updateBulkLimit(maxCount),
        updateValidityPeriod(validityDays)
      ]);
      setSuccess('Configuration updated successfully.');
      setMaxCount(limitRes.data.maxCount);
      setValidityDays(validityRes.data.defaultValidityDays);
      const updates = [limitRes.data.updatedAt, validityRes.data.updatedAt].filter(Boolean);
      setLastUpdated(updates.sort().pop() || null);

      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to update configuration.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex-center animate-fade-in" style={{ height: '60vh' }}><div style={{ color: 'var(--color-accent-gold)' }}>Loading configuration...</div></div>;
  }

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ padding: '0.75rem', background: 'rgba(206, 166, 32, 0.1)', borderRadius: '8px', color: 'var(--color-accent-gold)' }}>
          <SettingsIcon size={24} />
        </div>
        <div>
          <h1>System Configuration</h1>
          <p style={{ margin: 0 }}>Manage global system settings and constraints.</p>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '2rem', maxWidth: '600px' }}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem' }}>
          Generation Constraints
        </h2>

        {error && (
          <div style={{ padding: '1rem', background: 'rgba(208, 76, 87, 0.1)', border: '1px solid var(--color-accent-red)', borderRadius: '8px', color: 'var(--color-accent-red)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={20} /> {error}
          </div>
        )}

        {success && (
          <div style={{ padding: '1rem', background: 'rgba(74, 222, 128, 0.1)', border: '1px solid #4ade80', borderRadius: '8px', color: '#4ade80', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle size={20} /> {success}
          </div>
        )}

        <form onSubmit={handleSave}>
          <div className="input-group">
            <label>Maximum Bulk Generation Limit</label>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem', marginTop: '-0.25rem' }}>
              The maximum number of coupons that can be generated in a single bulk request.
            </p>
            <input
              type="number"
              className="input-field"
              min={1}
              max={1000000}
              value={maxCount}
              onChange={e => setMaxCount(parseInt(e.target.value, 10) || 0)}
              required
            />
          </div>

          <div className="input-group">
            <label>Default Coupon Validity (days)</label>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem', marginTop: '-0.25rem' }}>
              Applied when coupons are generated without an expiry date: creation date + this many days.
              Changing it only affects coupons generated afterwards — existing expiry dates are never rewritten.
            </p>
            <input
              type="number"
              className="input-field"
              min={1}
              max={3650}
              value={validityDays}
              onChange={e => setValidityDays(parseInt(e.target.value, 10) || 0)}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2rem' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
              {lastUpdated && `Last updated: ${new Date(lastUpdated).toLocaleString()}`}
            </div>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              <Save size={18} />
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
