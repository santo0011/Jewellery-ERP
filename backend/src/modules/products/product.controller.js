import { sendCreated, sendOk } from '../../utils/response.js';
import * as productService from './product.service.js';

export async function list(req, res) {
  const { items, meta } = await productService.listProducts(req.valid.query);
  sendOk(res, items, { meta });
}

export async function lookup(req, res) {
  sendOk(res, await productService.lookupProduct(req.valid.params.code));
}

export async function get(req, res) {
  sendOk(res, await productService.getProduct(req.valid.params.id));
}

export async function create(req, res) {
  sendCreated(res, await productService.createProduct(req.valid.body), { message: 'Product created' });
}

export async function setHuid(req, res) {
  sendOk(res, await productService.setProductHuid(req.valid.params.id, req.valid.body.huid), { message: 'HUID saved' });
}

export async function update(req, res) {
  sendOk(res, await productService.updateProduct(req.valid.params.id, req.valid.body), { message: 'Product updated' });
}

export async function remove(req, res) {
  await productService.deleteProduct(req.valid.params.id);
  sendOk(res, null, { message: 'Product deleted' });
}

export async function addImage(req, res) {
  sendOk(res, await productService.addProductImage(req.valid.params.id, req.file), { message: 'Image added' });
}

export async function removeImage(req, res) {
  sendOk(res, await productService.removeProductImage(req.valid.params.id, req.valid.params.fileId), { message: 'Image removed' });
}

export async function setPrimaryImage(req, res) {
  sendOk(res, await productService.setPrimaryImage(req.valid.params.id, req.valid.params.fileId), { message: 'Primary image updated' });
}
