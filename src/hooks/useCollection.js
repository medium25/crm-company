import { useEffect, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';

/**
 * Обёртка над onSnapshot для коллекции/запроса. Query строит вызывающий
 * код через query(collection(db, 'x'), where(...), limit(...)) и обязан
 * мемоизировать его (useMemo), иначе подписка будет пересоздаваться на
 * каждый рендер.
 * @param {import('firebase/firestore').Query|null} firestoreQuery null — подписка не создаётся (например, до готовности фильтров)
 * @returns {{data: Array<Object>, loading: boolean, error: Error|null}}
 */
export function useCollection(firestoreQuery) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!firestoreQuery) {
      setData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return onSnapshot(
      firestoreQuery,
      (snap) => {
        setData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err);
        setLoading(false);
      },
    );
  }, [firestoreQuery]);

  return { data, loading, error };
}
