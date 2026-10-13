import { createSlice } from '@reduxjs/toolkit';

const BRANCH_KEY = 'jerp.activeBranchId';
const VIEW_KEY = 'jerp.branchView';

const read = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key, value) => {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
};

const authSlice = createSlice({
  name: 'auth',
  // activeBranchId: the working branch (new bills, forms, and that branch's module access).
  // branchView: 'all' when the navbar filter shows every branch on list pages (the working branch is then the head office).
  initialState: { status: 'checking', accessToken: null, activeBranchId: read(BRANCH_KEY), branchView: read(VIEW_KEY) === 'all' ? 'all' : null },
  reducers: {
    signedIn(state, action) {
      state.accessToken = action.payload;
      state.status = 'authenticated';
    },
    sessionEnded(state) {
      state.accessToken = null;
      state.status = 'guest';
    },
    /** One branch: its data on list pages, and it becomes the working branch. */
    branchSelected(state, action) {
      state.activeBranchId = action.payload;
      state.branchView = null;
      write(BRANCH_KEY, action.payload);
      write(VIEW_KEY, null);
    },
    /** Every branch on list pages; the payload (the head office) stays the working branch. */
    allBranchesSelected(state, action) {
      state.activeBranchId = action.payload;
      state.branchView = 'all';
      write(BRANCH_KEY, action.payload);
      write(VIEW_KEY, 'all');
    },
  },
});

export const { signedIn, sessionEnded, branchSelected, allBranchesSelected } = authSlice.actions;
export default authSlice.reducer;
