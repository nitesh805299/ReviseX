import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';
import { Logo } from '../components/Logo';
import { api } from '../lib/api';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [step, setStep] = useState('request'); // 'request' | 'reset' | 'done'
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRequest(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/forgot-password', { email });
      setMessage(data.message);
      if (data.devResetToken) {
        setToken(data.devResetToken);
      }
      setStep('reset');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not initiate password reset.');
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/reset-password', { token, password: newPassword });
      setMessage(data.message);
      setStep('done');
    } catch (err) {
      setError(err.response?.data?.error || 'Reset failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4">
      <div className="mb-8">
        <Link to="/">
          <Logo size="lg" />
        </Link>
      </div>

      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to login
        </Link>

        <h1 className="text-xl font-bold text-slate-900">Reset your password</h1>

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            {error}
          </div>
        )}

        {step === 'request' && (
          <form onSubmit={handleRequest} className="mt-4 space-y-4">
            <p className="text-xs text-slate-500">
              Enter your account email to generate a secure password reset token.
            </p>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Send Reset Instructions
            </button>
          </form>
        )}

        {step === 'reset' && (
          <form onSubmit={handleReset} className="mt-4 space-y-4">
            <p className="text-xs text-slate-600 bg-blue-50 border border-blue-200 p-3 rounded-lg">
              {message}
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Reset Token</label>
              <input
                type="text"
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">New Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
            >
              Update Password
            </button>
          </form>
        )}

        {step === 'done' && (
          <div className="mt-5 text-center space-y-4">
            <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
            <p className="text-sm text-slate-700">{message}</p>
            <Link
              to="/login"
              className="inline-block px-5 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-semibold"
            >
              Go to Login
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
