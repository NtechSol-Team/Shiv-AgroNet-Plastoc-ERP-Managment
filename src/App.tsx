import React, { useState } from 'react';
import { Dashboard } from './components/Dashboard';
import { Masters } from './components/Masters';
import { Purchase } from './components/Purchase';
import { Production } from './components/Production';
import { Inventory } from './components/Inventory';
import { Sales } from './components/Sales';
import { Accounts } from './components/Accounts';
import { Finance } from './components/Finance'; // NEW
import { Reports } from './components/Reports';
// import { Header } from './components/Header'; // Deprecated
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';

export default function App() {
  const [activeModule, setActiveModule] = useState('inventory');

  const renderModule = () => {
    switch (activeModule) {
      case 'dashboard':
        return <Dashboard />;
      case 'masters':
        return <Masters />;
      case 'purchase':
        return <Purchase />;
      case 'production':
        return <Production />;
      case 'inventory':
        return <Inventory />;
      case 'sales':
        return <Sales />;
      case 'accounts':
        return <Accounts />;
      case 'finance': // Add Case
        return <Finance />;
      case 'reports':
        return <Reports />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-blue-100 selection:text-blue-900 overflow-x-hidden">
      {/* Sidebar Navigation - Fixed width 16rem (64) */}
      <Sidebar activeModule={activeModule} onModuleChange={setActiveModule} />

      {/* Main Content Area - Pushed right by 16rem */}
      <div className="flex-1 flex flex-col ml-64 min-w-0 transition-all duration-300">
        <TopBar title={activeModule} />

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-full mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
            {renderModule()}
          </div>
        </main>
      </div>
    </div>
  );
}
