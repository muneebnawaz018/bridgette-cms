// Public API of the products module.

export {
  listProducts,
  listProductOptions,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  listCustomerRates,
  setProductRate,
  removeProductRate,
  clearCustomerRates,
  OPTIONS_LIMIT,
  type CustomerRateRow,
} from './services/product.service';
export {
  listFabrics,
  listFabricOptions,
  getFabric,
  createFabric,
  updateFabric,
  deleteFabric,
  FABRIC_OPTIONS_LIMIT,
} from './services/fabric.service';
export {
  fabricCreateSchema,
  fabricUpdateSchema,
  fabricFormSchema,
  listFabricSchema,
  deleteFabricSchema,
  type FabricCreateInput,
  type FabricUpdateInput,
  type FabricFormInput,
  type ListFabricInput,
} from './schemas';
export { Fabric, type FabricDoc } from './models/fabric.model';
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
