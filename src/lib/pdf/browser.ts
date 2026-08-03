import 'server-only';
import type { Browser } from 'puppeteer-core';
import { logger } from '@/lib/logger/logger';

/**
 * Headless Chromium, for turning an invoice into a PDF.
 *
 * Two environments, one interface. On Vercel the function filesystem has no browser, so
 * @sparticuz/chromium unpacks a Lambda-sized build into /tmp. Locally that binary is the wrong
 * platform entirely, so we drive whatever Chrome the developer already has installed.
 *
 * Both packages are imported lazily. They are ~50MB together and every route that merely *links*
 * to a PDF would otherwise pay for them at build time.
 *
 * UPGRADING — the two are a matched pair and are pinned to exact versions for that reason.
 * puppeteer-core targets one specific Chrome build (see PUPPETEER_REVISIONS in its source) and
 * @sparticuz/chromium's major IS its Chromium version. Bump them together and keep the majors
 * equal, or the serverless path drives a browser its client was never tested against — a failure
 * that cannot reproduce locally, because locally we drive the developer's own Chrome instead.
 */

/** Where Chrome usually lives, per platform. Overridable with CHROME_PATH. */
const LOCAL_CHROME: Record<string, string[]> = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  linux: ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium'],
  win32: ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'],
};

/*
 * Dev only. Whatever Chrome the developer has installed keeps auto-updating, so over years it
 * drifts away from the Chrome puppeteer-core targets. If that ever starts misbehaving, install a
 * matched build (`npx puppeteer browsers install chrome`) and point CHROME_PATH at it — the
 * deployed path is unaffected either way, since it uses the pinned bundle.
 */
async function localExecutable(): Promise<string> {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const { existsSync } = await import('node:fs');
  const found = (LOCAL_CHROME[process.platform] ?? []).find((p) => existsSync(p));
  if (found) return found;
  throw new Error(
    'No local Chrome found for PDF rendering. Install Chrome or set CHROME_PATH to its binary.',
  );
}

/** True on Vercel (and anywhere else that sets AWS_LAMBDA_FUNCTION_NAME). */
function isServerless(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

/**
 * Launch a browser, run `fn`, and close it whatever happens. Callers never hold the handle: a
 * leaked Chromium pins hundreds of MB for the life of the container, and on a serverless host
 * that container is reused by later requests.
 */
export async function withBrowser<T>(fn: (browser: Browser) => Promise<T>): Promise<T> {
  const puppeteer = (await import('puppeteer-core')).default;

  const browser = isServerless()
    ? await (async () => {
        const chromium = (await import('@sparticuz/chromium')).default;
        return puppeteer.launch({
          args: chromium.args,
          executablePath: await chromium.executablePath(),
          headless: true,
        });
      })()
    : await puppeteer.launch({ executablePath: await localExecutable(), headless: true });

  try {
    return await fn(browser);
  } finally {
    await browser.close().catch((err) => {
      // Worth knowing about — a close that fails is how containers start leaking memory — but
      // never worth failing a PDF the caller already has in hand.
      logger.warn('pdf browser failed to close', { err: String(err) });
    });
  }
}
