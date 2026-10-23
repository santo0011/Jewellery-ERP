import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { Box, Button, FormControlLabel, Grid, IconButton, InputAdornment, MenuItem, Stack, Switch, TextField, Tooltip, Typography } from '@mui/material';
import { toPaise, TRIAL_BRANCH_LIMIT } from '@jerp/shared';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import FormDrawer from '../../components/FormDrawer.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import { getErrorMessage } from '../../utils/errors.js';
import { PlanCard } from '../billing/billingUi.jsx';
import { useCreatePlanMutation, useDeletePlanMutation, usePlansQuery, useUpdatePlanMutation } from './platformApi.js';
import { t } from '../../i18n/index.js';

const blank = { name: '', description: '', price: '', durationMonths: 1, users: '', branches: '', products: '', features: '', isActive: true, isDefault: false, isPopular: false, sortOrder: '0' };
const toForm = (p) => ({
  name: p.name,
  description: p.description ?? '',
  price: String(p.pricePaise / 100),
  durationMonths: p.durationMonths,
  users: p.limits?.users ?? '',
  branches: p.limits?.branches ?? '',
  products: p.limits?.products ?? '',
  features: (p.features ?? []).join('\n'),
  isActive: p.isActive,
  isDefault: p.isDefault,
  isPopular: p.isPopular,
  sortOrder: String(p.sortOrder ?? 0),
});
const limitOf = (v) => (v === '' || v == null ? null : Number(v));

