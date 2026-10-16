import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { Alert, Box, Button, Card, CardContent, Chip, Grid, Link, Stack, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography } from '@mui/material';
import { ADDRESS_FIELDS, stateName, TRIAL_BRANCH_LIMIT } from '@jerp/shared';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { useTabParam } from '../../hooks/useListParams.js';
import InfoCard from '../../components/InfoCard.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import StatusChip from '../../components/StatusChip.jsx';
import { getErrorMessage } from '../../utils/errors.js';
import { formatDate, formatDateTime } from '../../utils/format.js';
import { BranchUsage, ExpiryCell, OrgStatusChip } from './AdminOrganisationsPage.jsx';
import EditHistory from '../../components/EditHistory.jsx';
import { useDeleteOrganisationMutation, useOrganisationHistoryQuery, useOrganisationQuery, useSetOrganisationStatusMutation } from './platformApi.js';
import OrgSubscriptionPanel, { OrgPaymentsTable } from './OrgSubscriptionPanel.jsx';
import { formatAddress } from '../../components/form/PincodeAddressFields.jsx';
import ViewTabs from '../../components/ViewTabs.jsx';

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

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function AdminOrganisationDetailPage() {
  const { id } = useParams();
  const { data: org, isLoading, error, refetch } = useOrganisationQuery(id);
  const history = useOrganisationHistoryQuery(id);
  const [setStatus, { isLoading: saving }] = useSetOrganisationStatusMutation();
  const [confirm, setConfirm] = useState(false);
  const [removeOrg, { isLoading: deleting }] = useDeleteOrganisationMutation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const navigate = useNavigate();
  const [tab, setTab] = useTabParam('overview'); // Overview · Activations & payments · Edit history

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const d = org.details ?? {};
  const notAdded = (
    <Typography component="span" variant="body2" color="textSecondary">
      Not added
    </Typography>
  );

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
          </Stack>
        }
      />
      {org.status === 'suspended' && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Deactivated: nobody in this organisation can sign in. Their data is kept.
        </Alert>
      )}
      <ViewTabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'overview', label: 'Overview' },
          { value: 'payments', label: 'Activations & payments', short: 'Payments' },
          { value: 'history', label: 'Edit history', short: 'History', count: history.data?.length || undefined },
        ]}
      />
      {tab === 'payments' && <OrgPaymentsTable orgId={org.id} />}
      {tab === 'history' && <EditHistory entries={history.data} isLoading={history.isLoading} error={history.error} />}
      {tab === 'overview' && (
        <Grid container spacing={2}>
          <Grid size={12}>
            <OrgSubscriptionPanel orgId={org.id} />
          </Grid>
          {/* Everything stored about the organisation, in four cards. Empty values read "Not added". */}
          <Grid size={{ xs: 12, md: 6 }}>
            <InfoCard
              title="Business details"
              items={[
                { label: 'Business name', value: org.name },
                { label: 'Legal name', value: d.legalName ?? notAdded },
                { label: 'GSTIN', value: org.gstin ?? notAdded },
                { label: 'PAN', value: d.pan ?? notAdded },
                { label: 'Business email', value: org.email ? <Link href={`mailto:${org.email}`}>{org.email}</Link> : notAdded },
                { label: 'Business phone', value: org.phone ? <Link href={`tel:${org.phone}`}>{org.phone}</Link> : notAdded },
                { label: 'Currency', value: d.currency },
                { label: 'Timezone', value: d.timezone ?? notAdded },
                { label: 'Financial year', value: `Starts in ${MONTHS[(d.fyStartMonth ?? 4) - 1]}` },
                { label: 'Logo', value: d.hasLogo ? 'Uploaded' : notAdded },
              ]}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Stack spacing={2} sx={{ height: '100%' }}>
              <InfoCard title="Registered address">
                {ADDRESS_FIELDS.some((f) => org.address?.[f]) ? (
                  formatAddress(org.address ?? {}, org.stateCode).map((line) => (
                    <Typography key={line} variant="body2" sx={{ lineHeight: 1.7 }}>
                      {line}
                    </Typography>
                  ))
                ) : (
                  <Typography variant="body2" color="textSecondary">
                    No address yet · State: {stateName(org.stateCode) ?? '—'}
                  </Typography>
                )}
              </InfoCard>
              <InfoCard
                title="Owner & login"
                items={[
                  { label: 'Owner', value: org.owner?.name },
                  { label: 'Login email', value: org.owner?.email },
                  { label: 'Mobile', value: org.owner?.mobile ?? notAdded },
                  { label: 'Last sign-in', value: org.owner?.lastLoginAt ? formatDateTime(org.owner.lastLoginAt) : 'Never' },
                  { label: 'Active users', value: org.activeUsers },
                ]}
              />
            </Stack>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <InfoCard
              title="Account"
              items={[
                { label: 'Organisation ID', value: <Typography component="span" variant="body2" sx={{ fontFamily: 'monospace' }}>{org.slug}</Typography> },
                { label: 'Status', value: <OrgStatusChip status={org.status} /> },
                { label: 'Created', value: `${formatDateTime(org.createdAt)} · ${d.createdBy?.kind === 'admin' ? `by ${d.createdBy.name}` : d.createdBy?.name ?? ''}` },
                { label: 'Last updated', value: d.updatedAt ? formatDateTime(d.updatedAt) : '—' },
                { label: 'Plan', value: org.plan ?? '—' },
                { label: 'Expires', value: <ExpiryCell subscription={org.subscription} /> },
              ]}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <BranchesCard org={org} />
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
        </Grid>
      )}
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
