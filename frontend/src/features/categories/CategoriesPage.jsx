import { zodResolver } from '@hookform/resolvers/zod';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import DiamondOutlinedIcon from '@mui/icons-material/DiamondOutlined';
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

const formSchema = categorySchema.omit({ sortOrder: true }).extend({ sortOrder: z.string().regex(/^\d{0,4}$/, 'Whole number up to 9999') });

/** Each metal gets its own accent so a category's default metal reads at a glance. */
const METAL_LOOK = {
  gold: { label: 'Gold', tile: 'linear-gradient(135deg, #E9CF6E 0%, #C9A227 55%, #A8841B 100%)', ink: '#171717', chip: 'rgba(201, 162, 39, 0.14)', chipInk: '#7A5E0F' },
  silver: { label: 'Silver', tile: 'linear-gradient(135deg, #EEF1F4 0%, #BFC6CE 55%, #8E98A3 100%)', ink: '#22272C', chip: 'rgba(142, 152, 163, 0.18)', chipInk: '#4C5560' },
  platinum: { label: 'Platinum', tile: 'linear-gradient(135deg, #DCE3EA 0%, #9AA9B7 55%, #6E7F8D 100%)', ink: '#171717', chip: 'rgba(110, 127, 141, 0.16)', chipInk: '#3E4C58' },
};
const NO_METAL = { label: 'Any metal', tile: 'linear-gradient(135deg, #F1EEE6 0%, #D9D4C7 100%)', ink: '#6B6760', chip: 'rgba(107, 103, 96, 0.10)', chipInk: '#6B6760' };
const lookOf = (metal) => METAL_LOOK[metal] ?? NO_METAL;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

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

  const parentOptions = roots.filter((r) => r.id !== state?.category?.id).map((r) => ({ value: r.id, label: r.name }));
  const hasChildren = editing && roots.find((r) => r.id === state.category.id)?.children.length > 0;
  const parentName = state?.parentId && roots.find((r) => r.id === state.parentId)?.name;

  const onSubmit = handleSubmit(async ({ sortOrder, ...values }) => {
    const payload = { ...values, sortOrder: Number(sortOrder || 0) };
    try {
      if (editing) await update({ id: state.category.id, ...payload }).unwrap();
      else await create(payload).unwrap();
      toast.success(editing ? 'Category updated' : 'Category created');
      onClose();
    } catch (err) {
      if (!applyServerErrors(err, setError)) toast.error(getErrorMessage(err));
    }
  });

  return (
    <Dialog open={Boolean(state)} onClose={onClose} maxWidth="xs" fullWidth>
      <form noValidate onSubmit={onSubmit}>
        <DialogTitle sx={{ fontWeight: 600, pb: 0.5 }}>{editing ? `Edit ${state.category.name}` : parentName ? `New subcategory in ${parentName}` : 'New category'}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 1.5 }}>
            {parentName ? 'For example "Ladies rings" inside Rings.' : 'Group your jewellery the way your counter staff think about it.'}
          </Typography>
          <Grid container spacing={2} sx={{ pt: 1 }}>
            <Grid size={12}>
              <RHFTextField control={control} name="name" label="Name" autoFocus />
            </Grid>
            <Grid size={12}>
              <RHFSelect
                control={control}
                name="parentId"
                label="Parent category"
                options={parentOptions}
                placeholder="None (top level)"
                disabled={hasChildren}
                helperText={hasChildren ? 'Has subcategories, so it stays top-level' : undefined}
              />
            </Grid>
            <Grid size={6}>
              <RHFSelect control={control} name="defaultMetal" label="Default metal" options={METAL_OPTIONS} placeholder="Any" />
            </Grid>
            <Grid size={6}>
              <RHFTextField control={control} name="hsnCode" label="HSN code" helperText="Blank uses tax settings" slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 8 } }} />
            </Grid>
            <Grid size={6}>
              <RHFTextField control={control} name="sortOrder" label="Sort order" helperText="Lower shows first" slotProps={{ htmlInput: { inputMode: 'numeric' } }} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" loading={createState.isLoading || updateState.isLoading}>
            {editing ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function MetaChip({ children, look }) {
  return (
    <Box component="span" sx={{ px: 1, py: 0.25, borderRadius: 999, fontSize: '0.7rem', fontWeight: 600, bgcolor: look?.chip ?? 'action.hover', color: look?.chipInk ?? 'text.secondary', whiteSpace: 'nowrap' }}>
      {children}
    </Box>
  );
}

function ActionIcon({ title, onClick, label, danger, disabled, children }) {
  return (
    <Tooltip title={title}>
      <span>
        <IconButton size="small" onClick={onClick} disabled={disabled} aria-label={label} sx={{ width: 30, height: 30, color: 'text.secondary', '&:hover': { color: danger ? 'error.main' : 'primary.dark', bgcolor: danger ? 'rgba(155, 44, 44, 0.08)' : 'rgba(201, 162, 39, 0.10)' } }}>
          {children}
        </IconButton>
      </span>
    </Tooltip>
  );
}

/** A subcategory inside its parent's card: name and details, with its actions on the right. */
function SubRow({ category, canEdit, canDelete, onEdit, onDelete }) {
  const look = category.defaultMetal ? lookOf(category.defaultMetal) : null;
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', pl: 1.25, pr: 0.5, py: 0.75, borderRadius: 2, '&:hover': { bgcolor: 'action.hover' } }}>
      <Box sx={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: (look ?? NO_METAL).tile }} />
      <Typography variant="body2" sx={{ fontWeight: 500, flex: 1, minWidth: 0 }} noWrap>
        {category.name}
      </Typography>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexShrink: 0 }}>
        {look && <MetaChip look={look}>{look.label}</MetaChip>}
        {category.hsnCode && <MetaChip>HSN {category.hsnCode}</MetaChip>}
        <Typography variant="caption" color="textSecondary" sx={{ minWidth: 28, textAlign: 'right', fontWeight: 600 }}>
          {category.productCount}
        </Typography>
        {canEdit && (
          <ActionIcon title="Edit" label={`Edit ${category.name}`} onClick={onEdit}>
            <EditOutlinedIcon sx={{ fontSize: 16 }} />
          </ActionIcon>
        )}
        {canDelete && (
          <ActionIcon title={category.productCount ? 'In use by products' : 'Delete'} label={`Delete ${category.name}`} onClick={onDelete} disabled={category.productCount > 0} danger>
            <DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />
          </ActionIcon>
        )}
      </Stack>
    </Stack>
  );
}

