# Branding

Reference site: <https://bridgetteenterprises.com/>. The live site is behind a
captcha / bot-verification wall (brute-force protection) and cannot be scraped, so the
brand identity below was extracted from the embedded logo in the shared **Invoice
Template PDF** — the same identity the site uses. Confirm against a brand kit if one exists.

## Logo

- Extracted (transparent PNG, 1978×1145): [`public/brand/logo.png`](../public/brand/logo.png)
- Mark: red "E" + black "3/B" arrow forming an `E3` monogram; `BRIDGETTE` wordmark in red below.
- **Still nice to have from client:** original **SVG** for infinite scaling (current asset is high-res raster).

## Color scheme (exact — sampled from the logo)

| Role | Hex | RGB | Use |
| --- | --- | --- | --- |
| Brand red (primary) | `#EC222A` | 236, 34, 42 | logo, header/footer bars, table headers, primary buttons, accents |
| Brand black | `#050707` | 5, 7, 7 | logo dark mark, body text |
| White | `#FFFFFF` | 255, 255, 255 | backgrounds, invoice body |
| Muted gray (approx) | `#EDEDED` | 237, 237, 237 | borders, subtle fills |

## CSS tokens (drop into global styles)

```css
:root {
  --brand-red: #ec222a;
  --brand-black: #050707;
  --brand-white: #ffffff;
  --brand-muted: #ededed;
}
```

## Typography

- Logo/invoice use a clean geometric sans-serif (bold headings, regular body).
- Web default: **Inter** (or system sans) until the site's exact font is confirmed.

## Contact block (from invoice template)

- Bridgette Enterprises LLC
- 5775 Riverside DR, Chino, CA 91710-6710
- 1 (909) 516-8570
- <Info@bridgetteenterprises.com>

## Policy links (from invoice template footer)

- FAQ: <https://bridgetteenterprises.com/faqs/>
- Shipping: <https://bridgetteenterprises.com/shipping/>
- Payments: <https://bridgetteenterprises.com/payments/>
- Returns: <https://bridgetteenterprises.com/returns/>

## Could NOT extract (captcha wall — provide manually)

The live site sits behind an active JS bot-challenge, so these are unavailable via
automated fetch. Paste them (or a saved HTML / screenshot) if the app needs them:

- [ ] About / company description text
- [ ] Services / products list
- [ ] Navigation menu + footer structure
- [ ] Social media links
- [ ] Exact web font

## To confirm with client

- [ ] Original logo as **SVG** (have high-res PNG).
- [ ] Exact site font family.
- [ ] Favicon / app icon.
