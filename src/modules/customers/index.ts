// Public API of the customers module.

export {
  listCustomers,
  listCustomerOptions,
  getCustomer,
  getCustomerCertificate,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from './services/customer.service';
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
export {
  issueIntakeLink,
  emailExistingIntakeLink,
  issueOpenInvite,
  openIntake,
  submitIntake,
  listIntakes,
  reviewIntake,
  INTAKE_FIELDS,
  INTAKE_TTL_DAYS,
  type IntakeField,
} from './services/customerIntake.service';
export {
  customerIntakeSubmitSchema,
  reviewIntakeSchema,
  MAX_CERT_BYTES,
  ALLOWED_CERT_TYPES,
  type CustomerIntakeSubmitInput,
  type ReviewIntakeInput,
} from './intake.schemas';
export { CustomerIntake, type CustomerIntakeDoc } from './models/customerIntake.model';
export {
  CustomerIntakeToken,
  type CustomerIntakeTokenDoc,
} from './models/customerIntakeToken.model';
