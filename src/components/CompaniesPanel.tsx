import React, { useState } from 'react';
import { Building, Plus, Check, X, ChevronDown, ChevronRight } from 'lucide-react';
import { createCompany, updateCompany } from '../services/companies';
import type { Company } from '../services/companies';
import { getErrorMessage } from '../services/api';

const PAGE_SIZE = 10;

/**
 * The companies sites can belong to (Petrotrade, Redan, …). Admin and Regional Rep add, rename and
 * (de)activate them here; which company a site is under is picked in the site's New/Edit form.
 * Collapsed by default; when open it's a searchable, paged table so a long list stays manageable.
 */
// ponytail: filters/pages the full GET /companies list client-side — fine into the low thousands; move to server paging past that.
export const CompaniesPanel: React.FC<{ companies: Company[]; onChange: () => void }> =
  ({ companies, onChange }) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(0);
    const [code, setCode] = useState('');
    const [name, setName] = useState('');
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editName, setEditName] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const run = async (action: () => Promise<unknown>) => {
      setBusy(true);
      setError(null);
      try {
        await action();
        onChange();
        return true;
      } catch (err) {
        setError(getErrorMessage(err, 'Saving the company failed.'));
        return false;
      } finally {
        setBusy(false);
      }
    };

    const add = async (e: React.FormEvent) => {
      e.preventDefault();
      if (await run(() => createCompany({ code: code.trim(), name: name.trim() }))) {
        setCode('');
        setName('');
      }
    };

    const saveName = async (c: Company) => {
      if (await run(() => updateCompany(c.id, { name: editName.trim(), active: c.active }))) setEditingId(null);
    };

    const q = search.trim().toLowerCase();
    const matches = companies
      .filter((c) => !q || c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
    const totalPages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages - 1);
    const rows = matches.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
    const activeCount = companies.filter((c) => c.active).length;

    return (
      <div className="glass-panel" style={{ padding: '1rem 1.5rem', marginBottom: '1.5rem' }}>
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, width: '100%', textAlign: 'left' }}>
          {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          <Building size={18} style={{ color: 'var(--color-accent-gold)' }} />
          <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Companies</h2>
          <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
            {companies.length} total · {activeCount} active — who runs each site
          </span>
        </button>

        {open && (
          <div style={{ marginTop: '1rem' }}>
            {error && <div style={{ color: 'var(--color-accent-red)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{error}</div>}

            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div className="input-group" style={{ marginBottom: 0, width: 240 }}>
                <label>Search</label>
                <input className="input-field" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Code or name" />
              </div>
              <form onSubmit={add} style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div className="input-group" style={{ marginBottom: 0, width: 140 }}>
                  <label>New code</label>
                  <input className="input-field" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} placeholder="REDAN" />
                </div>
                <div className="input-group" style={{ marginBottom: 0, width: 200 }}>
                  <label>Name</label>
                  <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="Redan" />
                </div>
                <button className="btn btn-primary" type="submit" disabled={busy || !code.trim() || !name.trim()}>
                  <Plus size={16} /> Add Company
                </button>
              </form>
            </div>

            {rows.length > 0 ? (
              <div className="table-container">
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
                    {rows.map((c) => (
                      <tr key={c.id}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--color-accent-gold)' }}>{c.code}</td>
                        <td>
                          {editingId === c.id ? (
                            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                              <input className="input-field" style={{ padding: '0.25rem 0.5rem', width: 200, marginBottom: 0 }} value={editName}
                                onChange={(e) => setEditName(e.target.value)} maxLength={100} autoFocus />
                              <button className="btn btn-secondary" style={{ padding: '0.25rem 0.45rem' }} disabled={busy || !editName.trim()} onClick={() => saveName(c)} aria-label="Save name"><Check size={14} /></button>
                              <button className="btn btn-secondary" style={{ padding: '0.25rem 0.45rem' }} onClick={() => setEditingId(null)} aria-label="Cancel"><X size={14} /></button>
                            </div>
                          ) : c.name}
                        </td>
                        <td>
                          <span className={`badge ${c.active ? 'badge-success' : 'badge-danger'}`}>{c.active ? 'ACTIVE' : 'INACTIVE'}</span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                            <button className="btn btn-secondary" style={{ padding: '0.3rem 0.7rem', fontSize: '0.8rem' }}
                              onClick={() => { setEditingId(c.id); setEditName(c.name); }}>Rename</button>
                            <button className="btn btn-secondary" disabled={busy}
                              style={{ padding: '0.3rem 0.7rem', fontSize: '0.8rem', color: c.active ? 'var(--color-accent-red)' : '#4ade80' }}
                              onClick={() => run(() => updateCompany(c.id, { name: c.name, active: !c.active }))}>
                              {c.active ? 'Deactivate' : 'Activate'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-muted)' }}>No companies match.</div>
            )}

            {matches.length > PAGE_SIZE && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                <span>{matches.length} match(es)</span>
                <button className="btn btn-secondary" style={{ padding: '0.3rem 0.7rem' }} disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous</button>
                <span>Page {safePage + 1} of {totalPages}</span>
                <button className="btn btn-secondary" style={{ padding: '0.3rem 0.7rem' }} disabled={safePage >= totalPages - 1} onClick={() => setPage(safePage + 1)}>Next</button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };
