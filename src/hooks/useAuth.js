import { createContext, createElement, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase.js';

const AuthContext = createContext(null);

// Только для локальной разработки без настоящего Firebase-проекта — см. .env.example.
// В деплое VITE_DEV_BYPASS_AUTH не ставим, никогда.
const DEV_BYPASS = import.meta.env.VITE_DEV_BYPASS_AUTH === 'true';
const DEV_ROLE = import.meta.env.VITE_DEV_BYPASS_ROLE || 'ceo';
const DEV_USER = { uid: 'dev-bypass-uid', email: 'dev@icon.local' };
const DEV_STAFF = {
  id: 'dev-bypass-uid',
  fullName: 'Dev Bypass',
  phone: '',
  email: 'dev@icon.local',
  role: DEV_ROLE,
  branchIds: ['icon-main'],
  teacherId: DEV_ROLE === 'teacher' ? 't_sanjar' : null,
  isActive: true,
};

/**
 * Держит firebase-пользователя и его документ staff/{uid} (роль, филиалы).
 * @param {{children: import('react').ReactNode}} props
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(DEV_BYPASS ? DEV_USER : undefined);
  const [staff, setStaff] = useState(DEV_BYPASS ? DEV_STAFF : null);
  const [loading, setLoading] = useState(!DEV_BYPASS);

  useEffect(() => {
    if (DEV_BYPASS) return;
    if (!auth) {
      setUser(null);
      setLoading(false);
      return;
    }
    return onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setStaff(null);
        setLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    if (DEV_BYPASS || !user) return;
    setLoading(true);
    return onSnapshot(
      doc(db, 'staff', user.uid),
      (snap) => {
        setStaff(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setLoading(false);
      },
      () => {
        setStaff(null);
        setLoading(false);
      },
    );
  }, [user]);

  const value = {
    user,
    staff,
    loading,
    login: (email, password) => signInWithEmailAndPassword(auth, email, password),
    logout: () => signOut(auth),
  };

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth должен вызываться внутри AuthProvider');
  return ctx;
}
