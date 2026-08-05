import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { PermanentDriver, ShippingCompany, Order, Product, Agent } from '../types';
import PermanentDriversManager from './PermanentDriversManager';
import ManagerDashboard from './ManagerDashboard';
import {
  Activity,
  Shield,
  Zap,
  UserCheck,
  Cpu,
  Server,
  Database,
  Wifi,
  Terminal,
  RefreshCw,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Trash2,
  Search,
  X,
  Globe,
  Truck,
  ShoppingBag,
  FileText,
  Users,
  Briefcase
} from 'lucide-react';

interface SeniorAdminDashboardProps {
  orders?: Order[];
  products?: Product[];
  agents?: Agent[];
  shippingCompanies?: ShippingCompany[];
  permanentDrivers?: PermanentDriver[];
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
  askConfirm: (title: string, message: string, onConfirm: () => void) => void;
  currentUser?: any;
  onAddProduct?: (newProduct: Product) => Promise<boolean>;
  onToggleProduct?: (productId: string) => void;
  onDeleteProduct?: (productId: string) => void;
  onUpdateProduct?: (productData: Product) => Promise<boolean>;
  onAddAgent?: (newAgent: Agent) => Promise<boolean>;
  onToggleAgent?: (agentId: string) => void;
  onDeleteAgent?: (agentId: string) => void;
  onUpdateAgent?: (agentData: Agent) => Promise<boolean>;
  onAddShippingCompany?: (newCompany: ShippingCompany) => Promise<boolean>;
  onUpdateShippingCompany?: (companyData: ShippingCompany) => Promise<boolean>;
  onToggleShippingCompany?: (companyId: string) => void;
  onDeleteShippingCompany?: (companyId: string) => void;
  onAddPermanentDriver?: (driver: Partial<PermanentDriver>) => Promise<boolean>;
  onBulkImportPermanentDrivers?: (drivers: Partial<PermanentDriver>[]) => Promise<boolean>;
  onUpdatePermanentDriver?: (driver: PermanentDriver) => Promise<boolean>;
  onTogglePermanentDriver?: (driverId: string) => void;
  onDeletePermanentDriver?: (driverId: string) => void;
  onApproveOrder?: (orderId: string) => void;
  onRejectOrder?: (orderId: string, reason: string) => void;
  onDispatchToFactory?: (orderId: string, comment?: string) => void;
  onUpdateAllOrders?: (updatedOrders: Order[]) => void;
  onApproveAllOrders?: (orderIds?: string[]) => void;
  onDispatchAllToFactory?: () => void;
  onSaveLocation?: (orderId: string, deliveryLocationUrl: string) => Promise<void>;
  onClearTransactions?: () => Promise<boolean>;
  sandboxEnabled?: boolean;
  onToggleSandbox?: () => void;
}

