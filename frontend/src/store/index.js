import { configureStore, createListenerMiddleware } from '@reduxjs/toolkit';
import { baseApi, TAGS } from '../services/baseApi.js';
import { injectStore } from '../services/http.js';
import { injectPlatformStore, platformApi } from '../features/platform/platformApi.js';
import platformReducer, { platformSessionEnded } from '../features/platform/platformSlice.js';
import authReducer, { branchSelected, sessionEnded } from './authSlice.js';

const listener = createListenerMiddleware();

listener.startListening({
  actionCreator: sessionEnded,
  effect: (action, api) => api.dispatch(baseApi.util.resetApiState()),
});

listener.startListening({
  actionCreator: branchSelected,
  effect: (action, api) => {
    if (action.payload !== api.getOriginalState().auth.activeBranchId) {
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
