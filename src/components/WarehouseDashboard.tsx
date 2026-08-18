import React, { useState, useMemo } from 'react';
import { 
  Boxes, 
  Truck, 
  FileText, 
  CheckCircle2, 
  Clock, 
  Search, 
  Printer, 
  Scale, 
  ShieldCheck, 
  AlertCircle, 
  AlertTriangle,
  PackageCheck, 
  Layers, 
  Calendar, 
  User, 
  Phone, 
  MapPin, 
  X, 
  ChevronRight,
  Sparkles,
  Barcode,
  ArrowRight,
  ClipboardList,
  RefreshCw,
  Eye,
  Plus,
  Minus,
  Edit3,
  Check
} from 'lucide-react';
import { Order, Product, WarehouseDetails } from '../types';
import TabarestanLogo from './TabarestanLogo';

interface WarehouseDashboardProps {
  orders: Order[];
  products: Product[];
  currentUser?: any;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
  askConfirm: (title: string, message: string, onConfirm: () => void) => void;
  onWarehouseLoad: (orderId: string, warehouseData: WarehouseDetails) => Promise<boolean>;
  onWarehouseDiscrepancy?: (orderId: string, discrepancyData: { reason: string; reportedQuantity?: number; reporterName: string; notes?: string }) => Promise<boolean>;
  onRefresh?: () => void;
}

