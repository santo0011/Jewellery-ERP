import { sendCreated, sendOk } from '../../utils/response.js';
import * as saleService from './sale.service.js';

const IDEMPOTENCY_KEY = /^[\w-]{8,64}$/;

export async function quote(req, res) {
  sendOk(res, await saleService.quote(req.valid.body));
}

export async function create(req, res) {
  const key = req.get('idempotency-key');
  const sale = await saleService.createSale(req.valid.body, key && IDEMPOTENCY_KEY.test(key) ? key : undefined);
  sendCreated(res, sale, { message: `Invoice ${sale.invoiceNo} created` });
}

export async function list(req, res) {
  const { items, meta } = await saleService.listSales(req.valid.query);
  sendOk(res, items, { meta });
}

export async function get(req, res) {
  sendOk(res, await saleService.getSale(req.valid.params.id));
}

export async function cancel(req, res) {
  sendOk(res, await saleService.cancelSale(req.valid.params.id, req.valid.body.reason), { message: 'Invoice cancelled' });
}

export async function returnItems(req, res) {
  const result = await saleService.returnItems(req.valid.params.id, req.valid.body);
  sendCreated(res, result, { message: `Credit note ${result.creditNoteNo} created` });
}