function PlanDrawer({ open, plan, onClose }) {
  const [create, createState] = useCreatePlanMutation();
  const [update, updateState] = useUpdatePlanMutation();
  const [f, setF] = useState(blank);
  const [errors, setErrors] = useState({});
  useEffect(() => {
    if (open) {
      setF(plan ? toForm(plan) : blank);
      setErrors({});
    }
  }, [open, plan]);
  const set = (k, digits) => (e) => setF((x) => ({ ...x, [k]: digits ? e.target.value.replace(/[^\d.]/g, '') : e.target.value }));
  const flag = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.checked }));

  const submit = async (e) => {
    e?.preventDefault?.();
    let pricePaise = null;
    try {
      pricePaise = f.price === '' ? null : toPaise(f.price);
    } catch {
      pricePaise = null;
    }
    const errs = {};
    if (f.name.trim().length < 2) errs.name = t('Enter the plan name');
    if (pricePaise == null) errs.price = t('Enter the price (0 for free)');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const body = {
      name: f.name.trim(),
      description: f.description.trim() || null,
      pricePaise,
      durationMonths: Number(f.durationMonths),
      limits: { users: limitOf(f.users), branches: limitOf(f.branches), products: limitOf(f.products) },
      features: f.features.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 12),
      isActive: f.isActive,
      isDefault: f.isDefault,
      isPopular: f.isPopular,
      sortOrder: Number(f.sortOrder || 0),
    };
    try {
      await (plan ? update({ id: plan.id, ...body }) : create(body)).unwrap();
      toast.success(plan ? t('Plan updated') : t('{{name}} plan created', { name: body.name }));
      onClose();
    } catch (err) {
      const d = err?.data?.error?.details;
      if (d?.length) setErrors(Object.fromEntries(d.map((x) => [x.path.split('.').pop(), t(x.message)])));
      else toast.error(getErrorMessage(err));
    }
  };

  return (
    <FormDrawer open={open} title={plan ? t('Edit {{name}}', { name: plan.name }) : t('New plan')} subtitle={t('Price, how long it lasts and limits. Free days are set on each organisation.')} onClose={onClose} onSubmit={submit} submitting={createState.isLoading || updateState.isLoading} submitLabel={plan ? t('Save plan') : t('Create plan')} width={520}>
      <Grid container spacing={2}>
        <Grid size={12}>
          <TextField label={t('Plan name')} value={f.name} onChange={set('name')} error={Boolean(errors.name)} helperText={errors.name} autoFocus />
        </Grid>
        <Grid size={12}>
          <TextField label={t('Short description (optional)')} value={f.description} onChange={set('description')} slotProps={{ htmlInput: { maxLength: 200 } }} />
        </Grid>
        <Grid size={6}>
          <TextField label={t('Price')} value={f.price} onChange={set('price', true)} error={Boolean(errors.price)} helperText={errors.price ?? t('0 = free plan')} slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }} />
        </Grid>
        <Grid size={6}>
          <TextField select label={t('For')} value={f.durationMonths} onChange={set('durationMonths')}>
            {[1, 3, 6, 12, 24].map((m) => (
              <MenuItem key={m} value={m}>
                {m === 12 ? t('1 year') : m === 24 ? t('2 years') : (m > 1 ? t('{{m}} months', { m }) : t('{{m}} month', { m }))}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={6}>
          <TextField label={t('Display order')} value={f.sortOrder} onChange={set('sortOrder', true)} helperText={t('Lower shows first')} />
        </Grid>

        <Grid size={12}>
          <Typography variant="overline" color="textSecondary">
            {t('Limits — leave blank for unlimited')}
          </Typography>
          <Typography variant="caption" color="textSecondary" component="div">
            {t('An organisation on this plan can add branches and users up to these limits. During the free trial it gets {{TRIAL_BRANCH_LIMIT}} branches, whatever the plan.', { TRIAL_BRANCH_LIMIT })}
          </Typography>
        </Grid>
        {[
          ['users', t('User limit'), t('Active users')],
          ['branches', t('Branch limit'), t('Incl. head office')],
          ['products', t('Product limit'), t('Pieces in stock')],
        ].map(([k, label, hint]) => (
          <Grid key={k} size={{ xs: 12, sm: 4 }}>
            <TextField label={label} value={f[k]} onChange={set(k, true)} placeholder={t('Unlimited')} helperText={hint} />
          </Grid>
        ))}
        <Grid size={12}>
          <TextField label={t('Features (one per line)')} value={f.features} onChange={set('features')} multiline minRows={3} helperText={t('Shown as ticks on the pricing card')} />
        </Grid>
        <Grid size={12}>
          <Stack>
            <FormControlLabel control={<Switch checked={f.isActive} onChange={flag('isActive')} />} label={t('Offered — organisations can buy it')} />
            <FormControlLabel control={<Switch checked={f.isPopular} onChange={flag('isPopular')} />} label={t('Highlight as “Most popular”')} />
            <FormControlLabel control={<Switch checked={f.isDefault} onChange={flag('isDefault')} />} label={t('New organisations use this plan during their free days')} />
          </Stack>
        </Grid>
      </Grid>
    </FormDrawer>
  );
}

export default function PlansPage() {
  const { data, isLoading, error, refetch } = usePlansQuery();
  const [editing, setEditing] = useState(null); // null | 'new' | plan
  const [toDelete, setToDelete] = useState(null);
  const [removePlan, { isLoading: deleting }] = useDeletePlanMutation();
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const doDelete = async () => {
    try {
      await removePlan(toDelete.id).unwrap();
      toast.success(t('{{name}} plan deleted', { name: toDelete.name }));
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
    setToDelete(null);
  };
  const whyNot = (p) => (p.canDelete ? t('Delete plan') : p.isDefault && !p.organisations ? t('Default plan for new organisations — make another plan the default first') : t('Already taken by an organisation, so it cannot be deleted. Turn off “Offered” to hide it.'));

  return (
    <>
      <PageHeader
        title={t('Plans')}
        subtitle={t('What organisations can subscribe to: price, period and limits.')}
        actions={
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setEditing('new')}>
            {t('New plan')}
          </Button>
        }
      />
      <Grid container spacing={2.5}>
        {data.map((p) => (
          <Grid key={p.id} size={{ xs: 12, sm: 6, lg: 4, xl: 3 }}>
            <PlanCard
              plan={p}
              muted={!p.isActive}
              action={
                <Stack direction="row" spacing={1}>
                  <Button fullWidth variant="outlined" startIcon={<EditOutlinedIcon />} onClick={() => setEditing(p)}>
                    {t('Edit plan')}
                  </Button>
                  <Tooltip title={whyNot(p)}>
                    <span>
                      <IconButton color="error" disabled={!p.canDelete} onClick={() => setToDelete(p)} aria-label={t('Delete {{name}}', { name: p.name })} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, height: '100%' }}>
                        <DeleteOutlineRoundedIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
              }
              footer={
                <Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <Typography variant="caption" color="textSecondary">
                    {(p.organisations === 1 ? (p.isDefault ? (!p.isActive ? t('{{organisations}} organisation · default for new · not offered', { organisations: p.organisations }) : t('{{organisations}} organisation · default for new', { organisations: p.organisations })) : (!p.isActive ? t('{{organisations}} organisation · not offered', { organisations: p.organisations }) : t('{{organisations}} organisation', { organisations: p.organisations }))) : (p.isDefault ? (!p.isActive ? t('{{organisations}} organisations · default for new · not offered', { organisations: p.organisations }) : t('{{organisations}} organisations · default for new', { organisations: p.organisations })) : (!p.isActive ? t('{{organisations}} organisations · not offered', { organisations: p.organisations }) : t('{{organisations}} organisations', { organisations: p.organisations }))))}
                  </Typography>
                </Box>
              }
            />
          </Grid>
        ))}
      </Grid>
      <ConfirmDialog
        open={Boolean(toDelete)}
        title={t('Delete {{name}} plan?', { name: toDelete?.name })}
        message={t('No organisation has taken this plan, so it will be removed completely. This cannot be undone.')}
        confirmLabel={t('Delete plan')}
        danger
        loading={deleting}
        onConfirm={doDelete}
        onClose={() => setToDelete(null)}
      />
      <PlanDrawer open={Boolean(editing)} plan={editing && editing !== 'new' ? editing : null} onClose={() => setEditing(null)} />
    </>
  );
}
