import { sendCreated, sendOk } from '../../utils/response.js';
import * as rateService from './rate.service.js';

export async function current(req, res) {
  sendOk(res, await rateService.currentRates());
}

export async function history(req, res) {
  const { items, meta } = await rateService.rateHistory(req.valid.query);
  sendOk(res, items, { meta });
}

export async function create(req, res) {
  sendCreated(res, await rateService.setRates(req.valid.body), { message: 'Rates updated' });
}
