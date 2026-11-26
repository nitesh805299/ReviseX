import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Eye, Layers, MousePointerClick, Share2, ShieldCheck } from 'lucide-react';
import { Logo } from '../components/Logo';
import { useAuthStore } from '../store/authStore';

export function LandingPage() {
  const { user } = useAuthStore();

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col">
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-3">
            {user ? (
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium shadow-sm transition"
              >
                Open Dashboard
                <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="px-3.5 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition"
                >
                  Log in
                </Link>
                <Link
                  to="/register"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium shadow-sm transition"
                >
                  Get Started
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200/70 text-blue-700 text-xs font-semibold mb-6">
            <ShieldCheck className="w-3.5 h-3.5" />
            Isolated Chromium Visual Review · Zero Code Required
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 leading-[1.12]">
            Suggest website edits visually.
            <br />
            <span className="text-blue-600">Never touch live production code.</span>
          </h1>
          <p className="mt-5 text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Paste any public website URL into ReviseX. Click headings, paragraphs, buttons, images,
            or layouts to propose visual changes inside an isolated browser—then share a clear
            before-and-after review link with your developer.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to={user ? '/dashboard' : '/register'}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-sm transition"
            >
              Start Reviewing a Website
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm border border-slate-200 transition"
            >
              Sign in to Workspace
            </Link>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-6 pb-20">
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: MousePointerClick,
                title: 'Click-to-Edit Anything',
                desc: 'Edit headings, copy, images, colors, typography, spacing, and layout visually without knowing HTML or CSS.',
              },
              {
                icon: Layers,
                title: 'Structured Patch Revisions',
                desc: 'Every modification is recorded as an undoable patch with original vs. proposed values and element fingerprints.',
              },
              {
                icon: Share2,
                title: 'Instant Developer Share Links',
                desc: 'Generate read-only share links with side-by-side Original vs. Proposed previews and clear change lists.',
              },
            ].map((feat) => {
              const Icon = feat.icon;
              return (
                <div
                  key={feat.title}
                  className="p-6 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-3"
                >
                  <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-blue-600 shadow-sm">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-semibold text-slate-900">{feat.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{feat.desc}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-10 p-6 rounded-2xl border border-slate-200 bg-slate-900 text-white flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Eye className="w-5 h-5 text-blue-400 shrink-0" />
              <div className="text-sm">
                <span className="font-semibold">Safe by architecture:</span> Original websites remain
                100% untouched. SSRF-protected browser workers isolate every session.
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-300 shrink-0">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Desktop · Tablet · Mobile</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
