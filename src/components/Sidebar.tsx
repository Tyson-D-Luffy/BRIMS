import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Package, 
  FileText, 
  ClipboardList, 
  History, 
  Shield,
  ShieldCheck,
  Settings, 
  User,
  LogOut,
  X,
  ChevronDown,
  Database,
  Layers
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { useBranch } from '../context/BranchContext';
import { getUserBaseRole } from '../types';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { 
    name: 'Masters', 
    icon: Database,
    submenu: [
      { name: 'Product Masters', href: '/product-masters' },
      { name: 'Batch Number Engine', href: '/batch-number-generator-engine' },
      { name: 'Batch Sheet Masters', href: '/batch-sheet-masters' },
      { name: 'Department Master', href: '/department-masters' },
      { name: 'Designation Master', href: '/designation-masters' },
    ]
  },
  { 
    name: 'Batch Sheet', 
    icon: ClipboardList,
    submenu: [
      { name: 'New Batch sheet Request', href: '/batches' },
      { name: 'Request Status', href: '/batch-sheet-records/status' },
    ]
  },
  {
    name: 'Audit Logs',
    icon: History,
    submenu: [
      { name: 'Batch process Audit logs', href: '/audit/batch' },
      { name: 'System Admin Audit logs', href: '/audit/system' },
    ]
  },
  { name: 'Admin Panel', href: '/admin', icon: Shield },
  { name: 'AI Compliance Guardian', href: '/compliance-guardian', icon: ShieldCheck },
];

const hasAccessToSubmenu = (sub: any, user: any) => {
  const isAdmin = getUserBaseRole(user) === 'ADMIN';
  if (isAdmin) return true;
  const perms = user?.permissions || [];

  if (sub.href === '/product-masters') {
    return perms.some((p: string) => p.includes('product'));
  }
  if (sub.href === '/batch-number-generator-engine') {
    return perms.some((p: string) => p.includes('batch_number'));
  }
  if (sub.href === '/batch-sheet-masters') {
    return perms.some((p: string) => p.includes('batch_sheet_master') || p.includes('format'));
  }
  if (sub.href === '/department-masters') {
    return perms.some((p: string) => p.includes('department'));
  }
  if (sub.href === '/designation-masters') {
    return perms.some((p: string) => p.includes('designation'));
  }
  if (sub.href === '/batches') {
    return perms.includes('batch:create');
  }
  if (sub.href === '/batch-sheet-records/status') {
    return perms.some((p: string) => p.startsWith('batch:'));
  }
  if (sub.href === '/audit/batch') {
    return perms.includes('audit:view');
  }
  if (sub.href === '/audit/system') {
    return false; // system admin audit is ADMIN only
  }
  return false;
};

const hasAccessToItem = (item: any, user: any) => {
  const isAdmin = getUserBaseRole(user) === 'ADMIN';
  if (isAdmin) return true;
  
  if (item.href === '/') return true; // Dashboard is accessible to all
  if (item.href === '/compliance-guardian') return true; // AI Compliance Guardian is accessible to all logged in users
  if (item.href === '/admin') {
    return user?.permissions?.includes('user:manage');
  }

  if (item.submenu) {
    return item.submenu.some((sub: any) => hasAccessToSubmenu(sub, user));
  }

  return false;
};

