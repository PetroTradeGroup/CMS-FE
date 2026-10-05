import React, { useEffect, useState } from 'react';
import { Ticket, Database, Banknote, ArrowUpRight, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { getBulkLimit } from '../services/config';
import { canSee, hasRole } from '../services/auth';
import type { BulkLimit } from '../services/config';

import { getCoupons, getCouponsByFuelType, getStatusBadgeClass } from '../services/coupons';
import type { Coupon } from '../services/coupons';
import { getFuelTypes } from '../services/fuelTypes';
import type { FuelType } from '../services/fuelTypes';

// ─── Palette ────────────────────────────────────────────────────────────────
const GOLD   = '#CEA620';
const GREEN  = '#4ade80';
const RED    = '#D04C57';
const BLUE   = '#60a5fa';
const PURPLE = '#a78bfa';
const TEAL   = '#2dd4bf';

const STATUS_COLORS: Record<string, string> = {
  IN_STOCK: GREEN,
  REDEEMED: GOLD,
  EXPIRED:  RED,
};

// ─── Custom Tooltip ──────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'rgba(4, 51, 9, 0.95)',
      border: '1px solid rgba(206,166,32,0.35)',
      borderRadius: 10,
      padding: '10px 16px',
      backdropFilter: 'blur(12px)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    }}>
      {label && <p style={{ color: '#fff', fontWeight: 600, marginBottom: 4 }}>{label}</p>}
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: entry.color ?? GOLD, margin: 0, fontSize: '0.9rem' }}>
          {entry.name}: <strong>{entry.value?.toLocaleString()}</strong>
        </p>
      ))}
    </div>
  );
};

