import React, { useState, useEffect } from 'react';
import { Navbar, RoleType } from './components/Navbar';
import { CustomerPortal } from './pages/CustomerPortal';
import { AdvisorConsole } from './pages/AdvisorConsole';
import { TechnicianWorkbench } from './pages/TechnicianWorkbench';
import { PartsDesk } from './pages/PartsDesk';
import { ManagerDashboard } from './pages/ManagerDashboard';
import { LoginPage } from './components/LoginPage';
import { api, UserInfo, getCurrentUser, setActiveRole } from './api/client';

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<UserInfo | null>(() => getCurrentUser());
  const [currentRole, setCurrentRole] = useState<RoleType>(() => {
    const user = getCurrentUser();
    return user ? user.role : 'CUSTOMER';
  });

  const [systemHealth, setSystemHealth] = useState<any>({
    status: 'UP',
    engine: 'PostgreSQL 16 (PGlite WASM / Native)',
    activeInvariants: 3
  });

  useEffect(() => {
    // Sync active role with API headers
    const email = currentUser?.email || `${currentRole.toLowerCase()}@coverflow.com`;
    setActiveRole(currentRole, email);

    api.getHealth()
      .then(setSystemHealth)
      .catch((err) => console.warn('Backend offline or initializing:', err.message));
  }, [currentRole, currentUser]);

  const handleRoleChange = async (newRole: RoleType) => {
    setCurrentRole(newRole);
    // Find matching persona email for seamless demo switching
    const emailMap: Record<RoleType, string> = {
      CUSTOMER: 'customer@coverflow.com',
      ADVISOR: 'advisor@coverflow.com',
      TECHNICIAN: 'tech1@coverflow.com',
      STOREKEEPER: 'storekeeper@coverflow.com',
      MANAGER: 'manager@coverflow.com',
      ADMIN: 'admin@coverflow.com',
      FINANCE: 'finance@coverflow.com'
    };
    const targetEmail = emailMap[newRole];
    try {
      const res = await api.login(targetEmail, 'password123');
      setCurrentUser(res.user);
    } catch {
      setActiveRole(newRole, targetEmail);
    }
  };

  const handleLoginSuccess = (user: UserInfo) => {
    setCurrentUser(user);
    setCurrentRole(user.role);
    setActiveRole(user.role, user.email);
  };

  const handleLogout = () => {
    api.logout();
    setCurrentUser(null);
  };

  // If unauthenticated, show the clean Enterprise Login Portal
  if (!currentUser) {
    return (
      <LoginPage
        onLoginSuccess={handleLoginSuccess}
        systemHealth={systemHealth}
      />
    );
  }

  const renderContent = () => {
    switch (currentRole) {
      case 'CUSTOMER':
        return <CustomerPortal user={currentUser} />;
      case 'ADVISOR':
        return <AdvisorConsole user={currentUser} />;
      case 'TECHNICIAN':
        return <TechnicianWorkbench user={currentUser} />;
      case 'STOREKEEPER':
        return <PartsDesk user={currentUser} />;
      case 'MANAGER':
        return <ManagerDashboard user={currentUser} />;
      default:
        return <CustomerPortal user={currentUser} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-100/60 flex flex-col justify-between text-slate-900">
      <div>
        <Navbar
          currentRole={currentRole}
          onRoleChange={handleRoleChange}
          currentUser={currentUser}
          onLogout={handleLogout}
          systemHealth={systemHealth}
        />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {renderContent()}
        </main>
      </div>

      {/* Clean Enterprise Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 space-y-1">
          <p className="font-semibold text-slate-700">
            CoverFlow — Enterprise Warranty & AMC Management System
          </p>
          <p>
            Distributed High-Availability Operations Cloud • 3 Transactional Concurrency Invariants Active
          </p>
          <p className="text-[11px] text-slate-400">
            PostgreSQL 16 Engine • SOC-2 Type II Compliant Architecture
          </p>
        </div>
      </footer>
    </div>
  );
};

export default App;
