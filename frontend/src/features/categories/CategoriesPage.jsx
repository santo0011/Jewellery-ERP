import { zodResolver } from '@hookform/resolvers/zod';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import DiamondOutlinedIcon from '@mui/icons-material/DiamondOutlined';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import RestoreRoundedIcon from '@mui/icons-material/RestoreRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import {
  Box,
  Button,
  ButtonBase,
  Card,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { METAL_OPTIONS } from '@jerp/shared';
import { categorySchema } from '@jerp/shared/schemas';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import RHFSelect from '../../components/form/RHFSelect.jsx';
import RHFTextField from '../../components/form/RHFTextField.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/StateViews.jsx';
import SummaryCards, { SummaryCard } from '../../components/SummaryCards.jsx';
import { usePermission } from '../../hooks/usePermission.js';
import { fonts } from '../../theme/tokens.js';
import { applyServerErrors, getErrorMessage } from '../../utils/errors.js';
import {
  buildCategoryTree,
  useAddDefaultCategoriesMutation,
  useCategoriesQuery,
  useCreateCategoryMutation,
  useDeleteCategoryMutation,
  useUpdateCategoryMutation,
} from './categoryApi.js';
import { t } from '../../i18n/index.js';

const formSchema = categorySchema.omit({ sortOrder: true }).extend({ sortOrder: z.string().regex(/^\d{0,4}$/, t('Whole number up to 9999')) });

/** Each metal gets its own accent so a category's default metal reads at a glance. */
const METAL_LOOK = {
  gold: { label: t('Gold'), tile: 'linear-gradient(135deg, #E9CF6E 0%, #C9A227 55%, #A8841B 100%)', ink: '#171717', chip: 'rgba(201, 162, 39, 0.14)', chipInk: '#7A5E0F' },
  silver: { label: t('Silver'), tile: 'linear-gradient(135deg, #EEF1F4 0%, #BFC6CE 55%, #8E98A3 100%)', ink: '#22272C', chip: 'rgba(142, 152, 163, 0.18)', chipInk: '#4C5560' },
  platinum: { label: t('Platinum'), tile: 'linear-gradient(135deg, #DCE3EA 0%, #9AA9B7 55%, #6E7F8D 100%)', ink: '#171717', chip: 'rgba(110, 127, 141, 0.16)', chipInk: '#3E4C58' },
};
const NO_METAL = { label: t('Any metal'), tile: 'linear-gradient(135deg, #F1EEE6 0%, #D9D4C7 100%)', ink: '#6B6760', chip: 'rgba(107, 103, 96, 0.10)', chipInk: '#6B6760' };
const lookOf = (metal) => METAL_LOOK[metal] ?? NO_METAL;

