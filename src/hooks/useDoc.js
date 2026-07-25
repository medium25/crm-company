import { useEffect, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';

/**
 * Обёртка над onSnapshot для одного документа.
 * @param {import('firebase/firestore').DocumentReference|null} docRef null — подписка не создаётся
 * @returns {{data: Object|null, loading: boolean, error: Error|null}}
 */
export function useDoc(docRef) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!docRef) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    return onSnapshot(
      docRef,
      (snap) => {
        setData(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err);
        setLoading(false);
      },
    );
  }, [docRef]);

  return { data, loading, error };
}
