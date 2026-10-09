const get = (obj, path) => path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);

const normalise = (value) => {
  if (value === undefined || value === '') return null;
  return JSON.parse(JSON.stringify(value));
};

export function diffChanges(before, after, fields) {
  const changes = [];
  for (const field of fields) {
    const from = normalise(get(before, field));
    const to = normalise(get(after, field));
    if (JSON.stringify(from) !== JSON.stringify(to)) changes.push({ field, from, to });
  }
  return changes;
}
