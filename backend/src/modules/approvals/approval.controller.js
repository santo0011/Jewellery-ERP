import { decide as decideRequest, listApprovals, pendingCount as countPending } from '../../core/approvals/approval.service.js';
import { sendOk } from '../../utils/response.js';

export async function list(req, res) {
  const { items, meta } = await listApprovals(req.valid.query);
  sendOk(res, items, { meta });
}

export async function pendingCount(req, res) {
  sendOk(res, { count: await countPending() });
}

export async function decide(req, res) {
  const result = await decideRequest(req.valid.params.id, req.valid.body);
  sendOk(res, result, { message: result.status === 'approved' ? 'Approved and posted' : 'Rejected' });
}
