import { Router } from 'express';
import { idParamsSchema, itemListQuerySchema, itemSchema, itemStatusSchema } from '@jerp/shared/schemas';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { sendCreated, sendOk } from '../../utils/response.js';
import * as items from './item.service.js';

const router = Router();
const byId = validate({ params: idParamsSchema });
// Whoever buys or catalogues stock uses items.
// The item list is a purchase catalogue (picked on purchase bills and purchase orders): Purchases permissions.
const canView = authorize('purchase.view');
const canEdit = authorize('purchase.create');
router.use(authenticate);

router.get('/', canView, validate({ query: itemListQuerySchema }), async (req, res) => {
  const { items: rows, meta } = await items.listItems(req.valid.query);
  sendOk(res, rows, { meta });
});
router.post('/', canEdit, validate({ body: itemSchema }), async (req, res) => {
  const item = await items.createItem(req.valid.body);
  sendCreated(res, item, { message: `${item.name} saved as ${item.code}` });
});
router.get('/:id', canView, byId, async (req, res) => sendOk(res, await items.getItem(req.valid.params.id)));
router.put('/:id', canEdit, validate({ params: idParamsSchema, body: itemSchema }), async (req, res) => sendOk(res, await items.updateItem(req.valid.params.id, req.valid.body), { message: 'Item updated' }));
router.patch('/:id/status', canEdit, validate({ params: idParamsSchema, body: itemStatusSchema }), async (req, res) => sendOk(res, await items.setItemStatus(req.valid.params.id, req.valid.body), { message: 'Item updated' }));

export default router;