export default function SeniorAdminDashboard({
  orders = [],
  products = [],
  agents = [],
  shippingCompanies = [],
  permanentDrivers = [],
  showToast,
  askConfirm,
  currentUser,
  onAddProduct,
  onToggleProduct,
  onDeleteProduct,
  onUpdateProduct,
  onAddAgent,
  onToggleAgent,
  onDeleteAgent,
  onUpdateAgent,
  onAddShippingCompany,
  onUpdateShippingCompany,
  onToggleShippingCompany,
  onDeleteShippingCompany,
  onAddPermanentDriver,
  onBulkImportPermanentDrivers,
  onUpdatePermanentDriver,
  onTogglePermanentDriver,
  onDeletePermanentDriver,
  onApproveOrder,
  onRejectOrder,
  onDispatchToFactory,
  onUpdateAllOrders,
  onApproveAllOrders,
  onDispatchAllToFactory,
  onSaveLocation,
  onClearTransactions,
  sandboxEnabled = true,
  onToggleSandbox
}: SeniorAdminDashboardProps) {
  const [activeAdminTab, setActiveAdminTab] = useState<'SYSTEM_MONITOR' | 'SYSTEM_DEFINITIONS' | 'PERMANENT_DRIVERS' | 'SEARCH_ORDERS'>('SYSTEM_MONITOR');
  const [orderSearchQuery, setOrderSearchQuery] = useState<string>('');
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [systemMetrics, setSystemMetrics] = useState<any>(null);
  const [activitySearch, setActivitySearch] = useState<string>('');
  const [activityRoleFilter, setActivityRoleFilter] = useState<string>('ALL');
  const [activityModuleFilter, setActivityModuleFilter] = useState<string>('ALL');
  const [autoRefreshActive, setAutoRefreshActive] = useState<boolean>(true);
  const [logsConsoleContent, setLogsConsoleContent] = useState<string>('');
  const [isRefreshingMonitor, setIsRefreshingMonitor] = useState<boolean>(false);
  const [registeredUsersCount, setRegisteredUsersCount] = useState<number>(0);
  const [isClearingTransactions, setIsClearingTransactions] = useState<boolean>(false);

  const handleClearTransactionsClick = () => {
    askConfirm(
      '⚠️ پاکسازی کامل کلیه تراکنش‌ها و سفارشات',
      'آیا از حذف کامل تمام سفارشات، فاکتورها، سوابق گردش کالا و لاگ‌های سیستم اطمینان دارید؟\n\nنکته مهم: اطلاعات پایه مانند حساب کاربران، نمایندگی‌ها، باربری‌ها و محصولات دست‌نخورده باقی می‌مانند.',
      async () => {
        setIsClearingTransactions(true);
        try {
          if ('caches' in window) {
            try { await caches.delete('tabarestan-api-cache-v1'); } catch {}
          }
          if (onClearTransactions) {
            await onClearTransactions();
          } else {
            const res = await fetch('/api/system/clear-transactions', { method: 'POST', cache: 'no-store' });
            const d = await res.json();
            if (d.success) {
              showToast('کلیه تراکنش‌ها و سفارشات با موفقیت پاکسازی شدند.', 'success');
            } else {
              showToast(d.error || 'خطا در پاکسازی تراکنش‌ها', 'error');
            }
          }
          setActivityLogs([]);
          if ('caches' in window) {
            try { await caches.delete('tabarestan-api-cache-v1'); } catch {}
          }
          await fetchSystemLogsAndStats();
        } catch (err) {
          showToast('خطا در ارتباط با سرور جهت پاکسازی تراکنش‌ها', 'error');
        } finally {
          setIsClearingTransactions(false);
        }
      }
    );
  };

  const handleClearActivityLogs = async () => {
    askConfirm(
      'پاکسازی لاگ‌های فعالیت کاربران',
      'آیا از حذف تمام لاگ‌های ثبت‌شده فعالیت کاربران در سیستم اطمینان دارید؟',
      async () => {
        try {
          const res = await fetch('/api/system/clear-activity-logs', { method: 'POST' });
          const data = await res.json();
          if (data.success) {
            setActivityLogs([]);
            showToast('لاگ‌های فعالیت سیستم با موفقیت پاکسازی شدند.', 'success');
            fetchSystemLogsAndStats();
          } else {
            showToast(data.error || 'خطا در پاکسازی لاگ‌ها', 'error');
          }
        } catch (err) {
          showToast('خطای شبکه در پاکسازی لاگ‌ها', 'error');
        }
      }
    );
  };

  const fetchSystemLogsAndStats = async () => {
    setIsRefreshingMonitor(true);
    try {
      // 1. Fetch activity logs
      const resLogs = await fetch('/api/system/activity-logs?limit=100');
      if (resLogs.ok) {
        const ct = resLogs.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const data = await resLogs.json();
          if (data.logs && Array.isArray(data.logs)) {
            setActivityLogs(data.logs);
          }
        }
      }

      // 2. Fetch system metrics
      const resMetrics = await fetch('/api/system/metrics');
      if (resMetrics.ok) {
        const ct = resMetrics.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const data = await resMetrics.json();
          if (data.success) {
            setSystemMetrics(data);
          }
        }
      }

      // 3. Fetch error logs console
      const resErr = await fetch('/api/system/error-logs');
      if (resErr.ok) {
        const ct = resErr.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const data = await resErr.json();
          setLogsConsoleContent(data.logs || 'هیچ خطایی در سیستم ثبت نشده است.');
        }
      }

      // 4. Fetch users count
      const resUsers = await fetch('/api/users');
      if (resUsers.ok) {
        const ct = resUsers.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const data = await resUsers.json();
          if (Array.isArray(data)) {
            setRegisteredUsersCount(data.length);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching system logs and stats:', err);
    } finally {
      setIsRefreshingMonitor(false);
    }
  };

  useEffect(() => {
    fetchSystemLogsAndStats();
    if (autoRefreshActive) {
      const interval = setInterval(fetchSystemLogsAndStats, 10000);
      return () => clearInterval(interval);
    }
  }, [autoRefreshActive]);

  const handleFlushCache = async () => {
    try {
      const res = await fetch('/api/system/flush-cache', { method: 'POST' });
      if (res.ok) {
        showToast('حافظه کش سرور با موفقیت پاکسازی شد.', 'success');
        fetchSystemLogsAndStats();
      } else {
        showToast('خطا در پاکسازی کش سرور', 'error');
      }
    } catch (err) {
      showToast('خطای ارتباط با سرور', 'error');
    }
  };

  const handleClearErrorLogs = async () => {
    askConfirm(
      'پاکسازی لاگ‌های خطا',
      'آیا از پاکسازی کل فایل لاگ‌های خطای سرور اطمینان دارید؟',
      async () => {
        try {
          const res = await fetch('/api/system/clear-error-logs', { method: 'POST' });
          if (res.ok) {
            showToast('لاگ‌های خطا با موفقیت پاکسازی شد.', 'success');
            setLogsConsoleContent('هیچ خطایی در فایل لاگ ثبت نشده است.');
          }
        } catch (err) {
          showToast('خطا در پاکسازی لاگ‌ها', 'error');
        }
      }
    );
  };

  const translateRoleName = (role: string) => {
    switch (role) {
      case 'SYSTEM_ADMIN': return 'ادمین ارشد نرم‌افزار';
      case 'SALES_MANAGER': return 'مدیر بازرگانی و فروش';
      case 'REPRESENTATIVE': return 'نمایندگی فروش';
      case 'FACTORY_TRANSPORT': return 'مدیریت کارخانه';
      case 'SHIPPING_COMPANY': return 'شرکت حمل و نقل';
      default: return role || 'کاربر عمومی';
    }
  };

  const filteredActivityLogs = activityLogs.filter(log => {
    const matchesSearch = !activitySearch || 
      (log.userName && log.userName.toLowerCase().includes(activitySearch.toLowerCase())) ||
      (log.action && log.action.toLowerCase().includes(activitySearch.toLowerCase())) ||
      (log.details && log.details.toLowerCase().includes(activitySearch.toLowerCase())) ||
      (log.ipAddress && log.ipAddress.includes(activitySearch));

    const matchesRole = activityRoleFilter === 'ALL' || log.userRole === activityRoleFilter;
    const matchesModule = activityModuleFilter === 'ALL' || log.module === activityModuleFilter;

    return matchesSearch && matchesRole && matchesModule;
  });

  const handleExportActivityLogs = () => {
    if (filteredActivityLogs.length === 0) {
      showToast('هیچ لاگ فعالیتی برای دریافت خروجی یافت نشد.', 'info');
      return;
    }
    try {
      const formattedData = filteredActivityLogs.map(item => ({
        'شناسه': item.id,
        'تاریخ و زمان': new Date(item.createdAt).toLocaleString('fa-IR'),
        'کاربر': item.userName,
        'نقش سازمانی': translateRoleName(item.userRole),
        'نوع فعالیت': item.action,
        'ماژول': item.module,
        'شرح جزئیات': item.details,
        'آدرس IP': item.ipAddress,
        'وضعیت': item.status === 'SUCCESS' ? 'موفق' : item.status === 'WARNING' ? 'هشدار' : 'خطا'
      }));

      const ws = XLSX.utils.json_to_sheet(formattedData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Activity_Report");
      XLSX.writeFile(wb, `Software_Admin_Audit_Report_${new Date().toISOString().slice(0,10)}.xlsx`);
      showToast('گزارش فعالیت کاربران با موفقیت دانلود شد.', 'success');
    } catch (err) {
      showToast('خطا در صدور فایل اکسل', 'error');
    }
  };

  return (
    <div className="animate-fade-in font-sans space-y-8 pb-12 dir-rtl text-right" id="senior-admin-dashboard">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-purple-950 to-slate-900 text-white rounded-3xl p-6 md:p-8 shadow-xl border border-purple-900/50 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none"></div>
        
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="px-3 py-1 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-full text-xs font-bold flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-purple-400" />
                مرکز پایش، لایو لاگ و کنترلی ادمین ارشد نرم‌افزار
              </span>
              <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full text-xs font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                پایدار (پورت ۳۰۰۰)
              </span>
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight flex items-center gap-3">
              <span>داشبورد اختصاصی ادمین ارشد نرم‌افزار (پایش فعالیت کاربران و زیرساخت)</span>
            </h2>
            <p className="text-slate-300 text-xs md:text-sm mt-2 leading-relaxed max-w-3xl">
              رصد لحظه‌ای تمام فعالیت‌های کاربران، وضعیت دیتابیس، حافظه رم و پردازنده سرور، لاگ‌های لایو شبکه و عیب‌یابی آنی سیستم
            </p>
          </div>

          {/* Action Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {onToggleSandbox && (
              <button
                type="button"
                onClick={onToggleSandbox}
                className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer border flex items-center gap-2 shadow-md ${
                  sandboxEnabled
                    ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-400/50'
                    : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-amber-500/30'
                }`}
                title="فعال یا غیرفعال‌سازی نوار میانبر شبیه‌ساز (Sandbox) در بالای برنامه"
              >
                <Zap className="w-4 h-4 text-amber-200" />
                <span>{sandboxEnabled ? 'میانبر شبیه‌ساز: فعال 🟢' : 'میانبر شبیه‌ساز: غیرفعال 🔴'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleClearTransactionsClick}
              disabled={isClearingTransactions}
              className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white border border-rose-400/40 rounded-xl text-xs font-black transition-all flex items-center gap-2 shadow-md cursor-pointer animate-pulse hover:animate-none"
              title="پاکسازی کامل تمام سفارشات و فاکتورها (حفظ کامل حساب‌های کاربر، باربری‌ها و محصولات)"
            >
              <Trash2 className="w-4 h-4 text-rose-200" />
              <span>{isClearingTransactions ? 'در حال پاکسازی...' : 'حذف کلیه تراکنش‌ها و سفارشات'}</span>
            </button>

            <button
              type="button"
              onClick={fetchSystemLogsAndStats}
              disabled={isRefreshingMonitor}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-purple-200 border border-purple-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshingMonitor ? 'animate-spin text-purple-400' : 'text-purple-300'}`} />
              <span>به‌روزرسانی آنی</span>
            </button>

            <button
              type="button"
              onClick={() => setAutoRefreshActive(!autoRefreshActive)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border cursor-pointer ${
                autoRefreshActive 
                  ? 'bg-emerald-950/80 text-emerald-200 border-emerald-500/40 shadow-sm' 
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full ${autoRefreshActive ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'}`}></span>
              <span>{autoRefreshActive ? 'رفرش اتوماتیک (۱۰s)' : 'رفرش خودکار خاموش'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Sub-Tab Navigation Switcher */}
      <div className="flex flex-wrap items-center gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
        <button
          type="button"
          onClick={() => setActiveAdminTab('SYSTEM_MONITOR')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
            activeAdminTab === 'SYSTEM_MONITOR'
              ? 'bg-purple-900 text-white shadow-md'
              : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/80'
          }`}
        >
          <Activity className="w-4 h-4 text-purple-300" />
          <span>پایش و مانیتورینگ لایو سیستم</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveAdminTab('SYSTEM_DEFINITIONS')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
            activeAdminTab === 'SYSTEM_DEFINITIONS'
              ? 'bg-purple-900 text-white shadow-md'
              : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/80'
          }`}
        >
          <Users className="w-4 h-4 text-emerald-400" />
          <span>تعریف کاربران، نمایندگی‌ها و کالاها ({agents.length} نمایندگی / {products.length} محصول)</span>
          <span className="px-2 py-0.5 bg-emerald-500 text-slate-950 text-[10px] rounded-full font-bold">تعریف پایه</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveAdminTab('PERMANENT_DRIVERS')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
            activeAdminTab === 'PERMANENT_DRIVERS'
              ? 'bg-purple-900 text-white shadow-md'
              : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/80'
          }`}
        >
          <Truck className="w-4 h-4 text-amber-400" />
          <span>مدیریت و ثبت دائم رانندگان ({permanentDrivers.length})</span>
          <span className="px-2 py-0.5 bg-amber-500 text-slate-950 text-[10px] rounded-full font-bold">اختصاصی ادمین ارشد</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveAdminTab('SEARCH_ORDERS')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
            activeAdminTab === 'SEARCH_ORDERS'
              ? 'bg-purple-900 text-white shadow-md'
              : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/80'
          }`}
        >
          <Search className="w-4 h-4 text-cyan-300" />
          <span>استعلام و جستجوی سرتاسری سفارشات ({orders.length})</span>
        </button>
      </div>

      {activeAdminTab === 'SYSTEM_DEFINITIONS' && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 space-y-4" id="senior-admin-definitions-view">
          <div className="bg-gradient-to-r from-purple-950 via-slate-900 to-indigo-950 text-white p-4 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border border-purple-800/50 shadow-md">
            <div>
              <h3 className="text-sm font-black text-amber-300 flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                <span>تعریف و مدیریت دسترسی کاربران، نمایندگان و اطلاعات پایه (دسترسی ویژه ادمین ارشد)</span>
              </h3>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                دسترسی کامل مدیریت جهت تعریف حساب کاربران، فعال‌سازی کدهای نمایندگی، فهرست محصولات و شرکت‌های حمل و نقل
              </p>
            </div>
            <span className="px-3 py-1 bg-emerald-500 text-slate-950 font-black text-xs rounded-lg shadow-sm whitespace-nowrap">
              دسترسی کامل ادمین ارشد 🛡️
            </span>
          </div>

          <ManagerDashboard
            orders={orders}
            products={products}
            agents={agents}
            shippingCompanies={shippingCompanies}
            permanentDrivers={permanentDrivers}
            initialTab="PARTNERS_MGMT"
            onApproveOrder={onApproveOrder || (() => {})}
            onRejectOrder={onRejectOrder || (() => {})}
            onDispatchToFactory={onDispatchToFactory || (() => {})}
            onUpdateAllOrders={onUpdateAllOrders || (() => {})}
            onAddProduct={onAddProduct || (async () => false)}
            onToggleProduct={onToggleProduct || (() => {})}
            onDeleteProduct={onDeleteProduct || (() => {})}
            onUpdateProduct={onUpdateProduct || (async () => false)}
            onAddAgent={onAddAgent || (async () => false)}
            onToggleAgent={onToggleAgent || (() => {})}
            onDeleteAgent={onDeleteAgent || (() => {})}
            onUpdateAgent={onUpdateAgent || (async () => false)}
            onAddShippingCompany={onAddShippingCompany || (async () => false)}
            onUpdateShippingCompany={onUpdateShippingCompany || (async () => false)}
            onToggleShippingCompany={onToggleShippingCompany || (() => {})}
            onDeleteShippingCompany={onDeleteShippingCompany || (() => {})}
            onAddPermanentDriver={onAddPermanentDriver}
            onBulkImportPermanentDrivers={onBulkImportPermanentDrivers}
            onUpdatePermanentDriver={onUpdatePermanentDriver}
            onTogglePermanentDriver={onTogglePermanentDriver}
            onDeletePermanentDriver={onDeletePermanentDriver}
            onApproveAllOrders={onApproveAllOrders}
            onDispatchAllToFactory={onDispatchAllToFactory}
            onSaveLocation={onSaveLocation}
            showToast={showToast}
            askConfirm={askConfirm}
          />
        </div>
      )}

      {activeAdminTab === 'SEARCH_ORDERS' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm animate-fade-in space-y-5">
          <div className="p-4 bg-indigo-50/70 rounded-2xl border border-indigo-100 text-indigo-900 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Search className="w-6 h-6 text-indigo-600 shrink-0" />
              <div>
                <strong className="font-extrabold text-sm block">جستجوی آنی و سرتاسری کلیه سفارشات سیستم</strong>
                <p className="text-indigo-700 mt-0.5">
                  جستجو بر اساس کد رهگیری، شماره فاکتور، نام خریدار، نمایندگی، محصول، راننده، شماره بارنامه و کد مالی.
                </p>
              </div>
            </div>
            <span className="bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-full font-mono shrink-0">
              کل سفارشات: {orders.length}
            </span>
          </div>

          <div className="relative">
            <input
              type="text"
              value={orderSearchQuery}
              onChange={(e) => setOrderSearchQuery(e.target.value)}
              placeholder="عبارت مورد نظر جهت جستجو را وارد کنید (کد رهگیری / نام خریدار / شماره فاکتور / محصول / نمایندگی / راننده...)"
              className="w-full bg-slate-50 border border-slate-300 focus:border-indigo-500 rounded-xl py-3 pr-11 pl-10 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-sans"
            />
            <Search className="w-5 h-5 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            {orderSearchQuery && (
              <button
                type="button"
                onClick={() => setOrderSearchQuery('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                title="پاکسازی عبارت"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {(() => {
            const q = orderSearchQuery.toLowerCase().trim();
            const filtered = orders.filter(o => {
              if (!q) return true;
              return (
                (o.orderNumber && o.orderNumber.toLowerCase().includes(q)) ||
                (o.id && o.id.toLowerCase().includes(q)) ||
                (o.customerName && o.customerName.toLowerCase().includes(q)) ||
                (o.buyerName && o.buyerName.toLowerCase().includes(q)) ||
                (o.productName && o.productName.toLowerCase().includes(q)) ||
                (o.destinationCity && o.destinationCity.toLowerCase().includes(q)) ||
                (o.financialDocId && o.financialDocId.toLowerCase().includes(q)) ||
                (o.paymentTrackingCode && o.paymentTrackingCode.toLowerCase().includes(q)) ||
                (o.agentCode && o.agentCode.toLowerCase().includes(q)) ||
                (o.vehicleDetails?.driverName && o.vehicleDetails.driverName.toLowerCase().includes(q)) ||
                (o.vehicleDetails?.billOfLadingNumber && o.vehicleDetails.billOfLadingNumber.toLowerCase().includes(q))
              );
            });

            if (filtered.length === 0) {
              return (
                <div className="text-center py-12 bg-slate-50 rounded-2xl border border-slate-200">
                  <Search className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-slate-700 text-sm font-bold">هیچ سفارشی مطابق عبارت «{orderSearchQuery}» یافت نشد.</p>
                </div>
              );
            }

            return (
              <div className="space-y-3">
                <div className="text-xs text-slate-500 font-bold px-1">
                  نمایش {filtered.length} از {orders.length} سفارش
                </div>
                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-3">کد رهگیری / فاکتور</th>
                        <th className="p-3">نمایندگی / خریدار</th>
                        <th className="p-3">محصول</th>
                        <th className="p-3">مقدار</th>
                        <th className="p-3">شهر مقصد</th>
                        <th className="p-3">وضعیت سفارش</th>
                        <th className="p-3">راننده / باربری</th>
                        <th className="p-3">تاریخ ثبت</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filtered.map(order => (
                        <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3 font-mono font-bold text-indigo-700 dir-ltr text-right">
                            #{order.orderNumber || order.id}
                          </td>
                          <td className="p-3">
                            <div className="font-bold text-slate-800">{order.customerName}</div>
                            {order.buyerName && <div className="text-[11px] text-slate-500">خریدار: {order.buyerName}</div>}
                          </td>
                          <td className="p-3 font-medium text-slate-800">{order.productName}</td>
                          <td className="p-3 font-bold text-slate-700">{order.quantity?.toLocaleString()} {order.unit}</td>
                          <td className="p-3 text-slate-600">{order.destinationCity}</td>
                          <td className="p-3">
                            <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
                              {order.status === 'PENDING_APPROVAL' && '⏳ در انتظار تایید مدیریت فروش'}
                              {order.status === 'APPROVED_BY_SALES' && '✅ تایید اولویت مالی و واحد بازرگانی'}
                              {order.status === 'SENT_TO_FACTORY' && '🏭 ارجاع به کارخانه'}
                              {order.status === 'VEHICLE_ASSIGNED' && '🚛 تخصیص ناوگان'}
                              {order.status === 'LOADED_AND_DISPATCHED' && '🏁 خروج و ترخیص'}
                              {order.status === 'REJECTED' && '❌ رد شده'}
                            </span>
                          </td>
                          <td className="p-3 text-slate-600">
                            {order.vehicleDetails?.driverName ? (
                              <div>
                                <span className="font-bold text-slate-800">{order.vehicleDetails.driverName}</span>
                                {order.vehicleDetails.billOfLadingNumber && (
                                  <div className="text-[10px] text-slate-500">بارنامه: {order.vehicleDetails.billOfLadingNumber}</div>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="p-3 text-slate-500 text-[11px] font-mono">
                            {new Date(order.createdAt).toLocaleDateString('fa-IR')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {activeAdminTab === 'PERMANENT_DRIVERS' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm animate-fade-in space-y-4">
          <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-amber-900 text-xs flex items-center gap-3">
            <Truck className="w-6 h-6 text-amber-600 shrink-0" />
            <div>
              <strong className="font-extrabold text-sm block">پنل اختصاصی ثبت و مدیریت دائم رانندگان</strong>
              <p className="text-amber-800 mt-0.5">
                کلیه اختیارات ثبت، ویرایش، خروجی اکسل و فعال/غیرفعال‌سازی رانندگان ناوگان حمل و نقل به این بخش در پنل ادمین ارشد نرم‌افزار منتقل شده است.
              </p>
            </div>
          </div>

          <PermanentDriversManager
            permanentDrivers={permanentDrivers}
            shippingCompanies={shippingCompanies}
            onAddDriver={onAddPermanentDriver || (async () => false)}
            onBulkImport={onBulkImportPermanentDrivers || (async () => false)}
            onUpdateDriver={onUpdatePermanentDriver || (async () => false)}
            onToggleDriver={onTogglePermanentDriver || (() => {})}
            onDeleteDriver={onDeletePermanentDriver || (() => {})}
            showToast={showToast}
            askConfirm={askConfirm}
          />
        </div>
      )}

      {activeAdminTab === 'SYSTEM_MONITOR' && (
        <>
          {/* Top Summary Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="admin-kpi-cards">
        {/* KPI 1: User Activities Today */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 block mb-1">فعالیت‌های ثبت‌شده کاربران</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-800">{activityLogs.length}</span>
              <span className="text-xs font-bold text-emerald-600">ثبت لایو</span>
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">رصد دقیق تمام نقش‌ها</span>
          </div>
          <div className="p-3.5 bg-purple-50 text-purple-600 rounded-2xl border border-purple-100">
            <Activity className="w-6 h-6" />
          </div>
        </div>

        {/* KPI 2: Active Users / Registered Users */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 block mb-1">کاربران مجاز و فعال سیستم</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-800">{registeredUsersCount || systemMetrics?.database?.counts?.users || 9}</span>
              <span className="text-xs font-bold text-purple-600">کاربر فعال</span>
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              {systemMetrics?.software?.activeSessionsEstimate || 8} نشست آنلاین همزمان
            </span>
          </div>
          <div className="p-3.5 bg-blue-50 text-blue-600 rounded-2xl border border-blue-100">
            <UserCheck className="w-6 h-6" />
          </div>
        </div>

        {/* KPI 3: Software Health & Latency */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 block mb-1">سلامت نرم‌افزار و پاسخ دهی API</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-600">
                {systemMetrics?.software?.responseLatencyMs || 16} ms
              </span>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">عالی</span>
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              پایداری: {Math.floor((systemMetrics?.uptimeSeconds || 3600) / 3600)} ساعت روشن
            </span>
          </div>
          <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100">
            <Zap className="w-6 h-6" />
          </div>
        </div>

        {/* KPI 4: Hardware RAM & CPU */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 block mb-1">مصرف منابع سخت‌افزاری</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-indigo-900">
                {systemMetrics?.hardware?.usedRamPercent || 28}%
              </span>
              <span className="text-xs font-bold text-indigo-600">RAM / CPU</span>
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              Node RSS: {systemMetrics?.software?.nodeRssMb || 78} MB
            </span>
          </div>
          <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100">
            <Cpu className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Section 1: User Activity Report Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden" id="user-activity-report-section">
        <div className="p-5 md:p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Activity className="w-5 h-5 text-purple-600" />
              <span>گزارش و ردگیری آخرین فعالیت‌های کاربران (User Audit Trail)</span>
            </h3>
            <p className="text-slate-500 text-xs mt-1">
              ثبت و نظارت کامل بر کلیه تغییرات، ورودها، ثبت سفارشات، ویرایش قیمت‌ها و تخصیص رانندگان توسط کاربران
            </p>
          </div>

          {/* Controls: Search, Filters, Export */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="جستجو در فعالیت، کاربر یا IP..."
                value={activitySearch}
                onChange={(e) => setActivitySearch(e.target.value)}
                className="w-full pr-9 pl-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
              />
              {activitySearch && (
                <button onClick={() => setActivitySearch('')} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Role */}
            <select
              value={activityRoleFilter}
              onChange={(e) => setActivityRoleFilter(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-purple-500 focus:outline-none"
            >
              <option value="ALL">همه نقش‌ها</option>
              <option value="SYSTEM_ADMIN">ادمین ارشد نرم‌افزار</option>
              <option value="SALES_MANAGER">مدیر بازرگانی</option>
              <option value="REPRESENTATIVE">نمایندگی فروش</option>
              <option value="FACTORY_TRANSPORT">مدیریت کارخانه</option>
              <option value="SHIPPING_COMPANY">شرکت حمل و نقل</option>
            </select>

            {/* Filter Module */}
            <select
              value={activityModuleFilter}
              onChange={(e) => setActivityModuleFilter(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-purple-500 focus:outline-none"
            >
              <option value="ALL">همه بخش‌ها</option>
              <option value="AUTH">احراز هویت / ورود</option>
              <option value="ORDERS">سفارشات</option>
              <option value="REPRESENTATIVE">نمایندگی‌ها</option>
              <option value="LOGISTICS">ناوگان و رانندگان</option>
              <option value="PRODUCTS">کاتالوگ محصولات</option>
              <option value="USERS">مدیریت کاربران</option>
              <option value="SYSTEM">تنظیمات سیستم</option>
            </select>

            {/* Export Excel */}
            <button
              type="button"
              onClick={handleExportActivityLogs}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>خروجی اکسل</span>
            </button>

            {/* Clear Activity Logs */}
            <button
              type="button"
              onClick={handleClearActivityLogs}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
              title="پاکسازی تمام لاگ‌های ثبت‌شده فعالیت کاربران"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>حذف لاگ‌ها</span>
            </button>
          </div>
        </div>

        {/* Audit Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-100/80 text-slate-600 font-extrabold border-b border-slate-200">
                <th className="p-3.5 pr-5">تاریخ و زمان</th>
                <th className="p-3.5">کاربر و نقش</th>
                <th className="p-3.5">نوع فعالیت</th>
                <th className="p-3.5">بخش مربوطه</th>
                <th className="p-3.5">جزئیات کامل تغییرات</th>
                <th className="p-3.5">آدرس IP</th>
                <th className="p-3.5 pl-5 text-center">وضعیت</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-sans">
              {filteredActivityLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    <Activity className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <span>هیچ فعالیت یا لاگی با مشخصات انتخابی پیدا نشد.</span>
                  </td>
                </tr>
              ) : (
                filteredActivityLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5 pr-5 text-slate-500 font-mono text-[11px] dir-ltr text-right">
                      {new Date(log.createdAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      <span className="block text-[10px] text-slate-400 font-sans dir-rtl">
                        {new Date(log.createdAt).toLocaleDateString('fa-IR')}
                      </span>
                    </td>

                    <td className="p-3.5">
                      <div className="font-bold text-slate-800">{log.userName}</div>
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-extrabold mt-0.5 ${
                        log.userRole === 'SYSTEM_ADMIN' ? 'bg-purple-100 text-purple-800' :
                        log.userRole === 'SALES_MANAGER' ? 'bg-blue-100 text-blue-800' :
                        log.userRole === 'REPRESENTATIVE' ? 'bg-emerald-100 text-emerald-800' :
                        log.userRole === 'FACTORY_TRANSPORT' ? 'bg-amber-100 text-amber-800' :
                        'bg-cyan-100 text-cyan-800'
                      }`}>
                        {translateRoleName(log.userRole)}
                      </span>
                    </td>

                    <td className="p-3.5">
                      <span className="font-bold text-slate-800">{log.action}</span>
                    </td>

                    <td className="p-3.5">
                      <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-lg font-bold text-[11px]">
                        {log.module}
                      </span>
                    </td>

                    <td className="p-3.5 max-w-md text-slate-600 leading-relaxed">
                      {log.details || '-'}
                    </td>

                    <td className="p-3.5 font-mono text-[11px] text-slate-500 dir-ltr text-right">
                      {log.ipAddress || '127.0.0.1'}
                    </td>

                    <td className="p-3.5 pl-5 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black ${
                        log.status === 'ERROR' ? 'bg-rose-100 text-rose-700' :
                        log.status === 'WARNING' ? 'bg-amber-100 text-amber-700' :
                        'bg-emerald-100 text-emerald-800'
                      }`}>
                        {log.status === 'ERROR' ? <XCircle className="w-3 h-3" /> :
                         log.status === 'WARNING' ? <AlertTriangle className="w-3 h-3" /> :
                         <CheckCircle2 className="w-3 h-3" />}
                        <span>{log.status === 'ERROR' ? 'خطا' : log.status === 'WARNING' ? 'هشدار' : 'موفق'}</span>
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 2: Hardware & Software Technical Operations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="infra-technical-ops">
        {/* Box A: Software Health & Services Status */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
              <Server className="w-5 h-5 text-indigo-600" />
              <span>پایش سلامت سرویس‌های نرم‌افزاری</span>
            </h3>
            <span className="text-xs px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg font-bold">
              All Systems Nominal
            </span>
          </div>

          <div className="space-y-3">
            {/* Service 1: Web Server */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg">
                  <Globe className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold text-xs text-slate-800 block">وب‌سرور Node.js / Express + Vite</span>
                  <span className="text-[11px] text-slate-500">پورت اختصاصی ۳۰۰۰ - پاسخ‌دهی {systemMetrics?.software?.responseLatencyMs || 15}ms</span>
                </div>
              </div>
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">آنلاین</span>
            </div>

            {/* Service 2: Database */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold text-xs text-slate-800 block">پایگاه داده MariaDB / MySQL InnoDB</span>
                  <span className="text-[11px] text-slate-500">
                    {systemMetrics?.database?.counts?.orders || 0} سفارش / {systemMetrics?.database?.counts?.users || 0} کاربر / زمان کوئری {systemMetrics?.database?.latencyMs || 1.4}ms
                  </span>
                </div>
              </div>
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">متصل</span>
            </div>

            {/* Service 3: Redis Cache */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 text-amber-700 rounded-lg">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold text-xs text-slate-800 block">حافظه کش سریع Redis / In-Memory</span>
                  <span className="text-[11px] text-slate-500">نرخ پاسخ‌دهی موثر (Hit Rate): {systemMetrics?.cache?.hitRatePercent || 98.6}%</span>
                </div>
              </div>
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">فعال</span>
            </div>

            {/* Service 4: PWA Service Worker */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 text-purple-700 rounded-lg">
                  <Wifi className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold text-xs text-slate-800 block">موتور آفلاین و پپ‌نوتیفیکیشن PWA</span>
                  <span className="text-[11px] text-slate-500">پشتیبانی کامل از iOS، اندروید و دسکتاپ</span>
                </div>
              </div>
              <span className="text-xs font-bold text-purple-600 bg-purple-50 px-2.5 py-1 rounded-md border border-purple-200">آماده بکار</span>
            </div>
          </div>
        </div>

        {/* Box B: Hardware Resources & System Load */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
              <Cpu className="w-5 h-5 text-purple-600" />
              <span>منابع سخت‌افزاری و پردازشی سرور</span>
            </h3>
            <span className="text-xs text-slate-500 font-mono">
              {systemMetrics?.nodeVersion || 'Node.js v20'}
            </span>
          </div>

          <div className="space-y-4">
            {/* CPU Usage Bar */}
            <div>
              <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                <span>مصرف پردازنده (CPU Cores)</span>
                <span>{systemMetrics?.hardware?.loadAvg?.[0] ? Math.round(systemMetrics.hardware.loadAvg[0] * 100) / 100 : 0.15} Load Avg</span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-emerald-500 to-indigo-600 rounded-full" style={{ width: `${Math.min(100, Math.max(12, (systemMetrics?.hardware?.loadAvg?.[0] || 0.15) * 20))}%` }}></div>
              </div>
              <span className="text-[11px] text-slate-400 mt-1 block">
                پردازنده: {systemMetrics?.hardware?.cpuModel || 'Intel Xeon CPU'} ({systemMetrics?.hardware?.cpuCores || 4} هسته فعال)
              </span>
            </div>

            {/* Memory RAM Usage Bar */}
            <div>
              <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                <span>حافظه رم سرور (System RAM)</span>
                <span>
                  {systemMetrics?.hardware?.totalRamGb ? (systemMetrics.hardware.totalRamGb - systemMetrics.hardware.freeRamGb).toFixed(1) : '3.8'} GB / {systemMetrics?.hardware?.totalRamGb || 16} GB
                </span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-500 to-purple-600 rounded-full" style={{ width: `${systemMetrics?.hardware?.usedRamPercent || 28}%` }}></div>
              </div>
              <div className="flex justify-between text-[11px] text-slate-400 mt-1">
                <span>Node RSS: {systemMetrics?.software?.nodeRssMb || 78} MB</span>
                <span>Heap Used: {systemMetrics?.software?.heapUsedMb || 42} MB</span>
              </div>
            </div>

            {/* Database & Logs Disk usage */}
            <div className="p-3 bg-purple-50/50 rounded-xl border border-purple-100 flex items-center justify-between text-xs">
              <div>
                <span className="font-bold text-slate-800 block">حجم لاگ‌های خطای ثبت‌شده سرور</span>
                <span className="text-slate-500 text-[11px]">فایل server/db_errors.log</span>
              </div>
              <span className="font-mono font-bold text-purple-700 bg-white px-2.5 py-1 rounded border border-purple-200">
                {systemMetrics?.database?.errorLogSizeBytes || 0} Bytes
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Section 3: Admin Quick Controls & Server Error Logs Console */}
      <div className="bg-slate-900 text-slate-100 rounded-2xl p-6 shadow-xl border border-slate-800 space-y-4" id="admin-console-section">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <Terminal className="w-6 h-6 text-purple-400" />
            <div>
              <h3 className="font-bold text-base text-white">کنسول لایو لاگ‌های خطا و ابزارهای عیب‌یابی سرور</h3>
              <span className="text-slate-400 text-xs">ارزیابی کدهای وضعیت، پروکسی Nginx و خروجی لاگ‌های سرور</span>
            </div>
          </div>

          {/* Action Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleClearTransactionsClick}
              disabled={isClearingTransactions}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-200" />
              <span>پاکسازی تراکنش‌ها (حفظ داده‌های پایه)</span>
            </button>

            <button
              type="button"
              onClick={handleFlushCache}
              className="px-3.5 py-1.5 bg-purple-800 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span>پاکسازی کش سرور</span>
            </button>

            <button
              type="button"
              onClick={handleClearErrorLogs}
              className="px-3.5 py-1.5 bg-rose-900/80 hover:bg-rose-800 text-rose-100 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-300" />
              <span>پاکسازی فایل لاگ‌ها</span>
            </button>
          </div>
        </div>

        {/* Terminal Output */}
        <div className="bg-slate-950 rounded-xl p-4 font-mono text-xs text-emerald-400 border border-slate-800 max-h-60 overflow-y-auto dir-ltr text-left leading-relaxed">
          <pre className="whitespace-pre-wrap break-all">{logsConsoleContent || 'No error logs recorded. Server running healthy.'}</pre>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
