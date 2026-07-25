import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase.js';
import { useAuth } from '../hooks/useAuth.js';
import { Input } from '../components/ui/Input.jsx';
import { Button } from '../components/ui/Button.jsx';
import { useToast } from '../components/ui/Toast.jsx';

const AUTH_ERROR_MESSAGES = {
  'auth/invalid-credential': 'Неверный email или пароль.',
  'auth/invalid-email': 'Неверный email или пароль.',
  'auth/user-not-found': 'Неверный email или пароль.',
  'auth/wrong-password': 'Неверный email или пароль.',
  'auth/too-many-requests': 'Слишком много попыток. Попробуйте позже.',
};

export function LoginPage() {
  const { user, staff, loading, login, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
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
      await login(email, password);
    } catch (err) {
      setFormError(AUTH_ERROR_MESSAGES[err.code] ?? 'Не удалось войти. Проверьте соединение.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setFormError('Введите email, чтобы восстановить пароль.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      showToast('Письмо для сброса пароля отправлено.');
    } catch {
      showToast('Не удалось отправить письмо.', { type: 'error' });
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
            <Input
              label="Email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label="Пароль"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {formError && <p className="text-[13px] text-danger">{formError}</p>}
            <Button type="submit" size="lg" loading={submitting} className="w-full">
              Войти
            </Button>
            <button
              type="button"
              onClick={handleForgotPassword}
              className="text-center text-[13px] text-link"
            >
              Забыли пароль?
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
