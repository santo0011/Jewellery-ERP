import { Alert, Box, Button, Card, CardContent, Divider, Typography } from '@mui/material';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { applyServerErrors, getErrorMessage } from '../../utils/errors.js';
import { useUpdateSettingsMutation } from './settingsApi.js';

export default function SettingsSectionForm({ section, title, description, value, toForm = (v) => v, fromForm = (v) => v, readOnly, children }) {
  const [update, { isLoading }] = useUpdateSettingsMutation();
  const form = useForm({ defaultValues: toForm(value) });
  const { handleSubmit, reset, setError, formState } = form;

  useEffect(() => {
    reset(toForm(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reset]);

  const onSubmit = handleSubmit(async (values) => {
    let payload;
    try {
      payload = fromForm(values);
    } catch {
      toast.error('Some numbers are not valid. Please check the highlighted fields.');
      return;
    }
    try {
      await update({ section, values: payload }).unwrap();
      toast.success('Settings saved');
    } catch (err) {
      if (!applyServerErrors(err, setError)) toast.error(getErrorMessage(err));
    }
  });

  return (
    <Card component="form" noValidate onSubmit={onSubmit}>
      <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
        <Typography variant="h4">{title}</Typography>
        {description && (
          <Typography variant="body2" color="textSecondary" sx={{ mt: 0.5 }}>
            {description}
          </Typography>
        )}
        <Divider sx={{ my: 2.5 }} />
        {readOnly && (
          <Alert severity="info" sx={{ mb: 2 }}>
            You have view-only access to settings.
          </Alert>
        )}
        {children(form)}
        {!readOnly && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 3 }}>
            <Button color="secondary" onClick={() => reset(toForm(value))} disabled={!formState.isDirty || isLoading}>
              Discard
            </Button>
            <Button type="submit" variant="contained" loading={isLoading} disabled={!formState.isDirty}>
              Save changes
            </Button>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
