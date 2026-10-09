import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import { adminResetPasswordSchema } from '@jerp/shared/schemas';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import PasswordField from '../../components/form/PasswordField.jsx';
import { applyServerErrors, getErrorMessage } from '../../utils/errors.js';
import { useResetUserPasswordMutation } from './userApi.js';

export default function ResetPasswordDialog({ user, onClose }) {
  const [resetPassword, { isLoading, error, reset: resetMutation }] = useResetUserPasswordMutation();
  const { control, handleSubmit, reset, setError } = useForm({ resolver: zodResolver(adminResetPasswordSchema), defaultValues: { password: '' } });

  useEffect(() => {
    if (user) {
      reset({ password: '' });
      resetMutation();
    }
    // Only when it opens: resetMutation changes identity once a request starts, and re-running then would
    // clear the form and the error the server is about to return.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const onSubmit = handleSubmit(async ({ password }) => {
    try {
      await resetPassword({ id: user.id, password }).unwrap();
      toast.success(`Temporary password set for ${user.name}`);
      onClose();
    } catch (err) {
      applyServerErrors(err, setError);
    }
  });

  return (
    <Dialog open={Boolean(user)} onClose={isLoading ? undefined : onClose} maxWidth="xs" fullWidth>
      <form noValidate onSubmit={onSubmit}>
        <DialogTitle sx={{ fontWeight: 600 }}>Reset password</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Typography variant="body2" color="textSecondary">
              Set a temporary password for <strong>{user?.name}</strong>. They will be signed out everywhere and must choose a new password at next sign-in.
            </Typography>
            {error && !error.data?.error?.details && <Alert severity="error">{getErrorMessage(error)}</Alert>}
            <PasswordField control={control} name="password" label="Temporary password" autoComplete="new-password" autoFocus />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" loading={isLoading}>
            Set password
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
