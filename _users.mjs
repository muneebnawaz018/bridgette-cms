import { chromium } from 'playwright';
import fs from 'node:fs';
const BASE = 'http://localhost:3998';
const env = Object.fromEntries(
  fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('='))
    .map(l=>[l.slice(0,l.indexOf('=')).trim(), l.slice(l.indexOf('=')+1).trim()]));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
const page = await ctx.newPage();
page.setDefaultTimeout(90000); page.setDefaultNavigationTimeout(90000);
await page.goto(`${BASE}/login`);
await page.fill('input[type="email"]', env.SUPER_ADMIN_EMAIL);
await page.fill('input[type="password"]', env.SUPER_ADMIN_PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL('**/dashboard');

// Create modal — desktop
await page.goto(`${BASE}/users`);
await page.waitForSelector('text=Team members');
await page.click('button:has-text("New user")');
await page.waitForTimeout(700);
const overflow = await page.evaluate(() => {
  const p = document.querySelector('.MuiDialog-paper');
  const de = document.documentElement;
  return { paperFits: p ? p.getBoundingClientRect().right <= innerWidth+1 : false,
           pageOverflow: de.scrollWidth > de.clientWidth };
});
console.log('desktop create modal:', JSON.stringify(overflow));
await page.screenshot({ path: `${process.env.SHOTS}/users-create-desktop.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// Create modal — mobile 375
await page.setViewportSize({ width: 375, height: 820 });
await page.goto(`${BASE}/users`);
await page.waitForSelector('text=Team members');
await page.click('button:has-text("New user")');
await page.waitForTimeout(700);
const m = await page.evaluate(() => {
  const p = document.querySelector('.MuiDialog-paper');
  const c = document.querySelector('.MuiDialogContent-root');
  return { paperFits: p ? p.getBoundingClientRect().right <= innerWidth+1 && p.getBoundingClientRect().left >= -1 : false,
           contentScrollsX: c ? c.scrollWidth > c.clientWidth+1 : false };
});
console.log('mobile create modal:', JSON.stringify(m));
await page.screenshot({ path: `${process.env.SHOTS}/users-create-mobile.png` });
await browser.close();
