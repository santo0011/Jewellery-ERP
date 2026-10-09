import { sendCreated, sendOk } from '../../utils/response.js';
import * as orderService from './order.service.js';

export async function list(req, res) {
  const { items, meta } = await orderService.listOrders(req.valid.query);
  sendOk(res, items, { meta });
}

export const get = async (req, res) => sendOk(res, await orderService.getOrder(req.valid.params.id));

export async function create(req, res) {
  const order = await orderService.createOrder(req.valid.body);
  sendCreated(res, order, { message: `Order ${order.orderNo} booked` });
}

export const estimate = async (req, res) => sendOk(res, await orderService.estimateOrder(req.valid.body));

export async function addImage(req, res) {
  sendOk(res, await orderService.addOrderImage(req.valid.params.id, req.file), { message: 'Photo added' });
}

export async function removeImage(req, res) {
  sendOk(res, await orderService.removeOrderImage(req.valid.params.id, req.valid.params.fileId), { message: 'Photo removed' });
}

export async function addAdvance(req, res) {
  sendCreated(res, await orderService.addAdvance(req.valid.params.id, req.valid.body), { message: 'Advance received' });
}

export async function finishItem(req, res) {
  const order = await orderService.finishOrderItem(req.valid.params.id, req.valid.params.index, req.valid.body);
  sendOk(res, order, { message: 'Finished piece tagged and added to stock' });
}

export async function setStatus(req, res) {
  sendOk(res, await orderService.setOrderStatus(req.valid.params.id, req.valid.body), { message: 'Order updated' });
}

export async function cancel(req, res) {
  sendOk(res, await orderService.cancelOrder(req.valid.params.id, req.valid.body), { message: 'Order cancelled' });
}
