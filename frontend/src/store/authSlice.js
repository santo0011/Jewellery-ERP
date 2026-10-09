import { createSlice } from '@reduxjs/toolkit';

const BRANCH_KEY = 'jerp.activeBranchId';

const readBranch = () => {
  try {
    return localStorage.getItem(BRANCH_KEY);
  } catch {
    return null;
  }
};

const writeBranch = (id) => {
  try {
    if (id) localStorage.setItem(BRANCH_KEY, id);
    else localStorage.removeItem(BRANCH_KEY);
  } catch {
    /* storage unavailable */
  }
};

const authSlice = createSlice({
  name: 'auth',
  initialState: { status: 'checking', accessToken: null, activeBranchId: readBranch() },
  reducers: {
    signedIn(state, action) {
      state.accessToken = action.payload;
      state.status = 'authenticated';
    },
    sessionEnded(state) {
      state.accessToken = null;
      state.status = 'guest';
    },
    branchSelected(state, action) {
      state.activeBranchId = action.payload;
      writeBranch(action.payload);
    },
  },
});

export const { signedIn, sessionEnded, branchSelected } = authSlice.actions;
export default authSlice.reducer;
