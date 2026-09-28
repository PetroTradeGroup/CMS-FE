import React, { useEffect, useState } from 'react';
import { ScrollText, Search, ShieldAlert, Filter, FileSpreadsheet, FileText } from 'lucide-react';
import {
  getAuditLog, exportAuditLog, AUDIT_CATEGORIES, formatAuditCategory, getCategoryBadgeClass, getActionBadgeClass
} from '../services/audit';
import type { AuditEntry, AuditCategory, AuditFilters } from '../services/audit';
import { hasRole } from '../services/auth';
import { getErrorMessage } from '../services/api';

export const AuditLog: React.FC = () => {
  const allowed = hasRole('ADMIN', 'AUDITOR');

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);

  // Filters — no chip selected means every category, matching "omit param = everything"
  const [categoryFilter, setCategoryFilter] = useState<AuditCategory | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Actor is a server-side filter — debounce typing so we don't query per keystroke
  const [actorInput, setActorInput] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setActorFilter(actorInput.trim()), 300);
    return () => clearTimeout(t);
  }, [actorInput]);

  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);

  const currentFilters = (): AuditFilters => ({
    category: categoryFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    actor: actorFilter || undefined
  });

  const handleExport = async (format: 'excel' | 'pdf') => {
    setExporting(format);
    setError(null);
    try {
      await exportAuditLog(format, currentFilters());
    } catch (err) {
      console.error(`Failed to export audit log as ${format}`, err);
      setError(getErrorMessage(err, 'Export failed.'));
    } finally {
      setExporting(null);
    }
  };

  useEffect(() => {
    setPage(0);
  }, [categoryFilter, dateFrom, dateTo, pageSize, actorFilter]);

  useEffect(() => {
    if (!allowed) return;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getAuditLog(page, pageSize, currentFilters());
        setEntries(res.data?.content || []);
        setTotalPages(res.data?.totalPages || 0);
        setTotalElements(res.data?.totalElements || 0);
      } catch (err) {
        console.error('Failed to load audit log', err);
        setError(getErrorMessage(err, 'Failed to load the audit log.'));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, categoryFilter, dateFrom, dateTo, actorFilter, allowed]);

  if (!allowed) {
    return (
      <div className="animate-fade-in">
        <h1>Audit Log</h1>
        <div style={{ padding: '1.5rem', background: 'rgba(208, 76, 87, 0.1)', border: '1px solid var(--color-accent-red)', borderRadius: '8px', color: 'var(--color-accent-red)', display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '1.5rem' }}>
          <ShieldAlert size={22} />
          <span>You need the <strong>Admin</strong> or <strong>Auditor</strong> role to view the audit log.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1><ScrollText size={28} style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />Audit Log</h1>
          <p style={{ margin: 0 }}>System-wide trail of coupon lifecycle changes, approval decisions, and security events.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button
            className="btn btn-secondary"
            onClick={() => handleExport('excel')}
            disabled={exporting !== null || entries.length === 0}
            title="Export the filtered audit log as an Excel workbook"
          >
            <FileSpreadsheet size={18} />
            {exporting === 'excel' ? 'Exporting...' : 'Export Excel'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => handleExport('pdf')}
            disabled={exporting !== null || entries.length === 0}
            title="Export the filtered audit log as a PDF"
          >
            <FileText size={18} />
            {exporting === 'pdf' ? 'Exporting...' : 'Export PDF'}
          </button>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          <button
            className={`btn ${categoryFilter === '' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
            onClick={() => setCategoryFilter('')}
            type="button"
          >
            All
          </button>
          {AUDIT_CATEGORIES.map(c => (
            <button
              key={c}
              className={`btn ${categoryFilter === c ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
              onClick={() => setCategoryFilter(c)}
              type="button"
            >
              {formatAuditCategory(c)}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="input-group" style={{ width: '260px', marginBottom: 0 }}>
            <label style={{ fontSize: '0.8rem', marginBottom: '0.2rem', color: 'var(--color-text-muted)' }}>Actor</label>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }}>
                <Search size={16} />
              </div>
              <input
                type="text"
                className="input-field"
                placeholder="Who performed/decided/attempted it"
                style={{ paddingLeft: '2.5rem' }}
                value={actorInput}
                onChange={(e) => setActorInput(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
            <div className="input-group" style={{ marginBottom: 0, width: '320px' }}>
              <label style={{ fontSize: '0.8rem', marginBottom: '0.2rem', color: 'var(--color-text-muted)', display: 'block' }}>Date Range</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '2px' }}>
                <input
                  type="date"
                  className="input-field"
                  style={{ border: 'none', background: 'transparent', margin: 0, flex: 1, fontSize: '0.85rem' }}
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
                <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>→</span>
                <input
                  type="date"
                  className="input-field"
                  style={{ border: 'none', background: 'transparent', margin: 0, flex: 1, fontSize: '0.85rem' }}
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </div>
            <button
              className="btn btn-secondary"
              style={{ padding: '0 0.8rem', height: '42px', fontSize: '0.85rem' }}
              onClick={() => { setDateFrom(''); setDateTo(''); }}
              type="button"
              title="Clear Dates"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ padding: '1rem', background: 'rgba(208, 76, 87, 0.1)', border: '1px solid var(--color-accent-red)', borderRadius: '8px', color: 'var(--color-accent-red)', marginBottom: '2rem' }}>
          {error}
        </div>
      )}

      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-accent-gold)' }}>Loading audit log...</div>
        ) : entries.length > 0 ? (
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Occurred At</th>
                  <th>Category</th>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Summary</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, i) => (
                  <tr key={`${entry.referenceType}-${entry.referenceId}-${entry.occurredAt}-${i}`}>
                    <td style={{ color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(entry.occurredAt).toLocaleString()}
                    </td>
                    <td>
                      <span className={`badge ${getCategoryBadgeClass(entry.category)}`}>
                        {formatAuditCategory(entry.category)}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${getActionBadgeClass(entry.action)}`}>
                        {entry.action.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ fontWeight: 500 }}>
                      {entry.actor ?? <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>unauthenticated</span>}
                    </td>
                    <td>{entry.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-text-muted)' }}>
            <div style={{ marginBottom: '1rem', color: 'rgba(255,255,255,0.1)' }}>
              <Filter size={48} style={{ margin: '0 auto' }} />
            </div>
            <h3>No audit entries found</h3>
            <p>Try adjusting your filters.</p>
          </div>
        )}
      </div>

      <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ color: 'var(--color-text-muted)' }}>
            {totalElements.toLocaleString()} entr{totalElements === 1 ? 'y' : 'ies'} total
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>Items per page:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(parseInt(e.target.value))}
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'white', padding: '2px 4px' }}
            >
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            className="btn btn-secondary"
            style={{ padding: '0.4rem 0.8rem' }}
            disabled={page === 0}
            onClick={() => setPage(p => Math.max(0, p - 1))}
          >
            Previous
          </button>
          <span style={{ margin: '0 0.5rem', color: 'var(--color-text-muted)' }}>
            Page {page + 1} of {totalPages || 1}
          </span>
          <button
            className="btn btn-secondary"
            style={{ padding: '0.4rem 0.8rem' }}
            disabled={page >= totalPages - 1}
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};
