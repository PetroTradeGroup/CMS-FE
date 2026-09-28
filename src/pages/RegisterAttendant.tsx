import React, { useMemo, useState } from 'react';
import { UserPlus, AlertCircle, CheckCircle2, KeyRound, Copy, Check, ShieldAlert, Clock3, RefreshCw } from 'lucide-react';
import { registerAttendant, resetTempPassword } from '../services/attendants';
import type { RegisteredAttendant, RegisterAttendantRequest } from '../services/attendants';
import { getLocations } from '../services/locations';
import type { LocationDetail } from '../services/locations';
import { getErrorMessage } from '../services/api';
import { hasRole } from '../services/auth';
import { Modal } from '../components/Modal';

const EMPTY_FORM = { username: '', email: '', firstName: '', lastName: '', locationCode: '' };

export const RegisterAttendant: React.FC = () => {
  const allowed = hasRole('TEAM_LEADER', 'ADMIN');

  const [form, setForm] = useState(EMPTY_FORM);
  // Off by default: the normal case sends no locationCode and the server uses the Team
  // Leader's own station. Turned on only to register staff for a different station.
  const [overrideStation, setOverrideStation] = useState(false);
  const [sites, setSites] = useState<LocationDetail[]>([]);
  const [sitesFailed, setSitesFailed] = useState(false);
  const [loadingSites, setLoadingSites] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RegisteredAttendant | null>(null);
  const [copied, setCopied] = useState(false);
  const [checkingSync, setCheckingSync] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  // Fetch the station list only when the override is switched on — the normal path makes no
  // extra API call. Runs at most once per successful load; a failure lets it retry.
  const [sitesLoaded, setSitesLoaded] = useState(false);
  const loadSites = () => {
    if (sitesLoaded || loadingSites) return;
    setLoadingSites(true);
    setSitesFailed(false);
    getLocations(true)
      .then((res) => {
        const all = res.data || [];
        // The RETAIL_SITE filter is a UX preference, not a server rule — if the payload has no
        // RETAIL_SITE rows (or no type field at all), fall back to every active location rather
        // than showing an empty picker.
        const retail = all.filter((l) => l.type === 'RETAIL_SITE');
        setSites(retail.length > 0 ? retail : all);
        setSitesLoaded(true);
      })
      .catch(() => setSitesFailed(true))
      .finally(() => setLoadingSites(false));
  };

  const set = (key: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
  };

  const trimmed = useMemo(
    () => ({
      username: form.username.trim(),
      email: form.email.trim(),
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      locationCode: form.locationCode.trim(),
    }),
    [form]
  );

  const complete =
    Boolean(trimmed.username && trimmed.email && trimmed.firstName && trimmed.lastName) &&
    (!overrideStation || Boolean(trimmed.locationCode));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body: RegisterAttendantRequest = {
        username: trimmed.username,
        email: trimmed.email,
        firstName: trimmed.firstName,
        lastName: trimmed.lastName,
        // Only include locationCode for the explicit override.
        ...(overrideStation && trimmed.locationCode ? { locationCode: trimmed.locationCode } : {}),
      };
      const res = await registerAttendant(body);
      setResult(res.data);
      setCopied(false);
      setCheckError(null);
    } catch (err) {
      // fetchApi already folds 400 field errors into the message; 400 "no station of your own",
      // 404 unknown station, 409 duplicate username and 502 carry the envelope message.
      setError(getErrorMessage(err, 'Could not register the attendant.'));
    } finally {
      setSaving(false);
    }
  };

  const closeResult = () => {
    setResult(null);
    setForm(EMPTY_FORM);
    setOverrideStation(false);
    setCheckError(null);
  };

  // There's no standalone "get sync status" endpoint yet, so this doubles as both the retry
  // action and the status check — a 409 just means Keycloak still hasn't caught up.
  const checkSync = async () => {
    if (!result) return;
    setCheckingSync(true);
    setCheckError(null);
    try {
      const res = await resetTempPassword(result.id);
      setResult(res.data);
      setCopied(false);
    } catch (err) {
      setCheckError(
        getErrorMessage(err, 'Still waiting on Keycloak — try again in a moment.')
      );
    } finally {
      setCheckingSync(false);
    }
  };

  const copyPassword = async () => {
    if (!result || !result.temporaryPassword) return;
    try {
      await navigator.clipboard.writeText(result.temporaryPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard blocked — the value is still visible to copy manually */
    }
  };

  if (!allowed) {
    return (
      <div className="animate-fade-in">
        <h1>Register Attendant</h1>
        <div style={{ padding: '1.5rem', background: 'rgba(208, 76, 87, 0.1)', border: '1px solid var(--color-accent-red)', borderRadius: '8px', color: 'var(--color-accent-red)', display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '1.5rem' }}>
          <ShieldAlert size={22} />
          <span>You need the <strong>Team Leader</strong> or <strong>Admin</strong> role to register attendants.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '2rem' }}>
        <h1>Register Attendant</h1>
      </div>

      {error && (
        <div style={{ padding: '1rem', background: 'rgba(208, 76, 87, 0.1)', border: '1px solid var(--color-accent-red)', borderRadius: '8px', color: 'var(--color-accent-red)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertCircle size={20} /> {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="glass-panel" style={{ padding: '2rem', maxWidth: '620px' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div className="input-group" style={{ flex: 1, minWidth: '240px' }}>
            <label htmlFor="firstName">First name</label>
            <input id="firstName" className="input-field" value={form.firstName} onChange={set('firstName')} maxLength={50} required />
          </div>
          <div className="input-group" style={{ flex: 1, minWidth: '240px' }}>
            <label htmlFor="lastName">Last name</label>
            <input id="lastName" className="input-field" value={form.lastName} onChange={set('lastName')} maxLength={50} required />
          </div>
        </div>

        <div className="input-group">
          <label htmlFor="username">Username</label>
          <input id="username" className="input-field" value={form.username} onChange={set('username')} maxLength={50} autoComplete="off" placeholder="e.g. j.moyo" required />
        </div>

        <div className="input-group" style={{ marginBottom: overrideStation ? '1rem' : '2rem' }}>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" className="input-field" value={form.email} onChange={set('email')} autoComplete="off" placeholder="name@petrotrade.dev" required />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: overrideStation ? '1rem' : '2rem', cursor: 'pointer', fontSize: '0.9rem' }}>
          <input
            type="checkbox"
            checked={overrideStation}
            onChange={(e) => {
              setOverrideStation(e.target.checked);
              if (e.target.checked) loadSites();
              else setForm((f) => ({ ...f, locationCode: '' }));
            }}
          />
          Register at a different station
        </label>

        {overrideStation && (
          <div className="input-group" style={{ marginBottom: '2rem' }}>
            <label htmlFor="locationCode">Station</label>
            {sitesFailed ? (
              <>
                <input id="locationCode" className="input-field" value={form.locationCode} onChange={set('locationCode')} maxLength={10} placeholder="STN-09" required />
                <span style={{ fontSize: '0.8rem', color: 'var(--color-accent-gold)' }}>
                  Couldn't load the station list — enter the location code manually.
                </span>
              </>
            ) : (
              <select
                id="locationCode"
                className="input-field"
                value={form.locationCode}
                onChange={set('locationCode')}
                disabled={loadingSites}
                required
              >
                <option value="" disabled>
                  {loadingSites ? 'Loading stations…' : 'Select a station'}
                </option>
                {sites.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </select>
            )}
            {!sitesFailed && !loadingSites && sitesLoaded && sites.length === 0 && (
              <span style={{ fontSize: '0.8rem', color: 'var(--color-accent-gold)' }}>
                No active stations came back from <code>/locations?active=true</code>.
              </span>
            )}
          </div>
        )}

        <button type="submit" className="btn btn-primary" disabled={saving || !complete} style={{ width: '100%', padding: '0.875rem' }}>
          <UserPlus size={18} />
          {saving ? 'Registering…' : 'Register Attendant'}
        </button>
      </form>

      {result && result.syncStatus === 'SYNCED' && result.temporaryPassword && (
        <Modal onClose={() => { /* stay open — dismissed only via the Done button */ }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
            <CheckCircle2 size={22} style={{ color: '#4ade80' }} />
            <h2 style={{ margin: 0 }}>Attendant registered</h2>
          </div>
          <p style={{ marginTop: 0, color: 'var(--color-text-muted)' }}>
            <strong>{result.username}</strong> at <strong>{result.locationCode}</strong> — {result.email}
          </p>

          <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '1rem', margin: '1rem 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
              <KeyRound size={15} /> One-time password
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <code style={{ fontSize: '1.15rem', fontWeight: 600, letterSpacing: '0.04em', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {result.temporaryPassword}
              </code>
              <button type="button" className="btn btn-secondary" style={{ padding: '0.4rem 0.7rem', fontSize: '0.8rem', flexShrink: 0 }} onClick={copyPassword}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <p style={{ fontSize: '0.82rem', color: 'var(--color-accent-gold)', marginBottom: '1.5rem' }}>
            Give this to the attendant now. It won't be shown again, and they'll be asked to change it on first login.
          </p>

          <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={closeResult}>
            Done
          </button>
        </Modal>
      )}

      {result && result.syncStatus !== 'SYNCED' && (
        <Modal onClose={() => { /* stay open — dismissed only via the Done button */ }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
            <Clock3 size={22} style={{ color: 'var(--color-accent-gold)' }} />
            <h2 style={{ margin: 0 }}>Attendant queued</h2>
          </div>
          <p style={{ marginTop: 0, color: 'var(--color-text-muted)' }}>
            <strong>{result.username}</strong> at <strong>{result.locationCode}</strong> — {result.email}
          </p>

          <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '1rem', margin: '1rem 0', fontSize: '0.88rem', color: 'var(--color-text-muted)' }}>
            Keycloak was unreachable, so the account will be provisioned automatically in the
            background. There's no login password until that finishes — check back in a bit.
          </div>

          {checkError && (
            <div style={{ padding: '0.75rem', background: 'rgba(208, 76, 87, 0.1)', border: '1px solid var(--color-accent-red)', borderRadius: '8px', color: 'var(--color-accent-red)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
              <AlertCircle size={16} /> {checkError}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={checkSync} disabled={checkingSync}>
              <RefreshCw size={16} />
              {checkingSync ? 'Checking…' : 'Check / get password'}
            </button>
            <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={closeResult}>
              Done
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};
