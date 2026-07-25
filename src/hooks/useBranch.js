import { createContext, createElement, useContext, useEffect, useMemo, useState } from 'react';
import { collection, documentId, query, where } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useAuth } from './useAuth.js';
import { useCollection } from './useCollection.js';

const BranchContext = createContext(null);
const STORAGE_KEY = 'icon-crm:active-branch';

/**
 * Список филиалов, доступных пользователю, и активный филиал (переключатель
 * в топбаре). owner видит все неархивные филиалы, остальные — только свои
 * staff.branchIds.
 * @param {{children: import('react').ReactNode}} props
 */
export function BranchProvider({ children }) {
  const { staff } = useAuth();

  const branchesQuery = useMemo(() => {
    if (!db || !staff) return null;
    if (staff.role === 'owner') {
      return query(collection(db, 'branches'), where('isArchived', '==', false));
    }
    if (!staff.branchIds?.length) return null;
    return query(collection(db, 'branches'), where(documentId(), 'in', staff.branchIds.slice(0, 30)));
  }, [staff]);

  const { data: branches, loading } = useCollection(branchesQuery);

  const [activeBranchId, setActiveBranchIdState] = useState(() => localStorage.getItem(STORAGE_KEY));

  useEffect(() => {
    if (loading || branches.length === 0) return;
    if (!branches.some((b) => b.id === activeBranchId)) {
      setActiveBranchIdState(branches[0].id);
    }
  }, [branches, loading, activeBranchId]);

  const setActiveBranchId = (id) => {
    localStorage.setItem(STORAGE_KEY, id);
    setActiveBranchIdState(id);
  };

  const activeBranch = branches.find((b) => b.id === activeBranchId) ?? null;

  const value = { branches, loading, activeBranchId, activeBranch, setActiveBranchId };

  return createElement(BranchContext.Provider, { value }, children);
}

export function useBranch() {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error('useBranch должен вызываться внутри BranchProvider');
  return ctx;
}
