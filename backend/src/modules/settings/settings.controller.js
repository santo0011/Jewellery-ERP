import { sendOk } from '../../utils/response.js';
import * as settingsService from './settings.service.js';

export async function getAll(req, res) {
  sendOk(res, await settingsService.getSettings());
}

export async function update(req, res) {
  sendOk(res, await settingsService.updateSection(req.valid.params.section, req.body), { message: 'Settings saved' });
}
