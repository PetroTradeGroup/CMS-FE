import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowUpRight, Package, HandCoins } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getBalanceTrend } from '../services/redemptions';
import type { BalanceTrendPoint } from '../services/redemptions';
import { getActiveFuelTypes } from '../services/fuelTypes';
import type { FuelType } from '../services/fuelTypes';

const GREEN = '#4ade80';
const GOLD = '#CEA620';
const RANGES = [7, 30, 90] as const;

const isoDaysAgo = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const litresLabel = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n);

const dayLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TrendTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'rgba(4, 51, 9, 0.95)', border: '1px solid rgba(206,166,32,0.35)', borderRadius: 10,
      padding: '10px 16px', backdropFilter: 'blur(12px)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    }}>
      <p style={{ color: '#fff', fontWeight: 600, margin: '0 0 4px' }}>{dayLabel(label)}</p>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((entry: any) => (
        <p key={entry.dataKey} style={{ color: entry.color, margin: 0, fontSize: '0.9rem' }}>
          {entry.name}: <strong>{Number(entry.value).toLocaleString()} L</strong>
        </p>
      ))}
    </div>
  );
};

/** Dashboard panel: stock on hand vs what's owed (allocated, not yet redeemed), end of each day. */
export const VolumeTrend: React.FC = () => {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [fuelTypeId, setFuelTypeId] = useState<number | ''>('');
  const [fuelTypes, setFuelTypes] = useState<FuelType[]>([]);
  const [points, setPoints] = useState<BalanceTrendPoint[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getActiveFuelTypes(0, 100).then((res) => setFuelTypes(res.data?.content || [])).catch(() => setFuelTypes([]));
  }, []);

  useEffect(() => {
    getBalanceTrend({ dateFrom: isoDaysAgo(days - 1), dateTo: isoDaysAgo(0), fuelTypeId: fuelTypeId || undefined })
      .then((res) => { setPoints(res.data || []); setError(false); })
      .catch(() => setError(true));
  }, [days, fuelTypeId]);

  const data = useMemo(() => (points ?? []).map((p) => ({
    date: p.date,
    stock: p.litres.IN_STOCK ?? 0,
    owed: p.litres.ALLOCATED ?? 0,
  })), [points]);

  const latest = data[data.length - 1];
  const first = data[0];
  const delta = (key: 'stock' | 'owed') => (latest && first ? latest[key] - first[key] : 0);

  return (
    <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ color: 'var(--color-accent-gold)' }}><Activity size={18} /></span>
          <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Stock Balance &amp; Owed Volume</h2>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="input-field" style={{ width: 'auto', padding: '0.35rem 0.6rem', fontSize: '0.85rem', marginBottom: 0 }}
            value={fuelTypeId} onChange={(e) => setFuelTypeId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">All fuel types</option>
            {fuelTypes.map((ft) => <option key={ft.id} value={ft.id}>{ft.name}</option>)}
          </select>
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 2 }}>
            {RANGES.map((r) => (
              <button key={r} onClick={() => setDays(r)}
                style={{
                  border: 'none', cursor: 'pointer', borderRadius: 6, padding: '0.3rem 0.7rem', fontSize: '0.8rem',
                  background: days === r ? 'var(--color-accent-gold)' : 'transparent',
                  color: days === r ? '#043309' : 'rgba(255,255,255,0.7)', fontWeight: days === r ? 700 : 500,
                }}>
                {r}d
              </button>
            ))}
          </div>
          <Link to="/reports/activity" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem' }}>
            Report <ArrowUpRight size={14} />
          </Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
        <Kpi icon={<Package size={18} />} color={GREEN} label="Stock on hand" litres={latest?.stock} delta={delta('stock')} days={days} />
        <Kpi icon={<HandCoins size={18} />} color={GOLD} label="Owed (allocated, not redeemed)" litres={latest?.owed} delta={delta('owed')} days={days} />
      </div>

      {error ? (
        <ChartMessage text="Couldn't load the balance trend." />
      ) : points === null ? (
        <ChartMessage text="Loading…" />
      ) : data.every((d) => d.stock === 0 && d.owed === 0) ? (
        <ChartMessage text="No stock or allocated volume in this period." />
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="vt-stock" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={GREEN} stopOpacity={0.35} />
                <stop offset="100%" stopColor={GREEN} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="vt-owed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={GOLD} stopOpacity={0.35} />
                <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="date" tickFormatter={dayLabel} minTickGap={24}
              tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={litresLabel} width={48}
              tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={<TrendTooltip />} cursor={{ stroke: 'rgba(206,166,32,0.4)', strokeDasharray: '4 4' }} />
            <Area type="monotone" dataKey="stock" name="Stock on hand" stroke={GREEN} strokeWidth={2.5}
              fill="url(#vt-stock)" dot={false} activeDot={{ r: 5, strokeWidth: 0 }} />
            <Area type="monotone" dataKey="owed" name="Owed" stroke={GOLD} strokeWidth={2.5}
              fill="url(#vt-owed)" dot={false} activeDot={{ r: 5, strokeWidth: 0 }} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

const Kpi: React.FC<{ icon: React.ReactNode; color: string; label: string; litres?: number; delta: number; days: number }> =
  ({ icon, color, label, litres, delta, days }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '0.9rem 1rem', borderRadius: 10,
      background: `linear-gradient(135deg, ${color}14, transparent)`, border: `1px solid ${color}33` }}>
      <div style={{ padding: 8, borderRadius: 8, background: `${color}22`, color }}>{icon}</div>
      <div>
        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
        <div style={{ fontSize: '1.5rem', fontWeight: 700, color }}>{litres != null ? `${litres.toLocaleString()} L` : '—'}</div>
        {litres != null && (
          <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>
            {delta > 0 ? '▲' : delta < 0 ? '▼' : '•'} {Math.abs(delta).toLocaleString()} L over {days} days
          </div>
        )}
      </div>
    </div>
  );

const ChartMessage: React.FC<{ text: string }> = ({ text }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--color-text-muted)',
    fontSize: '0.9rem', border: '1px dashed var(--color-border)', borderRadius: 10 }}>
    {text}
  </div>
);
