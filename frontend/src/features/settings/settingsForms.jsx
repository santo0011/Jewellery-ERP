import { Box, Checkbox, FormControlLabel, FormHelperText, Grid, InputAdornment, Stack, Typography } from '@mui/material';
import { fromBps, fromPaise, PURITIES, toBps, toPaise } from '@jerp/shared';
import { Controller, useWatch } from 'react-hook-form';
import RHFSelect from '../../components/form/RHFSelect.jsx';
import RHFSwitch from '../../components/form/RHFSwitch.jsx';
import RHFTextField from '../../components/form/RHFTextField.jsx';
import SettingsSectionForm from './SettingsSectionForm.jsx';

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
      title="Invoice"
      description="Numbering, print format and what appears on customer invoices."
      value={value}
      readOnly={readOnly}
      toForm={(v) => ({ ...v, terms: v.terms ?? '', footerNote: v.footerNote ?? '', copies: String(v.copies) })}
      fromForm={(v) => ({ ...v, copies: toInt(v.copies) })}
    >
      {({ control }) => (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <RHFTextField control={control} name="invoicePrefix" label="Invoice prefix" transform={upper} helperText="e.g. INV/HO/26-27/0001" disabled={readOnly} />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <RHFTextField control={control} name="estimatePrefix" label="Estimate prefix" transform={upper} disabled={readOnly} />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <RHFSelect
              control={control}
              name="copies"
              label="Copies to print"
              options={['1', '2', '3'].map((n) => ({ value: n, label: n === '1' ? 'Original only' : `${n} copies` }))}
              disabled={readOnly}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <RHFSelect
              control={control}
              name="defaultFormat"
              label="Default print format"
              options={[
                { value: 'a4', label: 'A4 tax invoice' },
                { value: 'thermal80', label: '80 mm thermal receipt' },
              ]}
              disabled={readOnly}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <RHFTextField control={control} name="signatoryLabel" label="Signatory label" disabled={readOnly} />
          </Grid>
          <SwitchRow control={control} name="showHsn" label="Show HSN codes" disabled={readOnly} />
          <SwitchRow control={control} name="showHuid" label="Show HUID for hallmarked items" disabled={readOnly} />
          <SwitchRow control={control} name="showWeightBreakup" label="Show weight break-up" description="Gross, stone and net weight per item" disabled={readOnly} />
          <SwitchRow control={control} name="showRateTable" label="Show today's metal rates" description="Rate used for each purity, printed below the items" disabled={readOnly} />
          <Grid size={12}>
            <RHFTextField control={control} name="terms" label="Terms & conditions" multiline minRows={3} disabled={readOnly} />
          </Grid>
          <Grid size={12}>
            <RHFTextField control={control} name="footerNote" label="Footer note" disabled={readOnly} />
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
      title="Tax & GST"
      description="GST rates and HSN codes used when invoices are calculated."
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
      <SwitchRow control={control} name="gstEnabled" label="Charge GST" description="Turn off only if your business is not GST-registered" disabled={readOnly} />
      <NumberField control={control} name="jewelleryGstBps" label="GST on jewellery" unit="%" helperText="3% for gold, silver and diamond jewellery" disabled={readOnly || !gstEnabled} />
      <SwitchRow control={control} name="separateMakingGst" label="Separate GST rate on making charges" description="Use when making charges are billed as job work" disabled={readOnly || !gstEnabled} />
      {separate && <NumberField control={control} name="makingGstBps" label="GST on making charges" unit="%" disabled={readOnly || !gstEnabled} />}
      <Grid size={12}>
        <Typography variant="overline" color="textSecondary">
          HSN codes
        </Typography>
      </Grid>
      <NumberField control={control} name="hsnJewellery" label="Jewellery" sm={4} disabled={readOnly} />
      <NumberField control={control} name="hsnBullion" label="Gold bullion" sm={4} disabled={readOnly} />
      <NumberField control={control} name="hsnSilverArticles" label="Silver articles" sm={4} disabled={readOnly} />
      <Grid size={{ xs: 12, sm: 6 }}>
        <RHFSelect
          control={control}
          name="roundOff"
          label="Invoice round-off"
          options={[
            { value: 'nearest_rupee', label: 'Nearest ₹1' },
            { value: 'nearest_ten', label: 'Nearest ₹10' },
            { value: 'none', label: 'No rounding' },
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
          {fieldState.error && <FormHelperText error>{fieldState.error.message}</FormHelperText>}
        </Box>
      )}
    />
  );
}

