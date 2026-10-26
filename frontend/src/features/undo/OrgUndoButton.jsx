import { usePermission } from '../../hooks/usePermission.js';
import { useDismissActionMutation, useLazyUndoStacksQuery, useUndoActionMutation } from './undoApi.js';
import UndoMenu from './UndoMenu.jsx';
import { t } from '../../i18n/index.js';

/** Undo in the organisation / branch panel's top bar: the organisation's stack (if this person sees every branch) and each of their branches'. */
export default function OrgUndoButton() {
  const allowed = usePermission('undo.view');
  const [load, { data, isFetching, error }] = useLazyUndoStacksQuery();
  const [undo] = useUndoActionMutation();
  const [dismiss] = useDismissActionMutation();
  if (!allowed) return null;

  const stacks = (data ?? []).map((s) => ({ key: s.branch?.id ?? 'organisation', name: s.scope === 'organisation' ? t('Organisation (shared records)') : s.branch.name, latest: s.latest }));
  const after = async (promise) => {
    const done = await promise.unwrap();
    load(undefined, false);
    return done;
  };

  return (
    <UndoMenu
      stacks={stacks}
      loading={isFetching && !data}
      error={error}
      onOpen={() => load(undefined, false)}
      onUndo={(entry, reason) => after(undo({ id: entry.id, reason }))}
      onDismiss={(entry, reason) => after(dismiss({ id: entry.id, reason }))}
      historyPath="/settings/audit-log?tab=undo"
    />
  );
}
