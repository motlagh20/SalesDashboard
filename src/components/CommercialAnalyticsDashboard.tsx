import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Order, Product, Agent, ShippingCompany } from '../types';
import {
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Search,
  Filter,
  BarChart3,
  PieChart as PieIcon,
  MapPin,
  Truck,
  Users,
  ShieldCheck,
  Zap,
  ArrowUpRight,
  ChevronDown,
  Calendar,
  X,
  FileText,
  Building2,
  DollarSign,
  PackageCheck,
  Activity,
  Globe,
  Timer
} from 'lucide-react';

interface CommercialAnalyticsDashboardProps {
  orders: Order[];
  products: Product[];
  agents: Agent[];
  shippingCompanies: ShippingCompany[];
  onApproveOrder?: (orderId: string) => void;
  onDispatchToFactory?: (orderId: string, comment?: string) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  askConfirm: (title: string, message: string, onConfirm: () => void) => void;
}

export default function CommercialAnalyticsDashboard({
  orders,
  products,
  agents,
  shippingCompanies,
  onApproveOrder,
  onDispatchToFactory,
  showToast,
  askConfirm
}: CommercialAnalyticsDashboardProps) {
  // Time period filter
  const [timePeriod, setTimePeriod] = useState<'ALL' | 'TODAY' | 'WEEK' | 'MONTH'>('ALL');
  // SLA status filter
  const [slaFilter, setSlaFilter] = useState<'ALL' | 'ON_SCHEDULE' | 'AT_RISK' | 'OVERDUE'>('ALL');
  // Search query
  const [searchQuery, setSearchQuery] = useState('');
  // Selected Order for detail modal
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Filter orders by time period
  const filteredByPeriodOrders = useMemo(() => {
    const now = new Date();
    return orders.filter(order => {
      const orderDate = new Date(order.createdAt);
      if (timePeriod === 'TODAY') {
        return orderDate.toDateString() === now.toDateString();
      }
      if (timePeriod === 'WEEK') {
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return orderDate >= sevenDaysAgo;
      }
      if (timePeriod === 'MONTH') {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return orderDate >= thirtyDaysAgo;
      }
      return true;
    });
  }, [orders, timePeriod]);

  // Metric 1: Received / Pending Approval Orders (سفارشات رسیده)
  const receivedPendingOrders = useMemo(() => {
    return filteredByPeriodOrders.filter(o => o.status === 'PENDING_APPROVAL');
  }, [filteredByPeriodOrders]);

  // Metric 2: Orders Sent / Dispatched to Factory (سفارشات ارسال شده به کارخانه)
  const sentToFactoryOrders = useMemo(() => {
    return filteredByPeriodOrders.filter(o => 
      o.status === 'APPROVED_BY_SALES' || 
      o.status === 'SENT_TO_SHIPPING' || 
      o.status === 'DRIVER_ASSIGNED'
    );
  }, [filteredByPeriodOrders]);

  // Metric 3: Completed / Delivered Orders (سفارشات خاتمه یافته)
  const completedOrders = useMemo(() => {
    return filteredByPeriodOrders.filter(o => o.status === 'LOADED_AND_ARCHIVED');
  }, [filteredByPeriodOrders]);

  // Metric 4: Cancelled Orders
  const cancelledOrders = useMemo(() => {
    return filteredByPeriodOrders.filter(o => o.status === 'CANCELLED');
  }, [filteredByPeriodOrders]);

  // Helper calculation for total amounts and tonnage
  const totalFinancialValue = useMemo(() => {
    return filteredByPeriodOrders
      .filter(o => o.status !== 'CANCELLED')
      .reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  }, [filteredByPeriodOrders]);

  const totalQuantityUnits = useMemo(() => {
    return filteredByPeriodOrders
      .filter(o => o.status !== 'CANCELLED')
      .reduce((sum, o) => sum + (o.quantity || 0), 0);
  }, [filteredByPeriodOrders]);

  // Estimated Completion Time & SLA Calculator per Order
  const ordersWithSLA = useMemo(() => {
    const now = new Date().getTime();

    return filteredByPeriodOrders.map(order => {
      const createdAt = new Date(order.createdAt).getTime();
      const elapsedHours = Math.max(0.1, (now - createdAt) / (1000 * 60 * 60));

      // Calculate benchmark estimated lead time (in hours) based on destination & type
      let benchmarkHours = 36; // Default standard SLA is 36 hours from submission to arrival
      
      const destination = (order.destinationCity || '').toLowerCase();
      const province = (order.destinationProvince || '').toLowerCase();
      
      if (order.isExportOrder) {
        benchmarkHours = 96; // 4 days for export
      } else if (province.includes('تهران') || province.includes('مازندران') || destination.includes('ساری') || destination.includes('آمل')) {
        benchmarkHours = 24; // Nearby central/north: 24h
      } else if (province.includes('خوزستان') || province.includes('فارس') || province.includes('سیستان') || province.includes('هرمزگان')) {
        benchmarkHours = 48; // Distant south/west: 48h
      } else if (province.includes('خراسان') || province.includes('آذربایجان') || province.includes('کردستان')) {
        benchmarkHours = 48;
      }

      // Quantity factor: > 10,000 units adds extra production & loading buffer
      if (order.quantity > 10000) {
        benchmarkHours += 12;
      }

      // Calculate estimated remaining hours based on current stage
      let estimatedRemainingHours = 0;
      let stageLabel = '';
      let stageProgressPercent = 0;

      if (order.status === 'PENDING_APPROVAL') {
        stageLabel = 'منتظر تایید بازرگانی';
        stageProgressPercent = 15;
        estimatedRemainingHours = Math.max(2, benchmarkHours - elapsedHours);
      } else if (order.status === 'APPROVED_BY_SALES') {
        stageLabel = 'تایید شده - در صف کارخانه';
        stageProgressPercent = 40;
        estimatedRemainingHours = Math.max(4, benchmarkHours - elapsedHours);
      } else if (order.status === 'SENT_TO_SHIPPING') {
        stageLabel = 'ارجاع به باربری همکار';
        stageProgressPercent = 60;
        estimatedRemainingHours = Math.max(6, benchmarkHours - elapsedHours);
      } else if (order.status === 'DRIVER_ASSIGNED') {
        stageLabel = 'تخصیص کامیون و بارنامه';
        stageProgressPercent = 80;
        estimatedRemainingHours = Math.max(4, benchmarkHours - elapsedHours);
      } else if (order.status === 'LOADED_AND_ARCHIVED') {
        stageLabel = 'بارگیری و تحویل شده';
        stageProgressPercent = 100;
        estimatedRemainingHours = 0;
      } else {
        stageLabel = 'لغو شده';
        stageProgressPercent = 0;
        estimatedRemainingHours = 0;
      }

      // Determine SLA Health Status
      let slaStatus: 'ON_SCHEDULE' | 'AT_RISK' | 'OVERDUE' = 'ON_SCHEDULE';
      if (order.status === 'LOADED_AND_ARCHIVED' || order.status === 'CANCELLED') {
        slaStatus = 'ON_SCHEDULE';
      } else if (elapsedHours > benchmarkHours) {
        slaStatus = 'OVERDUE';
      } else if (elapsedHours > benchmarkHours * 0.75) {
        slaStatus = 'AT_RISK';
      }

      return {
        ...order,
        elapsedHours: Math.round(elapsedHours * 10) / 10,
        benchmarkHours,
        estimatedRemainingHours: Math.round(estimatedRemainingHours * 10) / 10,
        stageLabel,
        stageProgressPercent,
        slaStatus
      };
    });
  }, [filteredByPeriodOrders]);

  // Filter SLA Table orders
  const filteredSLAOrders = useMemo(() => {
    return ordersWithSLA.filter(order => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !searchQuery ||
        order.customerName.toLowerCase().includes(q) ||
        order.orderNumber.toLowerCase().includes(q) ||
        (order.id && order.id.toLowerCase().includes(q)) ||
        (order.financialDocId && order.financialDocId.toLowerCase().includes(q)) ||
        (order.paymentTrackingCode && order.paymentTrackingCode.toLowerCase().includes(q)) ||
        order.destinationCity.toLowerCase().includes(q) ||
        order.agentCode.toLowerCase().includes(q) ||
        (order.buyerName && order.buyerName.toLowerCase().includes(q)) ||
        (order.productName && order.productName.toLowerCase().includes(q)) ||
        (order.vehicleDetails?.driverName && order.vehicleDetails.driverName.toLowerCase().includes(q));

      const matchesSLA = slaFilter === 'ALL' || order.slaStatus === slaFilter;

      return matchesSearch && matchesSLA;
    });
  }, [ordersWithSLA, searchQuery, slaFilter]);

  // Product Sales Distribution data for Donut Chart
  const productDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredByPeriodOrders.forEach(o => {
      if (o.status !== 'CANCELLED') {
        const pName = o.productName || 'سایر سفال‌ها';
        counts[pName] = (counts[pName] || 0) + o.quantity;
      }
    });

    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
    const sorted = Object.entries(counts)
      .map(([name, qty]) => ({
        name,
        qty,
        percent: Math.round((qty / total) * 100)
      }))
      .sort((a, b) => b.qty - a.qty);

    return sorted.slice(0, 5); // top 5
  }, [filteredByPeriodOrders]);

  // Regional/Province distribution for Location Chart
  const provinceDistribution = useMemo(() => {
    const counts: Record<string, { count: number; qty: number }> = {};
    filteredByPeriodOrders.forEach(o => {
      if (o.status !== 'CANCELLED') {
        const prov = o.destinationProvince || o.destinationCity || 'نامشخص';
        if (!counts[prov]) counts[prov] = { count: 0, qty: 0 };
        counts[prov].count += 1;
        counts[prov].qty += o.quantity;
      }
    });

    return Object.entries(counts)
      .map(([province, data]) => ({ province, ...data }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 6);
  }, [filteredByPeriodOrders]);

  // Average Processing Time Stats
  const averageMetrics = useMemo(() => {
    const active = ordersWithSLA.filter(o => o.status !== 'CANCELLED');
    if (active.length === 0) return { avgRemaining: 0, overdueCount: 0, atRiskCount: 0 };

    const overdueCount = active.filter(o => o.slaStatus === 'OVERDUE').length;
    const atRiskCount = active.filter(o => o.slaStatus === 'AT_RISK').length;
    const avgRemaining = Math.round(
      active.reduce((acc, curr) => acc + curr.estimatedRemainingHours, 0) / active.length
    );

    return { avgRemaining, overdueCount, atRiskCount };
  }, [ordersWithSLA]);

  // Export Commercial Analytics Report to Excel
  const handleExportCommercialExcel = () => {
    try {
      const exportData = ordersWithSLA.map(o => ({
        'شماره سفارش': o.orderNumber,
        'تاریخ ثبت': new Date(o.createdAt).toLocaleString('fa-IR'),
        'نمایندگی': o.customerName,
        'کد نماینده': o.agentCode,
        'خریدار نهایی': o.buyerName || '-',
        'نام محصول': o.productName,
        'تعداد / مقدار': o.quantity,
        'واحد': o.unit,
        'مبلغ کل (تومان)': o.totalAmount,
        'شهرستان مقصد': o.destinationCity,
        'استان مقصد': o.destinationProvince || '-',
        'وضعیت جاری': o.stageLabel,
        'مدت زمان سپری شده (ساعت)': o.elapsedHours,
        'زمان استاندارد SLA (ساعت)': o.benchmarkHours,
        'زمان تخمینی باقیمانده (ساعت)': o.estimatedRemainingHours,
        'وضعیت زمان‌بندی (SLA)': o.slaStatus === 'ON_SCHEDULE' ? 'طبق برنامه' : o.slaStatus === 'AT_RISK' ? 'در آستانه تاخیر' : 'تاخیردار'
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Commercial_Analytics");
      XLSX.writeFile(wb, `Sales_Commercial_Report_${new Date().toISOString().slice(0,10)}.xlsx`);
      showToast('گزارش تحلیلی مدیریت بازرگانی با موفقیت دریافت شد.', 'success');
    } catch (err) {
      showToast('خطا در صدور گزارش اکسل', 'error');
    }
  };

  return (
    <div className="animate-fade-in font-sans space-y-8 pb-12 dir-rtl text-right" id="commercial-analytics-panel">
      {/* Clean Compact Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 border border-slate-200/90 rounded-2xl p-3.5 shadow-2xs" id="commercial-header-bar">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-amber-600 shrink-0" />
          <div>
            <h2 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
              <span>گزارش جامع آماری و تحلیل مالی بازرگانی</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              پایش ارزش ریالی فروش، سهم بازار محصولات سفال، توزیع جغرافیایی و زمان‌بندی تحویل (SLA)
            </p>
          </div>
        </div>

        {/* Controls: Time Period Filter & Export Excel */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Time Period Filter Pills */}
          <div className="bg-white p-0.5 rounded-xl border border-slate-200 flex items-center gap-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => setTimePeriod('ALL')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                timePeriod === 'ALL' ? 'bg-slate-800 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              کل دوره
            </button>
            <button
              type="button"
              onClick={() => setTimePeriod('MONTH')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                timePeriod === 'MONTH' ? 'bg-slate-800 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ۳۰ روز
            </button>
            <button
              type="button"
              onClick={() => setTimePeriod('WEEK')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                timePeriod === 'WEEK' ? 'bg-slate-800 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ۷ روز
            </button>
            <button
              type="button"
              onClick={() => setTimePeriod('TODAY')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                timePeriod === 'TODAY' ? 'bg-slate-800 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              امروز
            </button>
          </div>

          {/* Export Excel Button */}
          <button
            type="button"
            onClick={handleExportCommercialExcel}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-100" />
            <span>خروجی اکسل</span>
          </button>
        </div>
      </div>

      {/* Primary Analytics KPI Summary: Financial & Operational Value (Non-repetitive) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3" id="commercial-kpi-cards">
        
        {/* KPI 1: Financial Sales Volume */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10.5px] font-bold text-purple-700 block mb-1">
              ارزش کل فروش بازرگانی
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-black font-mono text-slate-900">
                {(totalFinancialValue / 1000000).toLocaleString(undefined, { maximumFractionDigits: 1 })}
              </span>
              <span className="text-[10px] font-bold text-slate-500">میلیون تومان</span>
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              فاکتورهای تایید شده و فعال
            </span>
          </div>
          <div className="p-2.5 bg-purple-50 text-purple-700 rounded-xl border border-purple-100">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        {/* KPI 2: Total Quantity / Volume */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10.5px] font-bold text-amber-700 block mb-1">
              حجم کل عرضه و تقاضا
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-black font-mono text-slate-900">
                {totalQuantityUnits.toLocaleString()}
              </span>
              <span className="text-[10px] font-bold text-slate-500">قالب / تن</span>
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              مجموع سفال سقف و آجر
            </span>
          </div>
          <div className="p-2.5 bg-amber-50 text-amber-700 rounded-xl border border-amber-100">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        {/* KPI 3: Average Fulfillment Duration */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10.5px] font-bold text-blue-700 block mb-1">
              میانگین زمان تحویل (SLA)
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-black font-mono text-slate-900">
                ~{averageMetrics.avgRemaining || 28}
              </span>
              <span className="text-[10px] font-bold text-slate-500">ساعت</span>
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              از ثبت تا تخلیه در مقصد
            </span>
          </div>
          <div className="p-2.5 bg-blue-50 text-blue-700 rounded-xl border border-blue-100">
            <Timer className="w-5 h-5" />
          </div>
        </div>

        {/* KPI 4: On-time Delivery Rate */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10.5px] font-bold text-emerald-700 block mb-1">
              نرخ تحویل به موقع
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-black font-mono text-slate-900">
                {filteredByPeriodOrders.length > 0
                  ? Math.max(0, Math.round(((filteredByPeriodOrders.length - averageMetrics.overdueCount) / filteredByPeriodOrders.length) * 100))
                  : 100}%
              </span>
              <span className="text-[10px] font-bold text-emerald-600">طبق برنامه</span>
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              {averageMetrics.overdueCount > 0 ? `${averageMetrics.overdueCount} سفارش تاخیردار` : 'بدون تاخیر بحرانی'}
            </span>
          </div>
          <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

      </div>

      {/* Visual Analytics Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="commercial-charts-section">
        {/* Chart 1: Order Funnel / Pipeline Stage Bar Meter */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
            <div>
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-amber-600" />
                <span>نمودار قیف و جریان سفارشات بازرگانی (Order Pipeline Funnel)</span>
              </h3>
              <p className="text-slate-400 text-xs mt-1">توزیع سفارشات و وزن محموله‌ها در مراحل ۵‌گانه خط بازرگانی و کارخانه</p>
            </div>
            <span className="text-xs font-bold text-slate-500 font-mono bg-slate-100 px-3 py-1 rounded-lg">
              مجموع: {filteredByPeriodOrders.length} سفارش
            </span>
          </div>

          <div className="space-y-4 pt-1">
            {/* Funnel Stage 1: Received / Pending Approval */}
            <div>
              <div className="flex justify-between text-xs font-bold mb-1.5">
                <span className="text-amber-800 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                  ۱. سفارشات رسیده (منتظر تایید بازرگانی)
                </span>
                <span className="text-slate-700 font-mono">
                  {receivedPendingOrders.length} سفارش ({receivedPendingOrders.reduce((s, o) => s + o.quantity, 0).toLocaleString()} قالب)
                </span>
              </div>
              <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200/60">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 to-amber-600 rounded-full transition-all duration-700"
                  style={{
                    width: `${filteredByPeriodOrders.length > 0 ? Math.max(8, (receivedPendingOrders.length / filteredByPeriodOrders.length) * 100) : 0}%`
                  }}
                ></div>
              </div>
            </div>

            {/* Funnel Stage 2: Approved / Dispatched to Factory Queue */}
            <div>
              <div className="flex justify-between text-xs font-bold mb-1.5">
                <span className="text-indigo-800 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-600"></span>
                  ۲. تایید شده بازرگانی (در صف واحد فروش کارخانه)
                </span>
                <span className="text-slate-700 font-mono">
                  {filteredByPeriodOrders.filter(o => o.status === 'APPROVED_BY_SALES').length} سفارش
                </span>
              </div>
              <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200/60">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-indigo-700 rounded-full transition-all duration-700"
                  style={{
                    width: `${filteredByPeriodOrders.length > 0 ? Math.max(8, (filteredByPeriodOrders.filter(o => o.status === 'APPROVED_BY_SALES').length / filteredByPeriodOrders.length) * 100) : 0}%`
                  }}
                ></div>
              </div>
            </div>

            {/* Funnel Stage 3: Referred to Shipping Companies */}
            <div>
              <div className="flex justify-between text-xs font-bold mb-1.5">
                <span className="text-blue-800 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                  ۳. ارجاع شده به شرکت‌های حمل و نقل همکار
                </span>
                <span className="text-slate-700 font-mono">
                  {filteredByPeriodOrders.filter(o => o.status === 'SENT_TO_SHIPPING').length} سفارش
                </span>
              </div>
              <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200/60">
                <div
                  className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all duration-700"
                  style={{
                    width: `${filteredByPeriodOrders.length > 0 ? Math.max(8, (filteredByPeriodOrders.filter(o => o.status === 'SENT_TO_SHIPPING').length / filteredByPeriodOrders.length) * 100) : 0}%`
                  }}
                ></div>
              </div>
            </div>

            {/* Funnel Stage 4: Driver & Truck Assigned */}
            <div>
              <div className="flex justify-between text-xs font-bold mb-1.5">
                <span className="text-cyan-800 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-500"></span>
                  ۴. تخصیص خودرو، پلاک راننده و صادرکننده بارنامه
                </span>
                <span className="text-slate-700 font-mono">
                  {filteredByPeriodOrders.filter(o => o.status === 'DRIVER_ASSIGNED').length} سفارش
                </span>
              </div>
              <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200/60">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 to-cyan-600 rounded-full transition-all duration-700"
                  style={{
                    width: `${filteredByPeriodOrders.length > 0 ? Math.max(8, (filteredByPeriodOrders.filter(o => o.status === 'DRIVER_ASSIGNED').length / filteredByPeriodOrders.length) * 100) : 0}%`
                  }}
                ></div>
              </div>
            </div>

            {/* Funnel Stage 5: Completed & Delivered */}
            <div>
              <div className="flex justify-between text-xs font-bold mb-1.5">
                <span className="text-emerald-800 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  ۵. بارگیری کامل، ارسال و تحویل به مشتری (خاتمه یافته)
                </span>
                <span className="text-slate-700 font-mono">
                  {completedOrders.length} سفارش ({completedOrders.reduce((s, o) => s + o.quantity, 0).toLocaleString()} قالب)
                </span>
              </div>
              <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200/60">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-emerald-700 rounded-full transition-all duration-700"
                  style={{
                    width: `${filteredByPeriodOrders.length > 0 ? Math.max(8, (completedOrders.length / filteredByPeriodOrders.length) * 100) : 0}%`
                  }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {/* Chart 2: Top Selling Products Donut Breakdown */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
              <PieIcon className="w-5 h-5 text-indigo-600" />
              <span>پرفروش‌ترین سفال‌ها و محصولات</span>
            </h3>
            <p className="text-slate-400 text-xs mt-1">سهم بازار سفال سقف و آجر براساس تعداد سفارشات</p>
          </div>

          {/* Donut Legend */}
          <div className="space-y-3 pt-2">
            {productDistribution.map((prod, idx) => {
              const colors = ['bg-amber-500', 'bg-indigo-600', 'bg-blue-500', 'bg-emerald-500', 'bg-purple-500'];
              const textColors = ['text-amber-700', 'text-indigo-700', 'text-blue-700', 'text-emerald-700', 'text-purple-700'];
              
              return (
                <div key={prod.name} className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-100 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-bold flex items-center gap-2 ${textColors[idx % colors.length]}`}>
                      <span className={`w-2.5 h-2.5 rounded-full ${colors[idx % colors.length]}`}></span>
                      {prod.name}
                    </span>
                    <span className="font-mono font-bold text-slate-800">{prod.percent}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${colors[idx % colors.length]} rounded-full`}
                      style={{ width: `${prod.percent}%` }}
                    ></div>
                  </div>
                  <span className="text-[10.5px] text-slate-400 block text-left font-mono">
                    {prod.qty.toLocaleString()} قالب
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Regional & SLA Alerts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="commercial-regional-sla">
        {/* Box 1: Regional Geographical Distribution */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
              <MapPin className="w-5 h-5 text-rose-600" />
              <span>توزیع جغرافیایی و مقاصد اصلی ارسال بار</span>
            </h3>
            <span className="text-xs font-bold text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200">
              برترین استان‌ها
            </span>
          </div>

          <div className="space-y-3">
            {provinceDistribution.map((item, idx) => (
              <div key={item.province} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-lg bg-rose-100 text-rose-800 text-xs font-bold flex items-center justify-center">
                    {idx + 1}
                  </span>
                  <div>
                    <span className="font-bold text-xs text-slate-800 block">{item.province}</span>
                    <span className="text-[11px] text-slate-500">{item.count} سفارش صادرشده</span>
                  </div>
                </div>
                <div className="text-left">
                  <span className="font-mono font-bold text-xs text-slate-800 block">{item.qty.toLocaleString()} قالب</span>
                  <span className="text-[10px] text-slate-400 font-sans">تخمین بارگیری کامل</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Box 2: Smart Commercial Bottlenecks & SLA Alerts */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <span>هوشمندسازی هشدارهای گلوگاه و تاخیر سفارشات</span>
            </h3>
            <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
              نیاز به توجه بازرگانی
            </span>
          </div>

          <div className="space-y-3">
            {/* Alert 1: Overdue orders */}
            <div className="p-3.5 bg-rose-50/90 rounded-xl border border-rose-200/80 flex items-start gap-3">
              <div className="p-2 bg-rose-100 text-rose-700 rounded-lg shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <strong className="text-xs text-rose-900 font-extrabold">سفارشات دارای تاخیر زمانی (خارج از SLA)</strong>
                  <span className="px-2 py-0.5 bg-rose-600 text-white font-mono font-bold text-xs rounded-full">
                    {averageMetrics.overdueCount} سفارش
                  </span>
                </div>
                <p className="text-[11px] text-rose-700 mt-1 leading-relaxed">
                  سفارشاتی که زمان سپری شده آن‌ها از حد مجاز ۳۶ یا ۴۸ ساعت گذشته است و نیازمند پیگیری با واحد باربری یا تولید کارخانه هستند.
                </p>
              </div>
            </div>

            {/* Alert 2: At risk orders */}
            <div className="p-3.5 bg-amber-50/90 rounded-xl border border-amber-200/80 flex items-start gap-3">
              <div className="p-2 bg-amber-100 text-amber-700 rounded-lg shrink-0">
                <Zap className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <strong className="text-xs text-amber-900 font-extrabold">سفارشات در آستانه تاخیر (هشدار زرد)</strong>
                  <span className="px-2 py-0.5 bg-amber-500 text-slate-950 font-mono font-bold text-xs rounded-full">
                    {averageMetrics.atRiskCount} سفارش
                  </span>
                </div>
                <p className="text-[11px] text-amber-800 mt-1 leading-relaxed">
                  بیش از ۷۵٪ زمان مجاز این سفارشات سپری شده است. پیشنهاد می‌شود وضعیت بارگیری آنها بررسی گردد.
                </p>
              </div>
            </div>

            {/* Alert 3: On Schedule Fulfillment Summary */}
            <div className="p-3.5 bg-emerald-50/90 rounded-xl border border-emerald-200/80 flex items-start gap-3">
              <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <strong className="text-xs text-emerald-900 font-extrabold">سفارشات در وضعیت مطلوب و نرمال</strong>
                  <span className="px-2 py-0.5 bg-emerald-600 text-white font-mono font-bold text-xs rounded-full">
                    {Math.max(0, ordersWithSLA.filter(o => o.status !== 'CANCELLED').length - averageMetrics.overdueCount - averageMetrics.atRiskCount)} سفارش
                  </span>
                </div>
                <p className="text-[11px] text-emerald-800 mt-1 leading-relaxed">
                  تولید، بارگیری و ترخیص این سفارشات مطابق استاندارد پیش‌بینی شده در حال انجام بوده و تاخیری در تحویل گزارش نشده است.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main SLA & Estimated Completion Time Table per Order */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden" id="order-sla-table-section">
        <div className="p-5 md:p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Timer className="w-5 h-5 text-amber-600" />
              <span>جدول پایش زمان تخمینی و SLA تحویل تمامی سفارشات بازرگانی</span>
            </h3>
            <p className="text-slate-500 text-xs mt-1">
              محاسبه هوشمند مدت زمان تخمینی تا تحویل کامل به خریدار بر اساس نوع سفال، مسافت شهر مقصد و وضعیت جاری در خط تولید
            </p>
          </div>

          {/* Table Filters & Search */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="جستجوی کد، نام نماینده یا مقصد..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pr-9 pl-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* SLA Filter Selector */}
            <select
              value={slaFilter}
              onChange={(e) => setSlaFilter(e.target.value as any)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-amber-500 focus:outline-none"
            >
              <option value="ALL">همه وضعیت‌های زمان‌بندی</option>
              <option value="ON_SCHEDULE">🟢 طبق برنامه (عادی)</option>
              <option value="AT_RISK">🟡 در آستانه تاخیر (هشدار)</option>
              <option value="OVERDUE">🔴 تاخیردار (اقدام فوری)</option>
            </select>
          </div>
        </div>

        {/* SLA Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-100/90 text-slate-700 font-extrabold border-b border-slate-200">
                <th className="p-3.5 pr-5">شماره سفارش</th>
                <th className="p-3.5">نمایندگی / خریدار</th>
                <th className="p-3.5">محصول و مقدار</th>
                <th className="p-3.5">مقصد ارسال</th>
                <th className="p-3.5">مرحله جاری</th>
                <th className="p-3.5">زمان سپری شده</th>
                <th className="p-3.5">زمان تخمینی باقیمانده</th>
                <th className="p-3.5 pl-5 text-center">وضعیت SLA</th>
                <th className="p-3.5 text-center">عملیات بازرگانی</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-sans">
              {filteredSLAOrders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400">
                    <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <span>هیچ سفارشی با فیلترهای انتخابی یافت نشد.</span>
                  </td>
                </tr>
              ) : (
                filteredSLAOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3.5 pr-5 font-mono font-bold text-slate-900">
                      {order.orderNumber}
                      <span className="block text-[10px] text-slate-400 font-sans">
                        {new Date(order.createdAt).toLocaleDateString('fa-IR')}
                      </span>
                    </td>

                    <td className="p-3.5">
                      <div className="font-bold text-slate-800">{order.customerName}</div>
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                        کد: {order.agentCode}
                      </span>
                      {order.buyerName && (
                        <span className="text-[10px] text-emerald-700 block font-bold mt-0.5">
                          خریدار: {order.buyerName}
                        </span>
                      )}
                    </td>

                    <td className="p-3.5">
                      <div className="font-bold text-slate-800">{order.productName}</div>
                      <span className="text-slate-500 font-mono font-bold">
                        {order.quantity.toLocaleString()} {order.unit}
                      </span>
                    </td>

                    <td className="p-3.5">
                      <div className="flex items-center gap-1 font-bold text-slate-800">
                        <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                        <span>{order.destinationCity}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 block">
                        استان {order.destinationProvince || order.destinationCity}
                      </span>
                    </td>

                    <td className="p-3.5">
                      <span className={`inline-block px-2.5 py-1 rounded-lg text-[11px] font-extrabold ${
                        order.status === 'PENDING_APPROVAL' ? 'bg-amber-100 text-amber-900 border border-amber-300/80' :
                        order.status === 'APPROVED_BY_SALES' ? 'bg-indigo-100 text-indigo-900 border border-indigo-300/80' :
                        order.status === 'SENT_TO_SHIPPING' ? 'bg-blue-100 text-blue-900 border border-blue-300/80' :
                        order.status === 'DRIVER_ASSIGNED' ? 'bg-cyan-100 text-cyan-900 border border-cyan-300/80' :
                        order.status === 'LOADED_AND_ARCHIVED' ? 'bg-emerald-100 text-emerald-900 border border-emerald-300/80' :
                        'bg-rose-100 text-rose-900'
                      }`}>
                        {order.stageLabel}
                      </span>
                    </td>

                    <td className="p-3.5 font-mono text-slate-700">
                      <strong>{order.elapsedHours}</strong> <span className="text-[10px] text-slate-400">ساعت</span>
                    </td>

                    <td className="p-3.5 font-mono">
                      {order.status === 'LOADED_AND_ARCHIVED' ? (
                        <span className="text-emerald-600 font-bold">تحویل کامل شد</span>
                      ) : order.status === 'CANCELLED' ? (
                        <span className="text-slate-400">-</span>
                      ) : (
                        <div>
                          <strong className="text-slate-900 text-xs">~{order.estimatedRemainingHours}</strong>{' '}
                          <span className="text-[10px] text-slate-500">ساعت باقیمانده</span>
                          <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
                            <div className="h-full bg-amber-500 rounded-full" style={{ width: `${order.stageProgressPercent}%` }}></div>
                          </div>
                        </div>
                      )}
                    </td>

                    <td className="p-3.5 pl-5 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] font-extrabold ${
                        order.slaStatus === 'OVERDUE' ? 'bg-rose-100 text-rose-800 border border-rose-300' :
                        order.slaStatus === 'AT_RISK' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                        'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      }`}>
                        {order.slaStatus === 'OVERDUE' && <AlertTriangle className="w-3 h-3 text-rose-600" />}
                        {order.slaStatus === 'AT_RISK' && <Clock className="w-3 h-3 text-amber-600" />}
                        {order.slaStatus === 'ON_SCHEDULE' && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                        <span>
                          {order.slaStatus === 'OVERDUE' ? 'تاخیردار' : order.slaStatus === 'AT_RISK' ? 'در آستانه' : 'طبق برنامه'}
                        </span>
                      </span>
                    </td>

                    <td className="p-3.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {order.status === 'PENDING_APPROVAL' && onApproveOrder && (
                          <button
                            type="button"
                            onClick={() => onApproveOrder(order.id)}
                            className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold rounded-lg text-[11px] transition-all cursor-pointer shadow-sm"
                          >
                            تایید بازرگانی
                          </button>
                        )}

                        {order.status === 'APPROVED_BY_SALES' && onDispatchToFactory && (
                          <button
                            type="button"
                            onClick={() => onDispatchToFactory(order.id)}
                            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-lg text-[11px] transition-all cursor-pointer shadow-sm"
                          >
                            ارسال کارخانه
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setSelectedOrder(order)}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold transition-all cursor-pointer"
                        >
                          مشاهده کامل
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-xl w-full shadow-2xl border border-slate-200 space-y-5 animate-scale-up dir-rtl text-right">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-100 text-amber-800 rounded-2xl">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-lg text-slate-900">شناسنامه و زمان‌بندی سفارش</h3>
                  <span className="text-xs text-slate-500 font-mono">شماره فاکتور: {selectedOrder.orderNumber}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div>
                <span className="text-slate-400 block mb-1">نام نمایندگی:</span>
                <strong className="text-slate-800 font-bold">{selectedOrder.customerName}</strong>
              </div>
              <div>
                <span className="text-slate-400 block mb-1">خریدار نهایی:</span>
                <strong className="text-slate-800 font-bold">{selectedOrder.buyerName || 'خود نماینده'}</strong>
              </div>
              <div>
                <span className="text-slate-400 block mb-1">محصول و تعداد:</span>
                <strong className="text-slate-800 font-bold">{selectedOrder.productName} ({selectedOrder.quantity.toLocaleString()} {selectedOrder.unit})</strong>
              </div>
              <div>
                <span className="text-slate-400 block mb-1">مبلغ کل فاکتور:</span>
                <strong className="text-emerald-700 font-bold font-mono">{(selectedOrder.totalAmount || 0).toLocaleString()} تومان</strong>
              </div>
              <div>
                <span className="text-slate-400 block mb-1">شهرستان مقصد:</span>
                <strong className="text-slate-800 font-bold">{selectedOrder.destinationCity} (استان {selectedOrder.destinationProvince || '-'})</strong>
              </div>
              <div>
                <span className="text-slate-400 block mb-1">زمان ثبت:</span>
                <strong className="text-slate-700 font-mono">{new Date(selectedOrder.createdAt).toLocaleString('fa-IR')}</strong>
              </div>
            </div>

            <div className="p-4 bg-amber-50/80 rounded-2xl border border-amber-200/80 space-y-2">
              <strong className="text-xs text-amber-900 font-extrabold block">وضعیت ناوگان و راننده:</strong>
              <div className="grid grid-cols-2 gap-2 text-xs text-amber-950">
                <div>شرکت باربری: <strong className="font-bold">{selectedOrder.assignedShippingCompany || 'هنوز تخصیص نیافته'}</strong></div>
                <div>نام راننده: <strong className="font-bold">{selectedOrder.driverName || 'در انتظار اعلام باربری'}</strong></div>
                <div>پلاک خودرو: <strong className="font-bold font-mono">{selectedOrder.truckPlate || '-'}</strong></div>
                <div>شماره بارنامه: <strong className="font-bold font-mono">{selectedOrder.waybillNumber || '-'}</strong></div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="px-5 py-2.5 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-slate-700 transition-all cursor-pointer"
              >
                بستن پنجره
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
