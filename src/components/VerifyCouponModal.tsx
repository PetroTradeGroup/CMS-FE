import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Search, QrCode, KeyRound, Camera, CameraOff, CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { verifyRedemptionScan, verifyRedemptionScanByCouponNumber, verifyRedemptionScanByCode } from '../services/redemptions';
import type { ScanVerifyResult } from '../services/redemptions';
import { getStatusBadgeClass, getOriginBadgeClass, formatOrigin } from '../services/coupons';
import { ApiError, getErrorMessage } from '../services/api';
import { Modal } from './Modal';

const SCANNER_ELEMENT_ID = 'verify-coupon-qr-reader';

interface VerifyCouponModalProps {
  onClose: () => void;
}

type VerifyMode = 'type' | 'code' | 'scan';

// Read-only lookup against the /redemptions/scan endpoints — checks whether a coupon (physical,
// or virtual via its redemption code) is currently redeemable without adding it to a batch or
// submitting anything. Distinct from the Scan & Redeem flow, which builds and submits a batch.
export const VerifyCouponModal: React.FC<VerifyCouponModalProps> = ({ onClose }) => {
  const [mode, setMode] = useState<VerifyMode>('type');
  const [couponNumber, setCouponNumber] = useState('');
  const [redemptionCode, setRedemptionCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanVerifyResult | null>(null);

  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

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

  useEffect(() => {
    // Stop the camera on unmount so it isn't left running in the background.
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {}).finally(() => scannerRef.current?.clear());
      }
    };
  }, []);

  const runLookup = (fn: () => ReturnType<typeof verifyRedemptionScan>, notFoundMessage = 'No coupon found with that number.') => {
    setLoading(true);
    setError(null);
    setResult(null);
    fn()
      .then((res) => setResult(res.data))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setError(notFoundMessage);
        } else {
          setError(getErrorMessage(err, 'Could not verify this coupon.'));
        }
      })
      .finally(() => setLoading(false));
  };

  const handleLookup = () => {
    const number = couponNumber.trim();
    if (!number) return;
    runLookup(() => verifyRedemptionScanByCouponNumber(number));
  };

  const handleCodeLookup = () => {
    const code = redemptionCode.trim();
    if (!code) return;
    runLookup(() => verifyRedemptionScanByCode(code), 'No virtual coupon found with that redemption code.');
  };

  const startScanning = async () => {
    setCameraError(null);
    setResult(null);
    const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
    scannerRef.current = scanner;
    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          // One-shot: verify whatever the first successful decode gives us, then stop the
          // camera — this is a lookup, not a batch scanner.
          stopScanning();
          runLookup(() => verifyRedemptionScan(decodedText));
        },
        () => { /* per-frame "no QR found" noise — ignored */ }
      );
      setScanning(true);
    } catch (err) {
      setCameraError(getErrorMessage(err, 'Could not access the camera. Check permissions and try again.'));
      scannerRef.current = null;
    }
  };

  const switchMode = (next: VerifyMode) => {
    if (mode === 'scan' && next !== 'scan') stopScanning();
    setMode(next);
    setResult(null);
    setError(null);
  };

  return (
    <Modal onClose={onClose} width="min(480px, 92vw)">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <h3 style={{ margin: 0, color: 'var(--color-accent-gold)' }}>Verify Coupon</h3>
      </div>

      <p style={{ marginTop: 0, marginBottom: '1.25rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
        Read-only — checks whether a coupon can be redeemed right now. Nothing is submitted here.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        <button
          className={`btn ${mode === 'type' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ flex: 1, padding: '0.5rem' }}
          onClick={() => switchMode('type')}
        >
          <Search size={16} /> Type Number
        </button>
        <button
          className={`btn ${mode === 'code' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ flex: 1, padding: '0.5rem' }}
          onClick={() => switchMode('code')}
        >
          <KeyRound size={16} /> Redemption Code
        </button>
        <button
          className={`btn ${mode === 'scan' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ flex: 1, padding: '0.5rem' }}
          onClick={() => switchMode('scan')}
        >
          <QrCode size={16} /> Scan QR
        </button>
      </div>

      {mode === 'type' ? (
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <input
            className="input-field"
            placeholder="e.g. PU002M0000001"
            value={couponNumber}
            onChange={(e) => setCouponNumber(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleLookup(); }}
            autoFocus
          />
          <button className="btn btn-primary" onClick={handleLookup} disabled={!couponNumber.trim() || loading}>
            Check
          </button>
        </div>
      ) : mode === 'code' ? (
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <input
            className="input-field"
            placeholder="Virtual coupon redemption code"
            value={redemptionCode}
            onChange={(e) => setRedemptionCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCodeLookup(); }}
            autoFocus
          />
          <button className="btn btn-primary" onClick={handleCodeLookup} disabled={!redemptionCode.trim() || loading}>
            Check
          </button>
        </div>
      ) : (
        <div style={{ marginBottom: '1.25rem' }}>
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
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          <Loader2 size={16} style={{ verticalAlign: 'middle' }} /> Checking…
        </div>
      )}

      {error && (
        <div style={{ padding: '0.75rem 1rem', background: 'rgba(208, 76, 87, 0.1)', border: '1px solid var(--color-accent-red)', borderRadius: '8px', color: 'var(--color-accent-red)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {result && (
        <div
          style={{
            padding: '1rem', borderRadius: '8px', background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${result.redeemable ? '#4ade80' : 'var(--color-accent-red)'}`,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{result.coupon.couponNumber}</span>
            <span style={{ display: 'flex', gap: '0.4rem' }}>
              <span className={`badge ${getStatusBadgeClass(result.coupon.status)}`}>{result.coupon.status}</span>
              <span className={`badge ${getOriginBadgeClass(result.coupon.origin)}`}>{formatOrigin(result.coupon.origin)}</span>
            </span>
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.75rem' }}>
            <span>
              {result.coupon.fuelType.name}
              {result.coupon.denomination > 0 ? ` — ${result.coupon.denomination} L` : ''}
            </span>
            {result.coupon.location && <span>Location: {result.coupon.location.name} ({result.coupon.location.code})</span>}
            {result.coupon.expiryDate && <span>Expires: {new Date(result.coupon.expiryDate).toLocaleDateString()}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, color: result.redeemable ? '#4ade80' : 'var(--color-accent-red)' }}>
            {result.redeemable ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
            {result.redeemable ? 'Redeemable' : (result.message || 'Not redeemable')}
          </div>
        </div>
      )}
    </Modal>
  );
};