function CategoryDialog({ state, roots, onClose }) {
  const editing = Boolean(state?.category);
  const [create, createState] = useCreateCategoryMutation();
  const [update, updateState] = useUpdateCategoryMutation();
  const { control, handleSubmit, reset, setError } = useForm({ resolver: zodResolver(formSchema) });

  useEffect(() => {
    if (!state) return;
    const c = state.category;
    reset({
      name: c?.name ?? '',
      parentId: c ? (c.parentId ?? '') : (state.parentId ?? ''),
      defaultMetal: c?.defaultMetal ?? '',
      hsnCode: c?.hsnCode ?? '',
      sortOrder: String(c?.sortOrder ?? 0),
    });
  }, [state, reset]);

  const parentName = state?.parentId && roots.find((r) => r.id === state.parentId)?.name;

  const onSubmit = handleSubmit(async ({ sortOrder, ...values }) => {
    const payload = { ...values, sortOrder: Number(sortOrder || 0) };
    try {
      if (editing) await update({ id: state.category.id, ...payload }).unwrap();
      else await create(payload).unwrap();
      toast.success(editing ? t('Category updated') : t('Category created'));
      onClose();
    } catch (err) {
      if (!applyServerErrors(err, setError)) toast.error(getErrorMessage(err));
    }
  });

  return (
    <Dialog open={Boolean(state)} onClose={onClose} maxWidth="xs" fullWidth>
      <form noValidate onSubmit={onSubmit}>
        <DialogTitle sx={{ fontWeight: 600, pb: 0.5 }}>{editing ? t('Edit {{name}}', { name: state.category.name }) : parentName ? t('New subcategory in {{parentName}}', { parentName }) : t('New category')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 1.5 }}>
            {parentName ? t('For example "Ladies rings" inside Rings.') : t('Group your jewellery the way your counter staff think about it.')}
          </Typography>
          <Grid container spacing={2} sx={{ pt: 1 }}>
            <Grid size={12}>
              <RHFTextField control={control} name="name" label={t('Name')} autoFocus />
            </Grid>
            <Grid size={6}>
              <RHFSelect control={control} name="defaultMetal" label={t('Default metal')} options={METAL_OPTIONS} placeholder={t('Any')} />
            </Grid>
            <Grid size={6}>
              <RHFTextField control={control} name="hsnCode" label={t('HSN code')} helperText={t('Blank uses tax settings')} slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 8 } }} />
            </Grid>
            <Grid size={6}>
              <RHFTextField control={control} name="sortOrder" label={t('Sort order')} helperText={t('Lower shows first')} slotProps={{ htmlInput: { inputMode: 'numeric', 'data-number': true } }} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="secondary" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button type="submit" variant="contained" loading={createState.isLoading || updateState.isLoading}>
            {editing ? t('Save') : t('Create')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function ActionIcon({ title, onClick, label, danger, disabled, children }) {
  return (
    <Tooltip title={title}>
      <span>
        <IconButton size="small" onClick={onClick} disabled={disabled} aria-label={label} sx={{ width: 30, height: 30, color: danger ? 'error.main' : 'text.secondary', '&:hover': { color: danger ? 'error.dark' : 'primary.dark', bgcolor: danger ? 'rgba(155, 44, 44, 0.10)' : 'rgba(var(--brand-rgb), 0.10)' }, '&.Mui-disabled': { color: danger ? 'rgba(155, 44, 44, 0.35)' : undefined } }}>
          {children}
        </IconButton>
      </span>
    </Tooltip>
  );
}

const plural = (n, one, many) => t(n === 1 ? `{{n}} ${one}` : `{{n}} ${many}`, { n });

/** Edit / delete (and, for a category, add a subcategory) — a small rounded group of icon buttons. */
function RowActions({ category, sub, canCreate, canEdit, canDelete, onEdit, onAddChild, onDelete }) {
  const blocked = category.children?.length ? t('Remove its subcategories first') : category.productCount ? t('In use by products') : null;
  if (!canCreate && !canEdit && !canDelete) return null;
  return (
    <Stack direction="row" sx={{ flexShrink: 0, alignItems: 'center', p: 0.25, borderRadius: 2, border: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
      {canCreate && !sub && (
        <ActionIcon title={t('Add subcategory')} label={t('Add subcategory to {{name}}', { name: category.name })} onClick={onAddChild}>
          <AddRoundedIcon sx={{ fontSize: 18 }} />
        </ActionIcon>
      )}
      {canEdit && (
        <ActionIcon title={t('Edit')} label={t('Edit {{name}}', { name: category.name })} onClick={onEdit}>
          <EditOutlinedIcon sx={{ fontSize: 17 }} />
        </ActionIcon>
      )}
      {canDelete && (
        <ActionIcon title={blocked ?? t('Delete')} label={t('Delete {{name}}', { name: category.name })} onClick={onDelete} disabled={Boolean(blocked)} danger>
          <DeleteOutlineRoundedIcon sx={{ fontSize: 17 }} />
        </ActionIcon>
      )}
    </Stack>
  );
}

/** "Gold · HSN 7113 · 12 products" — the quiet line under a name. */
function MetaLine({ category, products }) {
  const look = lookOf(category.defaultMetal);
  return (
    <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', columnGap: 1, rowGap: 0.25, color: 'text.secondary', fontSize: '0.75rem' }}>
      <Stack direction="row" spacing={0.6} sx={{ alignItems: 'center' }}>
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', background: look.tile, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)' }} />
        <span>{look.label}</span>
      </Stack>
      <Box component="span" sx={{ opacity: 0.4 }}>•</Box>
      <span>{category.hsnCode ? t('HSN {{hsnCode}}', { hsnCode: category.hsnCode }) : t('HSN from tax settings')}</span>
      <Box component="span" sx={{ opacity: 0.4 }}>•</Box>
      <Box component="span" sx={{ fontWeight: 600, color: products ? 'text.primary' : 'text.secondary' }}>
        {plural(products, 'product', 'products')}
      </Box>
    </Stack>
  );
}

/** The pill that folds a category's subcategories open and shut. */
function SubToggle({ count, open, onClick, name }) {
  return (
    <ButtonBase
      onClick={onClick}
      aria-expanded={open}
      aria-label={(open ? t('Hide subcategories of {{name}}', { name }) : t('Show subcategories of {{name}}', { name }))}
      sx={{
        flexShrink: 0,
        gap: 0.5,
        pl: 1.25,
        pr: 0.75,
        py: 0.5,
        borderRadius: 999,
        border: 1,
        fontSize: '0.75rem',
        fontWeight: 700,
        transition: 'all 200ms ease',
        ...(open
          ? { borderColor: 'rgba(var(--brand-rgb), 0.45)', bgcolor: 'rgba(var(--brand-rgb), 0.12)', color: 'var(--brand-strong)' }
          : { borderColor: 'divider', bgcolor: 'background.paper', color: 'text.secondary', '&:hover': { borderColor: 'rgba(var(--brand-rgb), 0.45)', color: 'var(--brand-strong)' } }),
      }}
    >
      {plural(count, 'subcategory', 'subcategories')}
      <ExpandMoreRoundedIcon sx={{ fontSize: 18, transition: 'transform 240ms cubic-bezier(0.4, 0, 0.2, 1)', transform: open ? 'rotate(180deg)' : 'none' }} />
    </ButtonBase>
  );
}

/** A subcategory as a small tile inside its category's card. */
function SubTile({ category, actions }) {
  const look = lookOf(category.defaultMetal);
  return (
    <Stack
      direction="row"
      spacing={1.25}
      sx={{ alignItems: 'center', minWidth: 0, pl: 1.5, pr: 0.75, py: 1, borderRadius: 2.5, border: 1, borderColor: 'divider', bgcolor: 'background.paper', transition: 'border-color 160ms, box-shadow 160ms', '&:hover': { borderColor: 'rgba(var(--brand-rgb), 0.4)', boxShadow: '0 4px 14px -8px rgba(80, 64, 20, 0.35)' } }}
    >
      <Box sx={{ width: 6, alignSelf: 'stretch', borderRadius: 3, background: look.tile, flexShrink: 0 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
          {category.name}
        </Typography>
        <Typography variant="caption" color="textSecondary" noWrap sx={{ display: 'block' }}>
          {plural(category.productCount, 'product', 'products')}
          {category.hsnCode ? t(' · HSN {{hsnCode}}', { hsnCode: category.hsnCode }) : ''}
          {category.defaultMetal ? ` · ${look.label}` : ''}
        </Typography>
      </Box>
      {actions}
    </Stack>
  );
}

/**
 * Every category as a card: metal accent, initial tile, name and details, and its subcategories folded away inside
 * (closed by default; the pill opens them with a smooth slide). `expandAll` (a search) shows them all.
 */
function CategoryTable({ roots, expandAll, canCreate, canEdit, canDelete, onEdit, onAddChild, onDelete }) {
  const [open, setOpen] = useState(() => new Set());
  const isOpen = (id) => expandAll || open.has(id);
  const toggle = (id) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const can = { canCreate, canEdit, canDelete };
  const addTo = (root) => {
    // Open it, so the new subcategory shows once it is saved.
    setOpen((s) => new Set(s).add(root.id));
    onAddChild(root);
  };

  return (
    <Stack spacing={{ xs: 1.25, sm: 1.5 }}>
      {roots.map((root) => {
        const look = lookOf(root.defaultMetal);
        const opened = isOpen(root.id);
        const count = root.children.length;
        const total = root.productCount + root.children.reduce((n, c) => n + c.productCount, 0);
        return (
          <Card
            key={root.id}
            sx={{
              position: 'relative',
              overflow: 'hidden',
              transition: 'box-shadow 220ms ease, border-color 220ms ease',
              borderColor: opened && count ? 'rgba(var(--brand-rgb), 0.35)' : undefined,
              boxShadow: opened && count ? '0 12px 32px -18px rgba(80, 64, 20, 0.45)' : undefined,
              '&:hover': { boxShadow: '0 10px 28px -18px rgba(80, 64, 20, 0.4)' },
              '&::before': { content: '""', position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: look.tile },
            }}
          >
            <Box sx={{ display: 'flex', flexWrap: { xs: 'wrap', md: 'nowrap' }, alignItems: 'center', columnGap: 2, rowGap: 1, pl: { xs: 2, sm: 2.5 }, pr: { xs: 1.25, sm: 2 }, py: { xs: 1.5, sm: 1.75 } }}>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flex: 1, minWidth: 0, order: 1 }}>
                <Box
                  sx={{
                    width: { xs: 40, sm: 46 },
                    height: { xs: 40, sm: 46 },
                    borderRadius: 2.5,
                    flexShrink: 0,
                    display: 'grid',
                    placeItems: 'center',
                    background: look.tile,
                    color: look.ink,
                    fontFamily: fonts.display,
                    fontSize: { xs: 19, sm: 22 },
                    fontWeight: 700,
                    boxShadow: '0 6px 16px -8px rgba(23, 23, 23, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.45)',
                  }}
                >
                  {root.name.trim().charAt(0).toUpperCase()}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={0.6} sx={{ alignItems: 'center', minWidth: 0 }}>
                    <Typography noWrap sx={{ fontFamily: fonts.display, fontSize: { xs: 17, sm: 19 }, fontWeight: 700, lineHeight: 1.2 }}>
                      {root.name}
                    </Typography>
                    {root.isSystem && (
                      <Tooltip title={t('Standard category')}>
                        <VerifiedOutlinedIcon sx={{ fontSize: 16, color: 'primary.dark', flexShrink: 0 }} />
                      </Tooltip>
                    )}
                  </Stack>
                  <Box sx={{ mt: 0.4, display: { xs: 'none', md: 'block' } }}>
                    <MetaLine category={root} products={total} />
                  </Box>
                </Box>
              </Stack>
              {/* Phones: details and the subcategory pill on a second line; desktop: all on one. */}
              <Box sx={{ display: { xs: 'block', md: 'none' }, order: 3, flexBasis: '100%', pl: { xs: 6.5, sm: 7.25 } }}>
                <MetaLine category={root} products={total} />
              </Box>
              {count > 0 && (
                <Box sx={{ order: { xs: 4, md: 2 }, pl: { xs: 6.5, sm: 7.25, md: 0 } }}>
                  <SubToggle count={count} open={opened} onClick={() => toggle(root.id)} name={root.name} />
                </Box>
              )}
              <Box sx={{ order: { xs: 2, md: 3 } }}>
                <RowActions category={root} {...can} onEdit={() => onEdit(root)} onDelete={() => onDelete(root)} onAddChild={() => addTo(root)} />
              </Box>
            </Box>

            {count > 0 && (
              <Collapse in={opened} timeout={280} easing={{ enter: 'cubic-bezier(0.4, 0, 0.2, 1)', exit: 'cubic-bezier(0.4, 0, 0.6, 1)' }} unmountOnExit>
                <Box sx={{ borderTop: 1, borderColor: 'divider', bgcolor: 'rgba(var(--brand-rgb), 0.035)', px: { xs: 1.5, sm: 2.5 }, py: { xs: 1.5, sm: 2 } }}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 1 }}>
                    {root.children.map((child) => (
                      <SubTile
                        key={child.id}
                        category={child}
                        actions={<RowActions category={{ ...child, children: [] }} sub {...can} onEdit={() => onEdit(child)} onDelete={() => onDelete(child)} />}
                      />
                    ))}
                    {canCreate && (
                      <ButtonBase
                        onClick={() => addTo(root)}
                        sx={{ minHeight: 52, gap: 0.75, borderRadius: 2.5, border: '1px dashed', borderColor: 'rgba(var(--brand-rgb), 0.45)', color: 'var(--brand-strong)', fontSize: '0.8125rem', fontWeight: 700, transition: 'background-color 160ms', '&:hover': { bgcolor: 'rgba(var(--brand-rgb), 0.08)' } }}
                      >
                        <AddRoundedIcon sx={{ fontSize: 18 }} />
                        {t('Add subcategory')}
                      </ButtonBase>
                    )}
                  </Box>
                </Box>
              </Collapse>
            )}
          </Card>
        );
      })}
    </Stack>
  );
}

