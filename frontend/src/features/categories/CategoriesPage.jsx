import { zodResolver } from '@hookform/resolvers/zod';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import SubdirectoryArrowRightRoundedIcon from '@mui/icons-material/SubdirectoryArrowRightRounded';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { METAL_OPTIONS } from '@jerp/shared';
import { categorySchema } from '@jerp/shared/schemas';
import { Fragment, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import RHFSelect from '../../components/form/RHFSelect.jsx';
import RHFTextField from '../../components/form/RHFTextField.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/StateViews.jsx';
import { usePermission } from '../../hooks/usePermission.js';
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
        <DialogTitle sx={{ fontWeight: 600 }}>{editing ? 'Edit category' : state?.parentId ? 'New subcategory' : 'New category'}</DialogTitle>
        <DialogContent>
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
              <RHFTextField control={control} name="sortOrder" label="Sort order" slotProps={{ htmlInput: { inputMode: 'numeric' } }} />
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

function Row({ category, depth, canEdit, canDelete, canCreate, onEdit, onAddChild, onDelete }) {
  const metal = METAL_OPTIONS.find((m) => m.value === category.defaultMetal)?.label;
  return (
    <Stack direction="row" spacing={1.5} sx={{ px: 2, py: 1.25, pl: depth ? 6 : 2, alignItems: 'center', '&:hover': { bgcolor: 'soft.main' } }}>
      {depth ? <SubdirectoryArrowRightRoundedIcon fontSize="small" sx={{ color: 'text.secondary' }} /> : <CategoryOutlinedIcon fontSize="small" sx={{ color: 'primary.dark' }} />}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography variant={depth ? 'body2' : 'subtitle2'} sx={{ fontWeight: depth ? 500 : 600 }}>
            {category.name}
          </Typography>
          {category.isSystem && <Chip size="small" label="Standard" variant="outlined" sx={{ height: 20, fontSize: '0.6875rem' }} />}
        </Stack>
        <Typography variant="caption" color="textSecondary">
          {[metal, category.hsnCode && `HSN ${category.hsnCode}`, `${category.productCount} product${category.productCount === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
        </Typography>
      </Box>
      {!depth && canCreate && (
        <Tooltip title="Add subcategory">
          <IconButton size="small" onClick={onAddChild} aria-label={`Add subcategory to ${category.name}`}>
            <AddRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {canEdit && (
        <Tooltip title="Edit">
          <IconButton size="small" onClick={onEdit} aria-label={`Edit ${category.name}`}>
            <EditOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {canDelete && (
        <Tooltip title={category.productCount ? 'In use by products' : 'Delete'}>
          <span>
            <IconButton size="small" color="error" onClick={onDelete} disabled={category.productCount > 0} aria-label={`Delete ${category.name}`}>
              <DeleteOutlineRoundedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      )}
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
  const tree = buildCategoryTree(data);

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
        title="Categories"
        subtitle="Organise jewellery into categories and subcategories."
        breadcrumbs={[{ label: 'Inventory' }, { label: 'Categories' }]}
        actions={
          canCreate && (
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setDialog({})}>
              New category
            </Button>
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
        <Card sx={{ maxWidth: 880 }}>
          {tree.map((root, i) => (
            <Fragment key={root.id}>
              {i > 0 && <Divider />}
              <Row
                category={root}
                depth={0}
                canCreate={canCreate}
                canEdit={canEdit}
                canDelete={canDelete && root.children.length === 0}
                onEdit={() => setDialog({ category: root })}
                onAddChild={() => setDialog({ parentId: root.id })}
                onDelete={() => setToDelete(root)}
              />
              {root.children.map((child) => (
                <Row
                  key={child.id}
                  category={child}
                  depth={1}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  onEdit={() => setDialog({ category: child })}
                  onDelete={() => setToDelete(child)}
                />
              ))}
            </Fragment>
          ))}
        </Card>
      )}
      {tree.length > 0 && canCreate && (
        <Alert severity="info" sx={{ mt: 2, maxWidth: 880 }} action={<Button color="inherit" size="small" onClick={seed} loading={seeding}>Restore</Button>}>
          Deleted a standard category by mistake? Restore any missing ones.
        </Alert>
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
