import { zodResolver } from '@hookform/resolvers/zod';
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined';
import { Alert, Box, Chip, Stack, Typography } from '@mui/material';
import { passwordSchema } from '@jerp/shared/schemas';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import FormDrawer from '../../components/FormDrawer.jsx';
import PasswordField from '../../components/form/PasswordField.jsx';
import RHFSelect from '../../components/form/RHFSelect.jsx';
import { useRolesQuery } from '../roles/roleApi.js';
import { z } from 'zod';
import { tokens } from '../../theme/tokens.js';
import { applyServerErrors, getErrorMessage } from '../../utils/errors.js';
import { formatDateTime } from '../../utils/format.js';
import { useSetBranchLoginMutation } from './branchApi.js';

// Creating the login needs a password; once it exists, the password is optional (blank = keep it) and the role can change alone.
const formSchemaFor = (existing) =>
  z
    .object({ roleId: z.string().min(1, 'Select a role'), password: existing ? z.union([z.literal(''), passwordSchema]) : passwordSchema, confirmPassword: z.string() })
    .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' });

const EMPTY = { roleId: '', password: '', confirmPassword: '' };
// Errors on these fields show under the field; anything else (plan limit, missing branch email) shows as an alert.
const fieldError = (error) => error?.data?.error?.details?.some((d) => d.path in EMPTY);

/** Sets up a branch login, or changes its password or role. The login email is always the branch email. */
export default function BranchLoginDrawer({ branch, onClose, onEditBranch }) {
  const existing = branch?.login ?? null;
  const hasEmail = Boolean(branch?.email);
  const [save, { isLoading, error, reset: resetMutation }] = useSetBranchLoginMutation();
  const { data: roles = [] } = useRolesQuery(undefined, { skip: !branch });
  const roleOptions = roles.map((r) => ({ value: String(r.id), label: r.name }));
  const defaultRoleId = String(existing?.role?.id ?? roles.find((r) => r.key === 'branch_manager')?.id ?? '');
  const { control, handleSubmit, reset, setError } = useForm({ resolver: zodResolver(formSchemaFor(existing)), defaultValues: EMPTY });

  useEffect(() => {
    if (branch) {
      reset({ ...EMPTY, roleId: defaultRoleId });
      resetMutation();
    }
    // Only when it opens: resetMutation changes identity once a request starts, and re-running then would
    // clear the form and the error the server is about to return.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch, defaultRoleId]);

  const submitPassword = handleSubmit(async ({ password, roleId }) => {
    try {
      await save({ id: branch._id, roleId, ...(password && { password }) }).unwrap();
      toast.success(existing ? `${branch.name} login updated` : `${branch.name} can now sign in with ${branch.email}`);
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
      title={existing ? 'Branch login' : 'Set up branch login'}
      subtitle={branch?.name}
      onClose={onClose}
      onSubmit={hasEmail ? submitPassword : goAddEmail}
      submitting={isLoading}
      submitLabel={!hasEmail ? 'Add email' : existing ? 'Save' : 'Create login'}
      width={460}
    >
      <Stack spacing={2.5}>
        <Box sx={{ p: 2, borderRadius: 2.5, border: '1px solid rgba(var(--brand-rgb), 0.25)', background: 'linear-gradient(145deg, rgba(var(--brand-rgb), 0.08), rgba(var(--brand-rgb), 0.01))' }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Box sx={{ width: 40, height: 40, borderRadius: 2, flexShrink: 0, display: 'grid', placeItems: 'center', background: tokens.sidebar.goldGradient, color: 'var(--brand-contrast)' }}>
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
                ? 'Change the role, or enter a new password (leave it blank to keep the current one). A new password signs the branch out on every device.'
                : 'This login opens the panel for this branch only. The email is the branch email; change it from Edit branch.'}
            </Typography>
            {error && !fieldError(error) && <Alert severity="error">{getErrorMessage(error)}</Alert>}
            <RHFSelect control={control} name="roleId" label="Role" options={roleOptions} helperText="What this login can do in its branch" />
            <PasswordField control={control} name="password" label={existing ? 'New password (optional)' : 'Password'} autoComplete="new-password" helperText="At least 6 characters" autoFocus />
            <PasswordField control={control} name="confirmPassword" label="Confirm password" autoComplete="new-password" />
          </>
        )}
      </Stack>
    </FormDrawer>
  );
}
