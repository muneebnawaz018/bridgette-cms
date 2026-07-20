import { NextResponse } from 'next/server';
import { handle } from '@/lib/api/respond';
import { Permission } from '@/modules/auth';
import { requireLimited } from '@/lib/security/guard';
import { LIMITS } from '@/lib/security/rateLimit';
import { exportInvoices, exportInvoiceSchema, type ExportFormat } from '@/modules/invoicing';
import { toCsv } from '@/lib/export/csv';
import { buildXlsx, type XlsxValue } from '@/lib/export/xlsx';

const HEADERS = [
  'Number',
  'Type',
  'State',
  'Status',
  'Customer',
  'Email',
  'Currency',
  'Total',
  'Paid',
  'Balance',
  'Created',
] as const;

const MIME: Record<ExportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  json: 'application/json; charset=utf-8',
};

function statusOf(row: { isDeleted?: boolean; isArchived?: boolean }): string {
  if (row.isDeleted) return 'Deleted';
  if (row.isArchived) return 'Archived';
  return 'Active';
}

/** Filename-safe stamp; the client clock is irrelevant here so the server's date is used. */
function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

// GET /api/invoices/export — the current filter set as a downloadable file.
export const GET = handle(async (req) => {
  // The heaviest authenticated call in the app: it scans and serialises up to 5000
  // invoices per request, so it gets its own budget rather than the shared write limit.
  const actor = await requireLimited(Permission.InvoiceView, 'export', LIMITS.exportPerUser);
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const query = exportInvoiceSchema.parse(params);

  const { rows, total, truncated } = await exportInvoices(actor, query);

  const table: XlsxValue[][] = rows.map((r) => [
    r.number,
    r.type,
    r.state,
    statusOf(r),
    r.billTo?.name ?? '',
    r.billTo?.email ?? '',
    r.currency,
    Number(r.grandTotal ?? 0),
    Number(r.amountPaid ?? 0),
    Number(r.balanceDue ?? 0),
    r.createdAt ? new Date(r.createdAt).toISOString() : '',
  ]);

  const filename = `invoices-${query.view ?? 'active'}-${stamp()}.${query.format}`;
  let body: string | Buffer;

  if (query.format === 'csv') {
    body = toCsv([...HEADERS], table);
  } else if (query.format === 'xlsx') {
    body = buildXlsx({ sheetName: 'Invoices', headers: [...HEADERS], rows: table });
  } else {
    body = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        filters: { view: query.view ?? 'active', type: query.type, from: query.from, to: query.to },
        total,
        truncated,
        // Objects rather than positional arrays — JSON consumers want named fields.
        invoices: table.map((row) => Object.fromEntries(HEADERS.map((h, i) => [h, row[i]]))),
      },
      null,
      2,
    );
  }

  return new NextResponse(body as BodyInit, {
    headers: {
      'Content-Type': MIME[query.format],
      'Content-Disposition': `attachment; filename="${filename}"`,
      // The row count the file actually contains, so the UI can warn about a capped export.
      'X-Export-Count': String(rows.length),
      'X-Export-Total': String(total),
      'X-Export-Truncated': String(truncated),
      'Cache-Control': 'no-store',
    },
  });
});
