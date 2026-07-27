'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useApi } from '@/lib/api/useApi';
import { colors } from '@/lib/colors';
import { InvoiceDocument, type InvoiceDocumentData } from '@/components/invoices/InvoiceDocument';

/*
 * Standalone printable invoice — deliberately outside the (dashboard) layout so it carries no
 * sidebar/header chrome. Fetches the invoice (useApi handles the 401 → login bounce), renders
 * the template document, and offers Print → Save as PDF. A thin toolbar sits on top and is
 * hidden by the document's own @media print rules plus `.no-print` here.
 */
export default function PrintInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useApi<InvoiceDocumentData>(`/api/invoices/${id}`);
  const printed = useRef(false);
  const [autoPrint, setAutoPrint] = useState(true);

  // Print once, after the document (and its logo) have had a moment to lay out.
  useEffect(() => {
    if (!data || printed.current || !autoPrint) return;
    printed.current = true;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [data, autoPrint]);

  return (
    <div style={{ background: colors.invoiceDoc.viewerBg, minHeight: '100dvh', padding: '24px 0' }}>
      <style>{`
        @media print { .no-print { display: none !important; } body { background: ${colors.invoiceDoc.paper}; } }
      `}</style>

      <div
        className="no-print"
        style={{
          maxWidth: 820,
          margin: '0 auto 16px',
          display: 'flex',
          gap: 8,
          justifyContent: 'flex-end',
        }}
      >
        <button
          onClick={() => {
            setAutoPrint(false);
            window.print();
          }}
          style={btn(true)}
        >
          Print / Save as PDF
        </button>
        <button onClick={() => window.close()} style={btn(false)}>
          Close
        </button>
      </div>

      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        {isLoading && <Note>Loading invoice…</Note>}
        {error && <Note>Could not load this invoice.</Note>}
        {data && <InvoiceDocument invoice={data} />}
      </div>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: colors.invoiceDoc.paper,
        padding: 40,
        textAlign: 'center',
        color: colors.invoiceDoc.muted,
      }}
    >
      {children}
    </div>
  );
}

function btn(primary: boolean): React.CSSProperties {
  return {
    padding: '8px 16px',
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 14,
    background: primary ? colors.invoiceDoc.red : colors.invoiceDoc.fieldBorder,
    color: primary ? colors.invoiceDoc.paper : colors.invoiceDoc.bodyText,
  };
}
