import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import ForwardToInboxOutlinedIcon from '@mui/icons-material/ForwardToInboxOutlined';
import { Alert, Box, Button, Card, CardContent, Chip, Grid, Stack, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography } from '@mui/material';
import { stateName, TRIAL_BRANCH_LIMIT } from '@jerp/shared';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import InfoCard from '../../components/InfoCard.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import StatusChip from '../../components/StatusChip.jsx';
import { getErrorMessage } from '../../utils/errors.js';
import { formatDate, formatDateTime } from '../../utils/format.js';
import { BranchUsage, OrgStatusChip } from './AdminOrganisationsPage.jsx';
import EditHistory from '../../components/EditHistory.jsx';
import { useDeleteOrganisationMutation, useOrganisationHistoryQuery, useOrganisationQuery, useSendLoginCodeMutation, useSetOrganisationStatusMutation } from './platformApi.js';
import LoginCodeDialog from './LoginCodeDialog.jsx';
import OrgSubscriptionPanel from './OrgSubscriptionPanel.jsx';

/** Branches in use and where the limit comes from: the free trial (TRIAL_BRANCH_LIMIT, head office included) or the plan. */
function BranchesCard({ org }) {
  const onTrial = org.subscription?.status === 'trial';
  return (
    <Card sx={{ height: '100%', borderTop: 3, borderTopColor: 'primary.main' }}>
      <CardContent>
        <Typography variant="overline" color="textSecondary">
          Branches
        </Typography>
        <Box sx={{ my: 1.5 }}>
          <BranchUsage used={org.branchesUsed} limit={org.branchLimit} />
        </Box>
        <Typography variant="body2" color="textSecondary">
          {onTrial
            ? `Free trial: up to ${TRIAL_BRANCH_LIMIT} branches, head office included.`
            : org.plan
              ? `Set by the ${org.plan} plan${org.branchLimit == null ? ' (unlimited)' : ''}. Change the plan to allow more.`
              : 'No plan yet.'}
        </Typography>
      </CardContent>
    </Card>
  );
}

