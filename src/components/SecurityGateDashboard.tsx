import React, { useState, useMemo } from 'react';
import { 
  ShieldCheck, 
  Truck, 
  FileText, 
  CheckCircle2, 
  Search, 
  Printer, 
  Clock, 
  User, 
  MapPin, 
  X, 
  Key, 
  BadgeAlert, 
  Boxes, 
  Lock, 
  Scale, 
  CheckSquare, 
  Square,
  AlertTriangle,
  ClipboardCheck,
  History,
  Sparkles,
  Ban,
  RotateCcw,
  PackageCheck
} from 'lucide-react';
import { Order, SecurityGateDetails } from '../types';
import TabarestanLogo from './TabarestanLogo';

interface SecurityGateDashboardProps {
  orders: Order[];
  currentUser?: any;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
  askConfirm: (title: string, message: string, onConfirm: () => void) => void;
  onSecurityClearance: (orderId: string, securityData: SecurityGateDetails) => Promise<boolean>;
  onSecurityDetain?: (orderId: string, detainData: { reason: string; officerName: string; action: 'RETURNED_TO_WAREHOUSE' | 'RETURNED_TO_SHIPPING' }) => Promise<boolean>;
  onRefresh?: () => void;
}

export default function SecurityGateDashboard({
  orders = [],
  currentUser,
  showToast,
  askConfirm,
  onSecurityClearance,
  onSecurityDetain,
  onRefresh
}: SecurityGateDashboardProps) {
  const [activeTab, setActiveTab] = useState<'AWAITING_GATE' | 'CLEARED_TODAY'>('AWAITING_GATE');
  const [searchQuery, setSearchQuery] = useState('');

  // Clearance Modal State
  const [selectedOrderForGate, setSelectedOrderForGate] = useState<Order | null>(null);
  const [officerName, setOfficerName] = useState<string>(currentUser?.fullName || 'افسر انتظامات کارخانه');
  const [gatePassNumber, setGatePassNumber] = useState<string>('');
  const [plateMatchConfirmed, setPlateMatchConfirmed] = useState<boolean>(true);
  const [driverIdConfirmed, setDriverIdConfirmed] = useState<boolean>(true);
  const [permitMatchConfirmed, setPermitMatchConfirmed] = useState<boolean>(true);
  const [billOfLadingChecked, setBillOfLadingChecked] = useState<boolean>(true);
  const [warehouseSlipChecked, setWarehouseSlipChecked] = useState<boolean>(true);
  const [sealNumber, setSealNumber] = useState<string>('');
  const [securityNotes, setSecurityNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Detainment / Interception Modal State
  const [selectedOrderForDetain, setSelectedOrderForDetain] = useState<Order | null>(null);
  const [detainReason, setDetainReason] = useState<string>('عدم تطابق پلاک خودرو یا مخدوش بودن مدارک بارنامه');
  const [detainAction, setDetainAction] = useState<'RETURNED_TO_WAREHOUSE' | 'RETURNED_TO_SHIPPING'>('RETURNED_TO_WAREHOUSE');
  const [detainNotes, setDetainNotes] = useState<string>('');
  const [isSubmittingDetain, setIsSubmittingDetain] = useState<boolean>(false);

  // Print Gate Exit Pass
  const [orderToPrint, setOrderToPrint] = useState<Order | null>(null);

  // Orders Filter
  const awaitingGateOrders = useMemo(() => {
    return orders.filter(o => o.status === 'WAREHOUSE_LOADED');
  }, [orders]);

  const clearedOrders = useMemo(() => {
    return orders.filter(o => o.status === 'LOADED_AND_DISPATCHED');
  }, [orders]);

  // Current tab filtered orders
  const currentFilteredOrders = useMemo(() => {
    const list = activeTab === 'AWAITING_GATE' ? awaitingGateOrders : clearedOrders;
    if (!searchQuery.trim()) return list;

    const q = searchQuery.trim().toLowerCase();
    return list.filter(o => 
      (o.orderNumber && o.orderNumber.toLowerCase().includes(q)) ||
      (o.customerName && o.customerName.toLowerCase().includes(q)) ||
      (o.destinationCity && o.destinationCity.toLowerCase().includes(q)) ||
      (o.vehicleDetails?.driverName && o.vehicleDetails.driverName.toLowerCase().includes(q)) ||
      (o.vehicleDetails?.licensePlate && o.vehicleDetails.licensePlate.toLowerCase().includes(q)) ||
      (o.vehicleDetails?.billOfLadingNumber && o.vehicleDetails.billOfLadingNumber.toLowerCase().includes(q)) ||
      (o.warehouseDetails?.exitPermitNumber && o.warehouseDetails.exitPermitNumber.toLowerCase().includes(q)) ||
      (o.securityGateDetails?.gatePassNumber && o.securityGateDetails.gatePassNumber.toLowerCase().includes(q)) ||
      (o.securityGateDetails?.sealNumber && o.securityGateDetails.sealNumber.toLowerCase().includes(q)) ||
      (o.securityGateDetails?.officerName && o.securityGateDetails.officerName.toLowerCase().includes(q))
    );
  }, [activeTab, awaitingGateOrders, clearedOrders, searchQuery]);

  const handleOpenClearanceModal = (order: Order) => {
    setSelectedOrderForGate(order);
    setOfficerName(currentUser?.fullName || 'افسر انتظامات کارخانه');
    setGatePassNumber(`PASS-${Date.now().toString().slice(-6)}`);
    setPlateMatchConfirmed(true);
    setDriverIdConfirmed(true);
    setPermitMatchConfirmed(true);
    setBillOfLadingChecked(true);
    setWarehouseSlipChecked(true);
    
    // Auto-generate seal number for export orders or high security
    if (order.isExportOrder) {
      setSealNumber(`SEAL-${Date.now().toString().slice(-6)}`);
    } else {
      setSealNumber('');
    }
    setSecurityNotes('');
  };

  const handleConfirmClearance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderForGate) return;

    if (!plateMatchConfirmed || !driverIdConfirmed || !permitMatchConfirmed || !billOfLadingChecked || !warehouseSlipChecked) {
      showToast('کلیه آیتم‌های چک‌لیست بازرسی گیت (شامل دریافت بارنامه، برگ خروج، پلاک و هویت راننده) باید تایید گردند.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: SecurityGateDetails = {
        gatePassNumber: gatePassNumber.trim() || `PASS-${Date.now().toString().slice(-6)}`,
        officerName: officerName.trim() || 'افسر انتظامات کارخانه',
        gateExitAt: new Date().toISOString(),
        plateMatchConfirmed: true,
        driverIdConfirmed: true,
        permitMatchConfirmed: true,
        billOfLadingChecked: true,
        warehouseSlipChecked: true,
        sealNumber: sealNumber.trim() || undefined,
        securityNotes: securityNotes.trim() || undefined
      };

      const success = await onSecurityClearance(selectedOrderForGate.id, payload);
      if (success) {
        showToast(`پروانه خروج ${payload.gatePassNumber} صادر شد و خودرو با پلاک ${selectedOrderForGate.vehicleDetails?.licensePlate || ''} ترخیص گردید.`, 'success');
        setSelectedOrderForGate(null);
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'خطا در ثبت ترخیص گیت حراست', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Detain Modal
  const handleOpenDetainModal = (order: Order) => {
    setSelectedOrderForDetain(order);
    setDetainReason('عدم تطابق پلاک خودرو یا مخدوش بودن مدارک بارنامه');
    setDetainAction('RETURNED_TO_WAREHOUSE');
    setDetainNotes('');
  };

  // Submit Detain Modal
  const handleSubmitDetain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderForDetain) return;

    setIsSubmittingDetain(true);
    try {
      const payload = {
        reason: detainReason.trim() + (detainNotes.trim() ? ` - ${detainNotes.trim()}` : ''),
        officerName: currentUser?.fullName || 'افسر انتظامات کارخانه',
        action: detainAction
      };

      if (onSecurityDetain) {
        const success = await onSecurityDetain(selectedOrderForDetain.id, payload);
        if (success) {
          showToast(`سفارش شماره ${selectedOrderForDetain.orderNumber} توقیف و دستور عودت ثبت شد.`, 'info');
          setSelectedOrderForDetain(null);
          if (selectedOrderForGate?.id === selectedOrderForDetain.id) {
            setSelectedOrderForGate(null);
          }
        }
      } else {
        const res = await fetch(`/api/orders/${selectedOrderForDetain.id}/security-detain`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          showToast(`سفارش شماره ${selectedOrderForDetain.orderNumber} توقیف و دستور عودت ثبت شد.`, 'info');
          setSelectedOrderForDetain(null);
          if (selectedOrderForGate?.id === selectedOrderForDetain.id) {
            setSelectedOrderForGate(null);
          }
          if (onRefresh) onRefresh();
        } else {
          showToast('خطا در ثبت دستور توقیف در گیت', 'error');
        }
      }
    } catch (err: any) {
      console.error(err);
      showToast('خطای شبکه در توقیف سفارش', 'error');
    } finally {
      setIsSubmittingDetain(false);
    }
  };

  // Render Persian License Plate
  const renderPlateBadge = (plate?: string) => {
    if (!plate) return <span className="text-slate-400 font-mono text-xs">تعیین نشده</span>;
    return (
      <div className="inline-flex items-center bg-amber-400 text-slate-900 border-2 border-slate-900 rounded-md px-2.5 py-1 text-xs font-black shadow-xs dir-ltr select-none">
        <span className="bg-blue-800 text-white text-[9px] px-1 py-0.5 -ml-2.5 mr-2 rounded-l-xs font-bold border-r border-slate-900 flex items-center gap-0.5">
          <span>I.R.</span>
          <span>IRAN</span>
        </span>
        <span className="tracking-widest font-mono text-xs">{plate}</span>
      </div>
    );
  };

  return (
    <div className="space-y-6 text-right dir-rtl font-sans animate-fade-in" id="security-gate-dashboard-root">
      
      {/* Top Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-emerald-500/10 text-emerald-600 rounded-2xl border border-emerald-500/20 shadow-xs">
              <ShieldCheck className="w-7 h-7 text-emerald-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg md:text-xl font-black text-slate-900">
                  گیت حراست و انتظامات درب خروج کارخانه
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  بازرسی و ترخیص نهایی
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                تطبیق فیزیکی حواله خروج انبار، بازرسی مدارک و پلاک خودرو، ثبت پلمپ و صدور مجوز قطعی خروج از کارخانه
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-start md:self-auto">
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                title="به‌روزرسانی لحظه‌ای"
              >
                <span>به‌روزرسانی گیت</span>
              </button>
            )}
            <div className="px-3.5 py-2 bg-slate-900 text-emerald-400 font-mono text-xs font-bold rounded-xl flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span>{new Date().toLocaleDateString('fa-IR')}</span>
            </div>
          </div>
        </div>

        {/* Quick KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 pt-6 border-t border-slate-100">
          
          <div className="p-4 bg-amber-50/70 rounded-xl border border-amber-200">
            <div className="flex items-center justify-between text-amber-900 mb-1">
              <span className="text-xs font-bold">خودروهای منتظر در گیت خروج</span>
              <Truck className="w-4 h-4 text-amber-600" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-amber-700 font-mono">
                {awaitingGateOrders.length}
              </span>
              <span className="text-[11px] text-amber-800">خودرو در صف بازرسی</span>
            </div>
          </div>

          <div className="p-4 bg-emerald-50/70 rounded-xl border border-emerald-200">
            <div className="flex items-center justify-between text-emerald-900 mb-1">
              <span className="text-xs font-bold">ترخیص و خروج‌های قطعی امروز</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-emerald-700 font-mono">
                {clearedOrders.length}
              </span>
              <span className="text-[11px] text-emerald-800">مجوز خروج صادر شده</span>
            </div>
          </div>

          <div className="p-4 bg-blue-50/70 rounded-xl border border-blue-200">
            <div className="flex items-center justify-between text-blue-900 mb-1">
              <span className="text-xs font-bold">مجموع وزن خالص ترخیص‌شده</span>
              <Scale className="w-4 h-4 text-blue-600" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-blue-700 font-mono">
                {clearedOrders.reduce((sum, o) => sum + (o.warehouseDetails?.weighbridgeNet || 0), 0).toLocaleString('fa-IR')}
              </span>
              <span className="text-[11px] text-blue-800">کیلوگرم بار سفال</span>
            </div>
          </div>

        </div>
      </div>

      {/* Tabs & Search */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('AWAITING_GATE')}
            className={`px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'AWAITING_GATE'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>در انتظار بازرسی و تایید خروج</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${activeTab === 'AWAITING_GATE' ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-800'}`}>
              {awaitingGateOrders.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('CLEARED_TODAY')}
            className={`px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'CLEARED_TODAY'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            <History className="w-4 h-4" />
            <span>بایگانی خروج و ترخیص‌های امروز</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${activeTab === 'CLEARED_TODAY' ? 'bg-emerald-700 text-white' : 'bg-slate-200 text-slate-800'}`}>
              {clearedOrders.length}
            </span>
          </button>
        </div>

        {/* Search */}
        <div className="relative min-w-[280px]">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="جستجو در شماره پلاک، راننده، حواله انبار یا سفارش..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pr-9 pl-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all font-sans"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

      </div>

      {/* Orders List */}
      {currentFilteredOrders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
          <ShieldCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-700">هیچ خودرویی در این بخش وجود ندارد</h3>
          <p className="text-xs text-slate-400 mt-1">
            سفارشات پس از ثبت بارگیری و صدور برگه حواله توسط انبار محصول، در این گیت جهت بازرسی نهایی قرار می‌گیرند.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {currentFilteredOrders.map((order) => {
            const isAwaitingGate = order.status === 'WAREHOUSE_LOADED';
            const isCleared = order.status === 'LOADED_AND_DISPATCHED';

            return (
              <div 
                key={order.id}
                className={`bg-white rounded-2xl border transition-all duration-200 overflow-hidden shadow-xs hover:shadow-md ${
                  isAwaitingGate 
                    ? 'border-amber-300 ring-1 ring-amber-100' 
                    : 'border-slate-200 hover:border-emerald-300'
                }`}
              >
                <div className="p-5 md:p-6">
                  
                  {/* Top Header */}
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-mono text-xs font-black text-slate-900 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">
                        {order.orderNumber}
                      </span>

                      {order.warehouseDetails?.exitPermitNumber && (
                        <span className="font-mono text-xs font-bold text-amber-900 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 flex items-center gap-1">
                          <FileText className="w-3.5 h-3.5 text-amber-600" />
                          <span>حواله انبار: {order.warehouseDetails.exitPermitNumber}</span>
                        </span>
                      )}

                      <span className="text-xs font-bold text-slate-800">
                        {order.customerName}
                      </span>

                      {order.isExportOrder ? (
                        <span className="text-[10px] font-bold bg-purple-100 text-purple-800 px-2.5 py-0.5 rounded-full border border-purple-200 flex items-center gap-1">
                          <span>🌍 صادراتی (بارگیری با پالت)</span>
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full border border-amber-200 flex items-center gap-1">
                          <span>🚛 داخلی (چیدمان فله‌ای)</span>
                        </span>
                      )}
                    </div>

                    <div>
                      {isAwaitingGate ? (
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                          <span>متوقف در گیت حراست (نیازمند بازرسی و ترخیص)</span>
                        </span>
                      ) : (
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>ترخیص نهایی از کارخانه {order.securityGateDetails?.gatePassNumber ? `(${order.securityGateDetails.gatePassNumber})` : ''}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Pending Edit Suspension Warning */}
                  {order.hasPendingEdit && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 my-3 text-amber-900 text-xs font-bold flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>⚠️ این سفارش توسط نماینده ویرایش شده و تا زمان تایید مجدد توسط مدیر بازرگانی غیرفعال می‌باشد. خروج از گیت ممنوع است.</span>
                      </div>
                      <span className="text-[10px] bg-amber-200 text-amber-900 px-2 py-0.5 rounded-md font-mono shrink-0">معلق در انتظار مدیر</span>
                    </div>
                  )}

                  {/* Recently Edited Notice */}
                  {order.recentlyEditedNotice && !order.hasPendingEdit && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 my-3 text-blue-900 text-xs font-bold flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                      <span>⚡ {order.recentlyEditedNotice}</span>
                    </div>
                  )}

                  {/* Detained Notice */}
                  {order.securityDetained && (
                    <div className="bg-red-100 border border-red-300 rounded-xl p-3 my-3 text-red-900 text-xs font-bold flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                        <span>🛑 سابقه توقیف قبلی در گیت: {order.securityDetained.reason} (افسر: {order.securityDetained.officerName})</span>
                      </div>
                      <span className="text-[10px] bg-red-200 text-red-900 px-2 py-0.5 rounded-md font-mono shrink-0">دستور ممانعت</span>
                    </div>
                  )}

                  {/* 3 Column Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-4">
                    
                    {/* Col 1: Plate & Driver */}
                    <div className="p-3.5 bg-slate-50/90 rounded-xl border border-slate-200 space-y-2">
                      <span className="text-[11px] font-bold text-slate-400 block">پلاک و مدارک راننده:</span>
                      <div className="flex items-center justify-between">
                        {renderPlateBadge(order.vehicleDetails?.licensePlate)}
                        <span className="text-xs font-bold text-slate-700">{order.vehicleDetails?.vehicleType}</span>
                      </div>
                      <div className="text-xs text-slate-700 flex items-center justify-between pt-1">
                        <span className="flex items-center gap-1 font-bold">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span>{order.vehicleDetails?.driverName}</span>
                        </span>
                        <span className="font-mono text-[11px] text-slate-500 dir-ltr">{order.vehicleDetails?.driverPhone}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center justify-between">
                        <span>باربری: <strong className="text-slate-700">{order.vehicleDetails?.shippingAgency || 'ترابری کارخانه'}</strong></span>
                        {order.vehicleDetails?.billOfLadingNumber && (
                          <span className="font-mono text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            بارنامه: {order.vehicleDetails.billOfLadingNumber}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Col 2: Warehouse Pallets & Weighbridge */}
                    <div className="p-3.5 bg-amber-50/60 rounded-xl border border-amber-200 space-y-1.5">
                      <span className="text-[11px] font-bold text-amber-900 block">گواهی بارگیری انبار محصول:</span>
                      <div className="text-xs font-bold text-slate-900">{order.productName}</div>
                      <div className="text-xs text-slate-700 flex items-center justify-between">
                        <span>نوع بارگیری:</span>
                        <span className="font-mono font-bold text-slate-800">
                          {order.warehouseDetails?.packagingType === 'PALLET' || order.isExportOrder ? (
                            <span className="text-purple-700">{order.warehouseDetails?.loadedPalletsCount || 1} پالت صادراتی</span>
                          ) : (
                            <span className="text-amber-800">{(order.warehouseDetails?.actualQuantity || order.quantity).toLocaleString('fa-IR')} قالب فله کفی</span>
                          )}
                        </span>
                      </div>
                      <div className="text-xs text-slate-700 flex items-center justify-between">
                        <span>وزن خالص باسکول:</span>
                        <span className="font-mono font-black text-emerald-700">{(order.warehouseDetails?.weighbridgeNet || 0).toLocaleString('fa-IR')} kg</span>
                      </div>
                      {order.warehouseDetails?.warehouseKeeperName && (
                        <div className="text-[10px] text-slate-500">انباردار صادرکننده: {order.warehouseDetails.warehouseKeeperName}</div>
                      )}
                    </div>

                    {/* Col 3: Destination & Security Status */}
                    <div className="p-3.5 bg-slate-50/90 rounded-xl border border-slate-200 space-y-1.5">
                      <span className="text-[11px] font-bold text-slate-400 block">مقصد و اطلاعات امنیتی:</span>
                      <div className="text-xs font-bold text-slate-800 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                        <span>{order.destinationCity}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 line-clamp-1">{order.exactAddress}</p>
                      
                      {order.securityGateDetails?.sealNumber && (
                        <div className="text-xs bg-purple-50 text-purple-900 p-1.5 rounded-lg border border-purple-200 flex items-center justify-between">
                          <span className="font-bold flex items-center gap-1">
                            <Lock className="w-3 h-3 text-purple-600" />
                            <span>شماره پلمپ حراست:</span>
                          </span>
                          <span className="font-mono font-black">{order.securityGateDetails.sealNumber}</span>
                        </div>
                      )}
                    </div>

                  </div>

                  {/* Actions Bar */}
                  <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-[11px] text-slate-500">
                      {order.securityGateDetails?.gateExitAt && (
                        <span>زمان ترخیص نهایی: {new Date(order.securityGateDetails.gateExitAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })} توسط {order.securityGateDetails.officerName}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {isAwaitingGate && (
                        <>
                          <button
                            onClick={() => handleOpenDetainModal(order)}
                            className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                            title="ممانعت از خروج به دلیل نقص مدارک، پلاک یا مشکل بارگیری"
                          >
                            <Ban className="w-3.5 h-3.5 text-rose-600" />
                            <span>توقیف در گیت / ممانعت از خروج</span>
                          </button>

                          <button
                            disabled={order.hasPendingEdit}
                            onClick={() => handleOpenClearanceModal(order)}
                            className={`px-4 py-2 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 ${
                              order.hasPendingEdit
                                ? 'bg-slate-300 cursor-not-allowed'
                                : 'bg-emerald-600 hover:bg-emerald-700 cursor-pointer'
                            }`}
                          >
                            <ShieldCheck className="w-4 h-4" />
                            <span>{order.hasPendingEdit ? 'غیرفعال به دلیل ویرایش نماینده' : 'کنترل مدارک و صدور پروانه خروج'}</span>
                          </button>
                        </>
                      )}

                      {order.securityGateDetails && (
                        <button
                          onClick={() => setOrderToPrint(order)}
                          className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5 text-slate-600" />
                          <span>چاپ پروانه خروج گیت</span>
                        </button>
                      )}
                    </div>

                  </div>

                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Inspection & Gate Clearance */}
      {selectedOrderForGate && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full p-5 md:p-6 my-8 animate-scale-in text-right">
            
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/10 text-emerald-600 rounded-xl">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    بازرسی نهایی مدارک و صدور پروانه خروج گیت
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    سفارش {selectedOrderForGate.orderNumber} | حواله {selectedOrderForGate.warehouseDetails?.exitPermitNumber}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedOrderForGate(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmClearance} className="space-y-4 font-sans text-xs">
              
              {/* Vehicle & Permit Summary */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 grid grid-cols-2 gap-3">
                <div>
                  <span className="text-slate-500 block mb-0.5">پلاک خودرو و راننده:</span>
                  <div className="font-bold text-slate-900">{selectedOrderForGate.vehicleDetails?.driverName}</div>
                  <div className="mt-1">{renderPlateBadge(selectedOrderForGate.vehicleDetails?.licensePlate)}</div>
                  {selectedOrderForGate.vehicleDetails?.billOfLadingNumber && (
                    <div className="text-[11px] font-mono text-emerald-800 mt-1 font-bold">
                      بارنامه رسمی: {selectedOrderForGate.vehicleDetails.billOfLadingNumber}
                    </div>
                  )}
                </div>

                <div>
                  <span className="text-slate-500 block mb-0.5">مشخصات بار انبار:</span>
                  <div className="font-bold text-slate-900">{selectedOrderForGate.productName}</div>
                  <div className="text-slate-600 mt-1 font-mono">
                    {selectedOrderForGate.isExportOrder ? `${selectedOrderForGate.warehouseDetails?.loadedPalletsCount || 1} پالت صادراتی` : `${(selectedOrderForGate.warehouseDetails?.actualQuantity || selectedOrderForGate.quantity).toLocaleString('fa-IR')} قالب فله کفی`}
                  </div>
                  <div className="text-emerald-700 font-mono font-bold mt-0.5">
                    وزن خالص: {(selectedOrderForGate.warehouseDetails?.weighbridgeNet || 0).toLocaleString('fa-IR')} kg
                  </div>
                </div>
              </div>

              {/* Security Mandatory Checklist */}
              <div className="p-4 bg-emerald-50/60 rounded-xl border border-emerald-200 space-y-2.5">
                <span className="font-bold text-emerald-950 block">چک‌لیست کنترل فیزیکی و بازرسی مدارک گیت:</span>
                
                <label className="flex items-start gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={billOfLadingChecked}
                    onChange={(e) => setBillOfLadingChecked(e.target.checked)}
                    className="w-4 h-4 mt-0.5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                  />
                  <span className="text-slate-800 leading-snug font-medium">
                    رویت و دریافت برگه بارنامه رسمی صادره از شرکت باربری ({selectedOrderForGate.vehicleDetails?.billOfLadingNumber ? `شماره ${selectedOrderForGate.vehicleDetails.billOfLadingNumber}` : 'ثبت شده در سیستم'})
                  </span>
                </label>

                <label className="flex items-start gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={warehouseSlipChecked}
                    onChange={(e) => setWarehouseSlipChecked(e.target.checked)}
                    className="w-4 h-4 mt-0.5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                  />
                  <span className="text-slate-800 leading-snug font-medium">
                    رویت و دریافت برگه حواله خروج انبار محصول به شماره {selectedOrderForGate.warehouseDetails?.exitPermitNumber}
                  </span>
                </label>

                <label className="flex items-start gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={plateMatchConfirmed}
                    onChange={(e) => setPlateMatchConfirmed(e.target.checked)}
                    className="w-4 h-4 mt-0.5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                  />
                  <span className="text-slate-800 leading-snug font-medium">
                    تطبیق فیزیکی پلاک خودرو با برگه بارنامه و سیستم ترابری
                  </span>
                </label>

                <label className="flex items-start gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={driverIdConfirmed}
                    onChange={(e) => setDriverIdConfirmed(e.target.checked)}
                    className="w-4 h-4 mt-0.5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                  />
                  <span className="text-slate-800 leading-snug font-medium">
                    احراز هویت راننده ({selectedOrderForGate.vehicleDetails?.driverName}) و استعلام سلامت مدارک
                  </span>
                </label>

                <label className="flex items-start gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={permitMatchConfirmed}
                    onChange={(e) => setPermitMatchConfirmed(e.target.checked)}
                    className="w-4 h-4 mt-0.5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                  />
                  <span className="text-slate-800 leading-snug font-medium">
                    تطبیق چیدمان فیزیکی بار ({selectedOrderForGate.isExportOrder ? 'پالت‌های شرینک صادراتی' : 'چیدمان فله روی کفی'}) با حواله
                  </span>
                </label>
              </div>

              {/* Gate Pass & Seal Number & Officer */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    شماره پروانه الکترونیکی خروج گیت *
                  </label>
                  <input
                    type="text"
                    required
                    value={gatePassNumber}
                    onChange={(e) => setGatePassNumber(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-emerald-800 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    شماره پلمپ امنیتی حراست (اختیاری / صادراتی)
                  </label>
                  <input
                    type="text"
                    value={sealNumber}
                    onChange={(e) => setSealNumber(e.target.value)}
                    placeholder="مثال: SEAL-884920"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  نام افسر انتظامات و شیفت حراست *
                </label>
                <input
                  type="text"
                  required
                  value={officerName}
                  onChange={(e) => setOfficerName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  ملاحظات و گزارش بازرسی حراست
                </label>
                <input
                  type="text"
                  value={securityNotes}
                  onChange={(e) => setSecurityNotes(e.target.value)}
                  placeholder="ملاحظات بازرسی گیت..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setSelectedOrderForGate(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-all"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-xl font-extrabold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{isSubmitting ? 'در حال صدور...' : 'صدور پروانه و ترخیص قطعی از کارخانه'}</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* Modal: Detain / Intercept Order at Gate */}
      {selectedOrderForDetain && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-rose-200 shadow-2xl max-w-lg w-full p-5 md:p-6 my-8 animate-scale-in text-right">
            
            <div className="flex items-center justify-between pb-4 border-b border-rose-100 mb-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-rose-500/10 text-rose-600 rounded-xl">
                  <Ban className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    دستور توقیف در گیت و ممانعت از خروج خودرو
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    سفارش {selectedOrderForDetain.orderNumber} | پلاک {selectedOrderForDetain.vehicleDetails?.licensePlate}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedOrderForDetain(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitDetain} className="space-y-4 font-sans text-xs">
              
              <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-rose-900 leading-relaxed">
                🛑 <strong>هشدار حراست:</strong> با ثبت این فرم، خودرو در گیت متوقف شده و دستور ممانعت از خروج و عودت محموله در سوابق سفارش ثبت می‌گردد.
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1 text-[11px]">
                  علت اصلی توقیف و ممانعت از خروج *
                </label>
                <select
                  required
                  value={detainReason}
                  onChange={(e) => setDetainReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-rose-500 focus:outline-none"
                >
                  <option value="عدم تطابق پلاک خودرو یا مخدوش بودن مدارک بارنامه">عدم تطابق پلاک خودرو یا مخدوش بودن مدارک بارنامه</option>
                  <option value="عدم ارائه بارنامه رسمی معتبر از شرکت باربری">عدم ارائه بارنامه رسمی معتبر از شرکت باربری</option>
                  <option value="مغایرت فیزیکی تعداد پالت یا متراژ بار با حواله انبار">مغایرت فیزیکی تعداد پالت یا متراژ بار با حواله انبار</option>
                  <option value="عدم تطابق هویت راننده با مشخصات ثبت شده">عدم تطابق هویت راننده با مشخصات ثبت شده</option>
                  <option value="عدم رعایت استانداردهای مهار و بسته‌بندی بار">عدم رعایت استانداردهای مهار و بسته‌بندی بار</option>
                  <option value="سایر موارد مشکوک یا تخلفات انتظامی">سایر موارد مشکوک یا تخلفات انتظامی</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1 text-[11px]">
                  اقدام و دستور عودت حراست *
                </label>
                <select
                  required
                  value={detainAction}
                  onChange={(e) => setDetainAction(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-rose-500 focus:outline-none"
                >
                  <option value="RETURNED_TO_WAREHOUSE">عودت به انبار محصول جهت بازبینی و رفع نقص بارگیری</option>
                  <option value="RETURNED_TO_SHIPPING">عودت به شرکت باربری جهت تعویض ناوگان یا اصلاح مشخصات</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1 text-[11px]">
                  توضیحات تکمیلی افسر حراست
                </label>
                <textarea
                  rows={3}
                  value={detainNotes}
                  onChange={(e) => setDetainNotes(e.target.value)}
                  placeholder="شرح جزئیات علت توقیف، بررسی‌های انجام‌شده و دستورات صادره..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-rose-500 focus:outline-none"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setSelectedOrderForDetain(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-all"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingDetain}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white rounded-xl font-extrabold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <Ban className="w-4 h-4" />
                  <span>{isSubmittingDetain ? 'در حال ثبت توقیف...' : 'ثبت توقیف و ممانعت از خروج'}</span>
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Modal: Gate Clearance Pass Printable */}
      {orderToPrint && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-300 shadow-2xl max-w-2xl w-full p-6 my-6 text-right animate-scale-in">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-6 print:hidden">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-emerald-600" />
                <span className="font-bold text-slate-800 text-sm">پروانه الکترونیکی رسمی خروج خودرو از درب حراست کارخانه</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>چاپ پروانه خروج</span>
                </button>
                <button
                  onClick={() => setOrderToPrint(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Document Body */}
            <div className="p-6 border-2 border-slate-800 rounded-xl space-y-4 font-sans text-xs">
              <div className="flex items-center justify-between border-b-2 border-slate-800 pb-3">
                <div className="flex items-center gap-3">
                  <TabarestanLogo className="w-10 h-10" />
                  <div>
                    <h2 className="font-black text-slate-900 text-sm">صنایع سفال طبرستان - واحد انتظامات و حراست</h2>
                    <h3 className="text-[11px] font-bold text-slate-600">پروانه رسمی ترخیص و مجوز قطعی خروج خودرو از گیت کارخانه</h3>
                  </div>
                </div>
                <div className="text-left font-mono">
                  <div className="text-emerald-800 font-bold">شماره پروانه: {orderToPrint.securityGateDetails?.gatePassNumber || 'PASS-0000'}</div>
                  <div>تاریخ: {new Date().toLocaleDateString('fa-IR')}</div>
                  <div>ساعت: {new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div>شماره سفارش: <span className="font-mono font-bold">{orderToPrint.orderNumber}</span></div>
                <div>شماره حواله انبار: <span className="font-mono font-bold">{orderToPrint.warehouseDetails?.exitPermitNumber}</span></div>
                <div>شماره بارنامه رسمی: <span className="font-mono font-bold text-emerald-800">{orderToPrint.vehicleDetails?.billOfLadingNumber || 'پیوست'}</span></div>
                <div>شرکت باربری: <span className="font-bold">{orderToPrint.vehicleDetails?.shippingAgency || 'ترابری کارخانه'}</span></div>
                <div>راننده: <span className="font-bold">{orderToPrint.vehicleDetails?.driverName}</span></div>
                <div>پلاک: <span className="font-mono font-bold">{orderToPrint.vehicleDetails?.licensePlate}</span></div>
                <div>کالا و بسته‌بندی: <span className="font-bold">{orderToPrint.productName} ({orderToPrint.isExportOrder ? `${orderToPrint.warehouseDetails?.loadedPalletsCount || 1} پالت صادراتی` : `${(orderToPrint.warehouseDetails?.actualQuantity || orderToPrint.quantity).toLocaleString('fa-IR')} قالب فله`})</span></div>
                <div>وزن خالص باسکول: <span className="font-mono font-bold">{(orderToPrint.warehouseDetails?.weighbridgeNet || 0).toLocaleString('fa-IR')} kg</span></div>
              </div>

              {orderToPrint.securityGateDetails?.sealNumber && (
                <div className="p-2 bg-purple-50 border border-purple-200 rounded-lg text-purple-900 font-bold">
                  شماره پلمپ حراست: {orderToPrint.securityGateDetails.sealNumber}
                </div>
              )}

              <div className="pt-6 grid grid-cols-2 gap-4 text-center">
                <div className="p-3 border border-dashed border-slate-300 rounded-lg h-20 flex flex-col justify-between">
                  <span>امضای راننده ترخیص‌شده</span>
                  <span className="text-[10px] text-slate-500">{orderToPrint.vehicleDetails?.driverName}</span>
                </div>
                <div className="p-3 border border-dashed border-slate-300 rounded-lg h-20 flex flex-col justify-between">
                  <span>مهر و امضای افسر انتظامات درب خروج</span>
                  <span className="text-[10px] text-slate-500">{orderToPrint.securityGateDetails?.officerName || 'افسر حراست'}</span>
                </div>
              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
}
