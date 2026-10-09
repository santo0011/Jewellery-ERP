import { sendCreated, sendOk } from '../../utils/response.js';
import * as categoryService from './category.service.js';

export async function list(req, res) {
  sendOk(res, await categoryService.listCategories());
}

export async function create(req, res) {
  sendCreated(res, await categoryService.createCategory(req.valid.body), { message: 'Category created' });
}

export async function update(req, res) {
  sendOk(res, await categoryService.updateCategory(req.valid.params.id, req.valid.body), { message: 'Category updated' });
}

export async function remove(req, res) {
  await categoryService.deleteCategory(req.valid.params.id);
  sendOk(res, null, { message: 'Category deleted' });
}

export async function addDefaults(req, res) {
  const added = await categoryService.addDefaultCategories();
  sendOk(res, { added }, { message: added ? `${added} standard categories added` : 'All standard categories already exist' });
}
