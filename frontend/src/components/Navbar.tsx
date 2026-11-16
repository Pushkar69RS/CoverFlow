import React from 'react';
import { ShieldCheck, UserCheck, Wrench, Package, BarChart3, CheckCircle2, LogOut, RotateCcw } from 'lucide-react';
import { api, setActiveRole, UserInfo, RoleType } from '../api/client';

export type { RoleType };

interface NavbarProps {
  currentRole: RoleType;
  onRoleChange: (role: RoleType) => void;
  currentUser?: UserInfo | null;
  onLogout?: () => void;
  systemHealth?: any;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentRole,
  onRoleChange,
  currentUser,
  onLogout,
  systemHealth
}) => {
  const roles: Array<{ id: RoleType; label: string; email: string; icon: React.ReactNode }> = [
    { id: 'CUSTOMER', label: 'Customer', email: 'customer@coverflow.com', icon: <UserCheck className="w-4 h-4" /> },
    { id: 'ADVISOR', label: 'Service Advisor', email: 'advisor@coverflow.com', icon: <ShieldCheck className="w-4 h-4" /> },
    { id: 'TECHNICIAN', label: 'Technician', email: 'tech1@coverflow.com', icon: <Wrench className="w-4 h-4" /> },
    { id: 'STOREKEEPER', label: 'Parts Desk', email: 'storekeeper@coverflow.com', icon: <Package className="w-4 h-4" /> },
    { id: 'MANAGER', label: 'Service Manager', email: 'manager@coverflow.com', icon: <BarChart3 className="w-4 h-4" /> },
  ];

  const handleRoleSelect = (r: (typeof roles)[0]) => {
    setActiveRole(r.id, r.email);
    onRoleChange(r.id);
  };

  return (
    <header className="bg-slate-900 text-white shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-sky-500 flex items-center justify-center font-bold text-white shadow-md">
              CF
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-lg font-bold tracking-tight text-white">CoverFlow</span>
                <span className="text-xs bg-sky-950 text-sky-400 px-2 py-0.5 rounded-full font-mono border border-sky-800">
                  Enterprise
                </span>
              </div>
              <p className="text-xs text-slate-400">Warranty & AMC Adjudication System</p>
            </div>
          </div>

          {/* Engine & Invariant Badge + Quick Demo Reset */}
          <div className="hidden lg:flex items-center space-x-2.5">
            <div className="flex items-center space-x-2 text-xs bg-slate-800/80 border border-slate-700 px-3 py-1.5 rounded-md">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-slate-300 font-medium">
                {systemHealth?.engine ? 'PostgreSQL 16 Engine' : 'PostgreSQL 16'}
              </span>
              <span className="text-slate-500">•</span>
              <span className="text-emerald-400 font-mono">Guards Active (3 Invariants)</span>
            </div>

            <button
              onClick={async () => {
                try {
                  await api.resetDemoQueue();
                  window.location.reload();
                } catch (err: any) {
                  alert('Error resetting demo: ' + err.message);
                }
              }}
              className="flex items-center space-x-1.5 bg-slate-800/90 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 px-2.5 py-1.5 rounded-md text-xs transition"
              title="Reset database to 3 pristine demonstration tickets"
            >
              <RotateCcw className="w-3 h-3 text-sky-400" />
              <span>Reset Demo (3 Jobs)</span>
            </button>
          </div>

          {/* Right Section: Role Switcher & User Actions */}
          <div className="flex items-center space-x-2">
            {/* Role Switcher Pills */}
            <div className="flex items-center space-x-1 bg-slate-800 p-1 rounded-lg border border-slate-700">
              {roles.map((r) => {
                const isActive = currentRole === r.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => handleRoleSelect(r)}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-sky-600 text-white shadow-sm'
                        : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
                    }`}
                  >
                    {r.icon}
                    <span className="hidden sm:inline">{r.label}</span>
                  </button>
                );
              })}
            </div>

            {/* User Chip & Sign Out */}
            {currentUser && onLogout && (
              <div className="flex items-center space-x-1.5 pl-2 border-l border-slate-800">
                <div className="hidden xl:flex items-center space-x-2 px-2 py-1 text-xs text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span className="font-medium text-white">{currentUser.full_name}</span>
                </div>
                <button
                  onClick={onLogout}
                  className="flex items-center space-x-1 bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-800 px-2.5 py-1.5 rounded-lg text-xs font-medium transition"
                  title="Sign Out to Login Portal"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
