/**
 * What kind of account a customer is. Tax exemption is NOT read from this — the `reseller` flag
 * still owns that — but picking Reseller sets the flag, so the two never disagree.
 */
export enum CustomerType {
  Retail = 'retail',
  Wholesale = 'wholesale',
  Reseller = 'reseller',
  Distributor = 'distributor',
}

export const CUSTOMER_TYPE_LABEL: Record<CustomerType, string> = {
  [CustomerType.Retail]: 'Retail',
  [CustomerType.Wholesale]: 'Wholesale',
  [CustomerType.Reseller]: 'Reseller',
  [CustomerType.Distributor]: 'Distributor',
};
