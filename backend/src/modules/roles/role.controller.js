import { sendCreated, sendOk } from '../../utils/response.js';
import * as roleService from './role.service.js';

export async function list(req, res) {
  sendOk(res, await roleService.listRoles());
}

export async function get(req, res) {
  sendOk(res, await roleService.getRole(req.valid.params.id));
}

export async function create(req, res) {
  sendCreated(res, await roleService.createRole(req.valid.body), { message: 'Role created' });
}

export async function update(req, res) {
  sendOk(res, await roleService.updateRole(req.valid.params.id, req.valid.body), { message: 'Role updated' });
}

export async function duplicate(req, res) {
  sendCreated(res, await roleService.duplicateRole(req.valid.params.id), { message: 'Role duplicated' });
}

export async function remove(req, res) {
  await roleService.deleteRole(req.valid.params.id);
  sendOk(res, null, { message: 'Role deleted' });
}
