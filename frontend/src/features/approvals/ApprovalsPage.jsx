import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import toast from 'react-hot-toast';
import DataTable from '../../components/DataTable.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { useListParams } from '../../hooks/useListParams.js';
import { useSession } from '../../hooks/usePermission.js';
import { getErrorMessage } from '../../utils/errors.js';
import { formatDateTime } from '../../utils/format.js';
import { DocStatusChip } from '../inventory/stockUi.jsx';
import { useApprovalsQuery, useDecideApprovalMutation } from './approvalApi.js';
import ViewButton from '../../components/ViewButton.jsx';
import { t } from '../../i18n/index.js';

function DecisionDialog({ request, onClose }) {
  const { data: session } = useSession();
  const [comment, setComment] = useState('');
  const [decide, { isLoading, originalArgs }] = useDecideApprovalMutation();
  if (!request) return null;
  const own = String(request.requestedBy?.id) === String(session.user.id);

  const submit = async (decision) => {
    try {
      const res = await decide({ id: request.id, decision, comment: comment.trim() || undefined }).unwrap();
      toast.success(res.status === 'approved' ? t('{{docNo}} approved and posted', { docNo: request.docNo }) : t('{{docNo}} rejected', { docNo: request.docNo }));
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <Dialog open onClose={isLoading ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>
        {request.docTypeLabel} {request.docNo}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 1 }}>
          {request.summary}
        </Typography>
        <Typography variant="caption" color="textSecondary">
          {t('Requested by {{name}} on {{createdAt}}', { name: request.requestedBy?.name, createdAt: formatDateTime(request.createdAt) })}
        </Typography>
        {own && (
          <Typography variant="body2" color="warning" sx={{ mt: 2 }}>
            {t('You raised this request. Only a full-access administrator can approve their own requests.')}
          </Typography>
        )}
        <TextField label={t('Comment')} value={comment} onChange={(e) => setComment(e.target.value)} multiline minRows={2} sx={{ mt: 2 }} />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button color="secondary" onClick={onClose} disabled={isLoading}>
          {t('Cancel')}
        </Button>
        <Button color="error" onClick={() => submit('reject')} loading={isLoading && originalArgs?.decision === 'reject'} disabled={isLoading}>
          {t('Reject')}
        </Button>
        <Button variant="contained" onClick={() => submit('approve')} loading={isLoading && originalArgs?.decision === 'approve'} disabled={isLoading}>
          {t('Approve & post')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function ApprovalsPage() {
  const [active, setActive] = useState(null);
  const list = useListParams({ status: 'pending' });
  const { data, isLoading, isFetching, error, refetch } = useApprovalsQuery(list.params);

  const columns = [
    {
      key: 'doc',
      label: t('Request'),
      render: (r) => (
        <Box>
          <Typography variant="subtitle2">
            {r.docTypeLabel} · {r.docNo}
          </Typography>
          <Typography variant="body2" color="textSecondary">
            {r.summary}
          </Typography>
        </Box>
      ),
    },
    { key: 'by', label: t('Requested'), render: (r) => `${r.requestedBy?.name ?? '—'}, ${formatDateTime(r.createdAt)}` },
    { key: 'decided', label: t('Decision'), render: (r) => (r.decidedBy ? `${r.decidedBy.name}${r.comment ? ` — “${r.comment}”` : ''}` : '—') },
    { key: 'status', label: t('Status'), render: (r) => <DocStatusChip status={r.status} /> },
    {
      key: 'actions',
      label: t('Action'),
      align: 'right',
      width: 56,
      render: (r) => r.status === 'pending' && <ViewButton onClick={() => setActive(r)} title={t('Review')} name={r.docNo} icon={RateReviewOutlinedIcon} />,
    },
  ];

  return (
    <>
      <PageHeader title={t('Approvals')} subtitle={t('Requests waiting for a second pair of eyes before they change stock or money.')} />
      <DataTable
        columns={columns}
        rows={data?.items}
        loading={isLoading}
        fetching={isFetching}
        error={error}
        onRetry={refetch}
        empty={{ title: list.filters.status === 'pending' ? t('Nothing waiting for approval') : t('No requests'), description: t('You will see requests here for the areas you can approve.') }}
        pagination={list.pagination(data?.meta)}
        toolbar={
          <Stack direction="row" spacing={1.5}>
            <TextField select slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }} label={t('Status')} value={list.filters.status} onChange={(e) => list.setFilter('status', e.target.value)} sx={{ maxWidth: 200 }}>
              <MenuItem value="pending">{t('Pending')}</MenuItem>
              <MenuItem value="approved">{t('Approved')}</MenuItem>
              <MenuItem value="rejected">{t('Rejected')}</MenuItem>
              <MenuItem value="">{t('All')}</MenuItem>
            </TextField>
          </Stack>
        }
      />
      <DecisionDialog key={active?.id} request={active} onClose={() => setActive(null)} />
    </>
  );
}
