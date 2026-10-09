import { sendCreated, sendOk } from '../../utils/response.js';
import { customerActivity } from './customerActivity.service.js';
import * as customerService from './customer.service.js';

export async function list(req, res) {
  const { items, meta } = await customerService.listCustomers(req.valid.query);
  sendOk(res, items, { meta });
}

export async function get(req, res) {
  sendOk(res, await customerService.getCustomer(req.valid.params.id));
}

export const activity = async (req, res) => sendOk(res, await customerActivity(req.valid.params.id));

export async function create(req, res) {
  sendCreated(res, await customerService.createCustomer(req.valid.body), { message: 'Customer created' });
}

export async function update(req, res) {
  sendOk(res, await customerService.updateCustomer(req.valid.params.id, req.valid.body), { message: 'Customer updated' });
}

export async function setStatus(req, res) {
  sendOk(res, await customerService.setCustomerStatus(req.valid.params.id, req.valid.body.status), { message: 'Status updated' });
}

export async function remove(req, res) {
  await customerService.deleteCustomer(req.valid.params.id);
  sendOk(res, null, { message: 'Customer deleted' });
}
