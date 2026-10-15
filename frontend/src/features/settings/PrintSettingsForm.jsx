import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import { Box, ButtonBase, Chip, FormControlLabel, Grid, Radio, RadioGroup, Stack, Typography } from '@mui/material';
import { PRINT_DESIGNS } from '@jerp/shared';
import { useMemo } from 'react';
import { useController } from 'react-hook-form';
import { useOrganisationLogo } from '../../hooks/useOrganisationLogo.js';
import { usePermission, useSession } from '../../hooks/usePermission.js';
import { PaperPreview } from '../print/PrintSheet.jsx';
import { DEFAULT_LAYOUT, designsFor, layoutLabel, PRINT_SIZES } from '../print/printLayouts.js';
import { sampleInvoice } from '../print/sampleInvoice.js';
import SettingsSectionForm from './SettingsSectionForm.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import { useBranchPrintQuery, useSettingsQuery, useUpdateBranchPrintMutation } from './settingsApi.js';


/** A selectable card: a gold outline and tick when chosen. */
function ChoiceCard({ selected, onClick, disabled, children }) {
  return (
    <ButtonBase
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      sx={{
        position: 'relative',
        display: 'block',
        width: '100%',
        height: '100%',
        textAlign: 'left',
        borderRadius: 2,
        border: '1.5px solid',
        borderColor: selected ? 'var(--brand)' : 'divider',
        bgcolor: selected ? 'rgba(var(--brand-rgb), 0.07)' : 'background.paper',
        boxShadow: selected ? '0 0 0 3px rgba(var(--brand-rgb), 0.16)' : 'none',
        transition: 'border-color 150ms, box-shadow 150ms, background-color 150ms',
        '&:hover': { borderColor: disabled ? 'divider' : 'var(--brand)' },
        overflow: 'hidden',
      }}
    >
      {selected && <CheckCircleRoundedIcon sx={{ position: 'absolute', top: 8, right: 8, fontSize: 20, color: 'var(--brand-strong)', zIndex: 1 }} />}
      {children}
    </ButtonBase>
  );
}

