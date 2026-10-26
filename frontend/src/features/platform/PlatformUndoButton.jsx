import UndoMenu from '../undo/UndoMenu.jsx';
import { useLazyPlatformUndoLatestQuery, usePlatformDismissMutation, usePlatformUndoMutation } from './platformApi.js';
import { t } from '../../i18n/index.js';

/** Undo in the Super Admin panel's top bar: the platform's own stack (organisations, plans, subscriptions, email). */
export default function PlatformUndoButton() {
  const [load, { data, isFetching, error, isUninitialized }] = useLazyPlatformUndoLatestQuery();
  const [undo] = usePlatformUndoMutation();
  const [dismiss] = usePlatformDismissMutation();
  const after = async (promise) => {
    const done = await promise.unwrap();
    load(undefined, false);
    return done;
  };
  return (
    <UndoMenu
      stacks={isUninitialized ? [] : [{ key: 'platform', name: t('Super Admin panel'), latest: data ?? null }]}
      loading={isFetching && data === undefined}
      error={error}
      onOpen={() => load(undefined, false)}
      onUndo={(entry, reason) => after(undo({ id: entry.id, reason }))}
      onDismiss={(entry, reason) => after(dismiss({ id: entry.id, reason }))}
      historyPath="/admin/undo"
    />
  );
}
