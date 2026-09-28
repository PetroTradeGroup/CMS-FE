import React, { useEffect, useState } from 'react';
import { Package, Filter, FileSpreadsheet, FileText, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getBatches, exportBatches } from '../services/batches';
import type { CouponBatch, BatchFilters } from '../services/batches';
import { getFuelTypes } from '../services/fuelTypes';
import type { FuelType } from '../services/fuelTypes';
import { getErrorMessage } from '../services/api';

export const Batches: React.FC = () => {
  const navigate = useNavigate();
  const [batches, setBatches] = useState<CouponBatch[]>([]);
  const [fuelTypes, setFuelTypes] = useState<FuelType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);

  // Filters
  const [fuelTypeFilter, setFuelTypeFilter] = useState('');
  const [couponTypeFilter, setCouponTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [hasStockFilter, setHasStockFilter] = useState(false);

  // Batch number search is a server-side filter (partial, case-insensitive) — debounce the typing
  const [searchTerm, setSearchTerm] = useState('');
  const [batchNumberFilter, setBatchNumberFilter] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setBatchNumberFilter(searchTerm.trim()), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);

  const currentFilters = (): BatchFilters => ({
    fuelTypeId: fuelTypeFilter || undefined,
    couponType: couponTypeFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    hasStock: hasStockFilter || undefined,
    batchNumber: batchNumberFilter || undefined
  });

  const handleExport = async (format: 'excel' | 'pdf') => {
    setExporting(format);
    setError(null);
    try {
      await exportBatches(format, currentFilters());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setExporting(null);
    }
  };

  useEffect(() => {
    setPage(0);
  }, [fuelTypeFilter, couponTypeFilter, dateFrom, dateTo, hasStockFilter, batchNumberFilter]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [batchesRes, fuelTypesRes] = await Promise.all([
          getBatches(page, 20, currentFilters()),
          getFuelTypes(0, 100)
        ]);
        setBatches(batchesRes.data?.content || []);
        setTotalPages(batchesRes.data?.totalPages || 0);
        setTotalElements(batchesRes.data?.totalElements || 0);
        setFuelTypes(fuelTypesRes.data?.content || []);
      } catch (err) {
        console.error('Failed to load batches', err);
        setError(getErrorMessage(err, 'Failed to load batches.'));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, fuelTypeFilter, couponTypeFilter, dateFrom, dateTo, hasStockFilter, batchNumberFilter]);

  if (loading && batches.length === 0) {
    return (
      <div className="flex-center animate-fade-in" style={{ height: '60vh' }}>
        <div style={{ color: 'var(--color-accent-gold)', fontSize: '1.2rem' }}>Loading batches...</div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1>Coupon Batches</h1>
          <p style={{ margin: 0 }}>Every bulk generation creates a batch. Open one to receive stock or download QR codes.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button
            className="btn btn-secondary"
            onClick={() => handleExport('excel')}
            disabled={exporting !== null || batches.length === 0}
            title="Export the filtered batch register as an Excel workbook"
          >
            <FileSpreadsheet size={18} />
            {exporting === 'excel' ? 'Exporting...' : 'Export Excel'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => handleExport('pdf')}
            disabled={exporting !== null || batches.length === 0}
            title="Export the filtered batch register as a PDF"
          >
            <FileText size={18} />
            {exporting === 'pdf' ? 'Exporting...' : 'Export PDF'}
          </button>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="input-group" style={{ width: '240px', marginBottom: 0 }}>
            <label style={{ fontSize: '0.8rem', marginBottom: '0.2rem', color: 'var(--color-text-muted)' }}>Batch Number</label>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }}>
                <Search size={16} />
              </div>
              <input
                type="text"
                className="input-field"
                placeholder="BAT-... (partial)"
                style={{ paddingLeft: '2.5rem' }}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="input-group" style={{ width: '180px', marginBottom: 0 }}>
            <label style={{ fontSize: '0.8rem', marginBottom: '0.2rem', color: 'var(--color-text-muted)' }}>Fuel Type</label>
            <select className="input-field" value={fuelTypeFilter} onChange={(e) => setFuelTypeFilter(e.target.value)}>
              <option value="">All Fuel Types</option>
              {fuelTypes.map(ft => (
                <option key={ft.id} value={ft.id}>{ft.name}</option>
              ))}
            </select>
          </div>

          <div className="input-group" style={{ width: '160px', marginBottom: 0 }}>
            <label style={{ fontSize: '0.8rem', marginBottom: '0.2rem', color: 'var(--color-text-muted)' }}>Coupon Type</label>
            <select className="input-field" value={couponTypeFilter} onChange={(e) => setCouponTypeFilter(e.target.value)}>
              <option value="">All Types</option>
              <option value="PHYSICAL">Physical</option>
              <option value="DIGITAL">Digital</option>
            </select>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', height: '42px', fontSize: '0.85rem', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={hasStockFilter} onChange={(e) => setHasStockFilter(e.target.checked)} style={{ cursor: 'pointer' }} />
            Has stock on hand
          </label>

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
        {batches.length > 0 ? (
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Batch Number</th>
                  <th title="The batch's running number for its fuel type">Seq</th>
                  <th>Fuel Type</th>
                  <th>Type</th>
                  <th>Coupons</th>
                  <th>Target (L)</th>
                  <th>Location</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {batches.map(batch => (
                  <tr
                    key={batch.id}
                    onClick={() => navigate(`/batches/${batch.id}`)}
                    style={{ cursor: 'pointer' }}
                    title="View batch details"
                  >
                    <td style={{ fontWeight: 500, color: 'var(--color-accent-gold)', letterSpacing: '0.03em' }}>
                      {batch.batchNumber}
                    </td>
                    <td style={{ color: 'var(--color-text-muted)' }}>
                      {batch.sequenceNumber != null ? `#${batch.sequenceNumber}` : '—'}
                    </td>
                    <td>{batch.fuelType?.name ?? '—'}</td>
                    <td>
                      <span className={`badge ${batch.couponType === 'DIGITAL' ? 'badge-warning' : 'badge-success'}`}>
                        {batch.couponType}
                      </span>
                    </td>
                    <td>{batch.quantity?.toLocaleString()}</td>
                    <td>{batch.targetQuantity ? `${batch.targetQuantity.toLocaleString()} L` : '—'}</td>
                    <td>{batch.originLocation?.name ?? '—'}</td>
                    <td style={{ color: 'var(--color-text-muted)' }}>
                      {new Date(batch.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-text-muted)' }}>
            <div style={{ marginBottom: '1rem', color: 'rgba(255,255,255,0.1)' }}>
              <Package size={48} style={{ margin: '0 auto' }} />
            </div>
            <h3>No batches found</h3>
            <p>Bulk-generate coupons to create your first batch, or adjust the filters.</p>
          </div>
        )}
      </div>

      <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
        <span style={{ color: 'var(--color-text-muted)' }}>
          <Filter size={14} style={{ verticalAlign: '-2px', marginRight: '0.3rem' }} />
          {totalElements.toLocaleString()} batch{totalElements === 1 ? '' : 'es'} total
        </span>
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
