import { Box, Divider, Stack, Typography } from '@mui/material';
import { AUDIT_ACTION_LABELS } from '@jerp/shared';
import { useAuditLogsQuery } from '../features/audit/auditApi.js';
import { fieldLabel } from '../features/audit/describeEntry.js';
import { usePermission } from '../hooks/usePermission.js';
import { formatDateTime } from '../utils/format.js';
import InfoCard from './InfoCard.jsx';

export default function RecordHistory({ recordId }) {
  const allowed = usePermission('audit.view');
  const { data, isLoading } = useAuditLogsQuery({ recordId, limit: 10, page: 1 }, { skip: !allowed || !recordId });
  if (!allowed) return null;

  return (
    <InfoCard title="History">
      {isLoading ? (
        <Typography variant="body2" color="textSecondary">
          Loading…
        </Typography>
      ) : !data?.items.length ? (
        <Typography variant="body2" color="textSecondary">
          No changes recorded.
        </Typography>
      ) : (
        <Stack divider={<Divider />} spacing={1}>
          {data.items.map((e) => (
            <Box key={e.id}>
              <Typography variant="body2">
                <Box component="span" sx={{ fontWeight: 600 }}>
                  {AUDIT_ACTION_LABELS[e.action] ?? e.action}
                </Box>{' '}
                by {e.user?.name ?? 'System'}
                {e.changes.length > 0 && (
                  <Typography component="span" variant="body2" color="textSecondary">
                    {' '}
                    · {e.changes.map((c) => fieldLabel(c.field)).join(', ')}
                  </Typography>
                )}
              </Typography>
              <Typography variant="caption" color="textSecondary">
                {formatDateTime(e.createdAt)}
              </Typography>
            </Box>
          ))}
        </Stack>
      )}
    </InfoCard>
  );
}
