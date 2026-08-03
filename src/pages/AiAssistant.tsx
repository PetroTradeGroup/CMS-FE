import React, { useState } from 'react';
import { Sparkles, Search, TrendingUp, Loader, AlertCircle, RefreshCw, FileText, FileDown } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { queryAi, getInsights } from '../services/ai';
import { getStatusBadgeClass } from '../services/coupons';
import type { NaturalLanguageQueryResponse, InsightResponse } from '../services/ai';

type Tab = 'query' | 'insights';

/* ─── Example prompts ─────────────────────────────────────────────── */
const EXAMPLE_QUESTIONS = [
  'Show me all expired diesel coupons from last week',
  'How many active petrol coupons were generated this month?',
  'Find used coupons from January 2026',
  'List all active coupons for fuel type 1',
];

/* ─── Helpers ─────────────────────────────────────────────────────── */
const fmtNum = (n: number) => n?.toLocaleString() ?? '0';
const fmtPct = (n: number) => `${(n ?? 0).toFixed(1)}%`;

/* ═══════════════════════════════════════════════════════════════════ */
export const AiAssistant: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('query');

  /* ── Query state ── */
  const [question, setQuestion] = useState('');
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [queryResult, setQueryResult] = useState<NaturalLanguageQueryResponse | null>(null);
  const [queryPage, setQueryPage] = useState(0);

  /* ── Insights state ── */
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [insightsData, setInsightsData] = useState<InsightResponse | null>(null);

  /* ── Handlers ── */
  const handleQuery = async (q?: string, p = 0) => {
    const text = q ?? question;
    if (!text.trim()) return;
    setQueryLoading(true);
    setQueryError(null);
    setQueryPage(p);
    try {
      const res = await queryAi(text, p, 20);
      setQueryResult(res.data);
    } catch (e: unknown) {
      setQueryError(e instanceof Error ? e.message : 'Query failed. Is Ollama running?');
    } finally {
      setQueryLoading(false);
    }
  };

  const handleFetchInsights = async () => {
    setInsightsLoading(true);
    setInsightsError(null);
    try {
      const res = await getInsights();
      setInsightsData(res.data);
    } catch (e: unknown) {
      setInsightsError(e instanceof Error ? e.message : 'Failed to fetch insights. Is Ollama running?');
    } finally {
      setInsightsLoading(false);
    }
  };

  /* ── Export: Business Insights PDF ── */
  const exportInsightsPDF = () => {
    if (!insightsData) return;
    const { stats, summary, generatedAt } = insightsData;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFillColor(15, 15, 30);
    doc.rect(0, 0, pageWidth, 42, 'F');
    doc.setTextColor(206, 166, 32);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Petrotrade Coupon System', 14, 17);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(200, 200, 200);
    doc.text('Business Insights Report', 14, 27);
    doc.text(`Generated: ${new Date(generatedAt).toLocaleString()}`, 14, 36);

    let y = 52;

    doc.setTextColor(206, 166, 32);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Coupon Statistics', 14, y);
    y += 6;

    autoTable(doc, {
      startY: y,
      head: [['Metric', 'Value']],
      body: [
        ['Total Coupons', fmtNum(stats.totalCoupons)],
        ['Active', fmtNum(stats.activeCoupons)],
        ['Used', fmtNum(stats.usedCoupons)],
        ['Expired', fmtNum(stats.expiredCoupons)],
        ['Issued This Week', fmtNum(stats.issuedThisWeek)],
        ['Issued Last Week', fmtNum(stats.issuedLastWeek)],
      ],
      theme: 'striped',
      headStyles: { fillColor: [15, 15, 30], textColor: [206, 166, 32] },
      columnStyles: { 1: { halign: 'right' } },
      margin: { left: 14, right: 14 },
    });

    y = (doc as any).lastAutoTable.finalY + 12;

    doc.setTextColor(206, 166, 32);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('AI Summary', 14, y);
    y += 7;
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const summaryLines = doc.splitTextToSize(summary, pageWidth - 28);
    doc.text(summaryLines, 14, y);
    y += summaryLines.length * 5 + 12;

    if (stats.fuelTypeBreakdown?.length > 0) {
      if (y > 230) { doc.addPage(); y = 20; }
      doc.setTextColor(206, 166, 32);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Fuel Type Breakdown', 14, y);
      y += 6;
      autoTable(doc, {
        startY: y,
        head: [['Fuel Type', 'Code', 'Total Issued', 'Active', 'Used', 'Expired']],
        body: stats.fuelTypeBreakdown.map(ft => [
          ft.fuelTypeName, ft.typeCode,
          fmtNum(ft.totalIssued), fmtNum(ft.active), fmtNum(ft.used), fmtNum(ft.expired),
        ]),
        theme: 'striped',
        headStyles: { fillColor: [15, 15, 30], textColor: [206, 166, 32] },
        margin: { left: 14, right: 14 },
      });
      y = (doc as any).lastAutoTable.finalY + 12;
    }

    if (stats.sequenceCapacities?.length > 0) {
      if (y > 230) { doc.addPage(); y = 20; }
      doc.setTextColor(206, 166, 32);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Sequence Capacity', 14, y);
      y += 6;
      autoTable(doc, {
        startY: y,
        head: [['Fuel Type', 'Current Letter', 'Issued in Letter', '% Capacity Used']],
        body: stats.sequenceCapacities.map(sc => [
          sc.fuelTypeName, sc.currentLetter,
          fmtNum(sc.issuedInCurrentLetter), fmtPct(sc.capacityUsedPercent),
        ]),
        theme: 'striped',
        headStyles: { fillColor: [15, 15, 30], textColor: [206, 166, 32] },
        columnStyles: { 3: { halign: 'right' } },
        margin: { left: 14, right: 14 },
      });
    }

    doc.save(`business-insights-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  /* ── Export: Query Results PDF ── */
  const exportQueryPDF = () => {
    if (!queryResult?.results?.content?.length) return;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFillColor(15, 15, 30);
    doc.rect(0, 0, pageWidth, 42, 'F');
    doc.setTextColor(206, 166, 32);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Petrotrade Coupon System', 14, 17);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(200, 200, 200);
    doc.text('Natural Language Query Results', 14, 27);
    doc.text(`Exported: ${new Date().toLocaleString()}`, 14, 36);

    let y = 52;

    doc.setTextColor(60, 60, 60);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Question:', 14, y);
    doc.setFont('helvetica', 'normal');
    const qLines = doc.splitTextToSize(queryResult.question, pageWidth - 60);
    doc.text(qLines, 46, y);
    y += Math.max(qLines.length, 1) * 5 + 5;

    doc.setFont('helvetica', 'bold');
    doc.text('Interpretation:', 14, y);
    doc.setFont('helvetica', 'normal');
    const iLines = doc.splitTextToSize(queryResult.interpretation, pageWidth - 60);
    doc.text(iLines, 46, y);
    y += Math.max(iLines.length, 1) * 5 + 5;

    doc.setFont('helvetica', 'bold');
    doc.text(
      `Total: ${fmtNum(queryResult.results.totalElements)} result(s)  —  showing page ${queryPage + 1} of ${queryResult.results.totalPages}`,
      14, y,
    );
    y += 10;

    autoTable(doc, {
      startY: y,
      head: [['Coupon Number', 'Fuel Type', 'Status', 'Created At']],
      body: queryResult.results.content.map(c => [
        c.couponNumber, c.fuelType.name, c.status, new Date(c.createdAt).toLocaleString(),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [15, 15, 30], textColor: [206, 166, 32] },
      margin: { left: 14, right: 14 },
    });

    doc.save(`query-results-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  /* ── Export: Query Results Excel ── */
  const exportQueryExcel = () => {
    if (!queryResult?.results?.content?.length) return;

    const rows = queryResult.results.content.map(c => ({
      'Coupon Number': c.couponNumber,
      'Fuel Type': c.fuelType.name,
      'Status': c.status,
      'Created At': new Date(c.createdAt).toLocaleString(),
    }));

    const wb = XLSX.utils.book_new();

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = (Object.keys(rows[0]) as (keyof typeof rows[0])[]).map(k => ({
      wch: Math.max(k.length, ...rows.map(r => String(r[k]).length)) + 2,
    }));
    XLSX.utils.book_append_sheet(wb, ws, 'Results');

    const infoWs = XLSX.utils.aoa_to_sheet([
      ['Question', queryResult.question],
      ['Interpretation', queryResult.interpretation],
      ['Total Results', queryResult.results.totalElements],
      ['Exported At', new Date().toLocaleString()],
    ]);
    infoWs['!cols'] = [{ wch: 18 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, infoWs, 'Query Info');

    XLSX.writeFile(wb, `query-results-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const statusBadgeClass = getStatusBadgeClass;

  /* ── Tab styles ── */
  const tabStyle = (tab: Tab): React.CSSProperties => ({
    padding: '0.6rem 1.4rem',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    fontWeight: 500,
    fontSize: '0.9rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    transition: 'all 0.2s ease',
    background: activeTab === tab ? 'var(--color-accent-gold)' : 'rgba(255,255,255,0.07)',
    color: activeTab === tab ? '#000' : 'var(--color-text-secondary)',
  });

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Sparkles size={32} style={{ color: 'var(--color-accent-gold)' }} />
          REPORT
        </h1>
        <p style={{ margin: 0 }}>
          Ask questions in plain English or get AI-powered business insights.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '2rem' }}>
        <button style={tabStyle('query')} onClick={() => setActiveTab('query')}>
          <Search size={16} /> Natural Language Query
        </button>
        <button style={tabStyle('insights')} onClick={() => setActiveTab('insights')}>
          <TrendingUp size={16} /> Business Insights
        </button>
      </div>

      {/* ══════════ QUERY TAB ══════════ */}
      {activeTab === 'query' && (
        <div>
          {/* Input panel */}
          <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--color-text-secondary)' }}>
              Ask a question about your coupons
            </label>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                <input
                  className="input-field"
                  style={{ paddingLeft: '2.5rem' }}
                  placeholder='e.g. "Show me all expired diesel coupons from last week"'
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleQuery()}
                  disabled={queryLoading}
                />
              </div>
              <button
                className="btn btn-primary"
                onClick={() => handleQuery()}
                disabled={queryLoading || !question.trim()}
                style={{ minWidth: '110px' }}
              >
                {queryLoading ? <Loader size={16} className="spin" /> : <><Sparkles size={16} /> Ask AI</>}
              </button>
            </div>

            {/* Example chips */}
            <div style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', alignSelf: 'center' }}>Try:</span>
              {EXAMPLE_QUESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => { setQuestion(q); handleQuery(q); }}
                  style={{
                    background: 'rgba(206,166,32,0.08)',
                    border: '1px solid rgba(206,166,32,0.25)',
                    color: 'var(--color-accent-gold)',
                    borderRadius: '999px',
                    padding: '0.3rem 0.8rem',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseOver={e => (e.currentTarget.style.background = 'rgba(206,166,32,0.18)')}
                  onMouseOut={e => (e.currentTarget.style.background = 'rgba(206,166,32,0.08)')}
                  disabled={queryLoading}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Loading spinner */}
          {queryLoading && (
            <div className="flex-center glass-panel" style={{ padding: '3rem', gap: '1rem' }}>
              <Loader size={24} style={{ color: 'var(--color-accent-gold)', animation: 'spin 1s linear infinite' }} />
              <span style={{ color: 'var(--color-text-secondary)' }}>Thinking…</span>
            </div>
          )}

          {/* Error */}
          {queryError && !queryLoading && (
            <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'flex-start', borderColor: 'rgba(208,76,87,0.3)' }}>
              <AlertCircle size={20} style={{ color: 'var(--color-accent-red)', flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 600, color: 'var(--color-accent-red)' }}>Query Failed</div>
                <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>{queryError}</div>
              </div>
            </div>
          )}

          {/* Results */}
          {queryResult && !queryLoading && (
            <div>
              {/* Interpretation banner */}
              <div className="glass-panel" style={{ padding: '1rem 1.5rem', marginBottom: '1rem', borderLeft: '3px solid var(--color-accent-gold)', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <Sparkles size={18} style={{ color: 'var(--color-accent-gold)', marginTop: '2px', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.25rem' }}>AI Interpretation</div>
                  <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>{queryResult.interpretation}</div>
                  {queryResult.appliedFilters && (
                    <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                      {queryResult.appliedFilters.status && (
                        <span className="badge badge-success">Status: {queryResult.appliedFilters.status}</span>
                      )}
                      {queryResult.appliedFilters.fuelTypeId && (
                        <span className="badge badge-warning">Fuel Type ID: {queryResult.appliedFilters.fuelTypeId}</span>
                      )}
                      {queryResult.appliedFilters.dateFrom && (
                        <span className="badge" style={{ background: 'rgba(255,255,255,0.07)', color: 'white', border: '1px solid var(--color-border)' }}>
                          From: {queryResult.appliedFilters.dateFrom}
                        </span>
                      )}
                      {queryResult.appliedFilters.dateTo && (
                        <span className="badge" style={{ background: 'rgba(255,255,255,0.07)', color: 'white', border: '1px solid var(--color-border)' }}>
                          To: {queryResult.appliedFilters.dateTo}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Table */}
              <div className="glass-panel" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600 }}>
                    Results — {fmtNum(queryResult.results?.totalElements ?? 0)} coupon(s) found
                  </span>
                  {(queryResult.results?.content?.length ?? 0) > 0 && (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        className="btn btn-secondary"
                        style={{ gap: '0.5rem', padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                        onClick={exportQueryPDF}
                      >
                        <FileText size={14} /> PDF
                      </button>
                      <button
                        className="btn btn-secondary"
                        style={{ gap: '0.5rem', padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                        onClick={exportQueryExcel}
                      >
                        <FileDown size={14} /> Excel
                      </button>
                    </div>
                  )}
                </div>

                {(queryResult.results?.content?.length ?? 0) > 0 ? (
                  <>
                    <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
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
                          {queryResult.results.content.map(c => (
                            <tr key={c.id}>
                              <td style={{ fontWeight: 500, color: 'var(--color-accent-gold)', letterSpacing: '0.05em' }}>{c.couponNumber}</td>
                              <td>{c.fuelType.name}</td>
                              <td><span className={`badge ${statusBadgeClass(c.status)}`}>{c.status}</span></td>
                              <td style={{ color: 'var(--color-text-muted)' }}>{new Date(c.createdAt).toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    {(queryResult.results?.totalPages ?? 0) > 1 && (
                      <div style={{ padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--color-border)', fontSize: '0.9rem' }}>
                        <span style={{ color: 'var(--color-text-muted)' }}>
                          Page {queryPage + 1} of {queryResult.results.totalPages}
                        </span>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem' }} disabled={queryPage === 0} onClick={() => handleQuery(queryResult.question, queryPage - 1)}>Previous</button>
                          <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem' }} disabled={queryPage >= (queryResult.results.totalPages - 1)} onClick={() => handleQuery(queryResult.question, queryPage + 1)}>Next</button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                    No coupons matched your query.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════ INSIGHTS TAB ══════════ */}
      {activeTab === 'insights' && (
        <div>
          {!insightsData && !insightsLoading && !insightsError && (
            <div className="glass-panel flex-center" style={{ padding: '4rem', flexDirection: 'column', gap: '1.5rem', textAlign: 'center' }}>
              <div style={{ padding: '1.5rem', background: 'rgba(206,166,32,0.1)', borderRadius: '50%' }}>
                <TrendingUp size={40} style={{ color: 'var(--color-accent-gold)' }} />
              </div>
              <div>
                <h2 style={{ marginBottom: '0.5rem' }}>AI Business Insights</h2>
                <p style={{ color: 'var(--color-text-muted)', maxWidth: '400px', margin: '0 auto 1.5rem' }}>
                  Generate a management-level narrative with live coupon statistics.
                </p>
              </div>
              <button className="btn btn-primary" style={{ gap: '0.5rem' }} onClick={handleFetchInsights}>
                <Sparkles size={16} /> Generate Insights
              </button>
            </div>
          )}

          {insightsLoading && (
            <div className="flex-center glass-panel" style={{ padding: '4rem', gap: '1rem', flexDirection: 'column' }}>
              <Loader size={32} style={{ color: 'var(--color-accent-gold)', animation: 'spin 1s linear infinite' }} />
              <span style={{ color: 'var(--color-text-secondary)' }}>Analysing coupon data with AI…</span>
            </div>
          )}

          {insightsError && !insightsLoading && (
            <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'flex-start', borderColor: 'rgba(208,76,87,0.3)' }}>
              <AlertCircle size={20} style={{ color: 'var(--color-accent-red)', flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 600, color: 'var(--color-accent-red)' }}>Failed to Generate Insights</div>
                <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>{insightsError}</div>
                <button className="btn btn-secondary" style={{ marginTop: '1rem', gap: '0.5rem' }} onClick={handleFetchInsights}>
                  <RefreshCw size={14} /> Retry
                </button>
              </div>
            </div>
          )}

          {insightsData && !insightsLoading && (
            <div>
              {/* Refresh button */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginBottom: '1rem' }}>
                <button className="btn btn-secondary" style={{ gap: '0.5rem' }} onClick={exportInsightsPDF}>
                  <FileText size={14} /> Export PDF
                </button>
                <button className="btn btn-secondary" style={{ gap: '0.5rem' }} onClick={handleFetchInsights}>
                  <RefreshCw size={14} /> Refresh Insights
                </button>
              </div>

              {/* Stats grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                {[
                  { label: 'Total Coupons', value: fmtNum(insightsData.stats.totalCoupons), color: 'var(--color-accent-gold)' },
                  { label: 'Active', value: fmtNum(insightsData.stats.activeCoupons), color: '#4ade80' },
                  { label: 'Used', value: fmtNum(insightsData.stats.usedCoupons), color: 'var(--color-accent-gold)' },
                  { label: 'Expired', value: fmtNum(insightsData.stats.expiredCoupons), color: 'var(--color-accent-red)' },
                  { label: 'This Week', value: fmtNum(insightsData.stats.issuedThisWeek), color: '#60a5fa' },
                  { label: 'Last Week', value: fmtNum(insightsData.stats.issuedLastWeek), color: '#a78bfa' },
                ].map(s => (
                  <div key={s.label} className="stat-card">
                    <div className="stat-label">{s.label}</div>
                    <div className="stat-value" style={{ color: s.color, fontSize: '1.6rem' }}>{s.value}</div>
                  </div>
                ))}
              </div>

              {/* AI Summary */}
              <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem', borderLeft: '3px solid var(--color-accent-gold)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                  <Sparkles size={18} style={{ color: 'var(--color-accent-gold)' }} />
                  <span style={{ fontWeight: 600, fontSize: '1rem' }}>AI Summary</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
                    Generated: {new Date(insightsData.generatedAt).toLocaleString()}
                  </span>
                </div>
                <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>
                  {insightsData.summary}
                </p>
              </div>

              {/* Fuel type breakdown */}
              {insightsData.stats.fuelTypeBreakdown?.length > 0 && (
                <div className="glass-panel" style={{ overflow: 'hidden', marginBottom: '1.5rem' }}>
                  <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--color-border)', fontWeight: 600 }}>
                    Fuel Type Breakdown
                  </div>
                  <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Fuel Type</th>
                          <th>Code</th>
                          <th>Total Issued</th>
                          <th>Active</th>
                          <th>Used</th>
                          <th>Expired</th>
                        </tr>
                      </thead>
                      <tbody>
                        {insightsData.stats.fuelTypeBreakdown.map(ft => (
                          <tr key={ft.typeCode}>
                            <td style={{ fontWeight: 500 }}>{ft.fuelTypeName}</td>
                            <td style={{ color: 'var(--color-text-muted)' }}>{ft.typeCode}</td>
                            <td style={{ color: 'var(--color-accent-gold)' }}>{fmtNum(ft.totalIssued)}</td>
                            <td><span className="badge badge-success">{fmtNum(ft.active)}</span></td>
                            <td><span className="badge badge-warning">{fmtNum(ft.used)}</span></td>
                            <td><span className="badge badge-danger">{fmtNum(ft.expired)}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Sequence capacities */}
              {insightsData.stats.sequenceCapacities?.length > 0 && (
                <div className="glass-panel" style={{ overflow: 'hidden' }}>
                  <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--color-border)', fontWeight: 600 }}>
                    Sequence Capacity
                  </div>
                  <div style={{ padding: '1.5rem', display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
                    {insightsData.stats.sequenceCapacities.map(sc => {
                      const pct = sc.capacityUsedPercent ?? 0;
                      const barColor = pct > 80 ? 'var(--color-accent-red)' : pct > 50 ? 'var(--color-accent-gold)' : '#4ade80';
                      return (
                        <div key={sc.fuelTypeName} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '1rem', border: '1px solid var(--color-border)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <span style={{ fontWeight: 500 }}>{sc.fuelTypeName}</span>
                            <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Letter: <strong style={{ color: 'white' }}>{sc.currentLetter}</strong></span>
                          </div>
                          <div style={{ height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                            <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: barColor, borderRadius: '4px', transition: 'width 0.6s ease' }} />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                            <span>{fmtNum(sc.issuedInCurrentLetter)} issued</span>
                            <span style={{ color: barColor }}>{fmtPct(pct)} used</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
};
