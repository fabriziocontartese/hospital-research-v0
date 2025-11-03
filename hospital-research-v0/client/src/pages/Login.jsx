import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import { useAuth } from '../lib/auth';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import authStyles from '../styles/AuthPage.module.css';

const landingByRole = {
  admin: '/dashboard',
  researcher: '/dashboard',
  staff: '/tasks',
};

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setSession } = useAuth();
  const [formState, setFormState] = useState({ email: '', password: '' });
  const [error, setError] = useState('');

  const loginMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post('/api/auth/login', formState);
      return response.data;
    },
    onSuccess: (data) => {
      setSession({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        user: data.user,
      });
      const redirectTo =
        (location.state && location.state.from?.pathname) || landingByRole[data.user.role] || '/dashboard';
      navigate(redirectTo, { replace: true });
    },
    onError: (err) => {
      const message = err.response?.data?.error || 'Unable to sign in. Check your credentials.';
      setError(message);
    },
  });

  const onSubmit = (event) => {
    event.preventDefault();
    setError('');
    loginMutation.mutate();
  };

  return (
    <div className={authStyles.page}>
      <div className={authStyles.card}>
        <div className={authStyles.header}>
          <h1 className={authStyles.title}>Sign in to continue</h1>
          <p className={authStyles.subtitle}>
            Access the hospital research console to manage studies, population cohorts, and care team tasks.
          </p>
        </div>
        <form className={authStyles.form} onSubmit={onSubmit}>
          <div className={authStyles.field}>
            <div className={authStyles.labelRow}>
              <label htmlFor="email">Email address</label>
            </div>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={formState.email}
              onChange={(event) => setFormState((prev) => ({ ...prev, email: event.target.value }))}
              required
              placeholder="researcher@example.org"
            />
          </div>

          <div className={authStyles.field}>
            <div className={authStyles.labelRow}>
              <label htmlFor="password">Password</label>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={formState.password}
              onChange={(event) => setFormState((prev) => ({ ...prev, password: event.target.value }))}
              required
              placeholder="••••••••"
            />
          </div>

          {error ? <div className={authStyles.error}>{error}</div> : null}

          <Button type="submit" disabled={loginMutation.isLoading}>
            {loginMutation.isLoading ? 'Signing in…' : 'Access console'}
          </Button>
        </form>
        <p className={authStyles.footnote}>
        Test accounts: <br></br>

        - admin@pioneer.example <br></br>
        - researcher@pioneer.example <br></br>
        - staff@pioneer.example <br></br>

        All pwd: ChangeMe123!
        </p>
        <p className={authStyles.footnote}>
          Accounts are issued by your organisation administrator. Need access?{' '}
          <Link to="/request-access" className={authStyles.link}>
            Request organisation onboarding
          </Link>
          .
        </p>
      </div>
    </div>
  );
};

export default Login;