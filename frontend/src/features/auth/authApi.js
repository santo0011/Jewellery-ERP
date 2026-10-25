import { baseApi, unwrapData } from '../../services/baseApi.js';
import { signedIn } from '../../store/authSlice.js';

export const authApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    authConfig: build.query({ query: () => ({ url: '/auth/config' }), transformResponse: unwrapData }),
    login: build.mutation({ query: (data) => ({ url: '/auth/login', method: 'post', data }), transformResponse: unwrapData }),
    register: build.mutation({ query: (data) => ({ url: '/auth/register', method: 'post', data }), transformResponse: unwrapData }),
    logout: build.mutation({ query: () => ({ url: '/auth/logout', method: 'post' }) }),
    logoutAll: build.mutation({ query: () => ({ url: '/auth/logout-all', method: 'post' }) }),
    forgotPassword: build.mutation({ query: (data) => ({ url: '/auth/forgot-password', method: 'post', data }) }),
    verifyResetCode: build.mutation({ query: (data) => ({ url: '/auth/verify-reset-code', method: 'post', data }) }),
    codeLogin: build.mutation({ query: (data) => ({ url: '/auth/code-login', method: 'post', data }), transformResponse: unwrapData }),
    resetPassword: build.mutation({ query: (data) => ({ url: '/auth/reset-password', method: 'post', data }) }),
    me: build.query({ query: () => ({ url: '/auth/me' }), transformResponse: unwrapData, providesTags: ['Me'] }),
    updateProfile: build.mutation({
      query: (data) => ({ url: '/auth/me', method: 'patch', data }),
      transformResponse: unwrapData,
      invalidatesTags: ['Me'],
    }),
    // The language the user sees the app in, kept on the account (the page reloads after, so nothing to refetch).
    setLanguage: build.mutation({ query: (language) => ({ url: '/auth/me/language', method: 'patch', data: { language } }) }),
    changePassword: build.mutation({
      query: (data) => ({ url: '/auth/change-password', method: 'post', data }),
      transformResponse: unwrapData,
      async onQueryStarted(arg, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled.catch(() => ({}));
        if (!data) return;
        dispatch(signedIn(data.accessToken));
        dispatch(baseApi.util.invalidateTags(['Session', 'Me']));
      },
    }),
    sessions: build.query({ query: () => ({ url: '/auth/sessions' }), transformResponse: unwrapData, providesTags: ['Session'] }),
    revokeSession: build.mutation({ query: (id) => ({ url: `/auth/sessions/${id}`, method: 'delete' }), invalidatesTags: ['Session'] }),
  }),
});

export const {
  useAuthConfigQuery,
  useLoginMutation,
  useCodeLoginMutation,
  useRegisterMutation,
  useLogoutMutation,
  useLogoutAllMutation,
  useForgotPasswordMutation,
  useResetPasswordMutation,
  useVerifyResetCodeMutation,
  useMeQuery,
  useUpdateProfileMutation,
  useSetLanguageMutation,
  useChangePasswordMutation,
  useSessionsQuery,
  useRevokeSessionMutation,
} = authApi;
