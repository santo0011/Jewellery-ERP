import { baseApi, unwrapData, unwrapList } from '../../services/baseApi.js';

// Anything that moves money or stock changes the profit figures: the summary refetches when any of these change.
const MONEY = ['Finance', 'Expense', 'Sale', 'Purchase', 'Payroll', 'Stock', 'Supplier'];
const expenseChange = ['Expense', 'Finance', 'Audit'];

/** Shop expenses, their categories, and the month's profit & expenses. */
export const financeApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    expenses: build.query({ query: (params) => ({ url: '/expenses', params }), transformResponse: unwrapList, providesTags: ['Expense'] }),
    expense: build.query({ query: (id) => ({ url: `/expenses/${id}` }), transformResponse: unwrapData, providesTags: ['Expense'] }),
    expenseCategories: build.query({ query: () => ({ url: '/expenses/categories' }), transformResponse: unwrapData, providesTags: ['Expense'] }),
    createExpense: build.mutation({ query: (data) => ({ url: '/expenses', method: 'post', data }), transformResponse: unwrapData, invalidatesTags: expenseChange }),
    updateExpense: build.mutation({ query: ({ id, ...data }) => ({ url: `/expenses/${id}`, method: 'put', data }), transformResponse: unwrapData, invalidatesTags: expenseChange }),
    voidExpense: build.mutation({ query: ({ id, reason }) => ({ url: `/expenses/${id}/void`, method: 'post', data: { reason } }), transformResponse: unwrapData, invalidatesTags: expenseChange }),
    createExpenseCategory: build.mutation({ query: (data) => ({ url: '/expenses/categories', method: 'post', data }), transformResponse: unwrapData, invalidatesTags: ['Expense', 'Audit'] }),
    financeSummary: build.query({ query: (params) => ({ url: '/finance/summary', params }), transformResponse: unwrapData, providesTags: MONEY }),
  }),
});

export const {
  useExpensesQuery,
  useExpenseQuery,
  useExpenseCategoriesQuery,
  useCreateExpenseMutation,
  useUpdateExpenseMutation,
  useVoidExpenseMutation,
  useCreateExpenseCategoryMutation,
  useFinanceSummaryQuery,
} = financeApi;
