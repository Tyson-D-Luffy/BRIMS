import React from 'react';
import { User as UserIcon, Menu } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { NotificationBell } from './NotificationBell';
import { useNavigate } from 'react-router-dom';

interface NavbarProps {
  onMenuClick: () => void;
}

export default function Navbar({ onMenuClick }: NavbarProps) {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between h-20 px-4 sm:px-8 bg-white/80 backdrop-blur-md border-b border-slate-100">
      <div className="flex items-center gap-3">
        <button
          className="lg:hidden p-2 text-slate-500 hover:bg-slate-50 rounded-xl transition-colors"
          onClick={onMenuClick}
          aria-label="Open Navigation Menu"
        >
          <Menu className="w-6 h-6" />
        </button>

        <div className="flex lg:hidden items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg overflow-hidden bg-slate-900 border border-slate-200 flex items-center justify-center shrink-0 shadow-sm">
            <img 
              src="/brims_logo.jpg" 
              alt="BRIMS Logo" 
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          <div>
            <span className="text-base font-black tracking-tight text-slate-900 leading-none block">BRIMS</span>
            <span className="text-[8px] text-cyan-600 font-bold uppercase tracking-wider block">Morepen</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-6 ml-auto">
        <NotificationBell />
        <div className="h-8 w-px bg-slate-100" />
        <div 
          className="flex items-center gap-4 group cursor-pointer"
          onClick={() => navigate('/profile')}
        >
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold text-slate-900 group-hover:text-cyan-600 transition-colors">
              {user?.employeeId ? `${user.employeeId} - ${user.displayName}` : user?.displayName}
            </p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{user?.role}</p>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-cyan-50 flex items-center justify-center text-cyan-700 font-bold border border-cyan-100 shadow-sm group-hover:scale-105 transition-transform">
            {user?.displayName?.[0] || <UserIcon className="w-5 h-5" />}
          </div>
        </div>
      </div>
    </header>
  );
}
