import { sendCreated, sendOk } from '../../utils/response.js';
import * as inventoryService from './inventory.service.js';
import * as transferService from './transfer.service.js';

const list = (fn) => async (req, res) => {
  const { items, meta } = await fn(req.valid.query);
  sendOk(res, items, { meta });
};

export const summary = async (req, res) => sendOk(res, await inventoryService.stockSummary(req.valid.query));
export const movements = list(inventoryService.listMovements);

export const listOpening = list((q) => inventoryService.listStockEntries({ ...q, type: 'opening' }));
export const listAdjustments = list((q) => inventoryService.listStockEntries({ ...q, type: 'adjustment' }));
export const getEntry = async (req, res) => sendOk(res, await inventoryService.getStockEntry(req.valid.params.id));

export async function createOpening(req, res) {
  const entry = await inventoryService.createOpeningStock(req.valid.body);
  sendCreated(res, entry, { message: `${entry.docNo} posted` });
}

export async function createAdjustment(req, res) {
  const entry = await inventoryService.createAdjustment(req.valid.body);
  sendCreated(res, entry, { message: entry.status === 'posted' ? `${entry.docNo} posted` : `${entry.docNo} sent for approval` });
}

export const listTransfers = list(transferService.listTransfers);
export const getTransfer = async (req, res) => sendOk(res, await transferService.getTransfer(req.valid.params.id));

export async function createTransfer(req, res) {
  const transfer = await transferService.createTransfer(req.valid.body);
  sendCreated(res, transfer, { message: `${transfer.docNo} dispatched` });
}

export async function receiveTransfer(req, res) {
  sendOk(res, await transferService.receiveTransfer(req.valid.params.id), { message: 'Transfer received' });
}

export async function rejectTransfer(req, res) {
  sendOk(res, await transferService.rejectTransfer(req.valid.params.id, req.valid.body.reason), { message: 'Transfer rejected and items returned' });
}
