import { useMemo, useState } from 'react';
import { useDebounce } from './useDebounce.js';

export function useListParams(initialFilters = {}) {
  const [search, setSearchValue] = useState('');
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [limit, setLimitValue] = useState(20);
  const q = useDebounce(search.trim());

  const params = useMemo(() => {
    const active = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '' && v !== null && v !== undefined));
    return { page, limit, ...(q && { q }), ...active };
  }, [page, limit, q, filters]);

  return {
    params,
    search,
    filters,
    filtered: Boolean(q) || Object.values(filters).some((v) => v !== '' && v !== null && v !== undefined),
    setSearch: (value) => {
      setSearchValue(value);
      setPage(1);
    },
    setFilter: (key, value) => {
      setFilters((f) => ({ ...f, [key]: value }));
      setPage(1);
    },
    pagination: (meta) => meta && { ...meta, onPageChange: setPage, onLimitChange: (l) => { setLimitValue(l); setPage(1); } },
  };
}
