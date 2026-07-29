// Public API of the customers module.

export {
  listCustomers,
  listCustomerOptions,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from './services/customer.service';
export { CustomerType, CUSTOMER_TYPE_LABEL } from './enums';
export {
  US_STATES,
  formatAddress,
  isBlankAddress,
  isStateCode,
  type AddressParts,
} from './address';
export {
  customerCreateSchema,
  customerCreateSchemaChecked,
  addressPartsSchema,
  customerUpdateSchema,
  customerFormSchema,
  listCustomerSchema,
  deleteCustomerSchema,
  type CustomerCreateInput,
  type CustomerUpdateInput,
  type CustomerFormInput,
  type ListCustomerInput,
} from './schemas';
export { Customer, type CustomerDoc } from './models/customer.model';