export default function AdminOrganisationDetailPage() {
  const { id } = useParams();
  const { data: org, isLoading, error, refetch } = useOrganisationQuery(id);
  const history = useOrganisationHistoryQuery(id);
  const [setStatus, { isLoading: saving }] = useSetOrganisationStatusMutation();
  const [confirm, setConfirm] = useState(false);
  const [removeOrg, { isLoading: deleting }] = useDeleteOrganisationMutation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sendCode, { isLoading: sending }] = useSendLoginCodeMutation();
  const [confirmCode, setConfirmCode] = useState(false);
  const [codeResult, setCodeResult] = useState(null);
  const navigate = useNavigate();

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const suspend = org.status === 'active';
  const toggle = async () => {
    try {
      await setStatus({ id, status: suspend ? 'suspended' : 'active' }).unwrap();
      toast.success(suspend ? `${org.name} deactivated` : `${org.name} activated`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
    setConfirm(false);
  };

  const doDelete = async () => {
    try {
      await removeOrg(id).unwrap();
      toast.success(`${org.name} deleted`);
      navigate('/admin/organisations', { replace: true });
    } catch (err) {
      toast.error(getErrorMessage(err));
      setConfirmDelete(false);
    }
  };
  const doSendCode = async () => {
    try {
      setCodeResult(await sendCode(id).unwrap());
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
    setConfirmCode(false);
  };
  // Why it can no longer be deleted, e.g. "3 products, 1 customer".
  const inUse = (org.records ?? []).map((r) => `${r.count} ${r.type}${r.count === 1 ? '' : 's'}`).join(', ');

  return (
    <>
      <PageHeader
        back={{ to: '/admin/organisations', label: 'Organisations' }}
        title={org.name}
        subtitle={
          <Stack component="span" direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <OrgStatusChip status={org.status} />
            <span>Created {formatDate(org.createdAt)}</span>
          </Stack>
        }
        breadcrumbs={[{ label: 'Organisations', to: '/admin/organisations' }, { label: org.name }]}
        actions={
          <Stack direction="row" spacing={1}>
            <Tooltip title={org.canDelete ? 'Nothing has been added yet, so it can be removed completely' : `Cannot delete: it already has ${inUse}. Deactivate it instead.`}>
              <span>
                <Button variant="outlined" color="error" startIcon={<DeleteOutlineRoundedIcon />} disabled={!org.canDelete} onClick={() => setConfirmDelete(true)}>
                  Delete
                </Button>
              </span>
            </Tooltip>
            <Button variant="outlined" color={suspend ? 'error' : 'success'} onClick={() => setConfirm(true)}>
              {suspend ? 'Deactivate' : 'Activate'}
            </Button>
            <Button variant="contained" startIcon={<ForwardToInboxOutlinedIcon />} onClick={() => setConfirmCode(true)}>
              Send sign-in code
            </Button>
          </Stack>
        }
      />
      <ConfirmDialog
        open={confirmCode}
        title="Send a new sign-in code?"
        message={`A new 6-digit code is emailed to ${org.owner?.email ?? org.email} and becomes the organisation’s password. Their current password stops working and they are signed out everywhere.`}
        confirmLabel="Send code"
        loading={sending}
        onConfirm={doSendCode}
        onClose={() => setConfirmCode(false)}
      />
      <LoginCodeDialog result={codeResult} title="New sign-in code" onClose={() => setCodeResult(null)} />
      {org.status === 'suspended' && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Deactivated: nobody in this organisation can sign in. Their data is kept.
        </Alert>
      )}
      <Grid container spacing={2}>
        <Grid size={12}>
          <OrgSubscriptionPanel orgId={org.id} />
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <BranchesCard org={org} />
        </Grid>
        <Grid size={{ xs: 12, md: 7 }}>
          <InfoCard
            title="Owner & business"
            items={[
              { label: 'Owner', value: org.owner?.name },
              { label: 'Email', value: org.owner?.email },
              { label: 'Mobile', value: org.owner?.mobile },
              { label: 'Last sign-in', value: org.owner?.lastLoginAt ? formatDateTime(org.owner.lastLoginAt) : 'Never' },
              { label: 'State', value: stateName(org.stateCode) },
              { label: 'GSTIN', value: org.gstin },
              { label: 'Active users', value: org.activeUsers },
            ]}
          />
        </Grid>
        <Grid size={12}>
          <InfoCard title={`Branches (${org.branches.length})`}>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Code</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell>City</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {org.branches.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell>{b.code}</TableCell>
                      <TableCell>
                        {b.name} {b.isHeadOffice && <Chip size="small" label="Head office" variant="outlined" color="primary" sx={{ height: 20, ml: 1 }} />}
                      </TableCell>
                      <TableCell>{b.city ?? '—'}</TableCell>
                      <TableCell>
                        <StatusChip status={b.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
            <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 1 }}>
              The organisation creates its own branches within the limit and decides what each branch can access.
            </Typography>
          </InfoCard>
        </Grid>
        <Grid size={12}>
          <EditHistory entries={history.data} isLoading={history.isLoading} error={history.error} />
        </Grid>
      </Grid>
      <ConfirmDialog
        open={confirm}
        title={suspend ? `Deactivate ${org.name}?` : `Activate ${org.name}?`}
        message={suspend ? 'All users of this organisation will be signed out and blocked until you activate it again.' : 'Users of this organisation will be able to sign in again.'}
        confirmLabel={suspend ? 'Deactivate' : 'Activate'}
        danger={suspend}
        loading={saving}
        onConfirm={toggle}
        onClose={() => setConfirm(false)}
      />
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${org.name}?`}
        message="It has no records yet, so it will be removed completely: its login, head office, roles and settings. This cannot be undone."
        confirmLabel="Delete organisation"
        danger
        loading={deleting}
        onConfirm={doDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </>
  );
}
