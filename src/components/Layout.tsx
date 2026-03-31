import { useState, useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Clock, Calculator, Banknote, Shield, Package, Menu, X, ChevronLeft, Calendar as CalendarIcon, Briefcase, CreditCard } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export function Layout() {
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileOpen(false);
  }, [location.pathname]);

  const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Employees', href: '/employees', icon: Users },
    { name: 'Attendance', href: '/attendance', icon: Clock },
    { name: 'Cash Advance', href: '/cash-advance', icon: Banknote },
    { name: 'Payroll', href: '/payroll', icon: Calculator },
    { name: 'Projects', href: '/projects', icon: Briefcase },
    { name: 'Billing', href: '/billing', icon: CreditCard },
    { name: 'Inventory', href: '/inventory', icon: Package },
    { name: 'Holidays', href: '/holidays', icon: CalendarIcon },
    { name: 'Admin', href: '/admin', icon: Shield },
  ];

  const SidebarContent = () => (
    <>
      <div className="h-16 flex items-center px-6 border-b border-gray-100 justify-between">
        <h1 className={cn(
          "text-xl font-bold text-indigo-600 transition-all duration-300 truncate",
          isCollapsed ? "md:opacity-0 md:w-0" : "opacity-100 w-auto"
        )}>
          Boss Leo
        </h1>
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)} 
          className="hidden md:flex p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <button 
          onClick={() => setIsMobileOpen(false)} 
          className="md:hidden p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      <nav className="flex-1 px-3 py-6 space-y-1.5 overflow-y-auto custom-scrollbar">
        {navigation.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                isActive
                  ? 'bg-indigo-50 text-indigo-600 shadow-sm'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900',
                'group flex items-center px-3 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200',
                isCollapsed ? "md:justify-center md:px-0" : ""
              )}
              title={isCollapsed ? item.name : undefined}
            >
              <item.icon
                className={cn(
                  isActive ? 'text-indigo-600' : 'text-gray-400 group-hover:text-gray-500',
                  'flex-shrink-0 h-5 w-5 transition-colors',
                  isCollapsed ? "md:mr-0" : "mr-3"
                )}
                aria-hidden="true"
              />
              <span className={cn(
                "transition-all duration-300 truncate",
                isCollapsed ? "md:opacity-0 md:w-0" : "opacity-100 w-auto"
              )}>
                {item.name}
              </span>
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-gray-100">
        <div className={cn(
          "flex items-center gap-3 bg-gray-50 p-3 rounded-2xl transition-all duration-300",
          isCollapsed ? "md:justify-center md:p-2" : ""
        )}>
          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
            BL
          </div>
          {!isCollapsed && (
            <div className="min-w-0">
              <p className="text-xs font-bold text-gray-900 truncate">Boss Leo</p>
              <p className="text-[10px] text-gray-500 truncate">Administrator</p>
            </div>
          )}
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col md:flex-row font-sans selection:bg-indigo-100 selection:text-indigo-700">
      {/* Mobile Header */}
      <div className="md:hidden bg-white border-b border-gray-200 p-4 flex justify-between items-center sticky top-0 z-40 shadow-sm h-16">
        <h1 className="text-xl font-bold text-indigo-600">Boss Leo</h1>
        <button 
          onClick={() => setIsMobileOpen(true)}
          className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isMobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileOpen(false)}
              className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-[60] md:hidden"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-72 bg-white z-[70] flex flex-col shadow-2xl md:hidden"
            >
              <SidebarContent />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <div className={cn(
        "hidden md:flex bg-white border-r border-gray-200 flex-col fixed inset-y-0 left-0 z-50 shadow-sm transition-all duration-300 ease-in-out",
        isCollapsed ? "w-20" : "w-64"
      )}>
        <SidebarContent />
      </div>

      {/* Main content */}
      <div className={cn(
        "flex-1 flex flex-col overflow-hidden transition-all duration-300 ease-in-out",
        isCollapsed ? "md:ml-20" : "md:ml-64"
      )}>
        <main className="flex-1 overflow-y-auto bg-[#f8fafc] p-4 md:p-8 lg:p-10">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