export default function WarehouseDashboard({
  orders = [],
  products = [],
  currentUser,
  showToast,
  askConfirm,
  onWarehouseLoad,
  onWarehouseDiscrepancy,
  onRefresh
}: WarehouseDashboardProps) {
  const [activeTab, setActiveTab] = useState<'PENDING_LOAD' | 'LOADED_AWAITING_GATE' | 'DISPATCHED_HISTORY'>('PENDING_LOAD');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Loading Modal Form State
  const [selectedOrderForLoading, setSelectedOrderForLoading] = useState<Order | null>(null);
  const [exitPermitNumber, setExitPermitNumber] = useState<string>('');
  const [loadingDate, setLoadingDate] = useState<string>('');
  const [loadingTime, setLoadingTime] = useState<string>('');
  const [warehouseKeeperName, setWarehouseKeeperName] = useState<string>('');
  const [loadedPalletsCount, setLoadedPalletsCount] = useState<number>(1);
  const [actualQuantity, setActualQuantity] = useState<number>(0);
  const [weighbridgeGross, setWeighbridgeGross] = useState<number | ''>('');
  const [weighbridgeTare, setWeighbridgeTare] = useState<number | ''>('');
  const [productionBatch, setProductionBatch] = useState<string>('');
  const [warehouseNotes, setWarehouseNotes] = useState<string>('');
  const [packageQualityConfirmed, setPackageQualityConfirmed] = useState<boolean>(true);
  const [strappingConfirmed, setStrappingConfirmed] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Discrepancy Modal State (اعلام مغایرت متراژ/تعداد و ارجاع به فروش)
  const [selectedOrderForDiscrepancy, setSelectedOrderForDiscrepancy] = useState<Order | null>(null);
  const [discrepancyReason, setDiscrepancyReason] = useState<string>('عدم گنجایش فیزیکی یا اضافه بار بر روی کفی ناوگان');
  const [discrepancyReportedQty, setDiscrepancyReportedQty] = useState<number>(0);
  const [discrepancyReporter, setDiscrepancyReporter] = useState<string>('');
  const [discrepancyNotes, setDiscrepancyNotes] = useState<string>('');
  const [isSubmittingDiscrepancy, setIsSubmittingDiscrepancy] = useState<boolean>(false);

  // Print Exit Permit Modal State
  const [orderToPrint, setOrderToPrint] = useState<Order | null>(null);

  // Auto calculate net weight
  const weighbridgeNet = useMemo(() => {
    const gross = Number(weighbridgeGross) || 0;
    const tare = Number(weighbridgeTare) || 0;
    return gross > tare ? gross - tare : 0;
  }, [weighbridgeGross, weighbridgeTare]);

  // Filter orders by warehouse stages
  const pendingLoadOrders = useMemo(() => {
    return orders.filter(o => o.status === 'VEHICLE_ASSIGNED');
  }, [orders]);

  const loadedAwaitingGateOrders = useMemo(() => {
    return orders.filter(o => o.status === 'WAREHOUSE_LOADED');
  }, [orders]);

  const dispatchedOrders = useMemo(() => {
    return orders.filter(o => o.status === 'LOADED_AND_DISPATCHED');
  }, [orders]);

  // Current tab orders filtered by search
  const currentFilteredOrders = useMemo(() => {
    let list: Order[] = [];
    if (activeTab === 'PENDING_LOAD') list = pendingLoadOrders;
    else if (activeTab === 'LOADED_AWAITING_GATE') list = loadedAwaitingGateOrders;
    else list = dispatchedOrders;

    if (!searchQuery.trim()) return list;

    const q = searchQuery.trim().toLowerCase();
    return list.filter(o => 
      (o.orderNumber && o.orderNumber.toLowerCase().includes(q)) ||
      (o.customerName && o.customerName.toLowerCase().includes(q)) ||
      (o.buyerName && o.buyerName.toLowerCase().includes(q)) ||
      (o.destinationCity && o.destinationCity.toLowerCase().includes(q)) ||
      (o.vehicleDetails?.driverName && o.vehicleDetails.driverName.toLowerCase().includes(q)) ||
      (o.vehicleDetails?.licensePlate && o.vehicleDetails.licensePlate.toLowerCase().includes(q)) ||
      (o.vehicleDetails?.billOfLadingNumber && o.vehicleDetails.billOfLadingNumber.toLowerCase().includes(q)) ||
      (o.warehouseDetails?.exitPermitNumber && o.warehouseDetails.exitPermitNumber.toLowerCase().includes(q)) ||
      (o.warehouseDetails?.warehouseKeeperName && o.warehouseDetails.warehouseKeeperName.toLowerCase().includes(q)) ||
      (o.productName && o.productName.toLowerCase().includes(q))
    );
  }, [activeTab, pendingLoadOrders, loadedAwaitingGateOrders, dispatchedOrders, searchQuery]);

  // Format Persian Date helper
  const getTodayPersianDate = () => {
    try {
      const now = new Date();
      return new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    } catch {
      return '۱۴۰۳/۰۸/۲۷';
    }
  };

  const getCurrentTimeString = () => {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  // Generate random unique exit permit number
  const generateNewPermitNumber = () => {
    const yr = '1403';
    const rand = Math.floor(10000 + Math.random() * 90000);
    return `WH-${yr}-${rand}`;
  };

  // Open Loading Modal & initialize default values
  const handleOpenLoadingModal = (order: Order) => {
    setSelectedOrderForLoading(order);
    
    // Estimate pallets based on quantity (e.g. approx 300-400 roof tiles per pallet)
    const estimatedPallets = Math.max(1, Math.ceil((order.quantity || 1) / 330));
    setLoadedPalletsCount(estimatedPallets);
    setActualQuantity(order.quantity || 0);

    // Generate exit permit number like WH-1403-XXXXX
    setExitPermitNumber(generateNewPermitNumber());

    // Date and time
    setLoadingDate(getTodayPersianDate());
    setLoadingTime(getCurrentTimeString());

    // Estimated weight in kg (average ~3.1 kg per tile)
    const estimatedNetKg = Math.round((order.quantity || 1) * 3.1);
    const estimatedTareKg = 14500; // Average truck tare
    setWeighbridgeTare(estimatedTareKg);
    setWeighbridgeGross(estimatedTareKg + estimatedNetKg);

    // Operator Name
    setWarehouseKeeperName(currentUser?.fullName || 'مسئول انبار محصول کارخانه طبرستان');
    
    // Batch
    const currentMonth = (new Date().getMonth() + 1).toString().padStart(2, '0');
    setProductionBatch(`B-03${currentMonth}-${Math.floor(10 + Math.random() * 90)}`);
    setWarehouseNotes('');
    setPackageQualityConfirmed(true);
    setStrappingConfirmed(true);
  };

  // Submit Loading Specifications Form
  const handleConfirmWarehouseLoading = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderForLoading) return;

    if (!exitPermitNumber.trim()) {
      showToast('لطفاً شماره برگه حواله خروج انبار را وارد نمایید.', 'error');
      return;
    }

    if (!warehouseKeeperName.trim()) {
      showToast('لطفاً نام اپراتور و انباردار مسئول بارگیری را وارد نمایید.', 'error');
      return;
    }

    if (loadedPalletsCount <= 0) {
      showToast('لطفاً تعداد پالت بارگیری شده معتبر وارد نمایید.', 'error');
      return;
    }

    if (actualQuantity <= 0) {
      showToast('لطفاً مقدار قطعی بارگیری شده را وارد نمایید.', 'error');
      return;
    }

    if (!packageQualityConfirmed || !strappingConfirmed) {
      showToast('تایید کنترل کیفی سلامت پالت‌ها و تسمه‌کشی استاندارد الزامی است.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: WarehouseDetails = {
        loadedPalletsCount: selectedOrderForLoading.isExportOrder ? Number(loadedPalletsCount) : undefined,
        actualQuantity: Number(actualQuantity) || selectedOrderForLoading.quantity,
        exitPermitNumber: exitPermitNumber.trim(),
        weighbridgeGross: Number(weighbridgeGross) || 0,
        weighbridgeTare: Number(weighbridgeTare) || 0,
        weighbridgeNet: Number(weighbridgeNet) || 0,
        warehouseKeeperName: warehouseKeeperName.trim(),
        loadedAt: new Date().toISOString(),
        warehouseNotes: warehouseNotes.trim() ? `${warehouseNotes.trim()} [ثبت شده در تاریخ: ${loadingDate} ساعت ${loadingTime}]` : `بارگیری در تاریخ ${loadingDate} ساعت ${loadingTime}`,
        productionBatch: productionBatch.trim() || undefined,
        packageQualityConfirmed: true,
        packagingType: selectedOrderForLoading.isExportOrder ? 'PALLET' : 'BULK'
      };

      const success = await onWarehouseLoad(selectedOrderForLoading.id, payload);
      if (success) {
        showToast(`مشخصات بارگیری سفارش شماره ${selectedOrderForLoading.orderNumber} با شماره حواله ${payload.exitPermitNumber} توسط ${payload.warehouseKeeperName} ثبت شد و جهت ترخیص نهایی به گیت حراست ارجاع گردید.`, 'success');
        setSelectedOrderForLoading(null);
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'خطا در ثبت اطلاعات بارگیری انبار', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Discrepancy Form
  const handleOpenDiscrepancyModal = (order: Order) => {
    setSelectedOrderForDiscrepancy(order);
    setDiscrepancyReason('عدم گنجایش فیزیکی یا اضافه بار بر روی کفی ناوگان');
    setDiscrepancyReportedQty(order.quantity || 0);
    setDiscrepancyReporter(currentUser?.fullName || 'مسئول انبار محصول');
    setDiscrepancyNotes('');
  };

  // Submit Discrepancy Form (ارجاع به فروش)
  const handleSubmitDiscrepancy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderForDiscrepancy) return;

    if (!discrepancyReporter.trim()) {
      showToast('لطفا نام ثبت‌کننده گزارش مغایرت را وارد نمایید.', 'error');
      return;
    }

    setIsSubmittingDiscrepancy(true);
    try {
      const payload = {
        reason: discrepancyReason.trim(),
        reportedQuantity: Number(discrepancyReportedQty) || selectedOrderForDiscrepancy.quantity,
        reporterName: discrepancyReporter.trim(),
        notes: discrepancyNotes.trim() || undefined
      };

      if (onWarehouseDiscrepancy) {
        const success = await onWarehouseDiscrepancy(selectedOrderForDiscrepancy.id, payload);
        if (success) {
          showToast(`گزارش مغایرت سفارش شماره ${selectedOrderForDiscrepancy.orderNumber} ثبت و جهت تعیین تکلیف به واحد فروش ارجاع گردید.`, 'info');
          setSelectedOrderForDiscrepancy(null);
          if (selectedOrderForLoading?.id === selectedOrderForDiscrepancy.id) {
            setSelectedOrderForLoading(null);
          }
        }
      } else {
        const res = await fetch(`/api/orders/${selectedOrderForDiscrepancy.id}/warehouse-discrepancy`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          showToast(`گزارش مغایرت سفارش شماره ${selectedOrderForDiscrepancy.orderNumber} ثبت و جهت تعیین تکلیف به واحد فروش ارجاع گردید.`, 'info');
          setSelectedOrderForDiscrepancy(null);
          if (selectedOrderForLoading?.id === selectedOrderForDiscrepancy.id) {
            setSelectedOrderForLoading(null);
          }
          if (onRefresh) onRefresh();
        } else {
          showToast('خطا در ارجاع مغایرت به واحد فروش', 'error');
        }
      }
    } catch (err: any) {
      console.error(err);
      showToast('خطای شبکه در ثبت مغایرت', 'error');
    } finally {
      setIsSubmittingDiscrepancy(false);
    }
  };

  // Render Persian License Plate Graphic
  const renderPlateBadge = (plate?: string) => {
    if (!plate) return <span className="text-slate-400 font-mono text-xs">تعیین نشده</span>;
    return (
      <div className="inline-flex items-center bg-amber-400 text-slate-900 border-2 border-slate-900 rounded-md px-2 py-0.5 text-xs font-black shadow-xs dir-ltr select-none">
        <span className="bg-blue-800 text-white text-[9px] px-1 py-0.5 -ml-2 mr-1.5 rounded-l-xs font-bold border-r border-slate-900 flex items-center gap-0.5">
          <span>I.R.</span>
          <span>IRAN</span>
        </span>
        <span className="tracking-widest font-mono text-xs">{plate}</span>
      </div>
    );
  };

  return (
    <div className="space-y-6 text-right dir-rtl font-sans animate-fade-in" id="warehouse-dashboard-root">
      
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 md:p-6" id="warehouse-header-panel">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-amber-500/10 text-amber-600 rounded-2xl border border-amber-500/20 shadow-xs">
              <Boxes className="w-7 h-7 text-amber-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg md:text-xl font-black text-slate-900">
                  کارتابل انبار محصول و ثبت مشخصات بارگیری
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                  صنایع سفال طبرستان
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                ثبت مشخصات بارگیری، صدور برگه خروج، ثبت اوزان باسکول دیجیتال و ارجاع نهایی سفارش به گیت حراست
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-start md:self-auto">
            {onRefresh && (
              <button
                id="btn-refresh-warehouse"
                onClick={onRefresh}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                title="به‌روزرسانی لحظه‌ای سفارشات"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>به‌روزرسانی کارتابل</span>
              </button>
            )}
            <div className="px-3.5 py-2 bg-slate-900 text-amber-400 font-mono text-xs font-bold rounded-xl flex items-center gap-2 shadow-xs">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>{new Date().toLocaleDateString('fa-IR')}</span>
            </div>
          </div>
        </div>

        {/* Quick KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-100">
          
          <div className="p-4 bg-amber-50/70 rounded-xl border border-amber-200/80">
            <div className="flex items-center justify-between text-amber-900 mb-1">
              <span className="text-xs font-bold">آماده بارگیری در انبار</span>
              <Truck className="w-4 h-4 text-amber-600" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-amber-700 font-mono">
                {pendingLoadOrders.length}
              </span>
              <span className="text-[11px] text-amber-800">خودرو در نوبت</span>
            </div>
          </div>

          <div className="p-4 bg-blue-50/70 rounded-xl border border-blue-200/80">
            <div className="flex items-center justify-between text-blue-900 mb-1">
              <span className="text-xs font-bold">بارگیری‌شده / منتظر حراست</span>
              <PackageCheck className="w-4 h-4 text-blue-600" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-blue-700 font-mono">
                {loadedAwaitingGateOrders.length}
              </span>
              <span className="text-[11px] text-blue-800">حواله صادر شده</span>
            </div>
          </div>

          <div className="p-4 bg-emerald-50/70 rounded-xl border border-emerald-200/80">
            <div className="flex items-center justify-between text-emerald-900 mb-1">
              <span className="text-xs font-bold">ترخیص نهایی حراست</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-emerald-700 font-mono">
                {dispatchedOrders.length}
              </span>
              <span className="text-[11px] text-emerald-800">خودرو ترخیص‌شده</span>
            </div>
          </div>

          <div className="p-4 bg-purple-50/70 rounded-xl border border-purple-200/80">
            <div className="flex items-center justify-between text-purple-900 mb-1">
              <span className="text-xs font-bold">مجموع پالت‌های صادره</span>
              <Layers className="w-4 h-4 text-purple-600" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-purple-700 font-mono">
                {orders.reduce((sum, o) => sum + (o.warehouseDetails?.loadedPalletsCount || 0), 0)}
              </span>
              <span className="text-[11px] text-purple-800">پالت استاندارد</span>
            </div>
          </div>

        </div>
      </div>

      {/* Tabs & Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          
          <button
            id="tab-pending-load"
            onClick={() => setActiveTab('PENDING_LOAD')}
            className={`px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'PENDING_LOAD'
                ? 'bg-amber-500 text-white shadow-sm'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>نوبت بارگیری انبار (آماده بارگیری)</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${activeTab === 'PENDING_LOAD' ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-800'}`}>
              {pendingLoadOrders.length}
            </span>
          </button>

          <button
            id="tab-loaded-gate"
            onClick={() => setActiveTab('LOADED_AWAITING_GATE')}
            className={`px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'LOADED_AWAITING_GATE'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            <PackageCheck className="w-4 h-4" />
            <span>بارهای بارگیری‌شده (منتظر تایید حراست)</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${activeTab === 'LOADED_AWAITING_GATE' ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-800'}`}>
              {loadedAwaitingGateOrders.length}
            </span>
          </button>

          <button
            id="tab-dispatched-history"
            onClick={() => setActiveTab('DISPATCHED_HISTORY')}
            className={`px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'DISPATCHED_HISTORY'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            <span>بایگانی حواله‌های ترخیص‌شده</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${activeTab === 'DISPATCHED_HISTORY' ? 'bg-emerald-700 text-white' : 'bg-slate-200 text-slate-800'}`}>
              {dispatchedOrders.length}
            </span>
          </button>

        </div>

        {/* Search Input */}
        <div className="relative min-w-[280px]">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            id="input-warehouse-search"
            type="text"
            placeholder="جستجو در شماره سفارش، حواله، اپراتور، پلاک یا راننده..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pr-9 pl-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all font-sans"
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

      {/* Orders List / Cards */}
      {currentFilteredOrders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
          <Boxes className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-700">هیچ سفارشی در این بخش یافت نشد</h3>
          <p className="text-xs text-slate-400 mt-1">
            {searchQuery ? 'با عبارت جستجوی مورد نظر نتیجه‌ای منطبق نگردید.' : 'سفارشات جدید پس از تخصیص خودرو توسط شرکت‌های حمل‌ونقل در این بخش جهت ثبت بارگیری قرار می‌گیرند.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4" id="warehouse-orders-container">
          {currentFilteredOrders.map((order) => {
            const isPending = order.status === 'VEHICLE_ASSIGNED';
            const isWarehouseLoaded = order.status === 'WAREHOUSE_LOADED';
            const isDispatched = order.status === 'LOADED_AND_DISPATCHED';

            return (
              <div 
                key={order.id}
                id={`warehouse-order-card-${order.id}`}
                className={`bg-white rounded-2xl border transition-all duration-200 overflow-hidden shadow-xs hover:shadow-md ${
                  isPending 
                    ? 'border-amber-200/80 hover:border-amber-400 bg-linear-to-b from-white to-amber-50/20' 
                    : isWarehouseLoaded 
                    ? 'border-blue-200/80 hover:border-blue-400 bg-linear-to-b from-white to-blue-50/20' 
                    : 'border-slate-200 hover:border-emerald-300'
                }`}
              >
                <div className="p-5 md:p-6">
                  
                  {/* Top Bar of Order */}
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-mono text-xs font-black text-slate-900 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">
                        {order.orderNumber}
                      </span>

                      {order.warehouseDetails?.exitPermitNumber && (
                        <span className="font-mono text-xs font-bold text-blue-800 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 flex items-center gap-1">
                          <FileText className="w-3.5 h-3.5 text-blue-600" />
                          <span>شماره حواله خروج: {order.warehouseDetails.exitPermitNumber}</span>
                        </span>
                      )}

                      <span className="text-xs font-bold text-slate-700">
                        {order.customerName} {order.agentCode ? `(کد ${order.agentCode})` : ''}
                      </span>

                      {order.buyerName && (
                        <span className="text-xs text-slate-500 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200">
                          خریدار: {order.buyerName}
                        </span>
                      )}

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

                    {/* Status Badge */}
                    <div className="flex items-center gap-2">
                      {isPending && (
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                          <span>آماده ثبت مشخصات بارگیری</span>
                        </span>
                      )}
                      {isWarehouseLoaded && (
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1.5">
                          <PackageCheck className="w-3.5 h-3.5 text-blue-600" />
                          <span>بارگیری‌شده / ارجاع به گیت حراست</span>
                        </span>
                      )}
                      {isDispatched && (
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>ترخیص نهایی و خروج از کارخانه</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Pending Edit Suspension Warning */}
                  {order.hasPendingEdit && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 my-3 text-amber-900 text-xs font-bold flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>⚠️ این سفارش توسط نماینده ویرایش شده و تا زمان تایید مجدد توسط مدیر بازرگانی غیرفعال می‌باشد.</span>
                      </div>
                      <span className="text-[10px] bg-amber-200 text-amber-900 px-2 py-0.5 rounded-md font-mono shrink-0">معلق در انتظار تایید مدیر</span>
                    </div>
                  )}

                  {/* Recently Edited Notice */}
                  {order.recentlyEditedNotice && !order.hasPendingEdit && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 my-3 text-blue-900 text-xs font-bold flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                      <span>⚡ {order.recentlyEditedNotice}</span>
                    </div>
                  )}

                  {/* Discrepancy Notice */}
                  {order.warehouseDiscrepancy && (
                    <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 my-3 text-rose-900 text-xs font-bold flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>⚠️ گزارش مغایرت ارجاع‌شده به فروش: {order.warehouseDiscrepancy.reason} (ثبت: {order.warehouseDiscrepancy.reporterName})</span>
                      </div>
                      <span className="text-[10px] bg-rose-200 text-rose-900 px-2 py-0.5 rounded-md font-mono shrink-0">ارجاع به واحد فروش</span>
                    </div>
                  )}

                  {/* Security Detained Notice */}
                  {order.securityDetained && (
                    <div className="bg-red-100 border border-red-300 rounded-xl p-3 my-3 text-red-900 text-xs font-bold flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                        <span>🛑 عودت داده شده از گیت حراست جهت بازبینی بارگیری: {order.securityDetained.reason} (افسر: {order.securityDetained.officerName})</span>
                      </div>
                      <span className="text-[10px] bg-red-200 text-red-900 px-2 py-0.5 rounded-md font-mono shrink-0">توقیف در گیت</span>
                    </div>
                  )}

                  {/* Order Details Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-4">
                    
                    {/* Column 1: Product & Pallet info */}
                    <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/70 space-y-1.5">
                      <span className="text-[11px] font-bold text-slate-400 block mb-1">مشخصات کالا و پالت:</span>
                      <div className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                        <Boxes className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>{order.productName}</span>
                      </div>
                      <div className="text-xs text-slate-600 flex items-center justify-between">
                        <span>مقدار درخواستی سفارش:</span>
                        <span className="font-black text-slate-900 font-mono">
                          {order.quantity.toLocaleString('fa-IR')} {order.unit}
                        </span>
                      </div>
                      {order.warehouseDetails?.actualQuantity && order.warehouseDetails.actualQuantity !== order.quantity ? (
                        <div className="text-xs text-blue-700 bg-blue-50 p-1.5 rounded-lg border border-blue-100 flex items-center justify-between">
                          <span className="font-bold">مقدار بارگیری قطعی:</span>
                          <span className="font-mono font-black">{order.warehouseDetails.actualQuantity.toLocaleString('fa-IR')} {order.unit}</span>
                        </div>
                      ) : null}
                      {order.warehouseDetails?.loadedPalletsCount ? (
                        <div className="text-xs text-purple-700 bg-purple-50 p-1.5 rounded-lg border border-purple-100 flex items-center justify-between">
                          <span className="font-bold">تعداد پالت بارگیری:</span>
                          <span className="font-mono font-black">{order.warehouseDetails.loadedPalletsCount} پالت استاندارد</span>
                        </div>
                      ) : null}
                    </div>

                    {/* Column 2: Assigned Vehicle & Driver */}
                    <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/70 space-y-1.5">
                      <span className="text-[11px] font-bold text-slate-400 block mb-1">مشخصات راننده و ناوگان:</span>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700">{order.vehicleDetails?.vehicleType || 'خودرو باربری'}</span>
                        {renderPlateBadge(order.vehicleDetails?.licensePlate)}
                      </div>
                      <div className="text-xs text-slate-600 flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span>{order.vehicleDetails?.driverName || '-'}</span>
                        </span>
                        <span className="font-mono text-[11px] text-slate-500 dir-ltr">{order.vehicleDetails?.driverPhone}</span>
                      </div>
                      {order.vehicleDetails?.billOfLadingNumber && (
                        <div className="text-[11px] text-slate-500 flex items-center justify-between">
                          <span>بارنامه باربری: </span>
                          <span className="font-mono font-bold text-slate-700">{order.vehicleDetails.billOfLadingNumber}</span>
                        </div>
                      )}
                    </div>

                    {/* Column 3: Destination & Weighbridge */}
                    <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/70 space-y-1.5">
                      <span className="text-[11px] font-bold text-slate-400 block mb-1">مقصد تخلیه و توزین باسکول:</span>
                      <div className="text-xs font-bold text-slate-800 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                        <span>{order.destinationCity}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 line-clamp-1">{order.exactAddress}</p>
                      
                      {order.warehouseDetails?.weighbridgeNet ? (
                        <div className="text-xs text-emerald-800 bg-emerald-50 p-1.5 rounded-lg border border-emerald-100 flex items-center justify-between">
                          <span className="font-bold flex items-center gap-1">
                            <Scale className="w-3 h-3 text-emerald-600" />
                            <span>وزن خالص باسکول:</span>
                          </span>
                          <span className="font-mono font-black">{order.warehouseDetails.weighbridgeNet.toLocaleString('fa-IR')} کیلوگرم</span>
                        </div>
                      ) : (
                        <div className="text-[11px] text-amber-700 bg-amber-50/60 p-1 rounded border border-amber-200/60">
                          نیاز به ثبت توزین و صدور برگه خروج
                        </div>
                      )}
                    </div>

                  </div>

                  {/* Actions & Summary Bar */}
                  <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                    
                    <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-3">
                      {order.warehouseDetails?.warehouseKeeperName && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3 text-slate-400" />
                          <span>اپراتور انبار: <strong>{order.warehouseDetails.warehouseKeeperName}</strong></span>
                        </span>
                      )}
                      {order.warehouseDetails?.loadedAt && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>زمان صدور حواله: {new Date(order.warehouseDetails.loadedAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}</span>
                        </span>
                      )}
                      {order.warehouseDetails?.productionBatch && (
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono text-[10px]">
                          بچ کوره: {order.warehouseDetails.productionBatch}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {isPending && (
                        <>
                          <button
                            id={`btn-open-discrepancy-${order.id}`}
                            onClick={() => handleOpenDiscrepancyModal(order)}
                            disabled={order.hasPendingEdit}
                            className="px-3 py-2 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                            title="در صورت عدم گنجایش ناوگان یا مغایرت متراژ"
                          >
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                            <span>اعلام مغایرت با ناوگان (ارجاع به فروش)</span>
                          </button>

                          <button
                            id={`btn-open-load-form-${order.id}`}
                            onClick={() => handleOpenLoadingModal(order)}
                            disabled={order.hasPendingEdit}
                            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl text-xs font-extrabold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                          >
                            <Boxes className="w-4 h-4" />
                            <span>ثبت مشخصات بارگیری و صدور برگه خروج</span>
                          </button>
                        </>
                      )}

                      {order.warehouseDetails && (
                        <button
                          id={`btn-print-permit-${order.id}`}
                          onClick={() => setOrderToPrint(order)}
                          className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5 text-slate-600" />
                          <span>چاپ برگه خروج رسمی</span>
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

      {/* Modal: Record Loading Specifications & Issue Exit Permit */}
      {selectedOrderForLoading && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-3xl w-full p-5 md:p-6 my-8 animate-scale-in text-right">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500/10 text-amber-600 rounded-xl">
                  <Boxes className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <span>فرم ثبت مشخصات بارگیری و صدور برگه خروج انبار</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                      صنایع سفال طبرستان
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    سفارش شماره <strong className="font-mono text-slate-800">{selectedOrderForLoading.orderNumber}</strong> | نمایندگی {selectedOrderForLoading.customerName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedOrderForLoading(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmWarehouseLoading} className="space-y-4 font-sans text-xs">
              
              {/* Target Order & Vehicle Preview Box */}
              <div className="bg-amber-50/60 p-4 rounded-xl border border-amber-200/80 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <span className="text-slate-500 block mb-0.5 text-[11px]">کالای سفارش:</span>
                  <span className="font-bold text-slate-800 text-xs">{selectedOrderForLoading.productName}</span>
                  <div className="text-[11px] text-slate-600 mt-1 font-mono">
                    مقدار فاکتور: <strong>{selectedOrderForLoading.quantity.toLocaleString('fa-IR')}</strong> {selectedOrderForLoading.unit}
                  </div>
                </div>

                <div>
                  <span className="text-slate-500 block mb-0.5 text-[11px]">راننده و خودرو باربری:</span>
                  <div className="font-bold text-slate-800 text-xs">
                    {selectedOrderForLoading.vehicleDetails?.driverName || 'تعیین نشده'} ({selectedOrderForLoading.vehicleDetails?.vehicleType})
                  </div>
                  <div className="mt-1.5">
                    {renderPlateBadge(selectedOrderForLoading.vehicleDetails?.licensePlate)}
                  </div>
                </div>

                <div>
                  <span className="text-slate-500 block mb-0.5 text-[11px]">مقصد و شرکت باربری:</span>
                  <div className="font-bold text-slate-800 text-xs">
                    {selectedOrderForLoading.destinationCity}
                  </div>
                  <div className="text-[11px] text-slate-600 mt-1">
                    بارنامه: <strong className="font-mono">{selectedOrderForLoading.vehicleDetails?.billOfLadingNumber || 'صادر نشده'}</strong>
                  </div>
                </div>
              </div>

              {/* Packaging Rule & Discrepancy Guide Alert */}
              <div className="space-y-2">
                {selectedOrderForLoading.isExportOrder ? (
                  <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 text-purple-900 text-xs font-bold flex items-center gap-2">
                    <Boxes className="w-4 h-4 text-purple-600 shrink-0" />
                    <span>🌍 دستورالعمل صادراتی: بار فقط بصورت پالت‌بندی شرینک‌شده استاندارد بارگیری می‌گردد. ثبت تعداد دقیق پالت‌ها الزامی است.</span>
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs font-bold flex items-center gap-2">
                    <Boxes className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>🚛 دستورالعمل بارگیری داخلی: بار بصورت فله روی وسیله نقلیه چیده می‌شود؛ لذا شمارش و بررسی دقیق تعداد/متراژ بارگیری الزامی است.</span>
                  </div>
                )}

                <div className="p-2.5 bg-rose-50 rounded-xl border border-rose-200 text-rose-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="leading-relaxed">
                    ⚠️ <strong>قانون عدم ویرایش مستقیم:</strong> در صورت مغایرت متراژ یا تعداد بار با گنجایش ناوگان، امکان تغییر مستقیم مقادیر توسط مسئول انبار وجود ندارد و سفارش باید جهت تصمیم‌گیری به واحد فروش ارجاع شود.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const ord = selectedOrderForLoading;
                      setSelectedOrderForLoading(null);
                      handleOpenDiscrepancyModal(ord);
                    }}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-xs shrink-0 cursor-pointer transition-colors"
                  >
                    ارجاع مغایرت به واحد فروش
                  </button>
                </div>
              </div>

              {/* Form Section 1: Core Exit Permit & Operator Fields */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-amber-600" />
                  <span>اطلاعات سند خروج، اپراتور انبار و تاریخ بارگیری:</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  
                  {/* Exit Permit Number */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-bold text-slate-700 text-[11px]">
                        شماره برگه خروج انبار *
                      </label>
                      <button
                        type="button"
                        onClick={() => setExitPermitNumber(generateNewPermitNumber())}
                        className="text-[10px] text-amber-600 hover:text-amber-700 font-bold cursor-pointer"
                        title="تولید خودکار شماره جدید"
                      >
                        کد خودکار
                      </button>
                    </div>
                    <input
                      type="text"
                      required
                      value={exitPermitNumber}
                      onChange={(e) => setExitPermitNumber(e.target.value)}
                      placeholder="WH-1403-..."
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>

                  {/* Loading Date */}
                  <div>
                    <label className="font-bold text-slate-700 block mb-1 text-[11px]">
                      تاریخ بارگیری (شمسی) *
                    </label>
                    <div className="relative">
                      <Calendar className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        required
                        value={loadingDate}
                        onChange={(e) => setLoadingDate(e.target.value)}
                        placeholder="۱۴۰۳/۰۸/۲۷"
                        className="w-full bg-white border border-slate-200 rounded-xl pr-9 pl-3 py-2 text-xs font-mono font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Loading Time */}
                  <div>
                    <label className="font-bold text-slate-700 block mb-1 text-[11px]">
                      ساعت شروع بارگیری *
                    </label>
                    <div className="relative">
                      <Clock className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="time"
                        required
                        value={loadingTime}
                        onChange={(e) => setLoadingTime(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl pr-9 pl-3 py-2 text-xs font-mono font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>

                </div>

                {/* Operator Name & Production Batch */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  
                  <div>
                    <label className="font-bold text-slate-700 block mb-1 text-[11px]">
                      نام اپراتور و انباردار مسئول بارگیری *
                    </label>
                    <div className="relative">
                      <User className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        required
                        value={warehouseKeeperName}
                        onChange={(e) => setWarehouseKeeperName(e.target.value)}
                        placeholder="مثال: آقای مهدی رضایی (انباردار)"
                        className="w-full bg-white border border-slate-200 rounded-xl pr-9 pl-3 py-2 text-xs text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1 text-[11px]">
                      شماره لات / ردیف کوره پخت (Production Batch)
                    </label>
                    <input
                      type="text"
                      value={productionBatch}
                      onChange={(e) => setProductionBatch(e.target.value)}
                      placeholder="مثال: B-0308-42"
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>

                </div>
              </div>

              {/* Form Section 2: Quantities and Pallets */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                
                <div className="p-3.5 bg-purple-50/60 rounded-xl border border-purple-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-purple-950 text-xs flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-purple-600" />
                      <span>تعداد پالت بارگیری شده *</span>
                    </label>
                    <span className="text-[10px] text-purple-700">پالت استاندارد طبرستان</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setLoadedPalletsCount(prev => Math.max(1, prev - 1))}
                      className="p-2 bg-white hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg cursor-pointer transition-colors"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      required
                      value={loadedPalletsCount}
                      onChange={(e) => setLoadedPalletsCount(Math.max(1, Number(e.target.value)))}
                      className="flex-1 bg-white border border-purple-200 rounded-lg px-3 py-2 text-center text-sm font-mono font-black text-purple-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <button
                      type="button"
                      onClick={() => setLoadedPalletsCount(prev => prev + 1)}
                      className="p-2 bg-white hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg cursor-pointer transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-blue-950 text-xs flex items-center gap-1.5">
                      <Boxes className="w-4 h-4 text-blue-600" />
                      <span>مقدار قطعی بارگیری شده ({selectedOrderForLoading.unit}) *</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setActualQuantity(selectedOrderForLoading.quantity)}
                      className="text-[10px] text-blue-600 hover:text-blue-700 font-bold cursor-pointer"
                    >
                      تطبیق با فاکتور
                    </button>
                  </div>

                  <input
                    type="number"
                    min={1}
                    required
                    value={actualQuantity}
                    onChange={(e) => setActualQuantity(Number(e.target.value))}
                    className="w-full bg-white border border-blue-200 rounded-lg px-3 py-2 text-sm font-mono font-black text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

              </div>

              {/* Form Section 3: Weighbridge / Digital Scale */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-slate-800 text-xs">
                    <Scale className="w-4 h-4 text-indigo-600" />
                    <span>ثبت اوزان باسکول دیجیتال کارخانه:</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">واحد: کیلوگرم (kg)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-600 block mb-1">وزن ناخالص/پر باسکول (Gross)</label>
                    <input
                      type="number"
                      value={weighbridgeGross}
                      onChange={(e) => setWeighbridgeGross(e.target.value ? Number(e.target.value) : '')}
                      placeholder="مثال: 32500"
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-600 block mb-1">وزن خودرو خالی (Tare)</label>
                    <input
                      type="number"
                      value={weighbridgeTare}
                      onChange={(e) => setWeighbridgeTare(e.target.value ? Number(e.target.value) : '')}
                      placeholder="مثال: 14500"
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-600 block mb-1">وزن خالص بار (محاسبه خودکار)</label>
                    <div className="w-full bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-1.5 text-xs font-mono font-black text-indigo-900 flex items-center justify-between">
                      <span>{weighbridgeNet.toLocaleString('fa-IR')}</span>
                      <span className="text-[10px] text-indigo-600 font-sans">کیلوگرم</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Form Section 4: Notes */}
              <div>
                <label className="font-bold text-slate-700 block mb-1 text-[11px]">
                  توضیحات و ملاحظات انبارداری (اختیاری)
                </label>
                <input
                  type="text"
                  value={warehouseNotes}
                  onChange={(e) => setWarehouseNotes(e.target.value)}
                  placeholder="ملاحظات چیدمان پالت، تحویل به راننده یا توضیحات تکمیلی..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              {/* Form Section 5: Quality Checklists */}
              <div className="space-y-2 pt-1">
                <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    id="qualityCheck"
                    checked={packageQualityConfirmed}
                    onChange={(e) => setPackageQualityConfirmed(e.target.checked)}
                    className="w-4 h-4 mt-0.5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                  />
                  <label htmlFor="qualityCheck" className="text-xs text-emerald-950 font-bold leading-relaxed cursor-pointer">
                    تایید کنترل کیفیت: پالت‌ها و قطعات سفال فاقد شکستگی، لب‌پریدگی یا تغییر رنگ بوده و بسته‌بندی شرینک نایلونی سالم است.
                  </label>
                </div>

                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    id="strappingCheck"
                    checked={strappingConfirmed}
                    onChange={(e) => setStrappingConfirmed(e.target.checked)}
                    className="w-4 h-4 mt-0.5 text-amber-600 rounded border-slate-300 focus:ring-amber-500 cursor-pointer"
                  />
                  <label htmlFor="strappingCheck" className="text-xs text-amber-950 font-bold leading-relaxed cursor-pointer">
                    تایید تسمه‌کشی و مهار ایمن بار: پالت‌ها روی کفی تریلی/کامیون به‌درستی چیدمان شده و توسط راننده با زنجیر و تسمه استاندارد مهار گردید.
                  </label>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setSelectedOrderForLoading(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-all cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-white rounded-xl font-extrabold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <PackageCheck className="w-4 h-4" />
                  <span>{isSubmitting ? 'در حال صدور حواله...' : 'صدور برگه خروج و ارجاع نهایی به گیت حراست'}</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* Modal: Discrepancy Referral to Sales (ارجاع مغایرت به واحد فروش) */}
      {selectedOrderForDiscrepancy && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-rose-200 shadow-2xl max-w-xl w-full p-5 md:p-6 my-8 animate-scale-in text-right">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-rose-100 mb-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-rose-500/10 text-rose-600 rounded-xl">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <span>فرم اعلام مغایرت بارگیری و ارجاع به واحد فروش</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    سفارش شماره <strong className="font-mono text-slate-800">{selectedOrderForDiscrepancy.orderNumber}</strong> | {selectedOrderForDiscrepancy.customerName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedOrderForDiscrepancy(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitDiscrepancy} className="space-y-4 text-xs font-sans">
              
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 leading-relaxed">
                💡 <strong>توجه انباردار محترم:</strong> بر اساس دستورالعمل سیستم، مسئول انبار مجاز به تغییر متراژ یا تعداد فاکتور نمی‌باشد. با ثبت این فرم، سفارش به واحد فروش ارجاع داده می‌شود تا بازرگانی نسبت به اصلاح متراژ سفارش یا هماهنگی ناوگان مناسب تصمیم‌گیری نماید.
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1 text-[11px]">
                  علت اصلی مغایرت / عدم امکان بارگیری کامل *
                </label>
                <select
                  required
                  value={discrepancyReason}
                  onChange={(e) => setDiscrepancyReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-rose-500 focus:outline-none"
                >
                  <option value="عدم گنجایش فیزیکی یا اضافه بار بر روی کفی ناوگان">عدم گنجایش فیزیکی یا اضافه بار بر روی کفی ناوگان</option>
                  <option value="کسری فیزیکی موجودی کالا در انبار محصول">کسری فیزیکی موجودی کالا در انبار محصول</option>
                  <option value="مغایرت ابعاد و متراژ سفارش با مشخصات بارگیری">مغایرت ابعاد و متراژ سفارش با مشخصات بارگیری</option>
                  <option value="عدم تناسب نوع وسیله نقلیه با نوع بسته‌بندی">عدم تناسب نوع وسیله نقلیه با نوع بسته‌بندی</option>
                  <option value="نقص فنی یا عدم تایید سلامت فیزیکی ناوگان">نقص فنی یا عدم تایید سلامت فیزیکی ناوگان</option>
                  <option value="سایر موارد و توضیحات انباردار">سایر موارد و توضیحات انباردار</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1 text-[11px]">
                    مقدار درخواستی فاکتور ({selectedOrderForDiscrepancy.unit})
                  </label>
                  <input
                    type="text"
                    disabled
                    value={selectedOrderForDiscrepancy.quantity.toLocaleString('fa-IR')}
                    className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-600"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1 text-[11px]">
                    حداکثر مقدار قابل بارگیری در این ناوگان ({selectedOrderForDiscrepancy.unit})
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={discrepancyReportedQty}
                    onChange={(e) => setDiscrepancyReportedQty(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1 text-[11px]">
                  نام و سمت گزارش‌دهنده انبار *
                </label>
                <input
                  type="text"
                  required
                  value={discrepancyReporter}
                  onChange={(e) => setDiscrepancyReporter(e.target.value)}
                  placeholder="مثال: مهدی رضایی (مسئول انبار)"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-rose-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1 text-[11px]">
                  توضیحات تکمیلی جهت اقدام واحد فروش
                </label>
                <textarea
                  rows={3}
                  value={discrepancyNotes}
                  onChange={(e) => setDiscrepancyNotes(e.target.value)}
                  placeholder="شرح دقیق علت عدم گنجایش، وضعیت کفی ناوگان، پیشنهاد انباردار یا هماهنگی تلفنی انجام شده..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-rose-500 focus:outline-none"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setSelectedOrderForDiscrepancy(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-all cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingDiscrepancy}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white rounded-xl font-extrabold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span>{isSubmittingDiscrepancy ? 'در حال ثبت ارجاع...' : 'ثبت و ارجاع مستقیم به واحد فروش'}</span>
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Modal: Official Printable Warehouse Exit Permit */}
      {orderToPrint && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-300 shadow-2xl max-w-3xl w-full p-6 my-6 text-right animate-scale-in">
            
            {/* Header controls for Modal */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-6 print:hidden">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-indigo-600" />
                <span className="font-bold text-slate-800 text-sm">پیش‌نمایش چاپ برگه رسمی خروج کالا و حواله انبار</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>چاپ فیزیکی برگه خروج</span>
                </button>
                <button
                  onClick={() => setOrderToPrint(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Document Body */}
            <div className="p-6 border-2 border-slate-800 rounded-xl space-y-5 font-sans" id="printable-exit-ticket">
              
              {/* Document Top */}
              <div className="flex items-center justify-between border-b-2 border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <TabarestanLogo className="w-12 h-12" />
                  <div>
                    <h2 className="text-base font-black text-slate-900">شرکت صنایع سفال طبرستان</h2>
                    <h3 className="text-xs font-bold text-slate-600">برگه رسمی حواله خروج کالا و تحویل بار از انبار محصول کارخانه</h3>
                  </div>
                </div>

                <div className="text-left font-mono text-xs space-y-1">
                  <div><span className="font-sans text-slate-500">شماره حواله خروج: </span><span className="font-bold text-slate-900">{orderToPrint.warehouseDetails?.exitPermitNumber || 'WH-0000'}</span></div>
                  <div><span className="font-sans text-slate-500">شماره سفارش: </span><span className="font-bold text-slate-900">{orderToPrint.orderNumber}</span></div>
                  <div><span className="font-sans text-slate-500">تاریخ صدور: </span><span className="font-bold text-slate-900">{new Date().toLocaleDateString('fa-IR')}</span></div>
                </div>
              </div>

              {/* Agent & Buyer Info */}
              <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                <div>
                  <span className="text-slate-500">نمایندگی خریدار: </span>
                  <span className="font-bold text-slate-900">{orderToPrint.customerName} {orderToPrint.agentCode ? `(کد: ${orderToPrint.agentCode})` : ''}</span>
                </div>
                <div>
                  <span className="text-slate-500">خریدار نهایی / پروژه: </span>
                  <span className="font-bold text-slate-900">{orderToPrint.buyerName || orderToPrint.customerName}</span>
                </div>
                <div>
                  <span className="text-slate-500">مقصد تخلیه بار: </span>
                  <span className="font-bold text-slate-900">{orderToPrint.destinationCity} - {orderToPrint.exactAddress}</span>
                </div>
                <div>
                  <span className="text-slate-500">شماره تماس: </span>
                  <span className="font-bold text-slate-900 font-mono">{orderToPrint.phoneNumber}</span>
                </div>
              </div>

              {/* Transport & Driver Info */}
              <div className="grid grid-cols-3 gap-3 text-xs bg-amber-50/50 p-3.5 rounded-lg border border-amber-200">
                <div>
                  <span className="text-slate-500">راننده ترابری: </span>
                  <span className="font-bold text-slate-900">{orderToPrint.vehicleDetails?.driverName || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-500">شماره پلاک خودرو: </span>
                  <span className="font-bold text-slate-900 font-mono">{orderToPrint.vehicleDetails?.licensePlate || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-500">شرکت باربری: </span>
                  <span className="font-bold text-slate-900">{orderToPrint.vehicleDetails?.shippingAgency || '-'}</span>
                </div>
              </div>

              {/* Items & Weighbridge Table */}
              <table className="w-full text-xs text-right border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                    <th className="p-2 border-r border-slate-300 text-center">ردیف</th>
                    <th className="p-2 border-r border-slate-300">شرح کالای بارگیری شده</th>
                    <th className="p-2 border-r border-slate-300 text-center">تعداد پالت</th>
                    <th className="p-2 border-r border-slate-300 text-center">مقدار قطعی</th>
                    <th className="p-2 border-r border-slate-300 text-center">لات کوره</th>
                    <th className="p-2 text-center">وزن خالص باسکول (kg)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-300">
                    <td className="p-2 border-r border-slate-300 text-center font-mono">۱</td>
                    <td className="p-2 border-r border-slate-300 font-bold">{orderToPrint.productName}</td>
                    <td className="p-2 border-r border-slate-300 text-center font-mono font-bold">{orderToPrint.warehouseDetails?.loadedPalletsCount || 1} پالت</td>
                    <td className="p-2 border-r border-slate-300 text-center font-mono font-bold">{(orderToPrint.warehouseDetails?.actualQuantity || orderToPrint.quantity).toLocaleString('fa-IR')} {orderToPrint.unit}</td>
                    <td className="p-2 border-r border-slate-300 text-center font-mono">{orderToPrint.warehouseDetails?.productionBatch || '-'}</td>
                    <td className="p-2 text-center font-mono font-bold">{(orderToPrint.warehouseDetails?.weighbridgeNet || 0).toLocaleString('fa-IR')}</td>
                  </tr>
                </tbody>
              </table>

              {/* Signatures & Stamps Footer */}
              <div className="grid grid-cols-4 gap-3 pt-6 text-center text-xs text-slate-700">
                <div className="p-3 border border-dashed border-slate-300 rounded-lg h-24 flex flex-col justify-between">
                  <span className="font-bold text-[11px]">امضای اپراتور انباردار:</span>
                  <span className="text-[10px] text-slate-600 font-bold">{orderToPrint.warehouseDetails?.warehouseKeeperName || 'مسئول انبار'}</span>
                </div>
                <div className="p-3 border border-dashed border-slate-300 rounded-lg h-24 flex flex-col justify-between">
                  <span className="font-bold text-[11px]">امضای راننده تحویل‌گیرنده:</span>
                  <span className="text-[10px] text-slate-600 font-bold">{orderToPrint.vehicleDetails?.driverName || 'راننده'}</span>
                </div>
                <div className="p-3 border border-dashed border-slate-300 rounded-lg h-24 flex flex-col justify-between">
                  <span className="font-bold text-[11px]">کنترل کیفیت و بسته‌بندی:</span>
                  <span className="text-[10px] text-emerald-700 font-bold">تایید شده</span>
                </div>
                <div className="p-3 border border-dashed border-slate-300 rounded-lg h-24 flex flex-col justify-between">
                  <span className="font-bold text-[11px]">مهر و امضای گیت حراست درب خروج:</span>
                  <span className="text-[10px] text-slate-600 font-bold">{orderToPrint.securityGateDetails?.gateOfficerName || 'افسر انتظامات'}</span>
                </div>
              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
}
