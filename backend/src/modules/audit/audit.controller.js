import { sendOk } from '../../utils/response.js';
import { listAuditLogs } from './audit.service.js';

export async function list(req, res) {
  const { items, meta } = await listAuditLogs(req.valid.query);
  sendOk(res, items, { meta });
}
