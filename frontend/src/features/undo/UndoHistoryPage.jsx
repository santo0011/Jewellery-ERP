import { MenuItem, TextField } from '@mui/material';
import { useState } from 'react';
import { useSession } from '../../hooks/usePermission.js';
import { useUndoHistoryQuery } from './undoApi.js';
import UndoHistoryTable from './UndoHistoryTable.jsx';
import { t } from '../../i18n/index.js';

/** The Audit log's Undo history tab: every action of the panels this person works in, and what became of it. */
export function UndoHistoryTab() {
  const { data: session } = useSession();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [status, setStatus] = useState('');
  const [panel, setPanel] = useState(''); // '' | 'organisation' | <branchId>
  const allBranches = session?.user?.allBranches ?? false;
  const params = { page, limit, ...(status && { status }), ...(panel === 'organisation' ? { scope: 'organisation' } : panel ? { branchId: panel } : {}) };
  const query = useUndoHistoryQuery(params);

  const panelFilter = (
    <TextField select label={t('Panel')} value={panel} onChange={(e) => { setPanel(e.target.value); setPage(1); }} slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }} sx={{ maxWidth: { md: 240 } }}>
      <MenuItem value="">{t('All panels')}</MenuItem>
      {allBranches && <MenuItem value="organisation">{t('Organisation (shared records)')}</MenuItem>}
      {(session?.branches ?? []).map((b) => (
        <MenuItem key={b.id} value={b.id}>
          {b.name}
        </MenuItem>
      ))}
    </TextField>
  );

  return <UndoHistoryTable query={query} page={page} setPage={setPage} limit={limit} setLimit={setLimit} status={status} setStatus={setStatus} panelFilter={panelFilter} />;
}
