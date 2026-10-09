import { zodResolver } from '@hookform/resolvers/zod';
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined';
import { Alert, Box, Chip, Stack, Typography } from '@mui/material';
import { branchLoginSchema } from '@jerp/shared/schemas';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import FormDrawer from '../../components/FormDrawer.jsx';
import PasswordField from '../../components/form/PasswordField.jsx';
import { tokens } from '../../theme/tokens.js';
import { applyServerErrors, getErrorMessage } from '../../utils/errors.js';
import { formatDateTime } from '../../utils/format.js';
import { useSetBranchLoginMutation } from './branchApi.js';

const formSchema = branchLoginSchema
  .extend({ confirmPassword: branchLoginSchema.shape.password })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' });

const EMPTY = { password: '', confirmPassword: '' };
// Errors on these fields show under the field; anything else (plan limit, missing branch email) shows as an alert.
const fieldError = (error) => error?.data?.error?.details?.some((d) => d.path in EMPTY);

/** Sets or changes a branch login's password. The login email is always the branch email. */
export default function BranchLoginDrawer({ branch, onClose, onEditBranch }) {
  const existing = branch?.login ?? null;
  const hasEmail = Boolean(branch?.email);
  const [save, { isLoading, error, reset: resetMutation }] = useSetBranchLoginMutation();
  const { control, handleSubmit, reset, setError } = useForm({ resolver: zodResolver(formSchema), defaultValues: EMPTY });

  useEffect(() => {
    if (branch) {
      reset(EMPTY);
      resetMutation();
    }
    // Only when it opens: resetMutation changes identity once a request starts, and re-running then would
    // clear the form and the error the server is about to return.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch]);

  const submitPassword = handleSubmit(async ({ password }) => {
    try {
      await save({ id: branch._id, password }).unwrap();
      toast.success(existing ? `${branch.name} password changed` : `${branch.name} can now sign in with ${branch.email}`);
      onClose();
    } catch (err) {
      applyServerErrors(err, setError);
    }
  });

  const goAddEmail = (e) => {
    e.preventDefault();
    onEditBranch(branch);
  };

  return (
    <FormDrawer
      open={Boolean(branch)}
      title={existing ? 'Change branch password' : 'Set up branch login'}
      subtitle={branch?.name}
      onClose={onClose}
      onSubmit={hasEmail ? submitPassword : goAddEmail}
      submitting={isLoading}
      submitLabel={!hasEmail ? 'Add email' : existing ? 'Change password' : 'Create login'}
      width={460}
    >
      <Stack spacing={2.5}>
        <Box sx={{ p: 2, borderRadius: 2.5, border: '1px solid rgba(201, 162, 39, 0.25)', background: 'linear-gradient(145deg, rgba(201, 162, 39, 0.08), rgba(201, 162, 39, 0.01))' }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Box sx={{ width: 40, height: 40, borderRadius: 2, flexShrink: 0, display: 'grid', placeItems: 'center', background: tokens.sidebar.goldGradient, color: '#171717' }}>
              <KeyOutlinedIcon fontSize="small" />
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="caption" color="textSecondary">
                Login email
              </Typography>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
                {branch?.email ?? 'No email on this branch'}
              </Typography>
            </Box>
            <Chip size="small" label={existing ? 'Active' : 'Not set up'} color={existing ? 'success' : 'default'} variant={existing ? 'filled' : 'outlined'} sx={{ height: 22 }} />
          </Stack>
          {existing && (
            <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 1.25 }}>
              {existing.lastLoginAt ? `Last signed in ${formatDateTime(existing.lastLoginAt)}` : 'Has not signed in yet'}
            </Typography>
          )}
        </Box>

        {!hasEmail ? (
          <Alert severity="info">The branch signs in with its email. Add an email to {branch?.name} first, then come back to set the password.</Alert>
        ) : (
          <>
            <Typography variant="body2" color="textSecondary">
              {existing
                ? 'Enter a new password. The branch is signed out on every device and must sign in again with the new password.'
                : 'This login opens the panel for this branch only, with Branch Manager access. The email is the branch email; change it from Edit branch.'}
            </Typography>
            {error && !fieldError(error) && <Alert severity="error">{getErrorMessage(error)}</Alert>}
            <PasswordField control={control} name="password" label={existing ? 'New password' : 'Password'} autoComplete="new-password" helperText="At least 6 characters" autoFocus />
            <PasswordField control={control} name="confirmPassword" label="Confirm password" autoComplete="new-password" />
          </>
        )}
      </Stack>
    </FormDrawer>
  );
}
