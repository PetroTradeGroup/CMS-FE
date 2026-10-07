import React, { useEffect, useState } from 'react';
import { ClipboardList, Plus, X, AlertCircle, CheckCircle2, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getRequisitions, createRequisition } from '../services/requisitions';
import type { Requisition, RequisitionStatus, RequisitionLineRequest } from '../services/requisitions';
import { getDepartments } from '../services/departments';
import type { Department } from '../services/departments';
import { getLocations } from '../services/locations';
import type { LocationDetail } from '../services/locations';
import { getActiveFuelTypes } from '../services/fuelTypes';
import type { FuelType } from '../services/fuelTypes';
import { getErrorMessage } from '../services/api';
import { Modal } from '../components/Modal';
import { isSalesClerk, getUsername, getDepartmentCode } from '../services/auth';

const STATUS_TABS: { label: string; value: RequisitionStatus | '' }[] = [
  { label: 'Pending', value: 'PENDING' },
  { label: 'Partially Fulfilled', value: 'PARTIALLY_FULFILLED' },
  { label: 'Fulfilled', value: 'FULFILLED' },
  { label: 'Rejected', value: 'REJECTED' },
  { label: 'All', value: '' },
];

const requisitionBadge = (status: RequisitionStatus) => {
  switch (status) {
    case 'PENDING': return 'badge-warning';
    case 'PARTIALLY_FULFILLED': return 'badge-info';
    case 'FULFILLED': return 'badge-success';
    default: return 'badge-danger'; // REJECTED
  }
};

interface LineInput {
  fuelTypeId: string;
  denomination: string;
  books: string;
  litres: string;
}

const COMMON_DENOMINATIONS = [5, 10, 20, 50];

