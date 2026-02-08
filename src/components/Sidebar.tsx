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
            {/* Top Logo Area - Product Logo */}
            <div className="h-20 flex items-center justify-center border-b border-slate-100">
                <img src="/product-logo.png" alt="Product Logo" className="h-16 object-contain" />
            </div>

            {/* Top Spacing / Navigation Label */}
            <div className="pt-6 px-6 mb-2">
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

            {/* Brand Footer - Parent Logo */}
            <div className="p-4 border-t-2 border-slate-200 bg-slate-50/50">
                <div className="flex flex-col items-center justify-center">
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">Powered By</p>
                    <img src="/parent-logo.png" alt="Parent Logo" className="h-12 object-contain" />
                </div>
            </div>
        </aside>
    );
}
