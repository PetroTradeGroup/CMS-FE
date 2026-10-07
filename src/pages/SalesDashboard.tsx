import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, ArrowUpRight } from 'lucide-react';
import { getRequisitions } from '../services/requisitions';
import type { Requisition, RequisitionStatus } from '../services/requisitions';

// Sales Clerk's home: how their requisitions stand, plus the latest few. Relies on the backend
// scoping GET /requisitions to the caller for SALES_CLERK — this page doesn't filter.
const STATUSES: { label: string; value: RequisitionStatus; color: string }[] = [
  { label: 'Pending', value: 'PENDING', color: '#CEA620' },
  { label: 'Partially Fulfilled', value: 'PARTIALLY_FULFILLED', color: '#60a5fa' },
  { label: 'Fulfilled', value: 'FULFILLED', color: '#4ade80' },
  { label: 'Rejected', value: 'REJECTED', color: '#D04C57' },
];

export const SalesDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [recent, setRecent] = useState<Requisition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all(STATUSES.map(s =>
      getRequisitions(0, 1, s.value).then(r => [s.value, r.data?.totalElements ?? 0] as const).catch(() => [s.value, 0] as const)
    )).then(entries => setCounts(Object.fromEntries(entries)));
    getRequisitions(0, 5)
      .then(r => setRecent(r.data?.content || []))
      .catch(() => setRecent([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1>My Requisitions</h1>
          <p style={{ margin: 0 }}>What you've requested and where it stands.</p>
        </div>
        <Link to="/requisitions" className="btn btn-primary">
          <Plus size={18} /> New Requisition
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
        {STATUSES.map(s => (
          <div key={s.value} className="glass-panel" style={{ padding: '1.5rem' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>{s.label}</p>
            <h2 style={{ margin: '0.5rem 0 0', color: s.color }}>{(counts[s.value] ?? 0).toLocaleString()}</h2>
          </div>
        ))}
      </div>

      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Recent Requisitions</h2>
          <Link to="/requisitions" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.9rem' }}>
            View all <ArrowUpRight size={16} />
          </Link>
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-accent-gold)' }}>Loading...</div>
        ) : recent.length > 0 ? (
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Department</th>
                  <th>Location</th>
                  <th>Books</th>
                  <th>Requested At</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(req => (
                  <tr key={req.id} onClick={() => navigate(`/requisitions/${req.id}`)} style={{ cursor: 'pointer' }}>
                    <td style={{ color: 'var(--color-accent-gold)', fontWeight: 600 }}>{req.id}</td>
                    <td>{req.department?.name ?? '—'}</td>
                    <td>{req.location?.name ?? '—'}</td>
                    <td>{req.lines.reduce((sum, l) => sum + l.requestedBooks, 0).toLocaleString()}</td>
                    <td style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>{new Date(req.requestedAt).toLocaleString()}</td>
                    <td>{req.status.replace('_', ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>No requisitions raised yet.</div>
        )}
      </div>
    </div>
  );
};
