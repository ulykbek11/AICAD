/**
 * Login Page for Draftly
 */

import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const i18n = {
  en: {
    title: 'Log in to Draftly',
    email: 'Email',
    password: 'Password',
    login: 'Log in',
    loggingIn: 'Logging in...',
    noAccount: 'Don\'t have an account?',
    signup: 'Sign up',
    backHome: 'Back to home',
  },
  ru: {
    title: 'Вход в Draftly',
    email: 'Email',
    password: 'Пароль',
    login: 'Войти',
    loggingIn: 'Вход...',
    noAccount: 'Нет аккаунта?',
    signup: 'Зарегистрироваться',
    backHome: 'На главную',
  }
};

export default function LoginPage() {
  const [lang] = useState(() => localStorage.getItem('lang') || 'en');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const t = i18n[lang];

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/app');
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(email, password);
    
    if (result.success) {
      navigate('/app');
    } else {
      setError(result.error);
    }
    
    setLoading(false);
  };

  return (
    <div className="auth-page">
      <div className="orb"></div>
      
      <div className="auth-container">
        <Link to="/" className="auth-logo">
          <span className="logo-dot"></span>
          Draftly
        </Link>

        <h1 className="auth-title">{t.title}</h1>

        {error && (
          <div className="auth-error">{error}</div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">{t.email}</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">{t.password}</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? t.loggingIn : t.login}
          </button>
        </form>

        <p className="auth-switch">
          {t.noAccount}{' '}
          <Link to="/signup">{t.signup}</Link>
        </p>

        <Link to="/" className="auth-back">{t.backHome}</Link>
      </div>
    </div>
  );
}
