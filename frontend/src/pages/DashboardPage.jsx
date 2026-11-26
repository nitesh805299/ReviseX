import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Globe,
  Loader2,
  LogOut,
  Plus,
  Search,
  Sparkles,
  User as UserIcon,
} from 'lucide-react';
import { Logo } from '../components/Logo';
import { ProjectCard } from '../components/dashboard/ProjectCard';
import { CreateProjectModal } from '../components/dashboard/CreateProjectModal';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';

export function DashboardPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);

  const [quickUrl, setQuickUrl] = useState('');
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickError, setQuickError] = useState('');

  useEffect(() => {
    fetchProjects();
  }, [statusFilter]);

  async function fetchProjects(query = search) {
    setLoading(true);
    try {
      const params = {};
      if (query.trim()) params.search = query.trim();
      if (statusFilter !== 'all') params.status = statusFilter;
      const { data } = await api.get('/projects', { params });
      setProjects(data.projects || []);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateProject(payload) {
    const { data } = await api.post('/projects', payload);
    navigate(`/editor/${data.project._id}`);
  }

  async function handleQuickLaunch(e) {
    e.preventDefault();
    if (!quickUrl.trim()) return;
    setQuickError('');
    let url = quickUrl.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    setQuickLoading(true);
    try {
      await handleCreateProject({ originalUrl: url });
    } catch (err) {
      setQuickError(err.response?.data?.error || 'Could not launch website URL');
      setQuickLoading(false);
    }
  }

  async function handleRename(id, name) {
    const { data } = await api.patch(`/projects/${id}`, { name });
    setProjects((prev) => prev.map((p) => (p._id === id ? data.project : p)));
  }

  async function handleDelete(project) {
    if (!window.confirm(`Delete "${project.name}" and all its proposed changes?`)) return;
    await api.delete(`/projects/${project._id}`);
    setProjects((prev) => prev.filter((p) => p._id !== project._id));
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link to="/dashboard">
            <Logo />
          </Link>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              New Project
            </button>

            <Link
              to="/profile"
              className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700"
            >
              <UserIcon className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">{user?.name}</span>
            </Link>

            <button
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
              title="Log out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 space-y-8 flex-1">
        {/* Welcome & Quick URL Bar */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 mb-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Welcome back, {user?.name?.split(' ')[0]}
              </div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Visual Website Review Workspace
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Paste any public website URL below to launch an isolated visual editing session.
              </p>
            </div>

            <form onSubmit={handleQuickLaunch} className="flex-1 max-w-xl">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Globe className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={quickUrl}
                    onChange={(e) => setQuickUrl(e.target.value)}
                    placeholder="https://your-client-website.com"
                    className="w-full pl-10 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  />
                </div>
                <button
                  type="submit"
                  disabled={quickLoading}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold shadow-sm disabled:opacity-60 transition shrink-0"
                >
                  {quickLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Start Editing
                </button>
              </div>
              {quickError && <p className="text-xs text-red-600 mt-2">{quickError}</p>}
            </form>
          </div>
        </section>

        {/* Search & Filter */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900">
              Recent Projects ({projects.length})
            </h2>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    fetchProjects(e.target.value);
                  }}
                  placeholder="Search projects or URLs..."
                  className="pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600 w-56"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-blue-600"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="in_review">In Review</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="py-16 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : projects.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center space-y-3">
              <Globe className="w-8 h-8 text-slate-400 mx-auto" />
              <h3 className="text-sm font-semibold text-slate-900">No projects yet</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Enter any public website URL above or click &ldquo;New Project&rdquo; to begin proposing
                visual changes without coding.
              </p>
              <button
                onClick={() => setModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold"
              >
                <Plus className="w-4 h-4" />
                Create New Project
              </button>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {projects.map((project) => (
                <ProjectCard
                  key={project._id}
                  project={project}
                  onOpen={(id) => navigate(`/editor/${id}`)}
                  onRename={handleRename}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <CreateProjectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreate={handleCreateProject}
      />
    </div>
  );
}
