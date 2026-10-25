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
import { t } from '../../i18n/index.js';

const TABS = [
  { key: 'invoice', label: t('Invoice'), Form: InvoiceSettingsForm },
  { key: 'print', label: t('Print'), Form: PrintSettingsForm, wide: true },
  { key: 'tax', label: t('Tax & GST'), short: t('Tax'), Form: TaxSettingsForm },
  { key: 'jewellery', label: t('Jewellery'), Form: JewellerySettingsForm },
  { key: 'barcode', label: t('Barcode labels'), short: t('Barcode'), Form: BarcodeSettingsForm },
  { key: 'approvals', label: t('Approvals'), Form: ApprovalSettingsForm },
];

export default function BusinessSettingsPage() {
  const [params, setParams] = useSearchParams();
  const canEdit = usePermission('settings.edit');
  const { data, isLoading, error, refetch } = useSettingsQuery();
  const current = TABS.find((tab) => tab.key === params.get('tab')) ?? TABS[0];

  return (
    <>
      <PageHeader
        title={t('Business settings')}
        subtitle={data?.updatedAt ? t('Last changed {{updatedAt}}', { updatedAt: formatDateTime(data.updatedAt) }) : t('Defaults suited to Indian jewellers. Adjust them to match how you work.')}
        breadcrumbs={[{ label: t('Settings') }, { label: t('Business settings') }]}
      />
      <ViewTabs value={current.key} onChange={(tab) => setParams({ tab }, { replace: true })} items={TABS.map((tab) => ({ value: tab.key, label: tab.label, short: tab.short }))} sx={{ mb: 3 }} />
      {isLoading ? (
        <LoadingState label={t('Loading settings')} />
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
