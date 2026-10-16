import { sendOk } from '../../utils/response.js';
import * as settingsService from './settings.service.js';

export async function getAll(req, res) {
  sendOk(res, await settingsService.getSettings());
}

export async function getBranchPrint(req, res) {
  sendOk(res, await settingsService.getBranchPrint(req.valid.params.id));
}

export async function updateBranchPrint(req, res) {
  sendOk(res, await settingsService.updateBranchPrint(req.valid.params.id, req.valid.body.choice), { message: 'Print settings saved' });
}

export async function update(req, res) {
  sendOk(res, await settingsService.updateSection(req.valid.params.section, req.body), { message: 'Settings saved' });
}
