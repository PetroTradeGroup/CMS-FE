import React, { useEffect, useState } from 'react';
import { MapPin, Plus, Pencil, AlertCircle, CheckCircle2, X, ArrowUpDown, Lock } from 'lucide-react';
import {
  getLocationsPage,
  createLocation,
  updateLocation,
  assignLocationCompany,
  LOCATION_TYPES,
  LOCATION_TYPE_LABEL,
} from '../services/locations';
import type { LocationDetail, LocationType } from '../services/locations';
import { getErrorMessage } from '../services/api';
import { hasRole } from '../services/auth';
import { Modal } from '../components/Modal';
import { useResetPage } from '../utils/useResetPage';
import { CompaniesPanel } from '../components/CompaniesPanel';
import { getCompanies } from '../services/companies';
import type { Company } from '../services/companies';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
type StatusFilter = 'all' | 'active' | 'inactive';
type SortField = 'code' | 'name' | 'type';

const EMPTY_FORM = { code: '', name: '', type: 'RETAIL_SITE' as LocationType, address: '', companyId: '' };

export const Locations: React.FC = () => {
  // Create/update are ADMIN-only server-side; everyone authenticated can read the list.
  const isAdmin = hasRole('ADMIN');

  const [pageRows, setPageRows] = useState<LocationDetail[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [reloadTick, setReloadTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<'' | LocationType>('');
  const [sortField, setSortField] = useState<SortField>('code');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Modal — create when `editing` is null, edit otherwise
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<LocationDetail | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [companyFilter, setCompanyFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  // Wait for a pause in typing before hitting the server.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Paging, sorting and filtering all happen server-side, so this scales past any site count.
  const filterKey = JSON.stringify([statusFilter, typeFilter, companyFilter, search, sortField, sortDir, pageSize]);
  useResetPage(filterKey, setPage);
  useEffect(() => {
    getLocationsPage(page, pageSize, `${sortField},${sortDir}`, {
      active: statusFilter === 'all' ? undefined : statusFilter === 'active',
      type: typeFilter || undefined,
      companyId: companyFilter ? Number(companyFilter) : undefined,
      q: search,
    })
      .then((res) => {
        setPageRows(res.data?.content ?? []);
        setTotal(res.data?.totalElements ?? 0);
        setTotalPages(Math.max(1, res.data?.totalPages ?? 1));
        setError(null);
      })
      .catch((err) => setError(getErrorMessage(err, 'Failed to load locations.')))
      .finally(() => setLoading(false));
  }, [page, pageSize, sortField, sortDir, statusFilter, typeFilter, companyFilter, search, reloadTick]);

  const refresh = () => setReloadTick((t) => t + 1);

  const flash = (message: string) => {
    setSuccess(message);
    setError(null);
    setTimeout(() => setSuccess(null), 4000);
  };

  // Companies: Admin and Regional Rep manage them and pick each site's company inline.
  const canManageCompanies = hasRole('ADMIN', 'REGIONAL_REP', 'RETAIL_MANAGER');
  const [companies, setCompanies] = useState<Company[]>([]);
  const loadCompanies = () => getCompanies().then((res) => setCompanies(res.data || [])).catch(() => setCompanies([]));
  useEffect(() => {
    getCompanies().then((res) => setCompanies(res.data || [])).catch(() => setCompanies([]));
  }, []);
  const safePage = Math.min(page, totalPages - 1);
  const rangeStart = total === 0 ? 0 : safePage * pageSize + 1;
  const rangeEnd = Math.min(total, (safePage + 1) * pageSize);

  const changeStatus = (v: StatusFilter) => setStatusFilter(v);
  const changeType = (v: '' | LocationType) => setTypeFilter(v);
  const changeCompany = (v: string) => setCompanyFilter(v);
  const changeSearch = (v: string) => setSearchInput(v);
  const changePageSize = (v: number) => setPageSize(v);
  const toggleSort = (field: SortField) => {
    if (field === sortField) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('asc'); }
  };
  const sortIndicator = (field: SortField) => (sortField === field ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  const openCreate = () => {
    setEditing(null);
    // Default to Petrotrade (the server's default too) so the common case is one click.
    const petrotrade = companies.find((c) => c.code === 'PETROTRADE');
    setForm({ ...EMPTY_FORM, companyId: petrotrade ? String(petrotrade.id) : '' });
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (loc: LocationDetail) => {
    setEditing(loc);
    setForm({ code: loc.code, name: loc.name, type: loc.type, address: loc.address ?? '', companyId: loc.companyId != null ? String(loc.companyId) : '' });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    const companyId = form.companyId ? Number(form.companyId) : null;
    try {
      if (editing && !isAdmin) {
        // Regional Rep: only the company is editable for them.
        if (companyId != null) await assignLocationCompany(editing.id, companyId);
        flash(`${editing.name} company updated.`);
      } else if (editing) {
        await updateLocation(editing.id, {
          name: form.name.trim(),
          type: form.type,
          address: form.address.trim() || null,
          active: editing.active,
          companyId,
        });
        flash(`Location "${form.name.trim()}" updated.`);
      } else {
        await createLocation({
          code: form.code.trim().toUpperCase(),
          name: form.name.trim(),
          type: form.type,
          address: form.address.trim() || null,
          companyId,
        });
        flash(`Location "${form.name.trim()}" created.`);
      }
      setModalOpen(false);
      refresh();
    } catch (err) {
      // 400 for a duplicate code/name or field validation; 403 if the token isn't ADMIN.
      setFormError(getErrorMessage(err, 'Failed to save the location.'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (loc: LocationDetail) => {
    setError(null);
    try {
      await updateLocation(loc.id, {
        name: loc.name,
        type: loc.type,
        address: loc.address,
        active: !loc.active,
      });
      flash(`Location ${loc.active ? 'deactivated' : 'activated'}.`);
      refresh();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to update the location.'));
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1>Locations</h1>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={18} /> New Location
          </button>
        )}
      </div>

      {!isAdmin && (
        <div style={{ padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--color-text-muted)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
          <Lock size={15} /> {canManageCompanies
            ? 'Creating and editing locations needs the Admin role — you can manage companies and change a site\'s company.'
            : 'Read-only — creating and editing locations needs the Admin role.'}
        </div>
      )}

      {canManageCompanies && <CompaniesPanel companies={companies} onChange={loadCompanies} />}

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

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div className="input-group" style={{ marginBottom: 0, width: '180px' }}>
          <label>Status</label>
          <select className="input-field" value={statusFilter} onChange={(e) => changeStatus(e.target.value as StatusFilter)}>
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div className="input-group" style={{ marginBottom: 0, width: '200px' }}>
          <label>Type</label>
          <select className="input-field" value={typeFilter} onChange={(e) => changeType(e.target.value as '' | LocationType)}>
            <option value="">All</option>
            {LOCATION_TYPES.map((t) => (
              <option key={t} value={t}>{LOCATION_TYPE_LABEL[t]}</option>
            ))}
          </select>
        </div>
        <div className="input-group" style={{ marginBottom: 0, width: '200px' }}>
          <label>Company</label>
          <select className="input-field" value={companyFilter} onChange={(e) => changeCompany(e.target.value)}>
            <option value="">All</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="input-group" style={{ marginBottom: 0, width: '240px' }}>
          <label>Search</label>
          <input className="input-field" value={searchInput} onChange={(e) => changeSearch(e.target.value)} placeholder="Code or name" />
        </div>
      </div>

      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-accent-gold)' }}>Loading locations…</div>
        ) : pageRows.length > 0 ? (
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('code')}>
                    Code{sortIndicator('code')} <ArrowUpDown size={11} style={{ verticalAlign: 'middle', opacity: 0.5 }} />
                  </th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('name')}>
                    Name{sortIndicator('name')} <ArrowUpDown size={11} style={{ verticalAlign: 'middle', opacity: 0.5 }} />
                  </th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('type')}>
                    Type{sortIndicator('type')} <ArrowUpDown size={11} style={{ verticalAlign: 'middle', opacity: 0.5 }} />
                  </th>
                  <th>Company</th>
                  <th>Address</th>
                  <th>Status</th>
                  {canManageCompanies && <th style={{ textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((loc) => (
                  <tr key={loc.id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--color-accent-gold)' }}>{loc.code}</td>
                    <td>{loc.name}</td>
                    <td>{LOCATION_TYPE_LABEL[loc.type] ?? loc.type}</td>
                    <td>{loc.companyName || '—'}</td>
                    <td style={{ color: 'var(--color-text-muted)' }}>{loc.address || '—'}</td>
                    <td>
                      <span className={`badge ${loc.active ? 'badge-success' : 'badge-danger'}`}>
                        {loc.active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    {canManageCompanies && (
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                          <button className="btn btn-secondary" style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem' }} onClick={() => openEdit(loc)}>
                            <Pencil size={14} /> {isAdmin ? 'Edit' : 'Change company'}
                          </button>
                          {isAdmin && <button
                            className="btn btn-secondary"
                            style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem', color: loc.active ? 'var(--color-accent-red)' : '#4ade80' }}
                            onClick={() => handleToggleActive(loc)}
                          >
                            {loc.active ? 'Deactivate' : 'Activate'}
                          </button>}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-text-muted)' }}>
            <div style={{ marginBottom: '1rem', color: 'rgba(255,255,255,0.1)' }}>
              <MapPin size={48} style={{ margin: '0 auto' }} />
            </div>
            <h3>No locations</h3>
            <p>No locations match the current filters.</p>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
          <span>
            {total === 0
              ? 'No locations'
              : `Showing ${rangeStart.toLocaleString()}–${rangeEnd.toLocaleString()} of ${total.toLocaleString()}`}
          </span>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            Rows
            <select
              className="input-field"
              style={{ width: 'auto', padding: '0.25rem 0.5rem' }}
              value={pageSize}
              onChange={(e) => changePageSize(Number(e.target.value))}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem' }} disabled={safePage === 0} onClick={() => setPage(0)}>
            « First
          </button>
          <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', marginLeft: '0.4rem' }} disabled={safePage === 0} onClick={() => setPage(Math.max(0, safePage - 1))}>
            Previous
          </button>
          <span style={{ margin: '0 0.75rem', color: 'var(--color-text-muted)' }}>Page {safePage + 1} of {totalPages}</span>
          <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem' }} disabled={safePage >= totalPages - 1} onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}>
            Next
          </button>
          <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', marginLeft: '0.4rem' }} disabled={safePage >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>
            Last »
          </button>
        </div>
      </div>

      {modalOpen && (
        <Modal onClose={() => !saving && setModalOpen(false)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ margin: 0 }}>{editing ? `Edit ${editing.code}` : 'New Location'}</h2>
            <button className="btn btn-secondary" style={{ padding: '0.3rem 0.5rem' }} onClick={() => !saving && setModalOpen(false)}>
              <X size={16} />
            </button>
          </div>

          {formError && (
            <div style={{ padding: '0.75rem', background: 'rgba(208, 76, 87, 0.1)', border: '1px solid var(--color-accent-red)', borderRadius: '8px', color: 'var(--color-accent-red)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
              <AlertCircle size={16} /> {formError}
            </div>
          )}

          <form onSubmit={handleSave}>
            <div className="input-group">
              <label htmlFor="loc-code">Code (max 10 chars)</label>
              <input
                id="loc-code"
                className="input-field"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                maxLength={10}
                placeholder="STN-09"
                required
                disabled={!!editing}
                title={editing ? 'Code is fixed once created' : undefined}
              />
            </div>
            <div className="input-group">
              <label htmlFor="loc-name">Name (max 100 chars)</label>
              <input
                id="loc-name"
                className="input-field"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                maxLength={100}
                placeholder="Station 9"
                required
                disabled={!isAdmin}
              />
            </div>
            <div className="input-group">
              <label htmlFor="loc-type">Type</label>
              <select
                id="loc-type"
                className="input-field"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as LocationType }))}
                disabled={!isAdmin}
              >
                {LOCATION_TYPES.map((t) => (
                  <option key={t} value={t}>{LOCATION_TYPE_LABEL[t]}</option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label htmlFor="loc-company">Company (who runs this site)</label>
              <select
                id="loc-company"
                className="input-field"
                value={form.companyId}
                onChange={(e) => setForm((f) => ({ ...f, companyId: e.target.value }))}
                required
              >
                <option value="" disabled>Select a company…</option>
                {companies.filter((c) => c.active || String(c.id) === form.companyId).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="input-group" style={{ marginBottom: '2rem' }}>
              <label htmlFor="loc-address">Address (optional, max 255)</label>
              <input
                id="loc-address"
                className="input-field"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                maxLength={255}
                placeholder="123 Samora Machel Ave, Harare"
                disabled={!isAdmin}
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Location'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
};
