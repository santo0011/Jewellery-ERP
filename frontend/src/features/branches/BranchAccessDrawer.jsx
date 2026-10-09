import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import { BRANCH_PERMISSIONS, BRANCH_SCOPED_MODULES } from '@jerp/shared';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import FormDrawer from '../../components/FormDrawer.jsx';
import { getErrorMessage } from '../../utils/errors.js';
import PermissionMatrix from '../roles/PermissionMatrix.jsx';
import { useSetBranchPermissionsMutation } from './branchApi.js';

export default function BranchAccessDrawer({ branch, onClose }) {
  const [value, setValue] = useState([]);
  const [save, { isLoading }] = useSetBranchPermissionsMutation();

  useEffect(() => {
    if (branch) setValue(branch.allowedPermissions ?? BRANCH_PERMISSIONS);
  }, [branch]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await save({ id: branch._id, permissions: value }).unwrap();
      toast.success(`${branch.name} access updated`);
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <FormDrawer
      open={Boolean(branch)}
      title={`What ${branch?.name ?? 'this branch'} can do`}
      subtitle="Staff working in this branch only get these modules and actions, even if their role allows more."
      onClose={onClose}
      onSubmit={submit}
      submitting={isLoading}
      submitLabel="Save branch access"
      width={760}
    >
      <Alert severity="info" sx={{ mb: 2 }}>
        Organisation-wide areas (users, roles, settings, metal rates, categories, audit) are managed at organisation level and are not limited per branch.
      </Alert>
      <Stack direction="row" spacing={1} sx={{ mb: 2, alignItems: 'center' }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {value.length} of {BRANCH_PERMISSIONS.length} allowed
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Button size="small" color="secondary" onClick={() => setValue([...BRANCH_PERMISSIONS])}>
          Allow all
        </Button>
        <Button size="small" color="secondary" onClick={() => setValue([])}>
          Clear all
        </Button>
      </Stack>
      <PermissionMatrix value={value} onChange={setValue} modules={BRANCH_SCOPED_MODULES} />
    </FormDrawer>
  );
}
