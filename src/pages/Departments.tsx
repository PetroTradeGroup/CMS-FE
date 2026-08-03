import React, { useEffect, useState } from 'react';
import { Building2, Plus, Pencil, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { getDepartments, createDepartment, updateDepartment } from '../services/departments';
import type { Department } from '../services/departments';
import { getErrorMessage } from '../services/api';

// Backend default-resolution depends on this code — its identity must not be touched from the UI
const PROTECTED_CODES = ['STOCKS'];

export const Departments: React.FC = () => {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');

  // Edit state (inline)
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

  const loadDepartments = async () => {
    try {
      const res = await getDepartments(false); // include inactive so they can be reactivated
      setDepartments(res.data || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load departments.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDepartments();
  }, []);

  const flash = (message: string) => {
    setSuccess(message);
    setError(null);
    setTimeout(() => setSuccess(null), 4000);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createDepartment(newCode.trim().toUpperCase(), newName.trim());
      flash(`Department "${newName.trim()}" created.`);
      setNewCode('');
      setNewName('');
      setShowCreate(false);
      await loadDepartments();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to create department.'));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (dept: Department) => {
    setEditingId(dept.id);
    setEditName(dept.name);
    setError(null);
  };

  const handleUpdateName = async (dept: Department) => {
    if (!editName.trim() || editName.trim() === dept.name) {
      setEditingId(null);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateDepartment(dept.id, { name: editName.trim(), active: dept.active });
      flash('Department renamed.');
      setEditingId(null);
      await loadDepartments();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to update department.'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (dept: Department) => {
    setSaving(true);
    setError(null);
    try {
      await updateDepartment(dept.id, { name: dept.name, active: !dept.active });
      flash(`Department ${dept.active ? 'deactivated' : 'activated'}.`);
      await loadDepartments();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to update department.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-center animate-fade-in" style={{ height: '60vh' }}>
        <div style={{ color: 'var(--color-accent-gold)', fontSize: '1.2rem' }}>Loading departments...</div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1>Departments</h1>
          <p style={{ margin: 0 }}>Organizational units a coupon moves through (e.g. Stocks → Commercial → Retail).</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(v => !v)}>
          {showCreate ? <X size={18} /> : <Plus size={18} />}
          {showCreate ? 'Cancel' : 'New Department'}
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

      {showCreate && (
        <form onSubmit={handleCreate} className="glass-panel animate-fade-in" style={{ padding: '1.5rem', marginBottom: '2rem', display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="input-group" style={{ width: '180px', marginBottom: 0 }}>
            <label>Code (max 10 chars)</label>
            <input
              className="input-field"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.toUpperCase())}
              maxLength={10}
              placeholder="COMMERCIAL"
              required
            />
          </div>
          <div className="input-group" style={{ flex: 1, minWidth: '220px', marginBottom: 0 }}>
            <label>Name (max 100 chars)</label>
            <input
              className="input-field"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={100}
              placeholder="Commercial"
              required
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Creating...' : 'Create'}
          </button>
        </form>
      )}

      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        {departments.length > 0 ? (
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {departments.map(dept => {
                  const isProtected = PROTECTED_CODES.includes(dept.code);
                  return (
                    <tr key={dept.id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--color-accent-gold)' }}>
                        {dept.code}
                        {isProtected && (
                          <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', color: 'var(--color-text-muted)' }} title="System default — the backend depends on this department">
                            (system)
                          </span>
                        )}
                      </td>
                      <td>
                        {editingId === dept.id ? (
                          <input
                            className="input-field"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleUpdateName(dept); } }}
                            maxLength={100}
                            autoFocus
                            style={{ maxWidth: '300px' }}
                          />
                        ) : dept.name}
                      </td>
                      <td>
                        <span className={`badge ${dept.active ? 'badge-success' : 'badge-danger'}`}>
                          {dept.active ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                          {editingId === dept.id ? (
                            <>
                              <button className="btn btn-primary" style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem' }} onClick={() => handleUpdateName(dept)} disabled={saving}>
                                Save
                              </button>
                              <button className="btn btn-secondary" style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem' }} onClick={() => setEditingId(null)}>
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button className="btn btn-secondary" style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem' }} onClick={() => startEdit(dept)} title="Rename">
                                <Pencil size={14} /> Rename
                              </button>
                              <button
                                className="btn btn-secondary"
                                style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem', color: dept.active ? 'var(--color-accent-red)' : '#4ade80' }}
                                onClick={() => handleToggleActive(dept)}
                                disabled={saving || (isProtected && dept.active)}
                                title={isProtected && dept.active ? 'System department — cannot be deactivated' : dept.active ? 'Deactivate' : 'Activate'}
                              >
                                {dept.active ? 'Deactivate' : 'Activate'}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-text-muted)' }}>
            <div style={{ marginBottom: '1rem', color: 'rgba(255,255,255,0.1)' }}>
              <Building2 size={48} style={{ margin: '0 auto' }} />
            </div>
            <h3>No departments</h3>
            <p>Create your first department to route coupons between units.</p>
          </div>
        )}
      </div>

      <p style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
        Departments cannot be deleted (audit requirement) — deactivate them instead. Codes are fixed once created.
      </p>
    </div>
  );
};
