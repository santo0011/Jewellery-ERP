import { Box } from '@mui/material';
import { Navigate } from 'react-router';
import PageHeader from '../../components/PageHeader.jsx';
import { useSession } from '../../hooks/usePermission.js';
import { BranchPrintSettings } from './PrintSettingsForm.jsx';
import { t } from '../../i18n/index.js';

/** A branch's own Print settings: how invoices billed at this branch print (branch users have no Business settings). */
export default function PrintSettingsPage() {
  const { data: session } = useSession();
  // The organisation (all branches) sets its print design under Business settings; this page is for branch logins.
  if (session?.user?.allBranches) return <Navigate to="/settings/business?tab=print" replace />;
  return (
    <>
      <PageHeader title={t('Print settings')} subtitle={t('Choose the paper and design your branch\'s invoices print with.')} />
      <Box sx={{ maxWidth: 1280 }}>
        <BranchPrintSettings />
      </Box>
    </>
  );
}
