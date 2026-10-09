import { sendCreated, sendOk } from '../../utils/response.js';
import * as userService from './user.service.js';

export async function list(req, res) {
  const { items, meta } = await userService.listUsers(req.valid.query);
  sendOk(res, items, { meta });
}

export async function get(req, res) {
  sendOk(res, await userService.getUser(req.valid.params.id));
}

export async function create(req, res) {
  sendCreated(res, await userService.createUser(req.valid.body), { message: 'User created' });
}

export async function update(req, res) {
  sendOk(res, await userService.updateUser(req.valid.params.id, req.valid.body), { message: 'User updated' });
}

export async function setStatus(req, res) {
  const user = await userService.setUserStatus(req.valid.params.id, req.valid.body.status);
  sendOk(res, user, { message: user.status === 'active' ? 'User activated' : 'User deactivated' });
}

export async function resetPassword(req, res) {
  await userService.adminResetPassword(req.valid.params.id, req.valid.body.password);
  sendOk(res, null, { message: 'Temporary password set. The user must change it at next sign-in.' });
}