export const Requisitions: React.FC = () => {
  const navigate = useNavigate();
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusTab, setStatusTab] = useState<RequisitionStatus | ''>('PENDING');
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [locations, setLocations] = useState<LocationDetail[]>([]);
  const [fuelTypes, setFuelTypes] = useState<FuelType[]>([]);
  const [departmentId, setDepartmentId] = useState('');
  // The backend raises for the caller's own department; only accounts without one pick it here.
  const myDepartment = getDepartmentCode();
  const [locationId, setLocationId] = useState('');
  // A Sales Clerk always raises as themselves, so their dashboard can track what they asked for.
  const lockRequestedBy = isSalesClerk();
  const [requestedBy, setRequestedBy] = useState<string>(() => (lockRequestedBy && getUsername()) || localStorage.getItem('username') || '');
  const [unit, setUnit] = useState<'books' | 'litres'>('books');
  const [lines, setLines] = useState<LineInput[]>([{ fuelTypeId: '', denomination: '', books: '', litres: '' }]);
  const [creating, setCreating] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadRequisitions = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getRequisitions(page, 20, statusTab || undefined);
      setRequisitions(res.data?.content || []);
      setTotalPages(res.data?.totalPages || 0);
      setTotalElements(res.data?.totalElements || 0);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load requisitions.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequisitions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusTab]);

  useEffect(() => {
    setPage(0);
  }, [statusTab]);

  // Backfill any line still missing a fuel type once the list finishes loading — openCreate/addLine
  // can run before the fetch resolves, leaving a line's fuelTypeId stuck on the empty placeholder.
  useEffect(() => {
    if (fuelTypes.length === 0) return;
    setLines(prev => prev.map(l => (l.fuelTypeId ? l : { ...l, fuelTypeId: fuelTypes[0].id.toString() })));
  }, [fuelTypes]);

  const openCreate = async () => {
    setDepartmentId('');
    setLocationId('');
    setLines([{ fuelTypeId: fuelTypes[0]?.id.toString() || '', denomination: '', books: '', litres: '' }]);
    setModalError(null);
    setShowCreate(true);
    if (!myDepartment && departments.length === 0) {
      getDepartments(true).then(res => setDepartments(res.data || [])).catch(() => setDepartments([]));
    }
    if (locations.length === 0) {
      getLocations(true).then(res => setLocations(res.data || [])).catch(() => setLocations([]));
    }
    if (fuelTypes.length === 0) {
      getActiveFuelTypes(0, 100).then(res => setFuelTypes(res.data?.content || [])).catch(() => setFuelTypes([]));
    }
  };

  const updateLine = (index: number, field: keyof LineInput, value: string) => {
    setLines(prev => prev.map((line, i) => (i === index ? { ...line, [field]: value } : line)));
  };

  const addLine = (denomination = '') => {
    setLines(prev => [...prev, { fuelTypeId: fuelTypes[0]?.id.toString() || '', denomination, books: '', litres: '' }]);
  };

  const removeLine = (index: number) => {
    setLines(prev => prev.filter((_, i) => i !== index));
  };

  const handleCreate = async () => {
    if (!myDepartment && !departmentId) {
      setModalError('Select a department.');
      return;
    }
    if (!locationId) {
      setModalError('Select a location.');
      return;
    }
    if (!requestedBy.trim()) {
      setModalError('Requested by is required.');
      return;
    }
    const amountField = unit === 'books' ? 'books' : 'litres';
    if (lines.some(l => !l.fuelTypeId || !l.denomination.trim() || !l[amountField].trim())) {
      setModalError(`Every line needs a fuel type, a denomination, and a ${unit === 'books' ? 'book count' : 'litres amount'}.`);
      return;
    }
    const parsedLines: RequisitionLineRequest[] = lines.map(l => ({
      fuelTypeId: parseInt(l.fuelTypeId, 10),
      denomination: parseFloat(l.denomination),
      ...(unit === 'books' ? { books: parseInt(l.books, 10) } : { litres: parseFloat(l.litres) })
    }));
    if (parsedLines.some(l => !l.denomination || l.denomination <= 0)) {
      setModalError('Denominations must be positive numbers of litres.');
      return;
    }
    if (unit === 'books' && parsedLines.some(l => !l.books || l.books <= 0)) {
      setModalError('Books must be a whole number greater than 0 on every line.');
      return;
    }
    if (unit === 'litres' && parsedLines.some(l => !l.litres || l.litres <= 0)) {
      setModalError('Litres must be greater than 0 on every line.');
      return;
    }
    const pairSet = new Set(parsedLines.map(l => `${l.fuelTypeId}:${l.denomination}`));
    if (pairSet.size !== parsedLines.length) {
      setModalError('No two lines may repeat the same fuel type and denomination.');
      return;
    }

    setCreating(true);
    setModalError(null);
    try {
      const res = await createRequisition({
        ...(myDepartment ? {} : { departmentId: parseInt(departmentId, 10) }),
        locationId: parseInt(locationId, 10),
        requestedBy: requestedBy.trim(),
        lines: parsedLines
      });
      setSuccess(`Requisition #${res.data.id} raised.`);
      setShowCreate(false);
      await loadRequisitions();
    } catch (err) {
      setModalError(getErrorMessage(err, 'Failed to raise requisition.'));
    } finally {
      setCreating(false);
    }
  };

  const totalLitres = (req: Requisition) => req.lines.reduce((sum, l) => sum + l.requestedLitres, 0);
  const outstandingLitres = (req: Requisition) => req.lines.reduce((sum, l) => sum + l.outstandingLitres, 0);
  const totalBooks = (req: Requisition) => req.lines.reduce((sum, l) => sum + l.requestedBooks, 0);
  const outstandingBooks = (req: Requisition) => req.lines.reduce((sum, l) => sum + l.outstandingBooks, 0);

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1>Requisitions</h1>
          <p style={{ margin: 0 }}>A department's request to Stock for coupons, in litres per fuel type and denomination.</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          <Plus size={18} /> New Requisition
        </button>
      </div>

      {error && (
        <div style={{ padding: '1rem', background: 'rgba(208, 76, 87, 0.1)', border: '1px solid var(--color-accent-red)', borderRadius: '8px', color: 'var(--color-accent-red)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertCircle size={20} /> {error}
        </div>
      )}
      {success && (
        <div style={{ padding: '1rem', background: 'rgba(74, 222, 128, 0.1)', border: '1px solid #4ade80', borderRadius: '8px', color: '#4ade80', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle2 size={20} /> {success}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {STATUS_TABS.map(tab => (
          <button
            key={tab.label}
            className={`btn ${statusTab === tab.value ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.5rem 1.2rem', fontSize: '0.9rem' }}
            onClick={() => setStatusTab(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-accent-gold)' }}>Loading requisitions...</div>
        ) : requisitions.length > 0 ? (
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Department</th>
                  <th>Location</th>
                  <th>Requested (Books)</th>
                  <th>Outstanding (Books)</th>
                  <th>Requested By</th>
                  <th>Requested At</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {requisitions.map(req => (
                  <tr key={req.id} onClick={() => navigate(`/requisitions/${req.id}`)} style={{ cursor: 'pointer' }} title="View requisition details">
                    <td style={{ color: 'var(--color-accent-gold)', fontWeight: 600 }}>{req.id}</td>
                    <td>{req.department?.name ?? '—'}</td>
                    <td>{req.location?.name ?? '—'}</td>
                    <td>{totalBooks(req).toLocaleString()} <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>({totalLitres(req).toLocaleString()} L)</span></td>
                    <td>{outstandingBooks(req).toLocaleString()} <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>({outstandingLitres(req).toLocaleString()} L)</span></td>
                    <td>{req.requestedBy}</td>
                    <td style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                      {new Date(req.requestedAt).toLocaleString()}
                    </td>
                    <td>
                      <span className={`badge ${requisitionBadge(req.status)}`}>{req.status.replace('_', ' ')}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-text-muted)' }}>
            <div style={{ marginBottom: '1rem', color: 'rgba(255,255,255,0.1)' }}>
              <ClipboardList size={48} style={{ margin: '0 auto' }} />
            </div>
            <h3>No {statusTab ? statusTab.replace('_', ' ').toLowerCase() : ''} requisitions</h3>
            <p>Departments raise requisitions to ask Stock for coupons by litres and denomination.</p>
          </div>
        )}
      </div>

      <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
        <span style={{ color: 'var(--color-text-muted)' }}>{totalElements.toLocaleString()} requisition{totalElements === 1 ? '' : 's'} total</span>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem' }} disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>
            Previous
          </button>
          <span style={{ margin: '0 0.5rem', color: 'var(--color-text-muted)' }}>Page {page + 1} of {totalPages || 1}</span>
          <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem' }} disabled={page >= totalPages - 1} onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}>
            Next
          </button>
        </div>
      </div>

      {/* Create requisition modal */}
      {showCreate && (
        <Modal onClose={() => setShowCreate(false)} width="min(560px, 92vw)">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: 0, color: 'var(--color-accent-gold)' }}>New Requisition</h3>
            <button className="btn btn-secondary" style={{ padding: '0.3rem 0.5rem' }} onClick={() => setShowCreate(false)}>
              <X size={16} />
            </button>
          </div>

          {modalError && (
            <div style={{ padding: '0.75rem 1rem', background: 'rgba(208, 76, 87, 0.1)', border: '1px solid var(--color-accent-red)', borderRadius: '8px', color: 'var(--color-accent-red)', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
              {modalError}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="input-group">
              <label>Department</label>
              {myDepartment ? (
                <input className="input-field" value={myDepartment} readOnly disabled />
              ) : (
                <select className="input-field" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} required>
                  <option value="">Select...</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                  ))}
                </select>
              )}
            </div>
            <div className="input-group">
              <label>Location</label>
              <select className="input-field" value={locationId} onChange={(e) => setLocationId(e.target.value)} required>
                <option value="">Select...</option>
                {locations.map(l => (
                  <option key={l.id} value={l.id}>{l.name} ({l.code})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="input-group">
            <label>Requested By</label>
            <input className="input-field" value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} readOnly={lockRequestedBy} required />
          </div>

          <div className="input-group">
            <label>Lines (books or litres per fuel type and denomination)</label>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <button
                type="button"
                className={`btn ${unit === 'books' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}
                onClick={() => setUnit('books')}
              >
                Books
              </button>
              <button
                type="button"
                className={`btn ${unit === 'litres' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}
                onClick={() => setUnit('litres')}
              >
                Litres
              </button>
            </div>
            {unit === 'litres' && (
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '-0.4rem', marginBottom: '0.75rem' }}>
                Litres must be a whole-book multiple of the denomination — books is preferred.
              </p>
            )}
            {fuelTypes.length === 0 && (
              <p style={{ color: 'var(--color-accent-red)', fontSize: '0.8rem', marginTop: '-0.25rem', marginBottom: '0.75rem' }}>
                No active fuel types found. Activate one in Fuel Types management before raising a requisition.
              </p>
            )}
            {lines.map((line, index) => (
              <div key={index} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.6rem' }}>
                <select
                  className="input-field"
                  style={{ flex: 1.2 }}
                  value={line.fuelTypeId}
                  onChange={(e) => updateLine(index, 'fuelTypeId', e.target.value)}
                >
                  <option value="">Fuel type...</option>
                  {fuelTypes.map(ft => (
                    <option key={ft.id} value={ft.id}>{ft.name}</option>
                  ))}
                </select>
                <input
                  type="number"
                  className="input-field"
                  placeholder="Denomination (L)"
                  min={1}
                  step="any"
                  value={line.denomination}
                  onChange={(e) => updateLine(index, 'denomination', e.target.value)}
                />
                <span style={{ color: 'var(--color-text-muted)' }}>×</span>
                {unit === 'books' ? (
                  <input
                    type="number"
                    className="input-field"
                    placeholder="Books"
                    min={1}
                    step={1}
                    value={line.books}
                    onChange={(e) => updateLine(index, 'books', e.target.value)}
                  />
                ) : (
                  <input
                    type="number"
                    className="input-field"
                    placeholder="Litres"
                    min={1}
                    step="any"
                    value={line.litres}
                    onChange={(e) => updateLine(index, 'litres', e.target.value)}
                  />
                )}
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '0.4rem 0.6rem' }}
                  onClick={() => removeLine(index)}
                  disabled={lines.length === 1}
                  title="Remove line"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary" style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }} onClick={() => addLine()}>
                <Plus size={16} /> Add line
              </button>
              {COMMON_DENOMINATIONS.map(d => (
                <button
                  key={d}
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  onClick={() => addLine(d.toString())}
                >
                  + {d} L
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleCreate} disabled={creating || fuelTypes.length === 0}>
              {creating ? 'Submitting...' : 'Raise Requisition'}
            </button>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowCreate(false)} disabled={creating}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};
