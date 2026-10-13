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

// [1,2,3,7,9,10] → "#1–3, #7, #9–10" — keeps a long position/book list readable on the voucher.
const toRanges = (sorted: number[], prefix: string) => {
  const parts: string[] = [];
  let start = sorted[0], prev = sorted[0];
  for (const n of [...sorted.slice(1), NaN]) {
    if (n === prev + 1) { prev = n; continue; }
    parts.push(start === prev ? `${prefix}${start}` : `${prefix}${start}–${prev}`);
    start = prev = n;
  }
  return parts.join(', ');
};

export type VoucherKind = 'GRV' | 'GIV';

/**
 * Builds a Goods Received Voucher PDF for a TRANSRECEIPT approval request — the digital
 * equivalent of Petrotrade's paper GRV, filled in with what the confirm-receipt step recorded.
 * Fields the paper form has that we don't track digitally (Cost) are left blank, same as they
 * often are on the physical form pending manual completion.
 *
 * Returns a blob: object URL for previewing in the browser's native PDF viewer (which has its own
 * download/print controls) rather than forcing a download outright. Caller owns the URL and should
 * revoke it (URL.revokeObjectURL) once the preview tab is done with it, if it wants to be tidy.
 */
export const generateGrvPdf = (approval: ApprovalRequest) => generateVoucherPdf(approval, 'GRV');

/**
 * The Goods Issued Voucher for a TRANSFERSHIPMENT (or later) transfer — what Stocks hands over with
 * the coupons, signed by the issuing Stocks Clerk and the collecting Sales Clerk. Same layout as the GRV.
 */
export const generateGivPdf = (approval: ApprovalRequest) => generateVoucherPdf(approval, 'GIV');

/**
 * Opens a voucher in a new tab. The tab is opened synchronously, inside the click handler — opening it
 * after the await would no longer count as a user gesture to most browsers and get popup-blocked.
 * Throws if the browser blocked the tab or generation failed.
 */
export const previewVoucher = async (approval: ApprovalRequest, kind: VoucherKind): Promise<void> => {
  const previewWindow = window.open('', '_blank');
  try {
    const url = await generateVoucherPdf(approval, kind);
    if (!previewWindow) {
      throw new Error(`The ${kind} preview was blocked by the browser — allow pop-ups for this site and try again.`);
    }
    previewWindow.location.href = url;
  } catch (err) {
    previewWindow?.close();
    throw err;
  }
};

const generateVoucherPdf = async (approval: ApprovalRequest, kind: VoucherKind): Promise<string> => {
  const issued = kind === 'GIV';
  // On a requisition issue, requestedBy is the Stocks Clerk who built the transfer and
  // requisitionRequestedBy the Sales Clerk who raised the requisition.
  const issuer = approval.requestedBy || '';
  const requester = approval.requisitionRequestedBy ?? approval.requestedBy ?? '';
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

  // ── Title + voucher No. ──
  doc.setFontSize(13);
  doc.text(issued ? 'GOODS ISSUED VOUCHER' : 'GOODS RECEIVED VOUCHER', marginX, y);
  doc.setTextColor(180, 30, 30);
  doc.text(`${kind} No. ${approval.id}`, pageWidth - marginX, y, { align: 'right' });
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
  field(issued ? 'DATE ISSUED:' : 'DATE RECEIVED:', fmtDate(issued ? approval.decidedAt : approval.receivedAt), marginX);
  field('COST:', '', marginX + 95);
  y += 7;
  field('ISSUED BY (STOCK):', issuer, marginX);
  field('APPROVED BY:', approval.decidedBy || '', marginX + 95);
  y += 7;
  field(
    approval.requisitionId != null ? 'REQUISITION NO.:' : 'BATCH REF:',
    approval.requisitionId != null ? `#${approval.requisitionId}` : (approval.batchNumber || '—'),
    marginX
  );
  field('REQUESTED BY:', requester, marginX + 95);
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

  // A book is 100 coupons — show the book count alongside, since that's what's physically counted.
  const withBooks = (count: number) => count % 100 === 0 ? `${count} (${count / 100} book${count === 100 ? '' : 's'})` : String(count);

  let rows: string[][];
  if (approval.denominations.length > 0) {
    rows = [...approval.denominations]
      .sort((a, b) => a.denomination - b.denomination)
      .map(line => [`${line.denomination} L coupons`, withBooks(line.count), notesFor(line.denomination)]);
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
    head: [['Goods Quantity Ordered', issued ? 'Quantity Issued' : 'Quantity Received', 'Notes']],
    body: rows,
    theme: 'grid',
    styles: { fontSize: 9, textColor: [20, 20, 20], lineColor: [20, 20, 20], lineWidth: 0.2 },
    headStyles: { fillColor: [255, 255, 255], textColor: [20, 20, 20], fontStyle: 'bold' },
    margin: { left: marginX, right: marginX },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 8;

  // ── Batch positions + books issued from that batch (fixed at creation, so correct on any reprint) ──
  const sequences = approval.batchSequences ?? [];
  const books = approval.bookNumbers ?? [];
  const detail = (label: string, value: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(label, marginX, y);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(value, pageWidth - marginX * 2 - 38);
    doc.text(lines, marginX + 38, y);
    y += 5 * lines.length + 1;
  };
  if (approval.batchNumber) detail('BATCH:', approval.batchNumber);
  if (sequences.length > 0) detail('BATCH POSITIONS:', toRanges(sequences, '#'));
  if (books.length > 0) detail('BOOKS ISSUED:', `${toRanges(books, 'Book ')} (${books.length} book${books.length === 1 ? '' : 's'})`);
  y += 4;

  if (approval.reason) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.text(`Reason: ${approval.reason}`, marginX, y);
    y += 8;
  }

  // ── Signatures ── (a blank name/date is left to be completed by hand on the printed copy)
  const signature = (title: string, name: string | null, date: string | null, role: string) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(title, marginX, y);
    y += 8;
    doc.line(marginX, y, marginX + 70, y);
    doc.text('DATE', marginX + 80, y - 1);
    doc.line(marginX + 92, y, marginX + 130, y);
    doc.setFontSize(8);
    doc.setTextColor(90, 90, 90);
    doc.text(name || '', marginX, y - 1.5);
    if (date) doc.text(fmtDate(date), marginX + 92, y - 1.5);
    doc.setFontSize(9);
    doc.text(role, marginX + 35, y + 5, { align: 'center' });
    doc.setTextColor(20, 20, 20);
    y += 16;
  };

  // Both vouchers carry both parties: the Stocks Clerk who issued, and the requester who collects/receives.
  signature('ISSUED BY', issuer, approval.decidedAt, 'STOCKS CLERK');
  if (issued) {
    // Collected at the moment of issue, so it shares the issue date.
    signature('COLLECTED BY', requester, approval.decidedAt, 'SALES CLERK (REQUESTER)');
  } else {
    signature('GOODS RECEIVED BY', approval.receivedBy || requester, approval.receivedAt, 'SALES CLERK (REQUESTER)');
  }

  return URL.createObjectURL(doc.output('blob'));
};
