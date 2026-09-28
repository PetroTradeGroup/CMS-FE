import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import logo from '../assets/logo.jpg';
import { login, isAuthenticated } from '../services/auth';

export const Login: React.FC = () => {
  const [loading, setLoading] = useState(false);

  // Already signed in (silent check-sso succeeded) — skip the landing page.
  if (isAuthenticated()) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleLogin = () => {
    setLoading(true);
    // Redirects to the Keycloak login page (Authorization Code + PKCE).
    login();
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Decorative background elements */}
      <div style={{
        position: 'absolute',
        top: '-10%',
        right: '-5%',
        width: '500px',
        height: '500px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(206,166,32,0.15) 0%, transparent 70%)',
        filter: 'blur(40px)',
        zIndex: 0
      }} />
      <div style={{
        position: 'absolute',
        bottom: '-10%',
        left: '-10%',
        width: '600px',
        height: '600px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(4,51,9,0.8) 0%, transparent 70%)',
        filter: 'blur(60px)',
        zIndex: 0
      }} />

      <div className="glass-panel animate-fade-in" style={{
        width: '100%',
        maxWidth: '440px',
        padding: '3rem',
        position: 'relative',
        zIndex: 1,
        borderTop: '1px solid rgba(255,255,255,0.2)',
        borderLeft: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            width: '180px',
            margin: '0 auto 1.5rem auto',
            padding: '1rem',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <img src={logo} alt="Petrotrade Logo" style={{ width: '100%', height: 'auto', display: 'block' }} />
          </div>
          <h1 style={{ fontSize: '1.8rem', marginBottom: '0.25rem', letterSpacing: '-0.02em' }}>Petrotrade</h1>
          <p style={{ color: 'var(--color-accent-gold)', fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.8rem' }}>Coupon System</p>
        </div>

        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '2rem' }}>
          Sign in with your Petrotrade account to continue.
        </p>

        <button
          type="button"
          onClick={handleLogin}
          className="btn btn-primary"
          disabled={loading}
          style={{ width: '100%', padding: '0.875rem', fontSize: '1rem' }}
        >
          <LogIn size={20} />
          {loading ? 'Redirecting…' : 'Sign In'}
        </button>

        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0 }}>
            All rights reserved &copy; {new Date().getFullYear()} Petrotrade
          </p>
        </div>
      </div>
    </div>
  );
};
