/**
 * US postal address, structured the way the client asked for it: street line, optional unit line,
 * city, two-letter state, 5-digit ZIP and the optional +4 add-on.
 *
 * Mongo has no join, so `states` stays a static list here rather than a collection, and the parts
 * live embedded on the customer. The flat `address` string every invoice prints is derived from
 * these via `formatAddress`, so nothing downstream has to know the shape changed.
 */
export interface AddressParts {
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

const STATE_CODES = new Set(US_STATES.map((s) => s.code));

export function isStateCode(code: string): boolean {
  return STATE_CODES.has(code.toUpperCase());
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
  const zip = [parts.zip, parts.zipPlus4].filter(Boolean).join('-');
  const cityState = [parts.city, [parts.state, zip].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  return [parts.line1, parts.line2, cityState].filter(Boolean).join(', ');
}
