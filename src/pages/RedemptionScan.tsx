import React, { useEffect, useRef, useState } from 'react';
import { QrCode, Camera, CameraOff, Keyboard, Trash2, AlertCircle, CheckCircle2, Banknote, Loader2 } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { Link } from 'react-router-dom';
import { submitRedemption, verifyRedemptionScan } from '../services/redemptions';
import type { RedemptionRequest } from '../services/redemptions';
import { getLocations } from '../services/locations';
import type { LocationDetail } from '../services/locations';
import { getErrorMessage } from '../services/api';

const SCANNER_ELEMENT_ID = 'redemption-qr-reader';

interface PendingItem {
  key: string; // qrPayload, or `manual:${couponNumber}` — used for dedup and list keys
  source: 'scan' | 'manual';
  label: string; // what's shown in the list — the coupon number for manual entries, a short tag for scans
  // Read-only pre-check via /redemptions/scan — only run for camera scans, since it verifies a QR
  // payload rather than a typed coupon number. Purely informational: doesn't block submit, since a
  // failed/slow check shouldn't stop an otherwise-valid batch.
  verifying?: boolean;
  redeemable?: boolean;
  verifyReason?: string | null;
}

export const RedemptionScan: React.FC = () => {
  const [locations, setLocations] = useState<LocationDetail[]>([]);
  const [locationId, setLocationId] = useState('');
  const [performedBy, setPerformedBy] = useState<string>(() => localStorage.getItem('username') || '');

  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const [manualNumber, setManualNumber] = useState('');
  const [items, setItems] = useState<PendingItem[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<RedemptionRequest | null>(null);

  useEffect(() => {
    getLocations(true).then(res => setLocations(res.data || [])).catch(() => setLocations([]));
  }, []);

  useEffect(() => {
    // Stop the camera on unmount so it isn't left running in the background.
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {}).finally(() => scannerRef.current?.clear());
      }
    };
  }, []);

  // onNew fires only the first time this key is added — used to kick off verification exactly
  // once per scan without relying on a (potentially stale, closed-over) copy of `items`.
  const addItem = (item: PendingItem, onNew?: () => void) => {
    setItems(prev => {
      if (prev.some(i => i.key === item.key)) return prev;
      onNew?.();
      return [...prev, item];
    });
  };

  const updateItem = (key: string, patch: Partial<PendingItem>) => {
    setItems(prev => prev.map(i => (i.key === key ? { ...i, ...patch } : i)));
  };

  const verifyScan = (scannedPayload: string) => {
    updateItem(scannedPayload, { verifying: true });
    verifyRedemptionScan(scannedPayload)
      .then(res => {
        const { coupon, redeemable, reason } = res.data;
        updateItem(scannedPayload, {
          verifying: false,
          redeemable,
          verifyReason: reason,
          label: `${coupon.couponNumber} (${coupon.denomination > 0 ? `${coupon.denomination} L` : coupon.fuelType.name})`
        });
      })
      .catch(() => updateItem(scannedPayload, { verifying: false })); // best-effort — leave unverified rather than blocking
  };

  const startScanning = async () => {
    setCameraError(null);
    setSuccess(null);
    const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
    scannerRef.current = scanner;
    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          // Decoded client-side only to detect the code's presence — the raw string is what
          // gets sent to the backend, never parsed or re-derived here.
          addItem(
            { key: decodedText, source: 'scan', label: `Scanned coupon (${decodedText.length} chars)` },
            () => verifyScan(decodedText)
          );
        },
        () => { /* per-frame "no QR found" noise — ignored */ }
      );
      setScanning(true);
    } catch (err) {
      setCameraError(getErrorMessage(err, 'Could not access the camera. Check permissions and try again.'));
      scannerRef.current = null;
    }
  };

  const stopScanning = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch {
        // already stopped
      }
      scannerRef.current = null;
    }
    setScanning(false);
  };

  const addManual = () => {
    const number = manualNumber.trim();
    if (!number) return;
    addItem({ key: `manual:${number}`, source: 'manual', label: number });
    setManualNumber('');
  };

  const removeItem = (key: string) => {
    setItems(prev => prev.filter(i => i.key !== key));
  };

  const handleSubmit = async () => {
    if (!locationId) {
      setError('Select the site this redemption is happening at.');
      return;
    }
    if (!performedBy.trim()) {
      setError('Your name is required.');
      return;
    }
    if (items.length === 0) {
      setError('Scan or type at least one coupon.');
      return;
    }

    const scannedPayloads = items.filter(i => i.source === 'scan').map(i => i.key);
    const couponNumbers = items.filter(i => i.source === 'manual').map(i => i.label);

    setSubmitting(true);
    setError(null);
    try {
      const res = await submitRedemption({
        ...(scannedPayloads.length > 0 ? { scannedPayloads } : {}),
        ...(couponNumbers.length > 0 ? { couponNumbers } : {}),
        locationId: parseInt(locationId, 10),
        performedBy: performedBy.trim()
      });
      setSuccess(res.data);
      setItems([]);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to submit for redemption.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '2rem' }}>
        <h1><QrCode size={28} style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />Scan &amp; Redeem</h1>
        <p style={{ margin: 0 }}>Scan coupon QR codes and/or type coupon numbers, then submit for redemption. This always waits for the coupon section to post it against an ERP document — it never applies immediately.</p>
      </div>

      {error && (
        <div style={{ padding: '1rem', background: 'rgba(208, 76, 87, 0.1)', border: '1px solid var(--color-accent-red)', borderRadius: '8px', color: 'var(--color-accent-red)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertCircle size={20} /> {error}
        </div>
      )}
      {success && (
        <div style={{ padding: '1rem', background: 'rgba(74, 222, 128, 0.1)', border: '1px solid #4ade80', borderRadius: '8px', color: '#4ade80', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <CheckCircle2 size={20} />
          <span>
            Submitted for redemption — request #{success.id} ({success.count} coupon{success.count === 1 ? '' : 's'}), status <span className="badge badge-warning">PENDING</span>. It'll post once the coupon section attaches a document number.
          </span>
          <Link to="/redemptions" className="btn btn-secondary" style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem', marginLeft: 'auto' }}>
            View Redemptions
          </Link>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(280px, 1fr)', gap: '1.5rem' }}>
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '1rem', color: 'var(--color-accent-gold)' }}>Redemption Details</h3>
          <div className="input-group">
            <label>Site (asserted location)</label>
            <select className="input-field" value={locationId} onChange={(e) => setLocationId(e.target.value)} required>
              <option value="">Select...</option>
              {locations.map(l => (
                <option key={l.id} value={l.id}>{l.name} ({l.code})</option>
              ))}
            </select>
          </div>
          <div className="input-group">
            <label>Attendant (performed by)</label>
            <input className="input-field" value={performedBy} onChange={(e) => setPerformedBy(e.target.value)} required />
          </div>

          <h3 style={{ fontSize: '1rem', margin: '1.5rem 0 1rem', color: 'var(--color-accent-gold)' }}>Camera Scan</h3>
          {cameraError && (
            <div style={{ padding: '0.75rem 1rem', background: 'rgba(208, 76, 87, 0.1)', border: '1px solid var(--color-accent-red)', borderRadius: '8px', color: 'var(--color-accent-red)', marginBottom: '1rem', fontSize: '0.85rem' }}>
              {cameraError}
            </div>
          )}
          <div
            id={SCANNER_ELEMENT_ID}
            style={{ width: '100%', minHeight: scanning ? '260px' : '0', borderRadius: '8px', overflow: 'hidden', marginBottom: scanning ? '1rem' : 0, background: scanning ? '#000' : 'transparent' }}
          />
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={scanning ? stopScanning : startScanning}>
            {scanning ? <><CameraOff size={18} /> Stop Camera</> : <><Camera size={18} /> Start Camera</>}
          </button>

          <h3 style={{ fontSize: '1rem', margin: '1.5rem 0 1rem', color: 'var(--color-accent-gold)' }}>
            <Keyboard size={16} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />Type a Coupon Number
          </h3>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <input
              className="input-field"
              placeholder="e.g. PU002M0000001"
              value={manualNumber}
              onChange={(e) => setManualNumber(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addManual(); }}
            />
            <button className="btn btn-secondary" onClick={addManual} disabled={!manualNumber.trim()}>Add</button>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '1rem', color: 'var(--color-accent-gold)' }}>
            Pending Coupons ({items.length})
          </h3>
          {items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--color-text-muted)', flex: 1 }}>
              <div style={{ marginBottom: '1rem', color: 'rgba(255,255,255,0.1)' }}>
                <Banknote size={40} style={{ margin: '0 auto' }} />
              </div>
              Scanned or typed coupons will appear here before you submit.
            </div>
          ) : (
            <div style={{ flex: 1, overflowY: 'auto', maxHeight: '420px' }}>
              {items.map(item => (
                <div
                  key={item.key}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.75rem',
                    borderRadius: '6px', background: 'rgba(255,255,255,0.03)', marginBottom: '0.5rem',
                    border: item.redeemable === false ? '1px solid var(--color-accent-red)' : '1px solid transparent'
                  }}
                >
                  <span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                    <span className={`badge ${item.source === 'scan' ? 'badge-info' : 'badge-success'}`} style={{ marginRight: '0.6rem', fontSize: '0.65rem' }}>
                      {item.source === 'scan' ? 'QR' : 'TYPED'}
                    </span>
                    {item.label}
                    {item.verifying && <span style={{ color: 'var(--color-text-muted)', marginLeft: '0.5rem' }}><Loader2 size={12} style={{ verticalAlign: 'middle' }} /> checking...</span>}
                    {item.redeemable === true && <CheckCircle2 size={14} color="#4ade80" style={{ verticalAlign: 'middle', marginLeft: '0.5rem' }} />}
                    {item.redeemable === false && (
                      <span style={{ color: 'var(--color-accent-red)', fontSize: '0.75rem', marginLeft: '0.5rem' }}>
                        not redeemable{item.verifyReason ? ` — ${item.verifyReason}` : ''}
                      </span>
                    )}
                  </span>
                  <button className="btn btn-secondary" style={{ padding: '0.3rem 0.5rem' }} onClick={() => removeItem(item.key)} title="Remove">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '1.5rem' }}
            onClick={handleSubmit}
            disabled={submitting || items.length === 0}
          >
            {submitting ? 'Submitting...' : `Submit ${items.length} Coupon${items.length === 1 ? '' : 's'} for Redemption`}
          </button>
        </div>
      </div>
    </div>
  );
};
