import { Grid, Stack } from '@mui/material';
import { formatWeight } from '@jerp/shared';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router';
import InfoCard from '../../components/InfoCard.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import RecordActions from '../../components/RecordActions.jsx';
import RecordHistory from '../../components/RecordHistory.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import StatusChip from '../../components/StatusChip.jsx';
import { usePermission } from '../../hooks/usePermission.js';
import { formatAddress } from '../customers/CustomerDetailPage.jsx';
import SupplierFormDrawer from './SupplierFormDrawer.jsx';
import { suppliesLabel } from './SuppliersPage.jsx';
import { useDeleteSupplierMutation, useSetSupplierStatusMutation, useSupplierQuery } from './supplierApi.js';
import { BalanceAmount } from '../../components/Amount.jsx';

const signed = (value, format, positive, negative) => (value ? `${format(Math.abs(value))} ${value > 0 ? positive : negative}` : 'Nil');

export default function SupplierDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const canEdit = usePermission('supplier.edit');
  const canDelete = usePermission('supplier.delete');
  const { data: s, isLoading, error, refetch } = useSupplierQuery(id);
  const [setStatus] = useSetSupplierStatusMutation();
  const [remove] = useDeleteSupplierMutation();

  if (isLoading) return <LoadingState label="Loading supplier" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const bank = s.bankDetails;

  return (
    <>
      <PageHeader
        back={{ to: '/suppliers', label: 'Suppliers' }}
        title={s.companyName}
        subtitle={
          <Stack component="span" direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <span>{s.code}</span>
            <StatusChip status={s.status} />
          </Stack>
        }
        breadcrumbs={[{ label: 'Suppliers', to: '/suppliers' }, { label: s.code }]}
        actions={
          <RecordActions
            name={s.companyName}
            status={s.status}
            canEdit={canEdit}
            canDelete={canDelete}
            onEdit={() => setEditing(true)}
            onStatus={async (status) => {
              await setStatus({ id, status }).unwrap();
              toast.success(status === 'active' ? 'Supplier activated' : 'Supplier deactivated');
            }}
            onDelete={async () => {
              await remove(id).unwrap();
              toast.success('Supplier deleted');
              navigate('/suppliers', { replace: true });
            }}
            deleteMessage="Suppliers linked to products cannot be deleted; deactivate them instead."
          />
        }
      />
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <InfoCard
            title="Contact"
            items={[
              { label: 'Contact person', value: s.contactPerson },
              { label: 'Mobile', value: s.mobile },
              { label: 'Alternate', value: s.alternateMobile },
              { label: 'Email', value: s.email },
              { label: 'Address', value: formatAddress(s.address) },
            ]}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <InfoCard
            title="Tax & terms"
            items={[
              { label: 'GSTIN', value: s.gstin },
              { label: 'PAN', value: s.pan },
              { label: 'Supplies', value: suppliesLabel(s.supplies) },
              { label: 'Payment terms', value: s.paymentTermsDays ? `${s.paymentTermsDays} days` : 'Immediate' },
            ]}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <InfoCard
            title="Bank details"
            items={[
              { label: 'Account name', value: bank.accountName },
              { label: 'Account number', value: bank.accountNumber },
              { label: 'IFSC', value: bank.ifsc },
              { label: 'Bank', value: [bank.bankName, bank.branchName].filter(Boolean).join(', ') },
              { label: 'UPI', value: bank.upiId },
            ]}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <InfoCard
            title="Opening balances"
            items={[
              { label: 'Amount', value: <BalanceAmount paise={s.openingBalancePaise} owedLabel="payable (due)" advanceLabel="receivable (advance paid)" /> },
              { label: 'Fine gold', value: signed(s.openingFineGoldMg, formatWeight, 'payable', 'receivable') },
              { label: 'Fine silver', value: signed(s.openingFineSilverMg, formatWeight, 'payable', 'receivable') },
              { label: 'Notes', value: s.notes },
            ]}
          />
        </Grid>
        <Grid size={12}>
          <RecordHistory recordId={id} />
        </Grid>
      </Grid>
      <SupplierFormDrawer open={editing} supplier={s} onClose={() => setEditing(false)} />
    </>
  );
}
