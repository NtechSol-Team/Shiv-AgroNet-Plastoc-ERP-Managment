import React from 'react';
import {
    LayoutDashboard,
    Package,
    ShoppingCart,
    Cog,
    Archive,
    CreditCard,
    FileText,
    Settings,
    LogOut,
    ChevronRight,
    Wallet
} from 'lucide-react';

interface SidebarProps {
    activeModule: string;
    onModuleChange: (module: string) => void;
}

export function Sidebar({ activeModule, onModuleChange }: SidebarProps) {
    const menuItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'masters', label: 'Masters', icon: Package },
        { id: 'sales', label: 'Sales', icon: ShoppingCart },
        { id: 'purchase', label: 'Purchase', icon: ShoppingCart },
        { id: 'inventory', label: 'Inventory', icon: Archive },
        { id: 'production', label: 'Production', icon: Cog },
        { id: 'accounts', label: 'Accounts', icon: CreditCard },
        { id: 'finance', label: 'Finance', icon: Wallet },
        { id: 'reports', label: 'Reports', icon: FileText }
    ];

    return (
        <aside className="w-64 h-screen fixed left-0 top-0 bg-white border-r border-slate-100 flex flex-col z-50 transition-all duration-300">
            {/* Top Spacing / Navigation Label */}
            <div className="pt-8 px-6 mb-2">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Apps</p>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto px-4 space-y-1">
                {menuItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeModule === item.id;

                    return (
                        <button
                            key={item.id}
                            onClick={() => onModuleChange(item.id)}
                            className={`
                                w-full flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 group relative
                                ${isActive
                                    ? 'bg-blue-50 text-blue-600'
                                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                                }
                            `}
                        >
                            <Icon className={`w-5 h-5 mr-3 transition-colors ${isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'}`} />
                            <span>{item.label}</span>
                            {isActive && <ChevronRight className="w-4 h-4 text-blue-500 absolute right-3 opacity-100" />}
                        </button>
                    );
                })}
            </nav>

            {/* Brand Footer */}
            <div className="p-6 border-t-2 border-slate-200 mt-2">
                <div className="flex items-center">
                    <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center text-white mr-3 shadow-lg shadow-blue-500/30">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </div>
                    <div>
                        <h1 className="text-sm font-bold text-slate-900 leading-tight">Shiv Egronet</h1>
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mt-0.5">Manufacture OS</p>
                    </div>
                </div>
            </div>
        </aside>
    );
}
