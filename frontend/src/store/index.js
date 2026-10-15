import { configureStore, createListenerMiddleware } from '@reduxjs/toolkit';
import { baseApi, TAGS } from '../services/baseApi.js';
import { injectStore } from '../services/http.js';
import { injectPlatformStore, platformApi } from '../features/platform/platformApi.js';
import platformReducer, { platformSessionEnded } from '../features/platform/platformSlice.js';
import authReducer, { allBranchesSelected, branchSelected, sessionEnded } from './authSlice.js';

const listener = createListenerMiddleware();

listener.startListening({
  actionCreator: sessionEnded,
  effect: (action, api) => api.dispatch(baseApi.util.resetApiState()),
});

// A different branch (or switching to / from "All branches") refreshes every list.
listener.startListening({
  predicate: (action) => branchSelected.match(action) || allBranchesSelected.match(action),
  effect: (action, api) => {
    const before = api.getOriginalState().auth;
    const after = api.getState().auth;
    if (before.activeBranchId !== after.activeBranchId || before.branchView !== after.branchView) {
      api.dispatch(baseApi.util.invalidateTags(TAGS));
    }
  },
});

listener.startListening({
  actionCreator: platformSessionEnded,
  effect: (action, api) => api.dispatch(platformApi.util.resetApiState()),
});

export const store = configureStore({
  reducer: {
    auth: authReducer,
    platform: platformReducer,
    [baseApi.reducerPath]: baseApi.reducer,
    [platformApi.reducerPath]: platformApi.reducer,
  },
  middleware: (getDefault) => getDefault().prepend(listener.middleware).concat(baseApi.middleware, platformApi.middleware),
});

injectStore(store);
injectPlatformStore(store);
