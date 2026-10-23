import { Router } from 'express';
import { expenseCategorySchema, expenseListQuerySchema, expenseSchema, expenseUpdateSchema, expenseVoidSchema, financeSummaryQuerySchema, idParamsSchema } from '@jerp/shared/schemas';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize, authorizeAny } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { sendCreated, sendOk } from '../../utils/response.js';
import * as expenses from './expense.service.js';
import { financeSummary } from './finance.service.js';

const router = Router();
const byId = validate({ params: idParamsSchema });
router.use(authenticate);

// Expense heads: picking one needs only to enter an expense; adding or renaming one, to edit expenses.
router.get('/categories', authorizeAny(['expense.view', 'expense.create']), async (req, res) => sendOk(res, await expenses.listCategories()));
router.post('/categories', authorizeAny(['expense.create', 'expense.edit']), validate({ body: expenseCategorySchema }), async (req, res) => sendCreated(res, await expenses.createCategory(req.valid.body), { message: 'Category added' }));
router.put('/categories/:id', authorize('expense.edit'), validate({ params: idParamsSchema, body: expenseCategorySchema }), async (req, res) => sendOk(res, await expenses.renameCategory(req.valid.params.id, req.valid.body), { message: 'Category renamed' }));

router.get('/', authorize('expense.view'), validate({ query: expenseListQuerySchema }), async (req, res) => {
  const { items, meta } = await expenses.listExpenses(req.valid.query);
  sendOk(res, items, { meta });
});
router.post('/', authorize('expense.create'), validate({ body: expenseSchema }), async (req, res) => sendCreated(res, await expenses.createExpense(req.valid.body), { message: 'Expense saved' }));
router.get('/:id', authorize('expense.view'), byId, async (req, res) => sendOk(res, await expenses.getExpense(req.valid.params.id)));
router.put('/:id', authorize('expense.edit'), validate({ params: idParamsSchema, body: expenseUpdateSchema }), async (req, res) => sendOk(res, await expenses.updateExpense(req.valid.params.id, req.valid.body), { message: 'Expense corrected' }));
router.post('/:id/void', authorize('expense.delete'), validate({ params: idParamsSchema, body: expenseVoidSchema }), async (req, res) => sendOk(res, await expenses.voidExpense(req.valid.params.id, req.valid.body), { message: 'Expense voided' }));

export default router;

/** Profit & expenses for a month: sales, cost of goods, expenses, salary, net profit, and supplier cash. */
export const financeRoutes = Router();
financeRoutes.use(authenticate);
financeRoutes.get('/summary', authorize('report.finance'), validate({ query: financeSummaryQuerySchema }), async (req, res) => sendOk(res, await financeSummary(req.valid.query)));
