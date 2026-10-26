import { useState } from 'react';
import PageHeader from '../../components/PageHeader.jsx';
import UndoHistoryTable from '../undo/UndoHistoryTable.jsx';
import { usePlatformUndoHistoryQuery } from './platformApi.js';
import { t } from '../../i18n/index.js';

/** The Super Admin panel's Undo history: what was done on the platform, and who undid or kept it, when and why. */
export default function AdminUndoHistoryPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [status, setStatus] = useState('');
  const query = usePlatformUndoHistoryQuery({ page, limit, ...(status && { status }) });
  return (
    <>
      <PageHeader
        title={t('Undo history')}
        subtitle={t('Platform actions that can be undone (organisations, plans, subscriptions, email settings) and what became of each. Nothing here is ever removed.')}
        breadcrumbs={[{ label: t('Settings') }, { label: t('Undo history') }]}
      />
      <UndoHistoryTable query={query} page={page} setPage={setPage} limit={limit} setLimit={setLimit} status={status} setStatus={setStatus} showPanel={false} />
    </>
  );
}