export function JewellerySettingsForm({ value, readOnly }) {
  return (
    <SettingsSectionForm
      section="jewellery"
      title="Jewellery rules"
      description="Purities you trade in, default pricing behaviour and compliance thresholds."
      value={value}
      readOnly={readOnly}
      toForm={(v) => ({ ...v, panRequiredAbovePaise: String(fromPaise(v.panRequiredAbovePaise)), cashLimitPaise: String(fromPaise(v.cashLimitPaise)) })}
      fromForm={(v) => ({ ...v, panRequiredAbovePaise: strict(toPaise)(v.panRequiredAbovePaise), cashLimitPaise: strict(toPaise)(v.cashLimitPaise) })}
    >
      {({ control }) => (
        <Grid container spacing={2}>
          <Grid size={12}>
            <Stack spacing={1.5}>
              <PurityChecklist control={control} metal="gold" label="Gold" disabled={readOnly} />
              <PurityChecklist control={control} metal="silver" label="Silver" disabled={readOnly} />
              <PurityChecklist control={control} metal="platinum" label="Platinum" disabled={readOnly} />
            </Stack>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <RHFSelect
              control={control}
              name="defaultWastageMode"
              label="Default wastage"
              options={[
                { value: 'percent', label: 'Percentage of net weight' },
                { value: 'weight', label: 'Fixed weight (grams)' },
                { value: 'none', label: 'No wastage' },
              ]}
              disabled={readOnly}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <RHFSelect
              control={control}
              name="defaultMakingChargeType"
              label="Default making charge"
              options={[
                { value: 'per_gram', label: 'Per gram' },
                { value: 'percent', label: 'Percentage of metal value' },
                { value: 'fixed', label: 'Fixed per piece' },
              ]}
              disabled={readOnly}
            />
          </Grid>
          <SwitchRow control={control} name="huidMandatory" label="HUID required for hallmarked gold" description="Gold items cannot be sold without a 6-character HUID" disabled={readOnly} />
          <SwitchRow control={control} name="allowNegativeStock" label="Allow negative stock" description="Not recommended. Sales will be blocked when stock is insufficient if off." disabled={readOnly} />
          <Grid size={12}>
            <Typography variant="overline" color="textSecondary">
              Compliance
            </Typography>
          </Grid>
          <NumberField control={control} name="panRequiredAbovePaise" label="PAN required for bills above" prefix="₹" helperText="Income-tax rules require PAN for jewellery purchases above ₹2,00,000" disabled={readOnly} />
          <NumberField control={control} name="cashLimitPaise" label="Maximum cash per transaction" prefix="₹" helperText="Section 269ST prohibits receiving ₹2,00,000 or more in cash" disabled={readOnly} />
          <Grid size={{ xs: 12, sm: 6 }}>
            <RHFSelect
              control={control}
              name="cashLimitAction"
              label="When cash limit is exceeded"
              options={[
                { value: 'block', label: 'Block the payment' },
                { value: 'warn', label: 'Warn and allow' },
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
      title="Barcode labels"
      description="Label size and content for jewellery tags."
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
              label="Code type"
              options={[
                { value: 'code128', label: 'Barcode (Code 128)' },
                { value: 'qr', label: 'QR code' },
              ]}
              disabled={readOnly}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <RHFTextField control={control} name="skuPrefix" label="SKU prefix" transform={upper} helperText="New SKUs look like JW000123" disabled={readOnly} />
          </Grid>
          <NumberField control={control} name="labelWidthMm" label="Label width" unit="mm" disabled={readOnly} />
          <NumberField control={control} name="labelHeightMm" label="Label height" unit="mm" disabled={readOnly} />
          <Grid size={12}>
            <Typography variant="overline" color="textSecondary">
              Printed on the label
            </Typography>
          </Grid>
          <SwitchRow control={control} name="showName" label="Product name" disabled={readOnly} />
          <SwitchRow control={control} name="showWeight" label="Gross and net weight" disabled={readOnly} />
          <SwitchRow control={control} name="showPurity" label="Purity" disabled={readOnly} />
          <SwitchRow control={control} name="showPrice" label="Price" description="Usually off, because jewellery price changes with the daily gold rate" disabled={readOnly} />
        </Grid>
      )}
    </SettingsSectionForm>
  );
}

export function ApprovalSettingsForm({ value, readOnly }) {
  return (
    <SettingsSectionForm section="approvals" title="Approvals" description="Choose which actions need a second person to approve before they take effect." value={value} readOnly={readOnly}>
      {({ control }) => (
        <Grid container spacing={2}>
          <SwitchRow
            control={control}
            name="stockAdjustments"
            label="Stock adjustments need approval"
            description="Write-offs and metal corrections wait in Approvals until someone with approval rights posts them. Recommended."
            disabled={readOnly}
          />
        </Grid>
      )}
    </SettingsSectionForm>
  );
}
