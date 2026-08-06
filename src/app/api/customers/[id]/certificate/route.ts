import { NextResponse } from 'next/server';
import { handle } from '@/lib/api/respond';
import { requirePermission, Permission } from '@/modules/auth';
import { getCustomerCertificate } from '@/modules/customers';

type Ctx = { params: Promise<{ id: string }> };

/*
 * GET /api/customers/:id/certificate — download the reseller certificate.
 *
 * A route of its own rather than a field on the customer payload. The file is megabytes and the
 * customer record is read constantly — by the list, the picker, the invoice form — none of which
 * want the bytes. Keeping it here means the cost is paid only by the request that asked for it.
 *
 * The response is the raw file, not JSON: a base64 string would have to be decoded in the browser
 * and rebuilt into a blob before it could be saved, for no gain over letting the browser download
 * what it was already sent.
 */
export const GET = handle<Ctx>(async (_req, { params }) => {
  const actor = await requirePermission(Permission.CustomerView);
  const { id } = await params;
  const file = await getCustomerCertificate(actor, id);

  if (!file)
    return NextResponse.json({ ok: false, error: 'No certificate on file' }, { status: 404 });

  return new NextResponse(new Uint8Array(file.body), {
    headers: {
      'Content-Type': file.contentType,
      'Content-Length': String(file.body.byteLength),
      // `attachment` so a PDF saves rather than taking over the tab. Quotes and backslashes are
      // stripped from the name because either would end the header early.
      'Content-Disposition': `attachment; filename="${file.name.replace(/["\\]/g, '')}"`,
      // Behind a session, and only changes when someone uploads a new one.
      'Cache-Control': 'private, max-age=0, must-revalidate',
    },
  });
});
