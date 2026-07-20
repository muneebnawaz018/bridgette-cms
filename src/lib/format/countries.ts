/**
 * Dial codes for the phone field, as compact tuples — [iso2, name, dialCode, groups?].
 *
 * Numbers are persisted in E.164 (`+<dial><national>`), which every SMS/telephony provider
 * expects. The country is recovered on edit by longest-prefix match rather than stored
 * separately, so there is one source of truth.
 *
 * `groups` is display spacing only: Pakistan `[3, 7]` renders `302 7577308`. It is set
 * explicitly for the countries in regular use here; the rest fall back to `defaultGroups`.
 */
type CountryTuple = readonly [iso2: string, name: string, dial: string, groups?: readonly number[]];

const RAW: readonly CountryTuple[] = [
  ['PK', 'Pakistan', '92', [3, 7]],
  ['AE', 'United Arab Emirates', '971', [2, 3, 4]],
  ['SA', 'Saudi Arabia', '966', [2, 3, 4]],
  ['US', 'United States', '1', [3, 3, 4]],
  ['GB', 'United Kingdom', '44', [4, 6]],
  ['CA', 'Canada', '1', [3, 3, 4]],
  ['AU', 'Australia', '61', [3, 3, 3]],
  ['IN', 'India', '91', [5, 5]],
  ['BD', 'Bangladesh', '880', [4, 6]],
  ['CN', 'China', '86', [3, 4, 4]],
  ['DE', 'Germany', '49'],
  ['FR', 'France', '33'],
  ['IT', 'Italy', '39'],
  ['ES', 'Spain', '34'],
  ['NL', 'Netherlands', '31'],
  ['BE', 'Belgium', '32'],
  ['CH', 'Switzerland', '41'],
  ['AT', 'Austria', '43'],
  ['SE', 'Sweden', '46'],
  ['NO', 'Norway', '47'],
  ['DK', 'Denmark', '45'],
  ['FI', 'Finland', '358'],
  ['IE', 'Ireland', '353'],
  ['PT', 'Portugal', '351'],
  ['PL', 'Poland', '48'],
  ['CZ', 'Czechia', '420'],
  ['GR', 'Greece', '30'],
  ['RO', 'Romania', '40'],
  ['HU', 'Hungary', '36'],
  ['TR', 'Turkey', '90', [3, 3, 4]],
  ['RU', 'Russia', '7'],
  ['UA', 'Ukraine', '380'],
  ['QA', 'Qatar', '974', [4, 4]],
  ['KW', 'Kuwait', '965', [4, 4]],
  ['BH', 'Bahrain', '973', [4, 4]],
  ['OM', 'Oman', '968', [4, 4]],
  ['JO', 'Jordan', '962'],
  ['LB', 'Lebanon', '961'],
  ['IQ', 'Iraq', '964'],
  ['IR', 'Iran', '98'],
  ['AF', 'Afghanistan', '93'],
  ['EG', 'Egypt', '20', [3, 3, 4]],
  ['MA', 'Morocco', '212'],
  ['DZ', 'Algeria', '213'],
  ['TN', 'Tunisia', '216'],
  ['LY', 'Libya', '218'],
  ['SD', 'Sudan', '249'],
  ['NG', 'Nigeria', '234'],
  ['GH', 'Ghana', '233'],
  ['KE', 'Kenya', '254'],
  ['TZ', 'Tanzania', '255'],
  ['UG', 'Uganda', '256'],
  ['ET', 'Ethiopia', '251'],
  ['ZA', 'South Africa', '27'],
  ['JP', 'Japan', '81', [2, 4, 4]],
  ['KR', 'South Korea', '82'],
  ['SG', 'Singapore', '65', [4, 4]],
  ['MY', 'Malaysia', '60', [2, 3, 4]],
  ['ID', 'Indonesia', '62'],
  ['TH', 'Thailand', '66'],
  ['VN', 'Vietnam', '84'],
  ['PH', 'Philippines', '63'],
  ['HK', 'Hong Kong', '852'],
  ['TW', 'Taiwan', '886'],
  ['NZ', 'New Zealand', '64', [2, 3, 4]],
  ['LK', 'Sri Lanka', '94'],
  ['NP', 'Nepal', '977'],
  ['MV', 'Maldives', '960'],
  ['UZ', 'Uzbekistan', '998'],
  ['KZ', 'Kazakhstan', '77'],
  ['AZ', 'Azerbaijan', '994'],
  ['BR', 'Brazil', '55'],
  ['AR', 'Argentina', '54'],
  ['CL', 'Chile', '56'],
  ['CO', 'Colombia', '57'],
  ['MX', 'Mexico', '52'],
  ['PE', 'Peru', '51'],
  ['IL', 'Israel', '972'],
  ['CY', 'Cyprus', '357'],
  ['MT', 'Malta', '356'],
] as const;

