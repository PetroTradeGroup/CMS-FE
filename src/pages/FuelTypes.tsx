import React, { useEffect, useState } from 'react';
import { Plus, Edit2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { 
  getFuelTypes, 
  createFuelType, 
  updateFuelType, 
  activateFuelType, 
  deactivateFuelType
} from '../services/fuelTypes';
import type { FuelType, FuelTypePayload } from '../services/fuelTypes';
import { Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { isSalesClerk } from '../services/auth';

export const FuelTypesManager: React.FC = () => {
  const readOnly = isSalesClerk();
  const [fuelTypes, setFuelTypes] = useState<FuelType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);

  // Modal / Form state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<FuelTypePayload>({ name: '', typeCode: '', description: '' });
  const [submitting, setSubmitting] = useState(false);

  const fetchFuelTypes = async () => {
    try {
      const effectiveSize = pageSize === -1 ? 1000 : pageSize;
      const res = await getFuelTypes(page, effectiveSize);
      setFuelTypes(res.data?.content || []);
      setTotalPages(res.data?.totalPages || 0);
      setTotalElements(res.data?.totalElements || 0);
    } catch (err: any) {
      setError('Failed to load fuel types.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFuelTypes();
  }, [page, pageSize]);

  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(fuelTypes.map(ft => ({
      'Code': ft.typeCode,
      'Name': ft.name,
      'Description': ft.description || '',
      'Status': ft.active ? 'Active' : 'Inactive'
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "FuelTypes");
    XLSX.writeFile(wb, `FuelTypes_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleOpenModal = (ft?: FuelType) => {
    if (ft) {
      setEditingId(ft.id);
      setFormData({ name: ft.name, typeCode: ft.typeCode, description: ft.description || '' });
    } else {
      setEditingId(null);
      setFormData({ name: '', typeCode: '', description: '' });
    }
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (editingId) {
        await updateFuelType(editingId, formData);
      } else {
        await createFuelType(formData);
      }
      setShowModal(false);
      await fetchFuelTypes();
    } catch (err: any) {
      setError(err.message || 'Operation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (ft: FuelType) => {
    try {
      if (ft.active) {
        await deactivateFuelType(ft.id);
      } else {
        await activateFuelType(ft.id);
      }
      await fetchFuelTypes();
    } catch (err: any) {
      setError(`Failed to ${ft.active ? 'deactivate' : 'activate'} fuel type.`);
    }
  };

  if (loading) {
    return <div className="flex-center animate-fade-in" style={{ height: '60vh' }}><div style={{ color: 'var(--color-accent-gold)' }}>Loading fuel types...</div></div>;
  }

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1>Fuel Types Management</h1>
          <p style={{ margin: 0 }}>Configure and manage the fuel types available in the system.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn btn-secondary" onClick={handleExport} disabled={fuelTypes.length === 0}>
            <Download size={18} /> Export
          </button>
          {!readOnly && (
            <button className="btn btn-primary" onClick={() => handleOpenModal()}>
              <Plus size={18} /> Add Fuel Type
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ padding: '1rem', background: 'rgba(208, 76, 87, 0.1)', border: '1px solid var(--color-accent-red)', borderRadius: '8px', color: 'var(--color-accent-red)', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertCircle size={20} /> {error}
        </div>
      )}

      <div className="glass-panel">
        <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Description</th>
                <th>Status</th>
                {!readOnly && <th style={{ textAlign: 'right' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {fuelTypes.map((ft) => (
                <tr key={ft.id}>
                  <td style={{ fontFamily: 'monospace', color: 'var(--color-accent-gold)' }}>{ft.typeCode}</td>
                  <td style={{ fontWeight: 600 }}>{ft.name}</td>
                  <td style={{ color: 'var(--color-text-secondary)', maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {ft.description || '-'}
                  </td>
                  <td>
                    <span className={`badge ${ft.active ? 'badge-success' : 'badge-danger'}`}>
                      {ft.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {!readOnly && <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      <button 
                        className="btn btn-secondary" 
                        style={{ padding: '0.4rem', borderRadius: '6px' }}
                        onClick={() => handleToggleStatus(ft)}
                        title={ft.active ? "Deactivate" : "Activate"}
                      >
                        {ft.active ? <XCircle size={16} /> : <CheckCircle size={16} color="#4ade80" />}
                      </button>
                      <button 
                        className="btn btn-secondary" 
                        style={{ padding: '0.4rem', borderRadius: '6px' }}
                        onClick={() => handleOpenModal(ft)}
                        title="Edit"
                      >
                        <Edit2 size={16} />
                      </button>
                    </div>
                  </td>}
                </tr>
              ))}
              {fuelTypes.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                    No fuel types configured yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ color: 'var(--color-text-muted)' }}>
            Showing {fuelTypes.length} on this page (Total in database: {totalElements})
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>Items per page:</span>
            <select 
              value={pageSize} 
              onChange={(e) => setPageSize(parseInt(e.target.value))}
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'white', padding: '2px 4px' }}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={-1}>All</option>
            </select>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button 
            className="btn btn-secondary" 
            style={{ padding: '0.4rem 0.8rem' }}
            disabled={page === 0 || pageSize === -1}
            onClick={() => setPage(p => Math.max(0, p - 1))}
          >
            Previous
          </button>
          
          <span style={{ margin: '0 0.5rem', color: 'var(--color-text-muted)' }}>
            Page {pageSize === -1 ? 1 : page + 1} of {pageSize === -1 ? 1 : (totalPages || 1)}
          </span>
          
          <button 
            className="btn btn-secondary" 
            style={{ padding: '0.4rem 0.8rem' }}
            disabled={pageSize === -1 || page >= totalPages - 1}
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
          >
            Next
          </button>
        </div>
      </div>

      {/* Simple Modal overlay for Create/Edit */}
      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '500px', padding: '2rem' }}>
            <h2 style={{ marginBottom: '1.5rem', color: 'var(--color-accent-gold)' }}>
              {editingId ? 'Edit Fuel Type' : 'Create Fuel Type'}
            </h2>
            <form onSubmit={handleSubmit}>
              <div className="input-group">
                <label>Name (e.g. PETROL)</label>
                <input 
                  type="text" 
                  className="input-field" 
                  required 
                  maxLength={20}
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value.toUpperCase()})}
                />
              </div>
              <div className="input-group">
                <label>Type Code (3-5 chars, e.g. 002)</label>
                <input 
                  type="text" 
                  className="input-field" 
                  required 
                  minLength={3}
                  maxLength={5}
                  value={formData.typeCode}
                  onChange={e => setFormData({...formData, typeCode: e.target.value})}
                  disabled={!!editingId} // Usually code shouldn't change, but following API limits
                />
                {editingId && <small style={{ color: 'var(--color-text-muted)' }}>Type code cannot be modified.</small>}
              </div>
              <div className="input-group">
                <label>Description (Optional)</label>
                <textarea 
                  className="input-field" 
                  rows={3}
                  value={formData.description || ''}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                />
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save Fuel Type'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
