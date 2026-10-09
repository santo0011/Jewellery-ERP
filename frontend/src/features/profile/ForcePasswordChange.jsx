import LockResetRoundedIcon from '@mui/icons-material/LockResetRounded';
import { Box, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import { useDispatch } from 'react-redux';
import { useLogoutMutation } from '../auth/authApi.js';
import { sessionEnded } from '../../store/authSlice.js';
import { ChangePasswordForm } from './ProfilePage.jsx';

export default function ForcePasswordChange({ user }) {
  const dispatch = useDispatch();
  const [logout] = useLogoutMutation();

  const signOut = async () => {
    await logout();
    dispatch(sessionEnded());
  };

  return (
    <Box sx={{ maxWidth: 480, mx: 'auto', mt: { xs: 2, md: 6 } }}>
      <Card sx={{ borderTop: 3, borderTopColor: 'primary.main' }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1 }}>
            <LockResetRoundedIcon color="accent" />
            <Typography variant="h3">Set your own password</Typography>
          </Stack>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
            Welcome, {user.name.split(' ')[0]}. Your account was created with a temporary password. Choose a new one to continue.
          </Typography>
          <ChangePasswordForm />
          <Button color="secondary" size="small" onClick={signOut} sx={{ mt: 2 }}>
            Sign out
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}
