import { sendCreated, sendOk } from '../../utils/response.js';
import * as userService from '../users/user.service.js';
import * as branchService from './branch.service.js';

export async function list(req, res) {
  const { items, meta } = await branchService.listBranches(req.valid.query);
  sendOk(res, items, { meta });
}

export async function usage(req, res) {
  sendOk(res, await branchService.branchUsage());
}

export async function setLogin(req, res) {
  const login = await userService.setBranchLogin(req.valid.params.id, req.valid.body);
  sendOk(res, login, { message: 'Branch login password saved' });
}

export async function setPermissions(req, res) {
  sendOk(res, await branchService.setBranchPermissions(req.valid.params.id, req.valid.body.permissions), { message: 'Branch access updated' });
}

export async function directory(req, res) {
  sendOk(res, await branchService.branchDirectory());
}

export async function get(req, res) {
  sendOk(res, await branchService.getBranch(req.valid.params.id));
}

export async function create(req, res) {
  sendCreated(res, await branchService.createBranch(req.valid.body), { message: 'Branch created' });
}

export async function update(req, res) {
  sendOk(res, await branchService.updateBranch(req.valid.params.id, req.valid.body), { message: 'Branch updated' });
}

export async function setStatus(req, res) {
  const branch = await branchService.setBranchStatus(req.valid.params.id, req.valid.body.status);
  sendOk(res, branch, { message: branch.status === 'active' ? 'Branch activated' : 'Branch deactivated' });
}
