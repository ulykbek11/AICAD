/**
 * Signup Page for Draftly
 */

import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const i18n = {
  en: {
    title: 'Create your account',
    fullName: 'Full name (optional)',
    email: 'Email',
    password: 'Password',
    passwordHint: 'At least 8 characters',
    signup: 'Create account',
    signingUp: 'Creating...',
    hasAccount: 'Already have an account?',
    login: 'Log in',
    backHome: 'Back to home',
  },
  ru: {
    title: 'Создайте аккаунт',
    fullName: 'Имя (необязательно)',
    email: 'Email',
    password: 'Пароль',
    passwordHint: 'Минимум 8 символов',
    signup: 'Создать аккаунт',
    signingUp: 'Создание...',
    hasAccount: 'Уже есть аккаунт?',
    login: 'Войти',
    backHome: 'На главную',
  }
};

export default function SignupPage() {
  const [lang] = useState(() => localStorage.getItem('lang') || 'en');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signup, isAuthenticated } = useAuth();
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
    
    if (password.length < 8) {
      setError(t.passwordHint);
      return;
    }

    setLoading(true);

    const result = await signup(email, password, fullName || null);
    
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
            <label htmlFor="fullName">{t.fullName}</label>
            <input
              type="text"
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
            />
          </div>

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
              autoComplete="new-password"
              minLength={8}
            />
            <span className="form-hint">{t.passwordHint}</span>
          </div>

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? t.signingUp : t.signup}
          </button>
        </form>

        <p className="auth-switch">
          {t.hasAccount}{' '}
          <Link to="/login">{t.login}</Link>
        </p>

        <Link to="/" className="auth-back">{t.backHome}</Link>
      </div>
    </div>
  );
}
