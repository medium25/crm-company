import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { Button } from '../components/ui/Button.jsx';

const AUTH_ERROR_MESSAGES = {
  'auth/invalid-credential': 'Неверный номер телефона или пароль.',
  'auth/invalid-email': 'Неверный номер телефона или пароль.',
  'auth/user-not-found': 'Неверный номер телефона или пароль.',
  'auth/wrong-password': 'Неверный номер телефона или пароль.',
  'auth/too-many-requests': 'Слишком много попыток. Попробуйте позже.',
};

export function LoginPage() {
  const { user, staff, loading, login, logout } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (loading || !user) return;
    if (staff && staff.isActive) navigate('/', { replace: true });
  }, [user, staff, loading, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      await login(`998${phone}`, password);
    } catch (err) {
      setFormError(AUTH_ERROR_MESSAGES[err.code] ?? 'Не удалось войти. Проверьте соединение.');
    } finally {
      setSubmitting(false);
    }
  };

  const blocked = !loading && user && (!staff || !staff.isActive);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="w-full max-w-[380px] rounded-card border border-border bg-surface p-8 shadow-card">
        <h1 className="mb-6 text-center text-xl font-bold text-navy">ICON CRM</h1>

        {blocked ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="text-[15px] text-danger">
              {!staff
                ? 'Доступ не выдан, обратитесь к администратору.'
                : 'Ваш аккаунт деактивирован, обратитесь к администратору.'}
            </p>
            <Button variant="secondary" onClick={logout}>
              Выйти
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <label className="block">
              <span className="mb-1 block text-[13px] text-muted">Номер телефона</span>
              <span className="flex items-center gap-2">
                <span className="flex h-11 shrink-0 items-center rounded-field border border-border-strong bg-surface-alt px-3 text-[15px] text-muted">
                  +998
                </span>
                <input
                  type="tel"
                  placeholder="901234567"
                  autoComplete="username"
                  required
                  maxLength={9}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 9))}
                  className="h-11 w-full rounded-field border border-border-strong bg-white px-3 text-[15px] text-text placeholder:text-muted focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/15"
                />
              </span>
            </label>
            <label className="block">
              <span className="mb-1 block text-[13px] text-muted">Пароль</span>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 w-full rounded-field border border-border-strong bg-white px-3 text-[15px] text-text placeholder:text-muted focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/15"
              />
            </label>
            {formError && <p className="text-[13px] text-danger">{formError}</p>}
            <Button type="submit" size="lg" loading={submitting} className="w-full">
              Войти
            </Button>
            <p className="text-center text-[13px] text-muted">Забыли пароль — обратитесь к администратору.</p>
          </form>
        )}
      </div>
    </div>
  );
}