function CategoryCard({ root, canCreate, canEdit, canDelete, onEdit, onAddChild, onDelete, onEditChild, onDeleteChild }) {
  const look = lookOf(root.defaultMetal);
  const total = root.productCount + root.children.reduce((sum, c) => sum + c.productCount, 0);
  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', transition: 'box-shadow 160ms ease, transform 160ms ease', '&:hover': { boxShadow: '0 10px 28px rgba(23, 23, 23, 0.08)', transform: 'translateY(-1px)' } }}>
      <Box sx={{ height: 3, background: look.tile }} />
      <Stack direction="row" spacing={1.5} sx={{ p: 2, pb: 1.5, alignItems: 'flex-start' }}>
        <Box sx={{ width: 46, height: 46, borderRadius: 2.5, flexShrink: 0, display: 'grid', placeItems: 'center', background: look.tile, color: look.ink, fontFamily: fonts.display, fontSize: 22, fontWeight: 700, boxShadow: '0 4px 12px rgba(23, 23, 23, 0.10)' }}>
          {root.name.trim().charAt(0).toUpperCase()}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
            <Typography sx={{ fontFamily: fonts.display, fontSize: 21, fontWeight: 700, lineHeight: 1.15 }} noWrap>
              {root.name}
            </Typography>
            {root.isSystem && (
              <Tooltip title="Standard category">
                <VerifiedOutlinedIcon sx={{ fontSize: 16, color: 'primary.dark' }} />
              </Tooltip>
            )}
          </Stack>
          <Stack direction="row" spacing={0.5} sx={{ mt: 0.75, flexWrap: 'wrap', rowGap: 0.5 }}>
            <MetaChip look={look}>{look.label}</MetaChip>
            {root.hsnCode && <MetaChip>HSN {root.hsnCode}</MetaChip>}
            <MetaChip>{plural(total, 'product')}</MetaChip>
          </Stack>
        </Box>
        <Stack direction="row" sx={{ flexShrink: 0, mt: -0.5, mr: -0.75 }}>
          {canEdit && (
            <ActionIcon title="Edit" label={`Edit ${root.name}`} onClick={onEdit}>
              <EditOutlinedIcon sx={{ fontSize: 18 }} />
            </ActionIcon>
          )}
          {canDelete && (
            <ActionIcon
              title={root.children.length ? 'Remove its subcategories first' : root.productCount ? 'In use by products' : 'Delete'}
              label={`Delete ${root.name}`}
              onClick={onDelete}
              disabled={root.children.length > 0 || root.productCount > 0}
              danger
            >
              <DeleteOutlineRoundedIcon sx={{ fontSize: 18 }} />
            </ActionIcon>
          )}
        </Stack>
      </Stack>

      <Box sx={{ flex: 1, mx: 1.25, mb: 1.25, p: 0.5, borderRadius: 2.5, bgcolor: 'soft.main', display: 'flex', flexDirection: 'column' }}>
        <Typography variant="overline" color="textSecondary" sx={{ px: 1.25, pt: 0.75, pb: 0.25, fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.1em', lineHeight: 1.6 }}>
          {!root.children.length ? 'No subcategories' : root.children.length === 1 ? '1 subcategory · products' : `${root.children.length} subcategories · products`}
        </Typography>
        {root.children.map((child) => (
          <SubRow key={child.id} category={child} canEdit={canEdit} canDelete={canDelete} onEdit={() => onEditChild(child)} onDelete={() => onDeleteChild(child)} />
        ))}
        {canCreate && (
          <ButtonBase
            onClick={onAddChild}
            sx={{ mx: 0.5, mb: 0.5, mt: root.children.length ? 0.5 : 0.25, py: 0.75, gap: 0.5, borderRadius: 2, border: '1px dashed', borderColor: 'divider', color: 'text.secondary', fontSize: '0.8rem', fontWeight: 600, '&:hover': { borderColor: 'primary.main', color: 'primary.dark', bgcolor: 'rgba(201, 162, 39, 0.06)' } }}
          >
            <AddRoundedIcon sx={{ fontSize: 17 }} />
            Add subcategory
          </ButtonBase>
        )}
      </Box>
    </Card>
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
      toast.success(res.message);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const confirmDelete = async () => {
    try {
      await remove(toDelete.id).unwrap();
      toast.success('Category deleted');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
    setToDelete(null);
  };

  return (
    <>
      <PageHeader
        title="Product categories"
        subtitle="Organise jewellery into categories and subcategories."
        breadcrumbs={[{ label: 'Settings' }, { label: 'Product categories' }]}
        actions={
          canCreate && (
            <Stack direction="row" spacing={1}>
              {tree.length > 0 && (
                <Tooltip title="Bring back any standard category that was deleted">
                  <Button color="secondary" variant="outlined" startIcon={<RestoreRoundedIcon />} onClick={seed} loading={seeding}>
                    Restore standard
                  </Button>
                </Tooltip>
              )}
              <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setDialog({})}>
                New category
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
            title="No categories yet"
            description="Start with the standard jewellery categories: rings, necklaces, bangles, chains and more."
            action={
              canCreate && (
                <Button variant="contained" onClick={seed} loading={seeding}>
                  Add standard categories
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <>
          <SummaryCards>
            <SummaryCard icon={CategoryOutlinedIcon} label="Categories" value={tree.length} caption="Top-level groups" />
            <SummaryCard icon={AccountTreeOutlinedIcon} label="Subcategories" value={subCount} caption="Inside the categories" tone="blue" />
            <SummaryCard icon={DiamondOutlinedIcon} label="Products" value={productCount} caption="Filed under a category" tone="green" />
            <SummaryCard icon={CategoryOutlinedIcon} label="Not used yet" value={unused} caption={unused ? 'No products in them' : 'Every category is in use'} tone={unused ? 'amber' : 'grey'} />
          </SummaryCards>

          <TextField
            size="small"
            placeholder="Search categories and subcategories"
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
            <Grid container spacing={2}>
              {shown.map((root) => (
                <Grid key={root.id} size={{ xs: 12, md: 6, xl: 4 }}>
                  <CategoryCard
                    root={root}
                    canCreate={canCreate}
                    canEdit={canEdit}
                    canDelete={canDelete}
                    onEdit={() => setDialog({ category: root })}
                    onAddChild={() => setDialog({ parentId: root.id })}
                    onDelete={() => setToDelete(root)}
                    onEditChild={(child) => setDialog({ category: child })}
                    onDeleteChild={(child) => setToDelete(child)}
                  />
                </Grid>
              ))}
            </Grid>
          ) : (
            <Card>
              <EmptyState title="Nothing matches" description={`No category or subcategory is called "${search.trim()}".`} action={<Button onClick={() => setSearch('')}>Clear search</Button>} />
            </Card>
          )}
        </>
      )}
      <CategoryDialog state={dialog} roots={tree} onClose={() => setDialog(null)} />
      <ConfirmDialog
        open={Boolean(toDelete)}
        title={`Delete ${toDelete?.name}?`}
        message="This cannot be undone."
        confirmLabel="Delete"
        danger
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      />
    </>
  );
}