export interface Country {
  iso2: string;
  name: string;
  dial: string;
  /** Emoji flag, derived from the ISO code — no image assets required. */
  flag: string;
  /** Digit grouping for display, or undefined to use `defaultGroups`. */
  groups?: readonly number[];
}

/** `PK` -> 🇵🇰 by mapping each letter to its regional-indicator code point. */
function flagOf(iso2: string): string {
  return String.fromCodePoint(...[...iso2.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

export const COUNTRIES: readonly Country[] = RAW.map(([iso2, name, dial, groups]) => ({
  iso2,
  name,
  dial,
  flag: flagOf(iso2),
  groups,
}));

/**
 * Grouping for countries without an explicit pattern: leading blocks of 3 with the remainder
 * last, so 10 digits read `302 757 7308` rather than one long run. Not every national
 * convention in the world, but consistently readable.
 */
function defaultGroups(length: number): number[] {
  // Hand-picked shapes for the lengths real numbers actually take — plain chunking leaves an
  // orphan group ("151 123 456 78") which reads worse than a slightly uneven split.
  const SHAPES: Record<number, number[]> = {
    5: [5],
    6: [3, 3],
    7: [3, 4],
    8: [4, 4],
    9: [3, 3, 3],
    10: [3, 3, 4],
    11: [3, 4, 4],
    12: [4, 4, 4],
  };
  if (length <= 4) return [length];
  if (SHAPES[length]) return SHAPES[length];

  const out: number[] = [];
  let left = length;
  while (left > 4) {
    out.push(3);
    left -= 3;
  }
  if (left > 0) out.push(left);
  return out;
}

/** Space out a national number for display: `3027577308` -> `302 7577308` (PK). */
export function formatNational(iso2: string, national: string): string {
  const digits = (national ?? '').replace(/\D/g, '');
  if (!digits) return '';

  const pattern = countryByIso2(iso2)?.groups ?? defaultGroups(digits.length);
  const parts: string[] = [];
  let index = 0;
  for (const size of pattern) {
    if (index >= digits.length) break;
    parts.push(digits.slice(index, index + size));
    index += size;
  }
  // Anything past the pattern (a longer-than-expected number) is appended rather than dropped.
  if (index < digits.length) parts.push(digits.slice(index));
  return parts.join(' ');
}

/** Business is Pakistan-based (PKR invoices), so that is the sensible starting country. */
export const DEFAULT_COUNTRY_ISO2 = 'PK';

export function countryByIso2(iso2: string): Country | undefined {
  return COUNTRIES.find((c) => c.iso2 === iso2);
}

/**
 * Split a stored E.164 number back into country + national part.
 *
 * Longest dial code wins: `+1` (US) and `+7` (Russia) are prefixes of other codes, so a naive
 * first-match would mis-assign them. Falls back to the default country when nothing matches.
 */
export function splitPhone(e164: string | null | undefined): { iso2: string; national: string } {
  const value = (e164 ?? '').trim();
  if (!value.startsWith('+')) {
    // Legacy/local format such as "0300-1234567": drop the trunk zero so it round-trips into
    // a valid E.164 number under the default country.
    return { iso2: DEFAULT_COUNTRY_ISO2, national: value.replace(/\D/g, '').replace(/^0+/, '') };
  }
  const digits = value.slice(1).replace(/\D/g, '');
  const match = [...COUNTRIES]
    .filter((c) => digits.startsWith(c.dial))
    .sort((a, b) => b.dial.length - a.dial.length)[0];

  if (!match) return { iso2: DEFAULT_COUNTRY_ISO2, national: digits };
  return { iso2: match.iso2, national: digits.slice(match.dial.length) };
}

/** Build the stored E.164 value from the picker's two halves. */
export function joinPhone(iso2: string, national: string): string {
  const dial = countryByIso2(iso2)?.dial ?? '';
  const digits = (national ?? '').replace(/\D/g, '');
  if (!digits) return '';
  return `+${dial}${digits}`;
}

/** Pretty form for display: `+92 302 7577308`. */
export function formatPhone(e164: string | null | undefined): string {
  const value = (e164 ?? '').trim();
  if (!value) return '';
  const { iso2, national } = splitPhone(value);
  const dial = countryByIso2(iso2)?.dial;
  return dial ? `+${dial} ${formatNational(iso2, national)}` : value;
}
