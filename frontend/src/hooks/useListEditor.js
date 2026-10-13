import { useState } from 'react';

/**
 * Edit a record from a table row: loads the full record (list rows carry only what the table shows), then the
 * page opens its usual form drawer with `editor.record`.
 */
export function useListEditor(useRecordQuery) {
  const [id, setId] = useState(null);
  const { data } = useRecordQuery(id, { skip: !id });
  const record = id && data && String(data.id) === String(id) ? data : null;
  return { open: (row) => setId(row.id), close: () => setId(null), record };
}