// ─── Pie Custom Label ────────────────────────────────────────────────────────
const renderPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central"
      style={{ fontSize: '0.75rem', fontWeight: 600, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

// ─── Component ───────────────────────────────────────────────────────────────
export const Dashboard: React.FC = () => {
  // Regional Rep gets In Stock / Redeemed / Fuel Types cards plus the two charts only.
  const isRegionalRep = hasRole('REGIONAL_REP') && !hasRole('ADMIN');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalCoupons: 0,
    inStockCoupons: 0,
    redeemedCoupons: 0,
    expiredCoupons: 0,
    totalFuelTypes: 0,
    bulkLimit: 0,
  });
  const [recentCoupons, setRecentCoupons] = useState<Coupon[]>([]);
  const [fuelTypeData, setFuelTypeData] = useState<{ name: string; count: number; color: string }[]>([]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        // Step 1 – fetch config, overall totals, and fuel type list in parallel
        const [limitRes, totalRes, inStockRes, redeemedRes, expiredRes, fuelTypesRes, recentRes] =
          await Promise.all([
            getBulkLimit().catch(() => ({ data: { maxCount: 20000 } as BulkLimit })),
            getCoupons(0, 1).catch(() => ({ data: { content: [] as Coupon[], totalElements: 0 } })),
            getCoupons(0, 1, { status: 'IN_STOCK' }).catch(() => ({ data: { totalElements: 0 } })),
            getCoupons(0, 1, { status: 'REDEEMED' }).catch(() => ({ data: { totalElements: 0 } })),
            getCoupons(0, 1, { status: 'EXPIRED' }).catch(() => ({ data: { totalElements: 0 } })),
            getFuelTypes(0, 50).catch(() => ({ data: { content: [] as FuelType[], totalElements: 0 } })),
            getCoupons(0, 5).catch(() => ({ data: { content: [] as Coupon[], totalElements: 0 } })),
          ]);

        const totalCoupons    = totalRes.data?.totalElements ?? 0;
        const inStockCoupons  = inStockRes.data?.totalElements ?? 0;
        const redeemedCoupons = redeemedRes.data?.totalElements ?? 0;
        const expiredCoupons  = expiredRes.data?.totalElements ?? 0;

        const fuelTypes = fuelTypesRes.data?.content ?? [];

        // Step 2 – fetch real totalElements per fuel type from the backend
        const palette = [GOLD, GREEN, BLUE, PURPLE, TEAL, RED];
        const ftCountResults = await Promise.all(
          fuelTypes.map(ft =>
            getCouponsByFuelType(ft.id, 0, 1)
              .then(r => ({ name: ft.name, count: r.data?.totalElements ?? 0 }))
              .catch(() => ({ name: ft.name, count: 0 }))
          )
        );
        const ftData = ftCountResults
          .filter(ft => ft.count > 0)
          .map((ft, i) => ({ ...ft, color: palette[i % palette.length] }));

        // Recent coupons – already sorted DESC by backend
        const recent = recentRes.data?.content ?? [];

        setStats({
          totalCoupons,
          inStockCoupons,
          redeemedCoupons,
          expiredCoupons,
          totalFuelTypes: fuelTypesRes.data?.totalElements ?? 0,
          bulkLimit: limitRes.data?.maxCount ?? 20000,
        });
        setRecentCoupons(recent.slice(0, 5));
        setFuelTypeData(ftData);
      } catch (error) {
        console.error('Failed to load dashboard data', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  // Derived chart data
  const statusPieData = [
    { name: 'In Stock', value: stats.inStockCoupons,  color: STATUS_COLORS.IN_STOCK },
    { name: 'Redeemed', value: stats.redeemedCoupons, color: STATUS_COLORS.REDEEMED },
    { name: 'Expired',  value: stats.expiredCoupons,  color: STATUS_COLORS.EXPIRED  },
  ].filter(d => d.value > 0);

  if (loading) {
    return (
      <div className="flex-center animate-fade-in" style={{ height: '60vh' }}>
        <div style={{ color: 'var(--color-accent-gold)', fontSize: '1.2rem' }}>
          Loading dashboard data...
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1>Dashboard Overview</h1>
          <p style={{ margin: 0 }}>Welcome back to the Petrotrade Coupon Portal</p>
        </div>
        {canSee('/coupons/generate') && (
          <Link to="/coupons/generate" className="btn btn-primary" style={{ boxShadow: '0 10px 20px rgba(206, 166, 32, 0.2)' }}>
            <Banknote size={18} />
            Generate Coupons
          </Link>
        )}
      </div>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
        {!isRegionalRep && <StatCard label="Total Generated" value={stats.totalCoupons.toLocaleString()} icon={<Ticket size={20} />} color={GOLD} />}
        <StatCard label="In Stock"        value={stats.inStockCoupons.toLocaleString()}  icon={<Ticket size={20} />} color={GREEN} delay="delay-100" />
        <StatCard label="Redeemed"        value={stats.redeemedCoupons.toLocaleString()} icon={<TrendingUp size={20} />} color={GOLD} delay="delay-200" />
        {!isRegionalRep && <StatCard label="Expired Coupons" value={stats.expiredCoupons.toLocaleString()} icon={<Ticket size={20} />} color={RED} delay="delay-200" />}
        <StatCard label="Fuel Types"      value={stats.totalFuelTypes.toString()}       icon={<Database size={20} />} color="#fff" delay="delay-300" />
        {!isRegionalRep && <StatCard label="Bulk Gen. Limit" value={stats.bulkLimit.toLocaleString()}      icon={<Banknote size={20} />} color={GREEN} delay="delay-300" />}
      </div>

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>

        {/* Pie Chart — Status Breakdown */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <SectionTitle icon={<Ticket size={18} />} title="Coupon Status Breakdown" />
          {statusPieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={statusPieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  innerRadius={52}
                  paddingAngle={3}
                  labelLine={false}
                  label={renderPieLabel}
                  stroke="none"
                >
                  {statusPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  iconType="circle"
                  iconSize={10}
                  formatter={(value: string) => (
                    <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem' }}>{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="No coupon status data available" />
          )}
        </div>

        {/* Bar Chart — Coupons by Fuel Type */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <SectionTitle icon={<Database size={18} />} title="Coupons by Fuel Type" />
          {fuelTypeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={fuelTypeData} barCategoryGap="30%" margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="count" name="Coupons" radius={[6, 6, 0, 0]}>
                  {fuelTypeData.map((entry, index) => (
                    <Cell key={`bar-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="No fuel type data available" />
          )}
        </div>
      </div>

      {/* Recent Coupons Table — only for users who can open the Coupons page (not Finance) */}
      {canSee('/coupons') && <div className="glass-panel delay-300" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Recent Coupons</h2>
          <Link to="/coupons" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.9rem' }}>
            View All <ArrowUpRight size={16} />
          </Link>
        </div>

        {recentCoupons.length > 0 ? (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Coupon Number</th>
                  <th>Fuel Type</th>
                  <th>Status</th>
                  <th>Created At</th>
                </tr>
              </thead>
              <tbody>
                {recentCoupons.map((coupon) => (
                  <tr key={coupon.id}>
                    <td style={{ fontWeight: 500, color: 'var(--color-accent-gold)', letterSpacing: '0.05em' }}>
                      {coupon.couponNumber}
                    </td>
                    <td>{coupon.fuelType.name}</td>
                    <td>
                      <span className={`badge ${getStatusBadgeClass(coupon.status)}`}>
                        {coupon.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td style={{ color: 'var(--color-text-muted)' }}>
                      {new Date(coupon.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)', borderRadius: '8px' }}>
            No coupons generated yet.
          </div>
        )}
      </div>}
    </div>
  );
};

// ─── Sub-components ───────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  delay?: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon, color, delay = '' }) => (
  <div className={`stat-card ${delay}`}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div className="stat-label">{label}</div>
      <div style={{ padding: '8px', background: `${color}18`, borderRadius: '8px', color }}>
        {icon}
      </div>
    </div>
    <div className="stat-value" style={{ color }}>{value}</div>
  </div>
);

const SectionTitle: React.FC<{ icon: React.ReactNode; title: string }> = ({ icon, title }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
    <span style={{ color: 'var(--color-accent-gold)' }}>{icon}</span>
    <h2 style={{ fontSize: '1.1rem', margin: 0 }}>{title}</h2>
  </div>
);

const EmptyChart: React.FC<{ message: string }> = ({ message }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 280, color: 'var(--color-text-muted)', fontSize: '0.9rem', border: '1px dashed var(--color-border)', borderRadius: 10 }}>
    {message}
  </div>
);
