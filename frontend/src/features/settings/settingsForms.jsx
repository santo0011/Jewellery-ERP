import { Box, Checkbox, FormControlLabel, FormHelperText, Grid, InputAdornment, Stack, Typography } from '@mui/material';
import { fromBps, fromPaise, PURITIES, toBps, toPaise } from '@jerp/shared';
import { Controller, useWatch } from 'react-hook-form';
import RHFSelect from '../../components/form/RHFSelect.jsx';
import RHFSwitch from '../../components/form/RHFSwitch.jsx';
import RHFTextField from '../../components/form/RHFTextField.jsx';
import SettingsSectionForm from './SettingsSectionForm.jsx';
import { t } from '../../i18n/index.js';

const upper = (v) => v.toUpperCase();
const adornment = (text, position = 'end') => ({ input: { [`${position}Adornment`]: <InputAdornment position={position}>{text}</InputAdornment> }, htmlInput: { inputMode: 'decimal' } });
const toInt = (v) => {
  const n = Number(v);
  if (v === '' || !Number.isFinite(n)) throw new RangeError('Invalid number');
  return n;
};
const strict = (fn) => (v) => {
  const out = fn(v);
  if (out === null) throw new RangeError('Required');
  return out;
};

function NumberField({ control, name, label, helperText, unit, prefix, disabled, sm = 6 }) {
  return (
    <Grid size={{ xs: 12, sm }}>
      <RHFTextField control={control} name={name} label={label} helperText={helperText} disabled={disabled} slotProps={prefix ? adornment(prefix, 'start') : unit ? adornment(unit) : { htmlInput: { inputMode: 'numeric' } }} />
    </Grid>
  );
}

function SwitchRow({ control, name, label, description, disabled }) {
  return (
    <Grid size={12}>
      <RHFSwitch control={control} name={name} label={label} description={description} disabled={disabled} />
    </Grid>
  );
}

export function InvoiceSettingsForm({ value, readOnly }) {
  return (
    <SettingsSectionForm
      section="invoice"
      title={t('Invoice')}
      description={t('Numbering and what appears on customer invoices. The paper size and design are chosen under Print.')}
      value={value}
      readOnly={readOnly}
      toForm={(v) => ({ ...v, terms: v.terms ?? '', footerNote: v.footerNote ?? '', copies: String(v.copies) })}
      fromForm={(v) => ({ ...v, copies: toInt(v.copies) })}
    >
      {({ control }) => (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <RHFTextField control={control} name="invoicePrefix" label={t('Invoice prefix')} transform={upper} helperText={t('e.g. INV/HO/26-27/0001')} disabled={readOnly} />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <RHFTextField control={control} name="estimatePrefix" label={t('Estimate prefix')} transform={upper} disabled={readOnly} />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <RHFSelect
              control={control}
              name="copies"
              label={t('Copies to print')}
              options={['1', '2', '3'].map((n) => ({ value: n, label: n === '1' ? t('Original only') : t('{{n}} copies', { n }) }))}
              disabled={readOnly}
            />
          </Grid>
          <Grid size={12}>
            <RHFTextField control={control} name="signatoryLabel" label={t('Signatory label')} disabled={readOnly} />
          </Grid>
          <SwitchRow control={control} name="showHsn" label={t('Show HSN codes')} disabled={readOnly} />
          <SwitchRow control={control} name="showHuid" label={t('Show HUID for hallmarked items')} disabled={readOnly} />
          <SwitchRow control={control} name="showWeightBreakup" label={t('Show weight break-up')} description={t('Gross, stone and net weight per item')} disabled={readOnly} />
          <SwitchRow control={control} name="showRateTable" label={t('Show today\'s metal rates')} description={t('Rate used for each purity, printed below the items')} disabled={readOnly} />
          <Grid size={12}>
            <RHFTextField control={control} name="terms" label={t('Terms & conditions')} multiline minRows={3} disabled={readOnly} />
          </Grid>
          <Grid size={12}>
            <RHFTextField control={control} name="footerNote" label={t('Footer note')} disabled={readOnly} />
          </Grid>
        </Grid>
      )}
    </SettingsSectionForm>
  );
}

export function TaxSettingsForm({ value, readOnly }) {
  return (
    <SettingsSectionForm
      section="tax"
      title={t('Tax & GST')}
      description={t('GST rates and HSN codes used when invoices are calculated.')}
      value={value}
      readOnly={readOnly}
      toForm={(v) => ({ ...v, jewelleryGstBps: String(fromBps(v.jewelleryGstBps)), makingGstBps: String(fromBps(v.makingGstBps)) })}
      fromForm={(v) => ({ ...v, jewelleryGstBps: strict(toBps)(v.jewelleryGstBps), makingGstBps: strict(toBps)(v.makingGstBps) })}
    >
      {({ control }) => <TaxFields control={control} readOnly={readOnly} />}
    </SettingsSectionForm>
  );
}

