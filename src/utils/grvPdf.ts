import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logoUrl from '../assets/logo.jpg';
import type { ApprovalRequest } from '../services/approvals';

// jsPDF needs actual image data, not just a URL — fetch the bundled asset and convert it.
const loadImageAsDataUrl = (url: string): Promise<string> =>
  fetch(url)
    .then(res => res.blob())
    .then(blob => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read logo image'));
      reader.readAsDataURL(blob);
    }));

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : '—');

/**
 * Builds a Goods Received Voucher PDF for a TRANSRECEIPT approval request — the digital
 * equivalent of Petrotrade's paper GRV, filled in with what the confirm-receipt step recorded.
 * Fields the paper form has that we don't track digitally (Cost, a named issuer) are left blank,
 * same as they often are on the physical form pending manual completion.
 *
 * Returns a blob: object URL for previewing in the browser's native PDF viewer (which has its own
 * download/print controls) rather than forcing a download outright. Caller owns the URL and should
 * revoke it (URL.revokeObjectURL) once the preview tab is done with it, if it wants to be tidy.
 */
export const generateGrvPdf = async (approval: ApprovalRequest): Promise<string> => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 16;
  let y = 16;

  // ── Letterhead ──
  try {
    const logo = await loadImageAsDataUrl(logoUrl);
    doc.addImage(logo, 'JPEG', marginX, y, 18, 18);
  } catch {
    // Non-fatal — proceed without the logo rather than block the whole document
  }
  doc.setTextColor(20, 20, 20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('PETROTRADE', marginX + 22, y + 9);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text('Petrotrade (Private) Limited, 1st Floor, Noczim House', marginX + 22, y + 15);
  doc.text('100 Leopold Takawira Street, P.O. Box CY 223 Causeway, Harare, Zimbabwe', marginX + 22, y + 19.5);

  y += 26;
  doc.setDrawColor(150, 150, 150);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 7;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(20, 20, 20);
  doc.text('FOR INTERNAL USE', pageWidth / 2, y, { align: 'center' });
  y += 9;

  // ── Title + GRV No. ──
  doc.setFontSize(13);
  doc.text('GOODS RECEIVED VOUCHER', marginX, y);
  doc.setTextColor(180, 30, 30);
  doc.text(`GRV No. ${approval.id}`, pageWidth - marginX, y, { align: 'right' });
  doc.setTextColor(20, 20, 20);
  y += 10;

  // ── Header fields ──
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const field = (label: string, value: string, x: number) => {
    doc.setFont('helvetica', 'bold');
    doc.text(label, x, y);
    doc.setFont('helvetica', 'normal');
    doc.text(value, x + doc.getTextWidth(label) + 2, y);
  };
  field('DATE RECEIVED:', fmtDate(approval.receivedAt), marginX);
  field('COST:', '', marginX + 95);
  y += 7;
  field('ISSUED BY (STOCK):', '', marginX);
  y += 7;
  field(
    approval.requisitionId != null ? 'REQUISITION NO.:' : 'BATCH REF:',
    approval.requisitionId != null ? `#${approval.requisitionId}` : (approval.batchNumber || '—'),
    marginX
  );
  y += 10;

  // ── Goods table ──
  // approval.denominations is resolved once at request creation and stays correct at every stage —
  // trust it for the quantity breakdown. Same for rangeStart/rangeEnd when a position-range selection
  // was used: set at creation, stable throughout. transferredCoupons, by contrast, is only ever
  // present on the one response of the call that actually moved coupons (empty again on a later GET,
  // e.g. re-opening this request to print the GRV) — it's a last-resort source for the position range.
  const seqsByDenomination = new Map<number, number[]>();
  for (const c of approval.transferredCoupons) {
    if (c.batchSequence == null) continue;
    const seqs = seqsByDenomination.get(c.denomination) ?? [];
    seqs.push(c.batchSequence);
    seqsByDenomination.set(c.denomination, seqs);
  }

  const notesFor = (denomination: number) => {
    const parts: string[] = [];
    if (approval.batchNumber) parts.push(approval.batchNumber);
    if (approval.rangeStart != null && approval.rangeEnd != null) {
      parts.push(`batch pos #${approval.rangeStart}–${approval.rangeEnd}`);
    } else {
      const seqs = seqsByDenomination.get(denomination);
      if (seqs && seqs.length > 0) {
        const min = Math.min(...seqs), max = Math.max(...seqs);
        parts.push(min === max ? `batch pos #${min}` : `batch pos #${min}–${max}`);
      }
    }
    return parts.join(' · ') || '—';
  };

  let rows: string[][];
  if (approval.denominations.length > 0) {
    rows = [...approval.denominations]
      .sort((a, b) => a.denomination - b.denomination)
      .map(line => [`${line.denomination} L coupons`, String(line.count), notesFor(line.denomination)]);
  } else if (approval.transferredCoupons.length > 0) {
    const counts = new Map<number, number>();
    for (const c of approval.transferredCoupons) counts.set(c.denomination, (counts.get(c.denomination) ?? 0) + 1);
    rows = [...counts.entries()]
      .sort(([a], [b]) => a - b)
      .map(([denomination, count]) => [`${denomination} L coupons`, String(count), notesFor(denomination)]);
  } else {
    rows = [[
      approval.batchNumber || 'Coupons',
      String(approval.count),
      'Per-denomination breakdown unavailable on this receipt'
    ]];
  }

  autoTable(doc, {
    startY: y,
    head: [['Goods Quantity Ordered', 'Quantity Received', 'Notes']],
    body: rows,
    theme: 'grid',
    styles: { fontSize: 9, textColor: [20, 20, 20], lineColor: [20, 20, 20], lineWidth: 0.2 },
    headStyles: { fillColor: [255, 255, 255], textColor: [20, 20, 20], fontStyle: 'bold' },
    margin: { left: marginX, right: marginX },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 10;

  if (approval.reason) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.text(`Reason: ${approval.reason}`, marginX, y);
    y += 8;
  }

  // ── Signatures ──
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('GOODS RECEIVED BY', marginX, y);
  y += 8;
  doc.line(marginX, y, marginX + 70, y);
  doc.text('DATE', marginX + 80, y - 1);
  doc.line(marginX + 92, y, marginX + 130, y);
  doc.setFontSize(8);
  doc.setTextColor(90, 90, 90);
  doc.text(approval.receivedBy || '', marginX, y - 1.5);
  doc.text(fmtDate(approval.receivedAt), marginX + 92, y - 1.5);
  doc.setFontSize(9);
  doc.text('ADMIN OFFICIAL', marginX + 20, y + 5);
  doc.setTextColor(20, 20, 20);

  y += 16;
  doc.setFontSize(10);
  doc.text('WITNESSED BY', marginX, y);
  y += 8;
  doc.line(marginX, y, marginX + 70, y);
  doc.text('DATE', marginX + 80, y - 1);
  doc.line(marginX + 92, y, marginX + 130, y);
  doc.setFontSize(8);
  doc.setTextColor(90, 90, 90);
  doc.text(approval.requestedBy || '', marginX, y - 1.5);
  doc.text(fmtDate(approval.requestedAt), marginX + 92, y - 1.5);
  doc.setFontSize(9);
  doc.text('ORDER ORIGINATOR', marginX + 15, y + 5);
  doc.setTextColor(20, 20, 20);

  return URL.createObjectURL(doc.output('blob'));
};
