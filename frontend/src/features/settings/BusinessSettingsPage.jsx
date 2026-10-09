import { Box, Tab, Tabs } from '@mui/material';
import { useSearchParams } from 'react-router';
import PageHeader from '../../components/PageHeader.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import { usePermission } from '../../hooks/usePermission.js';
import { formatDateTime } from '../../utils/format.js';
import { ApprovalSettingsForm, BarcodeSettingsForm, InvoiceSettingsForm, JewellerySettingsForm, TaxSettingsForm } from './settingsForms.jsx';
import { useSettingsQuery } from './settingsApi.js';

const TABS = [
  { key: 'invoice', label: 'Invoice', Form: InvoiceSettingsForm },
  { key: 'tax', label: 'Tax & GST', Form: TaxSettingsForm },
  { key: 'jewellery', label: 'Jewellery', Form: JewellerySettingsForm },
  { key: 'barcode', label: 'Barcode labels', Form: BarcodeSettingsForm },
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
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={current.key} onChange={(e, tab) => setParams({ tab }, { replace: true })} variant="scrollable" allowScrollButtonsMobile>
          {TABS.map((t) => (
            <Tab key={t.key} value={t.key} label={t.label} sx={{ minHeight: 44 }} />
          ))}
        </Tabs>
      </Box>
      {isLoading ? (
        <LoadingState label="Loading settings" />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <Box sx={{ maxWidth: 880 }}>
          <current.Form key={current.key} value={data[current.key]} readOnly={!canEdit} />
        </Box>
      )}
    </>
  );
}