function TaxFields({ control, readOnly }) {
  const gstEnabled = useWatch({ control, name: 'gstEnabled' });
  const separate = useWatch({ control, name: 'separateMakingGst' });
  return (
    <Grid container spacing={2}>
      <SwitchRow control={control} name="gstEnabled" label={t('Charge GST')} description={t('Turn off only if your business is not GST-registered')} disabled={readOnly} />
      <NumberField control={control} name="jewelleryGstBps" label={t('GST on jewellery')} unit="%" helperText={t('3% for gold, silver and diamond jewellery')} disabled={readOnly || !gstEnabled} />
      <SwitchRow control={control} name="separateMakingGst" label={t('Separate GST rate on making charges')} description={t('Use when making charges are billed as job work')} disabled={readOnly || !gstEnabled} />
      {separate && <NumberField control={control} name="makingGstBps" label={t('GST on making charges')} unit="%" disabled={readOnly || !gstEnabled} />}
      <Grid size={12}>
        <Typography variant="overline" color="textSecondary">
          {t('HSN codes')}
        </Typography>
      </Grid>
      <NumberField control={control} name="hsnJewellery" label={t('Jewellery')} sm={4} disabled={readOnly} />
      <NumberField control={control} name="hsnBullion" label={t('Gold bullion')} sm={4} disabled={readOnly} />
      <NumberField control={control} name="hsnSilverArticles" label={t('Silver articles')} sm={4} disabled={readOnly} />
      <Grid size={{ xs: 12, sm: 6 }}>
        <RHFSelect
          control={control}
          name="roundOff"
          label={t('Invoice round-off')}
          options={[
            { value: 'nearest_rupee', label: t('Nearest ₹1') },
            { value: 'nearest_ten', label: t('Nearest ₹10') },
            { value: 'none', label: t('No rounding') },
          ]}
          disabled={readOnly}
        />
      </Grid>
    </Grid>
  );
}

function PurityChecklist({ control, metal, label, disabled }) {
  return (
    <Controller
      name={`enabledPurities.${metal}`}
      control={control}
      render={({ field, fieldState }) => (
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
            {label}
          </Typography>
          <Stack direction="row" sx={{ flexWrap: 'wrap', columnGap: 2 }}>
            {PURITIES[metal].map((p) => (
              <FormControlLabel
                key={p.fineness}
                disabled={disabled}
                label={p.label}
                slotProps={{ typography: { variant: 'body2' } }}
                control={
                  <Checkbox
                    size="small"
                    checked={field.value?.includes(p.fineness) ?? false}
                    onChange={(e) => field.onChange(e.target.checked ? [...(field.value ?? []), p.fineness] : field.value.filter((f) => f !== p.fineness))}
                  />
                }
              />
            ))}
          </Stack>
          {fieldState.error && <FormHelperText error>{t(fieldState.error.message)}</FormHelperText>}
        </Box>
      )}
    />
  );
}

