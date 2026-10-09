import { useEffect, useState } from 'react';
import { http } from '../services/http.js';

export function useAuthImage(url) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    if (!url) {
      setSrc(null);
      return undefined;
    }
    let objectUrl;
    let cancelled = false;
    http
      .get(url, { responseType: 'blob' })
      .then((res) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(res.data);
        setSrc(objectUrl);
      })
      .catch(() => !cancelled && setSrc(null));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return src;
}
