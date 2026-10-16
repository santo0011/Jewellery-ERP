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
import DataTable from '../../components/DataTable.jsx';
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
        <IconButton size="small" onClick={onClick} disabled={disabled} aria-label={label} sx={{ width: 30, height: 30, color: 'text.secondary', '&:hover': { color: danger ? 'error.main' : 'primary.dark', bgcolor: danger ? 'rgba(155, 44, 44, 0.08)' : 'rgba(var(--brand-rgb), 0.10)' } }}>
          {children}
        </IconButton>
      </span>
    </Tooltip>
  );
}

/** A category's name with its metal-coloured initial; subcategories sit indented under their parent. */
function NameCell({ category, sub }) {
  const look = lookOf(category.defaultMetal);
  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', minWidth: 0, pl: sub ? { xs: 0, md: 4.5 } : 0 }}>
      {sub ? (
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: look.tile, ml: { xs: 0.5, md: 0 } }} />
      ) : (
        <Box sx={{ width: 34, height: 34, borderRadius: 2, flexShrink: 0, display: 'grid', placeItems: 'center', background: look.tile, color: look.ink, fontFamily: fonts.display, fontSize: 16, fontWeight: 700 }}>
          {category.name.trim().charAt(0).toUpperCase()}
        </Box>
      )}
      <Box sx={{ minWidth: 0 }}>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <Typography variant={sub ? 'body2' : 'subtitle2'} sx={{ fontWeight: sub ? 500 : 700 }} noWrap>
            {category.name}
          </Typography>
          {category.isSystem && (
            <Tooltip title="Standard category">
              <VerifiedOutlinedIcon sx={{ fontSize: 15, color: 'primary.dark' }} />
            </Tooltip>
          )}
        </Stack>
        {sub && (
          <Typography variant="caption" color="textSecondary">
            in {sub}
          </Typography>
        )}
      </Box>
    </Stack>
  );
}

/** Every category as a table row, each followed by its subcategories. */
function CategoryTable({ roots, canCreate, canEdit, canDelete, onEdit, onAddChild, onDelete }) {
  const rows = roots.flatMap((root) => [{ ...root, parentName: null }, ...root.children.map((c) => ({ ...c, children: [], parentName: root.name }))]);
  const columns = [
    { key: 'name', label: 'Category', render: (c) => <NameCell category={c} sub={c.parentName} /> },
    { key: 'metal', label: 'Default metal', render: (c) => (c.defaultMetal ? <MetaChip look={lookOf(c.defaultMetal)}>{lookOf(c.defaultMetal).label}</MetaChip> : <MetaChip look={NO_METAL}>{NO_METAL.label}</MetaChip>) },
    { key: 'hsn', label: 'HSN', render: (c) => c.hsnCode ?? '—' },
    { key: 'subs', label: 'Subcategories', align: 'right', render: (c) => (c.parentName ? '—' : c.children.length) },
    {
      key: 'products',
      label: 'Products',
      align: 'right',
      render: (c) => (
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {c.parentName ? c.productCount : c.productCount + c.children.reduce((n, x) => n + x.productCount, 0)}
        </Typography>
      ),
    },
    {
      key: 'actions',
      label: 'Action',
      align: 'right',
      width: 120,
      render: (c) => {
        const blocked = c.children.length ? 'Remove its subcategories first' : c.productCount ? 'In use by products' : null;
        return (
          <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
            {canCreate && !c.parentName && (
              <ActionIcon title="Add subcategory" label={`Add subcategory to ${c.name}`} onClick={() => onAddChild(c)}>
                <AddRoundedIcon sx={{ fontSize: 18 }} />
              </ActionIcon>
            )}
            {canEdit && (
              <ActionIcon title="Edit" label={`Edit ${c.name}`} onClick={() => onEdit(c)}>
                <EditOutlinedIcon sx={{ fontSize: 17 }} />
              </ActionIcon>
            )}
            {canDelete && (
              <ActionIcon title={blocked ?? 'Delete'} label={`Delete ${c.name}`} onClick={() => onDelete(c)} disabled={Boolean(blocked)} danger>
                <DeleteOutlineRoundedIcon sx={{ fontSize: 17 }} />
              </ActionIcon>
            )}
          </Stack>
        );
      },
    },
  ];
  return <DataTable columns={columns} rows={rows} getRowId={(c) => c.id} />;
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
            <CategoryTable
              roots={shown}
              canCreate={canCreate}
              canEdit={canEdit}
              canDelete={canDelete}
              onEdit={(category) => setDialog({ category: tree.find((r) => r.id === category.id) ?? category })}
              onAddChild={(root) => setDialog({ parentId: root.id })}
              onDelete={(category) => setToDelete(category)}
            />
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
