import React, { useState } from 'react';
import {
  ShieldCheck,
  UserCheck,
  Wrench,
  Package,
  BarChart3,
  Lock,
  Mail,
  ArrowRight,
  Shield,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { api, RoleType, UserInfo } from '../api/client';

interface LoginPageProps {
  onLoginSuccess: (user: UserInfo) => void;
  systemHealth?: any;
}

interface DemoPersona {
  role: RoleType;
  name: string;
  email: string;
  title: string;
  description: string;
  tag: string;
  icon: React.ReactNode;
  badgeBg: string;
  badgeText: string;
}

const DEMO_PERSONAS: DemoPersona[] = [
  {
    role: 'CUSTOMER',
    name: 'Rohan Sharma',
    email: 'customer@coverflow.com',
    title: 'Customer / Appliance Owner',
    description: 'Self-service appliance registration, active warranty badges & breakdown claims.',
    tag: 'Customer Portal',
    icon: <UserCheck className="w-5 h-5 text-emerald-600" />,
    badgeBg: 'bg-emerald-100',
    badgeText: 'text-emerald-800'
  },
  {
    role: 'ADVISOR',
    name: 'Priya Patel',
    email: 'advisor@coverflow.com',
    title: 'Service Advisor',
    description: 'Frontline complaint triage, Pure Adjudication trace inspection & policy terms ladder.',
    tag: 'Advisor Console',
    icon: <ShieldCheck className="w-5 h-5 text-sky-600" />,
    badgeBg: 'bg-sky-100',
    badgeText: 'text-sky-800'
  },
  {
    role: 'TECHNICIAN',
    name: 'Arjun Verma',
    email: 'tech1@coverflow.com',
    title: 'Field Service Technician',
    description: 'Breach-First dispatch queue, fault code diagnostics, parts requisitions & repair handover.',
    tag: 'Tech Workbench',
    icon: <Wrench className="w-5 h-5 text-amber-600" />,
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-800'
  },
  {
    role: 'STOREKEEPER',
    name: 'Deepak Rao',
    email: 'storekeeper@coverflow.com',
    title: 'Parts Storekeeper',
    description: 'Depot spare parts inventory, stock on hand vs reserved & atomic check constraint guard.',
    tag: 'Parts Desk',
    icon: <Package className="w-5 h-5 text-teal-600" />,
    badgeBg: 'bg-teal-100',
    badgeText: 'text-teal-800'
  },
  {
    role: 'MANAGER',
    name: 'Dr. Suresh Kumar',
    email: 'manager@coverflow.com',
    title: 'Service Operations Manager',
    description: 'Executive SLA radar, turnaround telemetry, breach counters & Goodwill Coverage Overrides.',
    tag: 'Command Center',
    icon: <BarChart3 className="w-5 h-5 text-purple-600" />,
    badgeBg: 'bg-purple-100',
    badgeText: 'text-purple-800'
  }
];

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess, systemHealth }) => {
  const [email, setEmail] = useState('customer@coverflow.com');
  const [password, setPassword] = useState('password123');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedRole, setSelectedRole] = useState<RoleType>('CUSTOMER');

  const handleSelectPersona = (persona: DemoPersona) => {
    setSelectedRole(persona.role);
    setEmail(persona.email);
    setPassword('password123');
    setErrorMsg('');
  };

  const executeLogin = async (targetEmail: string, targetPassword: string) => {
    setErrorMsg('');
    setLoading(true);
    try {
      const res = await api.login(targetEmail, targetPassword);
      onLoginSuccess(res.user);
    } catch (err: any) {
      setErrorMsg(err.message || 'Login failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeLogin(email, password);
  };

  const handleQuickLogin = (persona: DemoPersona, e: React.MouseEvent) => {
    e.stopPropagation();
    handleSelectPersona(persona);
    executeLogin(persona.email, 'password123');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between">
      {/* Enterprise Top Banner */}
      <div className="bg-slate-900 border-b border-slate-800 py-3 px-4 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <div className="w-5 h-5 rounded bg-sky-500 flex items-center justify-center font-bold text-white text-[11px]">
              CF
            </div>
            <span className="font-bold text-slate-200">CoverFlow Enterprise</span>
            <span className="text-slate-600">•</span>
            <span>Service & Warranty Orchestration Cloud</span>
          </div>
          <div className="flex items-center space-x-3">
            <span className="text-emerald-400 font-mono flex items-center space-x-1.5 text-[11px]">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>PostgreSQL 16 Engine Active</span>
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400 font-mono text-[11px]">3 Transactional Invariants Active</span>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-6xl w-full mx-auto px-4 py-8 flex-1 flex flex-col justify-center">
        {/* Hero Branding */}
        <div className="text-center max-w-3xl mx-auto mb-8">
          <div className="inline-flex items-center space-x-2 bg-slate-900 border border-slate-800 px-3.5 py-1.5 rounded-full text-xs text-sky-400 font-medium mb-4 shadow-inner">
            <Shield className="w-3.5 h-3.5 text-sky-400" />
            <span>Enterprise Multi-Actor Service Platform</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            CoverFlow <span className="text-sky-400">Sign In</span>
          </h1>
          <p className="mt-2 text-sm sm:text-base text-slate-400 leading-relaxed">
            Deterministic Warranty Adjudication & Concurrency-Guarded Transactional Execution.
            Sign in below or select a role persona to access your operational workspace.
          </p>
        </div>

        {/* 2-Column Section */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Actor Selection Cards */}
          <div className="lg:col-span-7 space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs uppercase tracking-wider font-bold text-slate-400">
                Select Workspace Persona
              </h2>
              <span className="text-xs text-slate-500">One-click enterprise access</span>
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {DEMO_PERSONAS.map((p) => {
                const isSelected = selectedRole === p.role;
                return (
                  <div
                    key={p.role}
                    onClick={() => handleSelectPersona(p)}
                    className={`cursor-pointer text-left p-3.5 rounded-xl border transition-all duration-200 bg-slate-900/60 hover:bg-slate-900 ${
                      isSelected
                        ? 'border-sky-500 ring-2 ring-sky-500/30 bg-slate-900'
                        : 'border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start space-x-3">
                        <div className="p-2 rounded-lg bg-slate-800 border border-slate-700 shadow-sm mt-0.5">
                          {p.icon}
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-semibold text-slate-100 text-sm">{p.name}</span>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${p.badgeBg} ${p.badgeText}`}>
                              {p.tag}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 font-mono mt-0.5">{p.email}</div>
                          <p className="text-xs text-slate-400 mt-1.5 leading-snug">{p.description}</p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => handleQuickLogin(p, e)}
                        disabled={loading}
                        className="shrink-0 flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white transition shadow-sm"
                        title={`Sign in immediately as ${p.name}`}
                      >
                        <span>Sign In</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Credential Form */}
          <div className="lg:col-span-5">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-7 shadow-xl sticky top-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-5">
                <div>
                  <h3 className="text-base font-bold text-white">Sign In with Credentials</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Authenticating as <span className="text-sky-400 font-semibold">{selectedRole}</span>
                  </p>
                </div>
                <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 font-bold text-xs">
                  {selectedRole.slice(0, 2)}
                </div>
              </div>

              {errorMsg && (
                <div className="mb-4 p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="e.g. customer@coverflow.com"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-300">
                      Password
                    </label>
                    <span className="text-[11px] text-slate-500 font-mono">Default: password123</span>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder="••••••••••••"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 py-2.5 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold text-sm transition flex items-center justify-center space-x-2 shadow-lg shadow-sky-600/20 disabled:opacity-50"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Enter Workspace</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Enterprise Guarantee */}
              <div className="mt-6 pt-5 border-t border-slate-800 text-[11px] text-slate-400 space-y-2">
                <div className="flex items-center space-x-2 text-slate-300 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Security & Data Isolation:</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Role-based views and actions are strictly partitioned. Zero unauthorized cross-role modifications.
                </p>
                {systemHealth?.engine && (
                  <div className="text-[10px] text-slate-500 font-mono">
                    Engine: {systemHealth.engine}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Enterprise Footer */}
      <footer className="bg-slate-950 border-t border-slate-900 py-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>
            CoverFlow Enterprise Warranty & Service Management Systems Inc. • All rights reserved.
          </p>
          <p className="text-[11px] text-slate-600">
            SOC-2 Type II Certified • High-Availability Distributed PostgreSQL Architecture
          </p>
        </div>
      </footer>
    </div>
  );
};
