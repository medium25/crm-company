import { useEffect, useRef, useState } from 'react';
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
  // Предохранитель от бесконечного цикла «новый query на каждый рендер → подписка → рендер»
  // (так 26–28.09 за час ушло ~1.8 млн чтений): если один и тот же хук за 5 секунд
  // пересоздаёт подписку больше 25 раз, подписки прекращаются и пишется ошибка в консоль.
  const subscribeTimes = useRef([]);

  useEffect(() => {
    if (!firestoreQuery) {
      setData([]);
      setLoading(false);
      return;
    }
    const nowMs = Date.now();
    subscribeTimes.current = [...subscribeTimes.current.filter((t) => nowMs - t < 5000), nowMs];
    if (subscribeTimes.current.length > 25) {
      console.error('useCollection: подписка пересоздаётся слишком часто — query, скорее всего, не мемоизирован (useMemo). Подписка остановлена.');
      setError(new Error('resubscribe-loop'));
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
