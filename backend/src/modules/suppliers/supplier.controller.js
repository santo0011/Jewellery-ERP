import { sendCreated, sendOk } from '../../utils/response.js';
import * as supplierService from './supplier.service.js';

export async function list(req, res) {
  const { items, meta } = await supplierService.listSuppliers(req.valid.query);
  sendOk(res, items, { meta });
}

export async function get(req, res) {
  sendOk(res, await supplierService.getSupplier(req.valid.params.id));
}

export async function create(req, res) {
  sendCreated(res, await supplierService.createSupplier(req.valid.body), { message: 'Supplier created' });
}

export async function update(req, res) {
  sendOk(res, await supplierService.updateSupplier(req.valid.params.id, req.valid.body), { message: 'Supplier updated' });
}

export async function setStatus(req, res) {
  sendOk(res, await supplierService.setSupplierStatus(req.valid.params.id, req.valid.body.status), { message: 'Status updated' });
}

export async function remove(req, res) {
  await supplierService.deleteSupplier(req.valid.params.id);
  sendOk(res, null, { message: 'Supplier deleted' });
}