interface SidebarProps {
  mobile?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ mobile, onClose }: SidebarProps) {
  const location = useLocation();
  const { logout, user } = useAuth();
  const { selectedBranch } = useBranch();
  const [openMenus, setOpenMenus] = React.useState<Record<string, boolean>>({
    'Masters': location.pathname.startsWith('/product-masters') || location.pathname.startsWith('/batch-sheet-masters') || location.pathname.startsWith('/batch-number-generator-engine') || location.pathname.startsWith('/department-masters') || location.pathname.startsWith('/designation-masters'),
    'Batch Sheet': location.pathname.startsWith('/batches') || location.pathname.startsWith('/batch-sheet-records/status'),
    'Audit Logs': location.pathname.startsWith('/audit')
  });

  const toggleMenu = (name: string) => {
    setOpenMenus(prev => ({ ...prev, [name]: !prev[name] }));
  };

  React.useEffect(() => {
    if (mobile) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobile]);

  const content = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-8 py-8 border-b border-white/5">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-800 border border-white/10 flex items-center justify-center shadow-lg shadow-cyan-500/10 shrink-0">
              <img 
                src="/brims_logo.jpg" 
                alt="BRIMS Logo" 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <span className="text-2xl font-black tracking-tighter text-white block leading-none">BRIMS</span>
              <span className="text-[9px] text-cyan-400 font-semibold tracking-wider uppercase block mt-1">Morepen Laboratories</span>
            </div>
          </div>
          {selectedBranch && (
            <div className="mt-2 inline-flex items-center gap-1.5 self-start px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white text-[10px] font-bold tracking-wider uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {selectedBranch}
            </div>
          )}
        </div>
        {mobile && (
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        )}
      </div>
      
      <nav className="flex-1 px-4 space-y-2 mt-4 overflow-y-auto sidebar-scrollbar">
        <div className="px-4 mb-2">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">Navigation</p>
        </div>
        {navigation.filter(item => hasAccessToItem(item, user)).map((item) => {
          const hasSubmenu = item.submenu && item.submenu.length > 0;
          const isActive = !hasSubmenu && (location.pathname === item.href || (item.href !== '/' && location.pathname.startsWith(item.href!)));
          const isMenuOpen = openMenus[item.name];
          
          if (hasSubmenu) {
            const isSubItemActive = item.submenu!.some(sub => {
              if (sub.href === '/batches') {
                return location.pathname === '/batches';
              } else if (sub.href === '/batch-sheet-records/status') {
                return location.pathname.startsWith('/batch-sheet-records/status') || location.pathname.startsWith('/batches/');
              }
              return location.pathname.startsWith(sub.href);
            });
            
            return (
              <div key={item.name} className="space-y-1">
                <button
                  onClick={() => toggleMenu(item.name)}
                  className={cn(
                    "flex items-center w-full gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 group",
                    isSubItemActive 
                      ? "text-white" 
                      : "text-gray-400 hover:text-white hover:bg-white/5"
                  )}
                >
                  <item.icon className={cn(
                    "w-5 h-5 transition-colors",
                    isSubItemActive ? "text-[#FF6321]" : "text-gray-500 group-hover:text-gray-300"
                  )} />
                  {item.name}
                  <ChevronDown className={cn(
                    "ml-auto w-4 h-4 transition-transform duration-200",
                    isMenuOpen && "rotate-180"
                  )} />
                </button>
                
                {isMenuOpen && (
                  <div className="ml-9 space-y-1">
                    {item.submenu!.filter(sub => hasAccessToSubmenu(sub, user)).map((sub) => {
                      let isSubActive = false;
                      if (sub.href === '/batches') {
                        isSubActive = location.pathname === '/batches';
                      } else if (sub.href === '/batch-sheet-records/status') {
                        isSubActive = location.pathname.startsWith('/batch-sheet-records/status') || location.pathname.startsWith('/batches/');
                      } else {
                        isSubActive = location.pathname.startsWith(sub.href);
                      }
                      return (
                        <Link
                          key={sub.name}
                          to={sub.href}
                          className={cn(
                            "flex items-center px-4 py-2 rounded-xl text-[13px] font-medium transition-all duration-200",
                            isSubActive 
                              ? "bg-white/10 text-white" 
                              : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                          )}
                          onClick={onClose}
                        >
                          {sub.name}
                          {isSubActive && (
                            <div className="ml-auto w-1 h-1 rounded-full bg-[#FF6321]" />
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          return (
            <Link
              key={item.name}
              to={item.href!}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 group",
                isActive 
                  ? "bg-white/10 text-white shadow-sm" 
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              )}
              onClick={onClose}
            >
              <item.icon className={cn(
                "w-5 h-5 transition-colors",
                isActive ? "text-[#FF6321]" : "text-gray-500 group-hover:text-gray-300"
              )} />
              {item.name}
              {isActive && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#FF6321] shadow-[0_0_8px_rgba(255,99,33,0.6)]" />
              )}
            </Link>
          );
        })}

        <div className="pt-6 mt-6 border-t border-white/5 space-y-2 pb-8">
          <Link
            to="/profile"
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200",
              location.pathname === '/profile' ? "bg-white/10 text-white" : "text-gray-400 hover:text-white hover:bg-white/5"
            )}
            onClick={onClose}
          >
            <User className="w-5 h-5 text-gray-500" />
            Profile
          </Link>
          <Link
            to="/settings"
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200",
              location.pathname === '/settings' ? "bg-white/10 text-white" : "text-gray-400 hover:text-white hover:bg-white/5"
            )}
            onClick={onClose}
          >
            <Settings className="w-5 h-5 text-gray-500" />
            Settings
          </Link>
          <button
            onClick={logout}
            className="flex items-center w-full gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/5 transition-all duration-200"
          >
            <LogOut className="w-5 h-5" />
            Logout
          </button>
        </div>
      </nav>
    </div>
  );

  if (mobile) {
    return (
      <div className="fixed inset-0 z-50 lg:hidden">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />
        <div className="fixed inset-y-0 left-0 w-64 bg-[#151619] shadow-xl flex flex-col h-full overflow-hidden">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col bg-[#151619]">
      {content}
    </div>
  );
}
