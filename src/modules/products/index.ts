// Public API of the products module.

export {
  listProducts,
  listProductOptions,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  listProductRates,
  listCustomerRates,
  setProductRate,
  removeProductRate,
  OPTIONS_LIMIT,
  type ProductRateRow,
  type CustomerRateRow,
} from './services/product.service';
export {
  productCreateSchema,
  productUpdateSchema,
  productFormSchema,
  listProductSchema,
  setRateSchema,
  setCustomerRateSchema,
  deleteProductSchema,
  type ProductCreateInput,
  type ProductUpdateInput,
  type ProductFormInput,
  type ListProductInput,
  type SetRateInput,
  type SetCustomerRateInput,
} from './schemas';
export { Product, type ProductDoc } from './models/product.model';
export { ProductRate, type ProductRateDoc } from './models/productRate.model';