function SizeCard({ size, selected, onClick, disabled }) {
  const paper = PRINT_SIZES[size];
  const Icon = size === 'a4' ? DescriptionOutlinedIcon : ReceiptLongOutlinedIcon;
  return (
    <ChoiceCard selected={selected} onClick={onClick} disabled={disabled}>
      <Stack direction="row" spacing={1.5} sx={{ p: 1.75, alignItems: 'center' }}>
        <Box sx={{ width: 40, height: 40, borderRadius: 1.5, display: 'grid', placeItems: 'center', bgcolor: 'rgba(var(--brand-rgb), 0.12)', color: 'var(--brand-strong)', flexShrink: 0 }}>
          <Icon />
        </Box>
        <Box sx={{ minWidth: 0, pr: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {paper.label}
          </Typography>
          <Typography variant="caption" color="textSecondary">
            {paper.caption}
          </Typography>
        </Box>
      </Stack>
    </ChoiceCard>
  );
}

function DesignCard({ design, layout, sale, logo, selected, onClick, disabled }) {
  return (
    <ChoiceCard selected={selected} onClick={onClick} disabled={disabled}>
      {/* The top of the real design, small. */}
      <Box sx={{ height: 132, overflow: 'hidden', bgcolor: '#EEEBE4', px: 1.5, pt: 1.5, pointerEvents: 'none' }}>
        <PaperPreview sale={sale} layout={{ ...layout, design: design.key }} logo={logo} />
      </Box>
      <Box sx={{ p: 1.5, borderTop: 1, borderColor: 'divider' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {design.label}
        </Typography>
        <Typography variant="caption" color="textSecondary" sx={{ display: 'block', lineHeight: 1.4 }}>
          {design.description}
        </Typography>
      </Box>
    </ChoiceCard>
  );
}

/**
 * Paper size and design cards beside a live preview of a sample bill. Controlled: `choice` is { size, design },
 * `onChange` gets the new one (a new size starts on its first design).
 */
function PrintChooser({ choice, onChange, disabled, title, invoice }) {
  const { data: session } = useSession();
  // The preview follows Invoice settings: passed in for a branch (it cannot read the organisation's settings).
  const { data: settings } = useSettingsQuery(undefined, { skip: Boolean(invoice) });
  const logo = useOrganisationLogo();
  const sale = useMemo(() => sampleInvoice(session?.organisation), [session?.organisation]);
  const layout = { ...DEFAULT_LAYOUT, ...(invoice ?? settings?.invoice), ...choice, copies: 1 };
  const choose = (next) => onChange(PRINT_DESIGNS[next.size].includes(next.design) ? next : { ...next, design: PRINT_DESIGNS[next.size][0] });

  return (
    <Grid container spacing={3}>
      <Grid size={{ xs: 12, lg: 6 }}>
        <Stack spacing={3} sx={{ opacity: disabled ? 0.55 : 1, transition: 'opacity 150ms' }}>
          <Box>
            <Typography variant="overline" color="textSecondary">
              Paper size
            </Typography>
            <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
              {Object.keys(PRINT_SIZES).map((key) => (
                <Grid key={key} size={{ xs: 12, sm: 4, lg: 12, xl: 4 }}>
                  <SizeCard size={key} selected={choice.size === key} disabled={disabled} onClick={() => choose({ size: key, design: choice.design })} />
                </Grid>
              ))}
            </Grid>
          </Box>
          <Box>
            <Typography variant="overline" color="textSecondary">
              Design
            </Typography>
            <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
              {designsFor(choice.size).map((d) => (
                <Grid key={d.key} size={{ xs: 12, sm: 6, md: 4, lg: 6 }}>
                  <DesignCard design={d} layout={layout} sale={sale} logo={logo} selected={choice.design === d.key} disabled={disabled} onClick={() => choose({ size: choice.size, design: d.key })} />
                </Grid>
              ))}
            </Grid>
          </Box>
        </Stack>
      </Grid>
      <Grid size={{ xs: 12, lg: 6 }}>
        <Box sx={{ position: { lg: 'sticky' }, top: { lg: 88 } }}>
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="overline" color="textSecondary">
              Preview{title ? ` · ${title}` : ''}
            </Typography>
            <Chip size="small" label={layoutLabel(choice)} sx={{ fontWeight: 600 }} />
          </Stack>
          <Box sx={{ bgcolor: '#E9E6DF', borderRadius: 2, p: { xs: 1.5, sm: 2.5 }, maxHeight: { lg: 'calc(100dvh - 180px)' }, overflowY: 'auto' }}>
            <PaperPreview sale={sale} layout={layout} logo={logo} />
          </Box>
          <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 1 }}>
            A sample bill. HSN, HUID, weight break-up, rates, terms and footer follow the Invoice tab.
          </Typography>
        </Box>
      </Grid>
    </Grid>
  );
}

function OrganisationChooser({ control, readOnly }) {
  const size = useController({ control, name: 'size' }).field;
  const design = useController({ control, name: 'design' }).field;
  return (
    <PrintChooser
      choice={{ size: size.value, design: design.value }}
      disabled={readOnly}
      title="Organisation"
      onChange={(next) => {
        size.onChange(next.size);
        design.onChange(next.design);
      }}
    />
  );
}

/** Business settings → Print, for the organisation: its own size and design (also used by a branch that has not chosen). */
function OrganisationPrintForm({ value, readOnly }) {
  return (
    <SettingsSectionForm
      section="print"
      title="Print"
      description="The paper and design the organisation's invoices print with. Print on an invoice shows a preview first."
      value={value}
      readOnly={readOnly}
      // Only the default: the server keeps each branch's own choice (set from the branch).
      toForm={(v) => ({ size: v.size, design: v.design })}
    >
      {({ control }) => <OrganisationChooser control={control} readOnly={readOnly} />}
    </SettingsSectionForm>
  );
}

function BranchChooser({ control, readOnly, orgChoice, branchName, invoice }) {
  const mode = useController({ control, name: 'mode' }).field;
  const size = useController({ control, name: 'size' }).field;
  const design = useController({ control, name: 'design' }).field;
  return (
    <Stack spacing={2.5}>
      <RadioGroup
        value={mode.value}
        onChange={(e) => {
          mode.onChange(e.target.value);
          if (e.target.value === 'default') {
            size.onChange(orgChoice.size);
            design.onChange(orgChoice.design);
          }
        }}
      >
        <FormControlLabel value="default" control={<Radio size="small" />} disabled={readOnly} label={`Same as the organisation (${layoutLabel(orgChoice)})`} />
        <FormControlLabel value="own" control={<Radio size="small" />} disabled={readOnly} label="Choose a size and design for this branch" />
      </RadioGroup>
      <PrintChooser
        choice={{ size: size.value, design: design.value }}
        disabled={readOnly || mode.value === 'default'}
        title={branchName}
        invoice={invoice}
        onChange={(next) => {
          size.onChange(next.size);
          design.onChange(next.design);
        }}
      />
    </Stack>
  );
}

/**
 * One branch's print design, set by the branch itself: the organisation's, or its own size and design.
 */
function BranchPrintForm({ branch, value, readOnly, invoice }) {
  const [saveBranch] = useUpdateBranchPrintMutation();
  const orgChoice = { size: value.size, design: value.design };
  const own = value.branches?.find((b) => b.branchId === branch.id);
  // Stable between renders: the form resets whenever this changes.
  const formValue = useMemo(
    () => (own ? { mode: 'own', size: own.size, design: own.design } : { mode: 'default', size: value.size, design: value.design }),
    [own, value.size, value.design],
  );

  return (
    <SettingsSectionForm
      section="print"
      title={`Print · ${branch.name}`}
      description="How invoices billed at this branch print. Print on an invoice shows a preview first."
      value={formValue}
      readOnly={readOnly}
      save={async ({ mode, size, design }) => {
        await saveBranch({ branchId: branch.id, choice: mode === 'own' ? { size, design } : null }).unwrap();
      }}
    >
      {({ control }) => <BranchChooser control={control} readOnly={readOnly} orgChoice={orgChoice} branchName={branch.name} invoice={invoice} />}
    </SettingsSectionForm>
  );
}

/**
 * Business settings → Print. The organisation (users of all branches) sets only its own design here; a branch,
 * signed in to that branch, sets its own — nobody sets another branch's.
 */
export function PrintSettingsForm({ value }) {
  const canEditAll = usePermission('settings.edit');
  return <OrganisationPrintForm value={value} readOnly={!canEditAll} />;
}

/**
 * A branch's own Print settings page (Settings → Print settings, for people who work in particular branches): reads
 * only that branch's print setup from the server, never the organisation's settings.
 */
export function BranchPrintSettings() {
  const { data: session } = useSession();
  const canPrint = usePermission('sales.print');
  const branches = session?.branches ?? [];
  const branch = branches.find((b) => b.id === session?.activeBranchId) ?? branches[0];
  const { data, isLoading, error, refetch } = useBranchPrintQuery(branch?.id, { skip: !branch });
  const value = useMemo(
    () => data && { ...data.organisation, branches: data.choice ? [{ branchId: data.branch.id, ...data.choice }] : [] },
    [data],
  );

  if (!branch) return null;
  if (isLoading) return <LoadingState label="Loading print settings" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  return <BranchPrintForm branch={{ id: data.branch.id, name: data.branch.name }} value={value} invoice={data.invoice} readOnly={!canPrint} />;
}