export default function CategoriesPage() {
  const canCreate = usePermission('category.create');
  const canEdit = usePermission('category.edit');
  const canDelete = usePermission('category.delete');
  const { data, isLoading, error, refetch } = useCategoriesQuery();
  const [addDefaults, { isLoading: seeding }] = useAddDefaultCategoriesMutation();
  const [remove, { isLoading: deleting }] = useDeleteCategoryMutation();
  const [dialog, setDialog] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [search, setSearch] = useState('');
  const tree = buildCategoryTree(data);

  // A search keeps a category when its own name or any subcategory's name matches (showing only those).
  const q = search.trim().toLowerCase();
  const shown = !q
    ? tree
    : tree
        .map((r) => (r.name.toLowerCase().includes(q) ? r : { ...r, children: r.children.filter((c) => c.name.toLowerCase().includes(q)) }))
        .filter((r) => r.name.toLowerCase().includes(q) || r.children.length);

  const subCount = tree.reduce((n, r) => n + r.children.length, 0);
  const productCount = (data ?? []).reduce((n, c) => n + (c.productCount ?? 0), 0);
  const unused = (data ?? []).filter((c) => !c.productCount).length;

  const seed = async () => {
    try {
      const res = await addDefaults().unwrap();
      toast.success(t(res.message));
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const confirmDelete = async () => {
    try {
      await remove(toDelete.id).unwrap();
      toast.success(t('Category deleted'));
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
    setToDelete(null);
  };

  return (
    <>
      <PageHeader
        title={t('Product categories')}
        subtitle={t('Organise jewellery into categories and subcategories.')}
        breadcrumbs={[{ label: t('Settings') }, { label: t('Product categories') }]}
        actions={
          canCreate && (
            <Stack direction="row" spacing={1}>
              {tree.length > 0 && (
                <Tooltip title={t('Bring back any standard category that was deleted')}>
                  <Button color="secondary" variant="outlined" startIcon={<RestoreRoundedIcon />} onClick={seed} loading={seeding}>
                    {t('Restore standard')}
                  </Button>
                </Tooltip>
              )}
              <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setDialog({})}>
                {t('New category')}
              </Button>
            </Stack>
          )
        }
      />
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !tree.length ? (
        <Card>
          <EmptyState
            title={t('No categories yet')}
            description={t('Start with the standard jewellery categories: rings, necklaces, bangles, chains and more.')}
            action={
              canCreate && (
                <Button variant="contained" onClick={seed} loading={seeding}>
                  {t('Add standard categories')}
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <>
          <SummaryCards>
            <SummaryCard icon={CategoryOutlinedIcon} label={t('Categories')} value={tree.length} caption={t('Top-level groups')} />
            <SummaryCard icon={AccountTreeOutlinedIcon} label={t('Subcategories')} value={subCount} caption={t('Inside the categories')} tone="blue" />
            <SummaryCard icon={DiamondOutlinedIcon} label={t('Products')} value={productCount} caption={t('Filed under a category')} tone="green" />
            <SummaryCard icon={CategoryOutlinedIcon} label={t('Not used yet')} value={unused} caption={unused ? t('No products in them') : t('Every category is in use')} tone={unused ? 'amber' : 'grey'} />
          </SummaryCards>

          <TextField
            size="small"
            placeholder={t('Search categories and subcategories')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ mb: 2, width: { xs: '100%', sm: 360 }, '& .MuiOutlinedInput-root': { bgcolor: 'background.paper' } }}
            slotProps={{ input: { startAdornment: (
              <InputAdornment position="start">
                <SearchRoundedIcon fontSize="small" />
              </InputAdornment>
            ) } }}
          />

          {shown.length ? (
            <CategoryTable
              roots={shown}
              expandAll={Boolean(q)}
              canCreate={canCreate}
              canEdit={canEdit}
              canDelete={canDelete}
              onEdit={(category) => setDialog({ category: tree.find((r) => r.id === category.id) ?? category })}
              onAddChild={(root) => setDialog({ parentId: root.id })}
              onDelete={(category) => setToDelete(category)}
            />
          ) : (
            <Card>
              <EmptyState title={t('Nothing matches')} description={t('No category or subcategory is called "{{search}}".', { search: search.trim() })} action={<Button onClick={() => setSearch('')}>{t('Clear search')}</Button>} />
            </Card>
          )}
        </>
      )}
      <CategoryDialog state={dialog} roots={tree} onClose={() => setDialog(null)} />
      <ConfirmDialog
        open={Boolean(toDelete)}
        title={t('Delete {{name}}?', { name: toDelete?.name })}
        message={t('This cannot be undone.')}
        confirmLabel={t('Delete')}
        danger
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      />
    </>
  );
}
