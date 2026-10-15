import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useDebounce } from './useDebounce.js';

/**
 * Search, filters and page of a list, kept in the address (?status=…&q=…&page=2). Opening a record and coming back
 * returns to the same filter, search and page, and a link or refresh opens the list as it was. A filter left at its
 * default is not written; one set to "all" ('') is, so it is not mistaken for the default.
 */
export function useListParams(initialFilters = {}) {
  const [url, setUrl] = useSearchParams();
  const update = useCallback(
    (patch) =>
      setUrl(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === undefined) next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true },
      ),
    [setUrl],
  );

  const filters = Object.fromEntries(Object.entries(initialFilters).map(([k, d]) => [k, url.has(k) ? url.get(k) : d]));
  const filterKey = JSON.stringify(filters);
  const page = Math.max(1, Number(url.get('page')) || 1);
  const limit = Number(url.get('limit')) || 20;

  // Typing updates the box at once; the address (and the request) follow once typing pauses.
  const [search, setSearchValue] = useState(() => url.get('q') ?? '');
  const q = useDebounce(search.trim());
  useEffect(() => {
    if ((url.get('q') ?? '') !== q) update({ q: q || null, page: null });
  }, [q, url, update]);

  const params = useMemo(() => {
    const active = Object.fromEntries(Object.entries(JSON.parse(filterKey)).filter(([, v]) => v !== '' && v !== null && v !== undefined));
    return { page, limit, ...(q && { q }), ...active };
  }, [page, limit, q, filterKey]);

  return {
    params,
    search,
    filters,
    filtered: Boolean(q) || Object.values(filters).some((v) => v !== '' && v !== null && v !== undefined),
    setSearch: setSearchValue,
    setFilter: (key, value) => update({ [key]: value === initialFilters[key] ? null : (value ?? ''), page: null }),
    pagination: (meta) =>
      meta && {
        ...meta,
        onPageChange: (p) => update({ page: p > 1 ? p : null }),
        onLimitChange: (l) => update({ limit: l === 20 ? null : l, page: null }),
      },
  };
}

/**
 * The open tab of a page, kept in the address (?tab=…), so coming back from a record opens the same tab.
 * The default tab is not written.
 */
export function useTabParam(fallback, name = 'tab') {
  const [url, setUrl] = useSearchParams();
  const tab = url.get(name) ?? fallback;
  const setTab = useCallback(
    (value) =>
      setUrl(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === fallback) next.delete(name);
          else next.set(name, value);
          return next;
        },
        { replace: true },
      ),
    [setUrl, fallback, name],
  );
  return [tab, setTab];
}
