import { Box } from '@mui/material';
import PageHeader from '../../components/PageHeader.jsx';
import { BranchPrintSettings } from './PrintSettingsForm.jsx';
import { t } from '../../i18n/index.js';

/** A branch's own Print settings: how invoices billed at this branch print (branch users have no Business settings). */
export default function PrintSettingsPage() {
  return (
    <>
      <PageHeader title={t('Print settings')} subtitle={t('Choose the paper and design your branch\'s invoices print with.')} />
      <Box sx={{ maxWidth: 1280 }}>
        <BranchPrintSettings />
      </Box>
    </>
  );
}
