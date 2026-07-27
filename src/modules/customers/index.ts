// Public API of the customers module.

export {
  listCustomers,
  listCustomerOptions,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from './services/customer.service';
export {
  customerCreateSchema,
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