export function JewellerySettingsForm({ value, readOnly }) {
  return (
    <SettingsSectionForm
      section="jewellery"
      title={t('Jewellery rules')}
      description={t('Purities you trade in, default pricing behaviour and compliance thresholds.')}
      value={value}
      readOnly={readOnly}
      toForm={(v) => ({ ...v, panRequiredAbovePaise: String(fromPaise(v.panRequiredAbovePaise)), cashLimitPaise: String(fromPaise(v.cashLimitPaise)) })}
      fromForm={(v) => ({ ...v, panRequiredAbovePaise: strict(toPaise)(v.panRequiredAbovePaise), cashLimitPaise: strict(toPaise)(v.cashLimitPaise) })}
    >
      {({ control }) => (
        <Grid container spacing={2}>
          <Grid size={12}>
            <Stack spacing={1.5}>
              <PurityChecklist control={control} metal="gold" label={t('Gold')} disabled={readOnly} />
              <PurityChecklist control={control} metal="silver" label={t('Silver')} disabled={readOnly} />
              <PurityChecklist control={control} metal="platinum" label={t('Platinum')} disabled={readOnly} />
            </Stack>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <RHFSelect
              control={control}
              name="defaultWastageMode"
              label={t('Default wastage')}
              options={[
                { value: 'percent', label: t('Percentage of net weight') },
                { value: 'weight', label: t('Fixed weight (grams)') },
                { value: 'none', label: t('No wastage') },
              ]}
              disabled={readOnly}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <RHFSelect
              control={control}
              name="defaultMakingChargeType"
              label={t('Default making charge')}
              options={[
                { value: 'per_gram', label: t('Per gram') },
                { value: 'percent', label: t('Percentage of metal value') },
                { value: 'fixed', label: t('Fixed per piece') },
              ]}
              disabled={readOnly}
            />
          </Grid>
          <SwitchRow control={control} name="huidMandatory" label={t('HUID required for hallmarked gold')} description={t('Gold items cannot be sold without a 6-character HUID')} disabled={readOnly} />
          <SwitchRow control={control} name="allowNegativeStock" label={t('Allow negative stock')} description={t('Not recommended. Sales will be blocked when stock is insufficient if off.')} disabled={readOnly} />
          <Grid size={12}>
            <Typography variant="overline" color="textSecondary">
              {t('Compliance')}
            </Typography>
          </Grid>
          <NumberField control={control} name="panRequiredAbovePaise" label={t('PAN required for bills above')} prefix="₹" helperText={t('Income-tax rules require PAN for jewellery purchases above ₹2,00,000')} disabled={readOnly} />
          <NumberField control={control} name="cashLimitPaise" label={t('Maximum cash per transaction')} prefix="₹" helperText={t('Section 269ST prohibits receiving ₹2,00,000 or more in cash')} disabled={readOnly} />
          <Grid size={{ xs: 12, sm: 6 }}>
            <RHFSelect
              control={control}
              name="cashLimitAction"
              label={t('When cash limit is exceeded')}
              options={[
                { value: 'block', label: t('Block the payment') },
                { value: 'warn', label: t('Warn and allow') },
              ]}
              disabled={readOnly}
            />
          </Grid>
        </Grid>
      )}
    </SettingsSectionForm>
  );
}

export function BarcodeSettingsForm({ value, readOnly }) {
  return (
    <SettingsSectionForm
      section="barcode"
      title={t('Barcode labels')}
      description={t('Label size and content for jewellery tags.')}
      value={value}
      readOnly={readOnly}
      toForm={(v) => ({ ...v, labelWidthMm: String(v.labelWidthMm), labelHeightMm: String(v.labelHeightMm) })}
      fromForm={(v) => ({ ...v, labelWidthMm: toInt(v.labelWidthMm), labelHeightMm: toInt(v.labelHeightMm) })}
    >
      {({ control }) => (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <RHFSelect
              control={control}
              name="symbology"
              label={t('Code type')}
              options={[
                { value: 'code128', label: t('Barcode (Code 128)') },
                { value: 'qr', label: t('QR code') },
              ]}
              disabled={readOnly}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <RHFTextField control={control} name="skuPrefix" label={t('SKU prefix')} transform={upper} helperText={t('New SKUs look like JW000123')} disabled={readOnly} />
          </Grid>
          <NumberField control={control} name="labelWidthMm" label={t('Label width')} unit="mm" disabled={readOnly} />
          <NumberField control={control} name="labelHeightMm" label={t('Label height')} unit="mm" disabled={readOnly} />
          <Grid size={12}>
            <Typography variant="overline" color="textSecondary">
              {t('Printed on the label')}
            </Typography>
          </Grid>
          <SwitchRow control={control} name="showName" label={t('Product name')} disabled={readOnly} />
          <SwitchRow control={control} name="showWeight" label={t('Gross and net weight')} disabled={readOnly} />
          <SwitchRow control={control} name="showPurity" label={t('Purity')} disabled={readOnly} />
          <SwitchRow control={control} name="showPrice" label={t('Price')} description={t('Usually off, because jewellery price changes with the daily gold rate')} disabled={readOnly} />
        </Grid>
      )}
    </SettingsSectionForm>
  );
}

export function ApprovalSettingsForm({ value, readOnly }) {
  return (
    <SettingsSectionForm section="approvals" title={t('Approvals')} description={t('Choose which actions need a second person to approve before they take effect.')} value={value} readOnly={readOnly}>
      {({ control }) => (
        <Grid container spacing={2}>
          <SwitchRow
            control={control}
            name="stockAdjustments"
            label={t('Stock adjustments need approval')}
            description={t('Write-offs and metal corrections wait in Approvals until someone with approval rights posts them. Recommended.')}
            disabled={readOnly}
          />
        </Grid>
      )}
    </SettingsSectionForm>
  );
}
