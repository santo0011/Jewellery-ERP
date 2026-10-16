import { Box } from '@mui/material';
import { useSearchParams } from 'react-router';
import PageHeader from '../../components/PageHeader.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import { usePermission } from '../../hooks/usePermission.js';
import { formatDateTime } from '../../utils/format.js';
import { PrintSettingsForm } from './PrintSettingsForm.jsx';
import { ApprovalSettingsForm, BarcodeSettingsForm, InvoiceSettingsForm, JewellerySettingsForm, TaxSettingsForm } from './settingsForms.jsx';
import { useSettingsQuery } from './settingsApi.js';
import ViewTabs from '../../components/ViewTabs.jsx';

const TABS = [
  { key: 'invoice', label: 'Invoice', Form: InvoiceSettingsForm },
  { key: 'print', label: 'Print', Form: PrintSettingsForm, wide: true },
  { key: 'tax', label: 'Tax & GST', short: 'Tax', Form: TaxSettingsForm },
  { key: 'jewellery', label: 'Jewellery', Form: JewellerySettingsForm },
  { key: 'barcode', label: 'Barcode labels', short: 'Barcode', Form: BarcodeSettingsForm },
  { key: 'approvals', label: 'Approvals', Form: ApprovalSettingsForm },
];

export default function BusinessSettingsPage() {
  const [params, setParams] = useSearchParams();
  const canEdit = usePermission('settings.edit');
  const { data, isLoading, error, refetch } = useSettingsQuery();
  const current = TABS.find((t) => t.key === params.get('tab')) ?? TABS[0];

  return (
    <>
      <PageHeader
        title="Business settings"
        subtitle={data?.updatedAt ? `Last changed ${formatDateTime(data.updatedAt)}` : 'Defaults suited to Indian jewellers. Adjust them to match how you work.'}
        breadcrumbs={[{ label: 'Settings' }, { label: 'Business settings' }]}
      />
      <ViewTabs value={current.key} onChange={(tab) => setParams({ tab }, { replace: true })} items={TABS.map((t) => ({ value: t.key, label: t.label, short: t.short }))} sx={{ mb: 3 }} />
      {isLoading ? (
        <LoadingState label="Loading settings" />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <Box sx={{ maxWidth: current.wide ? 1280 : 880 }}>
          <current.Form key={current.key} value={data[current.key]} readOnly={!canEdit} />
        </Box>
      )}
    </>
  );
}
