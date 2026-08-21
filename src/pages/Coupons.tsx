import React, { useEffect, useState } from 'react';
import { Banknote, Search, Filter, ArrowRightLeft, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  getCoupons, transitionCoupons, getCouponHistory, COUPON_STATUSES, ALLOWED_TRANSITIONS,
  getStatusBadgeClass, formatDenomination
} from '../services/coupons';
import type { Coupon, CouponStatus, CouponMovement, TransitionResult } from '../services/coupons';
import { getFuelTypes } from '../services/fuelTypes';
import type { FuelType } from '../services/fuelTypes';
import { getLocations } from '../services/locations';
import type { LocationDetail } from '../services/locations';
import type { ApprovalRequest } from '../services/approvals';
import { getErrorMessage } from '../services/api';
import { Modal } from '../components/Modal';
import { Download } from 'lucide-react';
import * as XLSX from 'xlsx';

export const Coupons: React.FC = () => {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [fuelTypes, setFuelTypes] = useState<FuelType[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchingAll, setFetchingAll] = useState(false);
  const [exporting, setExporting] = useState(false);
  
  // Pagination
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [fuelTypeFilter, setFuelTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Batch number is a server-side filter — debounce typing so we don't query per keystroke
  const [batchNumberInput, setBatchNumberInput] = useState('');
  const [batchNumberFilter, setBatchNumberFilter] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setBatchNumberFilter(batchNumberInput.trim()), 500);
    return () => clearTimeout(t);
  }, [batchNumberInput]);

  // Bulk transition
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [locations, setLocations] = useState<LocationDetail[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showTransition, setShowTransition] = useState(false);
  const [targetStatus, setTargetStatus] = useState<CouponStatus | ''>('');
  const [toLocationId, setToLocationId] = useState('');
  const [transitionReason, setTransitionReason] = useState('');
  const [performedBy, setPerformedBy] = useState<string>(() => localStorage.getItem('username') || '');
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ kind: 'success' | 'info'; text: string } | null>(null);

  useEffect(() => {
    getLocations(true)
      .then(res => setLocations(res.data || []))
      .catch(() => setLocations([]));
  }, []);

  // Movement history modal
  const [historyCoupon, setHistoryCoupon] = useState<Coupon | null>(null);
  const [history, setHistory] = useState<CouponMovement[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const openHistory = async (coupon: Coupon) => {
    setHistoryCoupon(coupon);
    setHistory([]);
    setHistoryError(null);
    setHistoryLoading(true);
    try {
      const res = await getCouponHistory(coupon.couponNumber);
      setHistory(res.data || []);
    } catch (err) {
      setHistoryError(getErrorMessage(err, 'Failed to load coupon history.'));
    } finally {
      setHistoryLoading(false);
    }
  };

  // Reset page to 0 when filters or page size change
  useEffect(() => {
    setPage(0);
  }, [statusFilter, fuelTypeFilter, dateFrom, dateTo, pageSize, batchNumberFilter]);

  useEffect(() => {
    const fetchData = async () => {
      if (pageSize === -1) {
        setFetchingAll(true);
      } else {
        setLoading(true);
      }
      
      try {
        const filters = {
          status: statusFilter || undefined,
          fuelTypeId: fuelTypeFilter || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          batchNumber: batchNumberFilter || undefined
        };

        // Handle "All" page size with a larger initial size
        const initialSize = pageSize === -1 ? 2000 : pageSize;

        const [couponsRes, fuelTypesRes] = await Promise.all([
          getCoupons(page, initialSize, filters),
          getFuelTypes(0, 100)
        ]);
        
        setFuelTypes(fuelTypesRes.data?.content || []);

        let allContent = couponsRes.data?.content || [];
        const totalElements = couponsRes.data?.totalElements || 0;
        const totalPagesRes = couponsRes.data?.totalPages || 0;

        // If "All" is selected and we haven't reached the total, fetch more pages
        if (pageSize === -1 && allContent.length < totalElements) {
          let currentPage = 1;
          while (allContent.length < totalElements && currentPage < totalPagesRes) {
            const nextRes = await getCoupons(currentPage, initialSize, filters);
            if (nextRes.data?.content) {
              allContent = [...allContent, ...nextRes.data.content];
            }
            currentPage++;
          }
        }
        
        setCoupons(allContent);
        setTotalPages(pageSize === -1 ? 1 : totalPagesRes);
        setTotalElements(totalElements);
        setSelected(new Set()); // page data changed — stale selections would be invisible
      } catch (error) {
        console.error('Failed to load coupons', error);
      } finally {
        setLoading(false);
        setFetchingAll(false);
      }
    };

    fetchData();
  }, [page, statusFilter, fuelTypeFilter, dateFrom, dateTo, pageSize, refreshKey, batchNumberFilter]);

  const handleExport = async () => {
    setExporting(true);
    try {
      let dataToExport = coupons;

      // If we are NOT in "All" view, but want to export everything matching filters
      if (pageSize !== -1 && totalElements > coupons.length) {
        // Fetch all pages for export
        const filters = {
          status: statusFilter || undefined,
          fuelTypeId: fuelTypeFilter || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          batchNumber: batchNumberFilter || undefined
        };

        let allData: Coupon[] = [];
        let currentPage = 0;
        let totalPagesLocal = 1;
        const exportBatchSize = 2000;

        while (currentPage < totalPagesLocal) {
          const res = await getCoupons(currentPage, exportBatchSize, filters);
          if (res.data?.content) {
            allData = [...allData, ...res.data.content];
          }
          totalPagesLocal = res.data?.totalPages || 0;
          currentPage++;
        }
        dataToExport = allData;
      }

      const ws = XLSX.utils.json_to_sheet(dataToExport.map(c => ({
        'Coupon Number': c.couponNumber,
        'Fuel Type': c.fuelType.name,
        'Denomination (L)': c.denomination > 0 ? c.denomination : 'N/A',
        'Status': c.status,
        'Batch': c.batchNumber || '',
        'Batch Sequence': c.batchSequence ?? '',
        'Book Number': c.bookNumber ?? '',
        'Created At': new Date(c.createdAt).toLocaleString()
      })));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Coupons");
      XLSX.writeFile(wb, `Coupons_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (error) {
      console.error('Export failed', error);
      alert('Failed to export data. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  // Local filter for search term only, since others are handled by backend
  const filteredCoupons = coupons.filter(c => {
    return c.couponNumber.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const toggleSelect = (couponNumber: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(couponNumber)) next.delete(couponNumber);
      else next.add(couponNumber);
      return next;
    });
  };

  const allVisibleSelected = filteredCoupons.length > 0 && filteredCoupons.every(c => selected.has(c.couponNumber));
  const toggleSelectAll = () => {
    setSelected(allVisibleSelected ? new Set() : new Set(filteredCoupons.map(c => c.couponNumber)));
  };

  // Legal targets = intersection across the distinct statuses of the selection
  // (the endpoint is all-or-nothing, so a target must be legal for every coupon)
  const selectedStatuses = [...new Set(coupons.filter(c => selected.has(c.couponNumber)).map(c => c.status))];
  const allowedTargets = selectedStatuses.length > 0
    ? COUPON_STATUSES.filter(s => selectedStatuses.every(st => ALLOWED_TRANSITIONS[st].includes(s)))
    : [];

  const reasonRequired = targetStatus === 'CANCELLED' || targetStatus === 'FLAGGED';

  const openTransition = () => {
    setTargetStatus('');
    setToLocationId('');
    setTransitionReason('');
    setModalError(null);
    setShowTransition(true);
  };

  const handleTransition = async () => {
    if (!targetStatus) {
      setModalError('Select a target status.');
      return;
    }
    if (reasonRequired && !transitionReason.trim()) {
      setModalError(`A reason is required when transitioning to ${targetStatus}.`);
      return;
    }

    setSubmitting(true);
    setModalError(null);
    try {
      const res = await transitionCoupons({
        couponNumbers: [...selected],
        targetStatus,
        ...(toLocationId ? { toLocationId: parseInt(toLocationId, 10) } : {}),
        ...(transitionReason.trim() ? { reason: transitionReason.trim() } : {}),
        ...(performedBy.trim() ? { performedBy: performedBy.trim() } : {})
      });

      // 202 = deferred to the supervisor queue; 200 = applied immediately
      if (res.status === 202) {
        const approval = res.data as ApprovalRequest;
        setActionMessage({
          kind: 'info',
          text: `Move submitted for approval — request #${approval.id}. Nothing changes until a supervisor approves it (see Approvals).`
        });
      } else {
        const result = res.data as TransitionResult;
        setActionMessage({
          kind: 'success',
          text: `${result.count} coupon${result.count === 1 ? '' : 's'} moved to ${result.targetStatus.replace('_', ' ')}.`
        });
      }
      setShowTransition(false);
      setSelected(new Set());
      setRefreshKey(k => k + 1);
    } catch (err) {
      setModalError(getErrorMessage(err, 'Failed to transition coupons.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-center animate-fade-in" style={{ height: '60vh' }}>
        <div style={{ color: 'var(--color-accent-gold)', fontSize: '1.2rem' }}>Loading coupons...</div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1>Coupons Management</h1>
          <p style={{ margin: 0 }}>View and manage all generated fuel coupons</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          {selected.size > 0 && (
            <button className="btn btn-primary" onClick={openTransition}>
              <ArrowRightLeft size={18} /> Transition ({selected.size})
            </button>
          )}
          <button className="btn btn-secondary" onClick={handleExport} disabled={exporting || coupons.length === 0}>
            <Download size={18} /> {exporting ? 'Exporting...' : 'Export'}
          </button>
          <Link to="/coupons/generate" className="btn btn-primary" style={{ boxShadow: '0 10px 20px rgba(206, 166, 32, 0.2)' }}>
            <Banknote size={18} />
            Generate New
          </Link>
        </div>
      </div>

      {actionMessage && (
        <div style={{
          padding: '1rem',
          background: actionMessage.kind === 'success' ? 'rgba(74, 222, 128, 0.1)' : 'rgba(96, 165, 250, 0.1)',
          border: `1px solid ${actionMessage.kind === 'success' ? '#4ade80' : '#60a5fa'}`,
          borderRadius: '8px',
          color: actionMessage.kind === 'success' ? '#4ade80' : '#60a5fa',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem'
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle2 size={20} /> {actionMessage.text}
          </span>
          <button onClick={() => setActionMessage(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>
      )}

      <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {/* Filter Row: Status, Fuel Type, Search */}
          <div style={{ display: 'flex', gap: '1rem', width: '100%', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="input-group" style={{ width: '160px', marginBottom: 0 }}>
              <label style={{ fontSize: '0.8rem', marginBottom: '0.2rem', color: 'var(--color-text-muted)' }}>Status</label>
              <select 
                className="input-field"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All Statuses</option>
                {COUPON_STATUSES.map(s => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            
            <div className="input-group" style={{ width: '180px', marginBottom: 0 }}>
              <label style={{ fontSize: '0.8rem', marginBottom: '0.2rem', color: 'var(--color-text-muted)' }}>Fuel Type</label>
              <select 
                className="input-field"
                value={fuelTypeFilter}
                onChange={(e) => setFuelTypeFilter(e.target.value)}
              >
                <option value="">All Fuel Types</option>
                {fuelTypes.map(ft => (
                  <option key={ft.id} value={ft.id}>{ft.name}</option>
                ))}
              </select>
            </div>
            
            <div className="input-group" style={{ width: '250px', marginBottom: 0 }}>
              <label style={{ fontSize: '0.8rem', marginBottom: '0.2rem', color: 'var(--color-text-muted)' }}>Search Number</label>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }}>
                  <Search size={16} />
                </div>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Local search..."
                  style={{ paddingLeft: '2.5rem' }}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="input-group" style={{ width: '280px', marginBottom: 0 }}>
              <label style={{ fontSize: '0.8rem', marginBottom: '0.2rem', color: 'var(--color-text-muted)' }}>Batch Number</label>
              <input
                type="text"
                className="input-field"
                placeholder="BAT-... (exact, case-insensitive)"
                value={batchNumberInput}
                onChange={(e) => setBatchNumberInput(e.target.value)}
              />
            </div>

            {/* Date Range grouped in same row if space allows */}
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
      </div>

      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        {filteredCoupons.length > 0 ? (
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '36px' }}>
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} style={{ cursor: 'pointer' }} />
                  </th>
                  <th>Coupon Number</th>
                  <th>Fuel Type</th>
                  <th>Denomination</th>
                  <th>Status</th>
                  <th>Batch</th>
                  <th>Book</th>
                  <th>Created At</th>
                </tr>
              </thead>
              <tbody>
                {filteredCoupons.map((coupon) => (
                  <tr key={coupon.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(coupon.couponNumber)}
                        onChange={() => toggleSelect(coupon.couponNumber)}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                    <td>
                      <button
                        onClick={() => openHistory(coupon)}
                        title="View movement history"
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 500, color: 'var(--color-accent-gold)', letterSpacing: '0.05em', fontSize: 'inherit', fontFamily: 'inherit', textDecoration: 'underline', textDecorationColor: 'rgba(206,166,32,0.35)', textUnderlineOffset: '3px' }}
                      >
                        {coupon.couponNumber}
                      </button>
                    </td>
                    <td>{coupon.fuelType.name}</td>
                    <td>{formatDenomination(coupon.denomination)}</td>
                    <td>
                      <span className={`badge ${getStatusBadgeClass(coupon.status)}`}>
                        {coupon.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                      {coupon.batchNumber ? `${coupon.batchNumber} #${coupon.batchSequence ?? '—'}` : '—'}
                    </td>
                    <td style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                      {coupon.bookNumber ?? '—'}
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
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-text-muted)' }}>
            <div style={{ marginBottom: '1rem', color: 'rgba(255,255,255,0.1)' }}>
              <Filter size={48} style={{ margin: '0 auto' }} />
            </div>
            <h3>No coupons found</h3>
            <p>Try adjusting your search or filters.</p>
          </div>
        )}
      </div>
      
      <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ color: 'var(--color-text-muted)' }}>
            {fetchingAll ? (
              <span style={{ color: 'var(--color-accent-gold)' }}>Fetching all records... ({coupons.length} of {totalElements})</span>
            ) : (
              `Showing ${filteredCoupons.length} on this page (Total in database: ${totalElements})`
            )}
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
              <option value={200}>200</option>
              <option value={500}>500</option>
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

      {/* Bulk transition modal */}
      {showTransition && (
        <Modal onClose={() => setShowTransition(false)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, color: 'var(--color-accent-gold)' }}>
                Transition {selected.size} Coupon{selected.size === 1 ? '' : 's'}
              </h3>
              <button className="btn btn-secondary" style={{ padding: '0.3rem 0.5rem' }} onClick={() => setShowTransition(false)}>
                <X size={16} />
              </button>
            </div>

            {modalError && (
              <div style={{ padding: '0.75rem 1rem', background: 'rgba(208, 76, 87, 0.1)', border: '1px solid var(--color-accent-red)', borderRadius: '8px', color: 'var(--color-accent-red)', marginBottom: '1.25rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertCircle size={16} /> {modalError}
              </div>
            )}

            {allowedTargets.length === 0 ? (
              <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
                The selected coupons ({selectedStatuses.map(s => s.replace('_', ' ')).join(', ')}) have no legal transition
                in common. Adjust the selection — transitions are all-or-nothing.
              </p>
            ) : (
              <>
                <div className="input-group">
                  <label>Target Status</label>
                  <select className="input-field" value={targetStatus} onChange={(e) => setTargetStatus(e.target.value as CouponStatus)}>
                    <option value="">Select status...</option>
                    {allowedTargets.map(s => (
                      <option key={s} value={s}>{s.replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>

                <div className="input-group">
                  <label>Move to Location (optional)</label>
                  <select className="input-field" value={toLocationId} onChange={(e) => setToLocationId(e.target.value)}>
                    <option value="">Keep current location</option>
                    {locations.map(l => (
                      <option key={l.id} value={l.id}>{l.name} ({l.code})</option>
                    ))}
                  </select>
                  {toLocationId && (
                    <p style={{ fontSize: '0.8rem', color: '#60a5fa', marginTop: '0.4rem' }}>
                      Changing location requires supervisor approval — nothing moves until the request is approved.
                    </p>
                  )}
                </div>

                <div className="input-group">
                  <label>Reason {reasonRequired ? '(required)' : '(optional)'}</label>
                  <input
                    className="input-field"
                    value={transitionReason}
                    onChange={(e) => setTransitionReason(e.target.value)}
                    maxLength={255}
                    placeholder={reasonRequired ? 'Required for CANCELLED / FLAGGED' : 'Recorded in the audit trail'}
                  />
                </div>

                <div className="input-group">
                  <label>Performed By</label>
                  <input className="input-field" value={performedBy} onChange={(e) => setPerformedBy(e.target.value)} maxLength={100} />
                </div>

                <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleTransition} disabled={submitting || !targetStatus}>
                    {submitting ? 'Submitting...' : toLocationId ? 'Submit for Approval' : 'Apply Transition'}
                  </button>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowTransition(false)} disabled={submitting}>
                    Cancel
                  </button>
                </div>
              </>
            )}
        </Modal>
      )}

      {/* Movement history modal */}
      {historyCoupon && (
        <Modal onClose={() => setHistoryCoupon(null)} width="min(640px, 92vw)">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
              <div>
                <h3 style={{ margin: 0, color: 'var(--color-accent-gold)', letterSpacing: '0.05em' }}>{historyCoupon.couponNumber}</h3>
                <p style={{ margin: '0.3rem 0 0', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                  {historyCoupon.fuelType.name} · {formatDenomination(historyCoupon.denomination)} · <span className={`badge ${getStatusBadgeClass(historyCoupon.status)}`}>{historyCoupon.status.replace('_', ' ')}</span>
                </p>
              </div>
              <button className="btn btn-secondary" style={{ padding: '0.3rem 0.5rem' }} onClick={() => setHistoryCoupon(null)}>
                <X size={16} />
              </button>
            </div>

            {historyLoading && (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-accent-gold)' }}>Loading history...</div>
            )}

            {historyError && (
              <div style={{ padding: '0.75rem 1rem', background: 'rgba(208, 76, 87, 0.1)', border: '1px solid var(--color-accent-red)', borderRadius: '8px', color: 'var(--color-accent-red)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertCircle size={16} /> {historyError}
              </div>
            )}

            {!historyLoading && !historyError && history.length === 0 && (
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                No movement history. Coupons generated before the audit release only accrue history from go-live onward.
              </p>
            )}

            {!historyLoading && history.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {history.map((m, i) => (
                  <div key={m.id} style={{ display: 'flex', gap: '1rem' }}>
                    {/* Timeline rail */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--color-accent-gold)', marginTop: '6px', flexShrink: 0 }} />
                      {i < history.length - 1 && (
                        <div style={{ width: '2px', flex: 1, background: 'rgba(206,166,32,0.25)' }} />
                      )}
                    </div>
                    <div style={{ paddingBottom: i < history.length - 1 ? '1.25rem' : 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '0.9rem' }}>{m.movementType.replace(/_/g, ' ')}</strong>
                        {m.fromStatus !== m.toStatus && m.toStatus && (
                          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                            {m.fromStatus ? `${m.fromStatus.replace('_', ' ')} → ` : ''}{m.toStatus.replace('_', ' ')}
                          </span>
                        )}
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                          {new Date(m.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                        {m.fromLocation && m.toLocation && m.fromLocation.id !== m.toLocation.id
                          ? `${m.fromLocation.name} → ${m.toLocation.name}`
                          : m.toLocation?.name || m.fromLocation?.name || ''}
                        {m.performedBy && <> · by {m.performedBy}</>}
                      </div>
                      {m.reason && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem', fontStyle: 'italic' }}>
                          “{m.reason}”
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
        </Modal>
      )}
    </div>
  );
};
