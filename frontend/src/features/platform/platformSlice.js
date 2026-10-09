import { createSlice } from '@reduxjs/toolkit';

const platformSlice = createSlice({
  name: 'platform',
  initialState: { status: 'checking', accessToken: null },
  reducers: {
    platformSignedIn(state, action) {
      state.accessToken = action.payload;
      state.status = 'authenticated';
    },
    platformSessionEnded(state) {
      state.accessToken = null;
      state.status = 'guest';
    },
  },
});

export const { platformSignedIn, platformSessionEnded } = platformSlice.actions;
export default platformSlice.reducer;
