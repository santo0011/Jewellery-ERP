import { Box } from '@mui/material';
import PageHeader from '../../components/PageHeader.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import { PrintSettingsForm } from './PrintSettingsForm.jsx';
import { useSettingsQuery } from './settingsApi.js';

/** A branch login's own Print settings: how invoices billed at this branch print (its menu has no Business settings). */
export default function PrintSettingsPage() {
  const { data, isLoading, error, refetch } = useSettingsQuery();
  return (
    <>
      <PageHeader title="Print settings" subtitle="Choose the paper and design your branch's invoices print with." />
      {isLoading ? (
        <LoadingState label="Loading settings" />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <Box sx={{ maxWidth: 1280 }}>
          <PrintSettingsForm value={data.print} />
        </Box>
      )}
    </>
  );
}
