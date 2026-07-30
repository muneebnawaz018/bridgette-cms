/**
 * Postal address, structured the way the client asked for it: street line, optional unit line,
 * city, state/province code, 5-digit postal code and — for the US only — the +4 add-on.
 *
 * The same shape covers both countries the system bills; only the state list and the +4 differ.
 * Mongo has no join, so those lists stay static here rather than a collection, and the parts live
 * embedded on the customer. The flat `address` string every invoice prints is derived from these
 * via `formatAddress`, so nothing downstream has to know the shape changed.
 */
export interface AddressParts {
  /** 'US' (the default) or 'PK'. Absent on rows that predate the field = US. */
  country?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  zip?: string;
  zipPlus4?: string;
}

/** USPS two-letter codes, incl. DC and the territories that take domestic mail. */
export const US_STATES: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'DC', name: 'District of Columbia' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
  { code: 'PR', name: 'Puerto Rico' },
  { code: 'VI', name: 'U.S. Virgin Islands' },
  { code: 'GU', name: 'Guam' },
  { code: 'AS', name: 'American Samoa' },
  { code: 'MP', name: 'Northern Mariana Islands' },
];

/**
 * Pakistan's provinces and territories, in the same {code, name} shape as the US list so the
 * form's State picker just swaps its options. Postal codes there are 5 digits, like a US ZIP,
 * so the same validation carries over.
 */
export const PK_PROVINCES: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'PB', name: 'Punjab' },
  { code: 'SD', name: 'Sindh' },
  { code: 'KP', name: 'Khyber Pakhtunkhwa' },
  { code: 'BA', name: 'Balochistan' },
  { code: 'GB', name: 'Gilgit-Baltistan' },
  { code: 'AK', name: 'Azad Jammu & Kashmir' },
  { code: 'IS', name: 'Islamabad Capital Territory' },
];

/** The State/Province list for a country — 'PK' or anything else (US is the default). */
export function statesFor(country?: string): ReadonlyArray<{ code: string; name: string }> {
  return country === 'PK' ? PK_PROVINCES : US_STATES;
}

const STATE_CODES = new Set(US_STATES.map((s) => s.code));
const PK_CODES = new Set(PK_PROVINCES.map((p) => p.code));

export function isStateCode(code: string, country?: string): boolean {
  const set = country === 'PK' ? PK_CODES : STATE_CODES;
  return set.has(code.toUpperCase());
}

/** True when nothing was filled in — treated as "no structured address given". */
export function isBlankAddress(a?: AddressParts | null): boolean {
  if (!a) return true;
  return !(a.line1 || a.line2 || a.city || a.state || a.zip);
}

/**
 * "123 Main St, Apt 4, Austin, TX 78701-1234" — the one-line form invoices print. Each piece is
 * skipped when blank, so a half-filled address still reads correctly.
 */
export function formatAddress(a?: AddressParts | null): string {
  if (isBlankAddress(a)) return '';
  const parts = a as AddressParts;
  const isPk = parts.country === 'PK';
  // The +4 add-on is a US-only routing suffix, so it never appears on a Pakistani address.
  const zip = isPk ? parts.zip : [parts.zip, parts.zipPlus4].filter(Boolean).join('-');
  const cityState = [parts.city, [parts.state, zip].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  return [parts.line1, parts.line2, cityState, isPk ? 'Pakistan' : null].filter(Boolean).join(', ');
}
