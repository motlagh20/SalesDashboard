/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Order, VehicleDetails, ShippingCompany, Product, AppUser, PermanentDriver } from '../types';
import { parseAndHydrateItemsJson } from '../utils/itemsJsonHelper';
import { SendLocationModal } from './SendLocationModal';
import { 
  Truck, 
  MapPin, 
  Phone, 
  User, 
  Calendar,
  Layers,
  Search,
  CheckCircle,
  FileText,
  Clock,
  ArrowLeftRight,
  ShieldCheck,
  Building,
  UserCheck,
  Undo2,
  AlertCircle,
  Send,
  X,
  Sparkles
} from 'lucide-react';

interface ShippingCompanyDashboardProps {
  orders: Order[];
  shippingCompanies: ShippingCompany[];
  products: Product[];
  permanentDrivers?: PermanentDriver[];
  onAssignVehicle: (orderId: string, vehicle: VehicleDetails) => void;
  onUpdateVehicle?: (orderId: string, vehicle: VehicleDetails) => Promise<boolean>;
  onReturnOrderToSales?: (orderId: string, reason: string) => void;
  onSaveLocation?: (orderId: string, deliveryLocationUrl: string) => Promise<void>;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  askConfirm: (title: string, message: string, onConfirm: () => void) => void;
  currentUser?: AppUser | null;
  onOpenEditProfile?: (targetAgentId?: string, targetShippingId?: string) => void;
  sandboxEnabled?: boolean;
}

// Preset frequent drivers for quick instant filling (to save high-value company time)
const FREQUENT_DRIVERS = [
  {
    driverName: 'جواد علوی',
    driverPhone: '09112523456',
    licensePlate: '۶۲ ع ۴۸۱ ایران ۷۲',
    vehicleType: 'تریلی ۱۸ چرخ لبه‌دار',
    label: 'جواد علوی (تریلی لبه‌دار - مازندران)'
  },
  {
    driverName: 'مرتضی نوربخش',
    driverPhone: '09123514785',
    licensePlate: '۲۴ ب ۶۷۲ ایران ۹۶',
    vehicleType: 'کامیون جفت ۱۰ تن',
    label: 'مرتضی نوربخش (جفت ۱۰ تن - تهران)'
  },
  {
    driverName: 'کاظم زارعی',
    driverPhone: '09176523120',
    licensePlate: '۸۱ ج ۳۹۵ ایران ۶۲',
    vehicleType: 'کامیون تک ۶ تن',
    label: 'کاظم زارعی (تک ۶ تن - اصفهان)'
  }
];

export default function ShippingCompanyDashboard({
  orders,
  shippingCompanies = [],
  products = [],
  permanentDrivers = [],
  onAssignVehicle,
  onUpdateVehicle,
  onReturnOrderToSales,
  onSaveLocation,
  showToast,
  askConfirm,
  currentUser,
  onOpenEditProfile,
  sandboxEnabled = true,
}: ShippingCompanyDashboardProps) {
  // Select which shipping company is simulating/viewing
  const activeCompanies = shippingCompanies.filter(sc => sc.isEnabled);
  const getInitialCompanyId = () => {
    if (currentUser?.role === 'SHIPPING_COMPANY' && currentUser.shippingCompanyId) {
      return currentUser.shippingCompanyId;
    }
    return activeCompanies.length > 0 ? activeCompanies[0].id : 'sc-1';
  };

  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(getInitialCompanyId());

  // Force company ID to match user profile when logged in
  React.useEffect(() => {
    if (currentUser?.role === 'SHIPPING_COMPANY' && currentUser.shippingCompanyId) {
      setSelectedCompanyId(currentUser.shippingCompanyId);
    }
  }, [currentUser]);

  const [activeTab, setActiveTab] = useState<'NEW_REQUESTS' | 'COMPLETED'>('NEW_REQUESTS');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLocationOrder, setSelectedLocationOrder] = useState<Order | null>(null);

  // Selected company object
  const currentCompany = shippingCompanies.find(sc => sc.id === selectedCompanyId) || shippingCompanies[0];

  // Specific assignment form states per order
  const [assigningOrderId, setAssigningOrderId] = useState<string | null>(null);
  const [isEditingExistingVehicle, setIsEditingExistingVehicle] = useState<boolean>(false);
  const [vehicleType, setVehicleType] = useState('تریلی ۱۸ چرخ لبه‌دار');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [billOfLadingNumber, setBillOfLadingNumber] = useState('');
  const [estimatedArrival, setEstimatedArrival] = useState(new Date().toLocaleDateString('fa-IR'));

  // Return order (استرداد سفارش) form states
  const [returningOrderId, setReturningOrderId] = useState<string | null>(null);
  const [returnReasonSelect, setReturnReasonSelect] = useState('عدم امکان تامین کامیون / وسیله نقلیه در زمان مقرر');
  const [returnNote, setReturnNote] = useState('');

  const handleOpenEditVehicle = (order: Order) => {
    setAssigningOrderId(order.id);
    setIsEditingExistingVehicle(true);
    setVehicleType(order.vehicleDetails?.vehicleType || 'تریلی ۱۸ چرخ لبه‌دار');
    setDriverName(order.vehicleDetails?.driverName || '');
    setDriverPhone(order.vehicleDetails?.driverPhone || '');
    setLicensePlate(order.vehicleDetails?.licensePlate || '');
    setBillOfLadingNumber(order.vehicleDetails?.billOfLadingNumber || '');
    setEstimatedArrival(order.vehicleDetails?.estimatedArrival || new Date().toLocaleDateString('fa-IR'));
  };

  const handleAssignSubmit = async (e: React.FormEvent, orderId: string) => {
    e.preventDefault();
    if (!driverName.trim()) {
      showToast('لطفا نام راننده را وارد کنید.', 'error');
      return;
    }
    if (!driverPhone.trim()) {
      showToast('لطفا شماره همراه راننده را وارد کنید.', 'error');
      return;
    }
    if (!licensePlate.trim()) {
      showToast('لطفا شماره پلاک خودرو را وارد کنید.', 'error');
      return;
    }
    if (!billOfLadingNumber.trim()) {
      showToast('لطفا شماره بارنامه صادره از سیستم حمل خود را وارد کنید.', 'error');
      return;
    }

    const vehicleObj: VehicleDetails = {
      vehicleType,
      driverName: driverName.trim(),
      driverPhone: driverPhone.trim(),
      licensePlate: licensePlate.trim(),
      shippingAgency: currentCompany?.name || 'باربری همکار کارخانه',
      estimatedArrival: estimatedArrival || new Date().toLocaleDateString('fa-IR'),
      billOfLadingNumber: billOfLadingNumber.trim()
    };

    if (isEditingExistingVehicle) {
      if (onUpdateVehicle) {
        const success = await onUpdateVehicle(orderId, vehicleObj);
        if (success) {
          showToast(`✏️ مشخصات ناوگان و راننده برای سفارش با موفقیت اصلاح گردید.`, 'success');
          setAssigningOrderId(null);
          setIsEditingExistingVehicle(false);
        }
      } else {
        try {
          const res = await fetch(`/api/orders/${orderId}/update-vehicle`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(vehicleObj)
          });
          if (res.ok) {
            showToast(`✏️ مشخصات ناوگان و راننده برای سفارش با موفقیت اصلاح گردید.`, 'success');
            setAssigningOrderId(null);
            setIsEditingExistingVehicle(false);
          } else {
            showToast('خطا در اصلاح مشخصات ناوگان', 'error');
          }
        } catch {
          showToast('خطای شبکه در ارتباط با سرور', 'error');
        }
      }
    } else {
      onAssignVehicle(orderId, vehicleObj);
      setAssigningOrderId(null);
      setIsEditingExistingVehicle(false);
    }
  };

  const handleReturnSubmit = (orderId: string) => {
    if (!onReturnOrderToSales) {
      showToast('عملیات استرداد فعال نیست.', 'error');
      return;
    }
    const finalReason = returnNote.trim() 
      ? `${returnReasonSelect} - توضیحات: ${returnNote.trim()}`
      : returnReasonSelect;

    askConfirm(
      'تایید استرداد سفارش به مدیر فروش',
      `آیا اطمینان دارید که مایلید این سفارش را با علت «${returnReasonSelect}» استرداد کرده و به مدیر فروش بازگردانید؟`,
      () => {
        onReturnOrderToSales(orderId, finalReason);
        setReturningOrderId(null);
        setReturnNote('');
      }
    );
  };

  // Handle quick fill
  const handleQuickFill = (driver: typeof FREQUENT_DRIVERS[0]) => {
    setDriverName(driver.driverName);
    setDriverPhone(driver.driverPhone);
    setLicensePlate(driver.licensePlate);
    setVehicleType(driver.vehicleType);
    showToast(`مشخصات راننده «${driver.driverName}» با موفقیت در فرم درج شد.`, 'info');
  };

  // Filters orders
  const filteredOrders = orders.filter((order) => {
    // Must belong to this shipping company (either by exact ID match or by exact agency name match as fallback)
    const isCompanyMatch = 
      order.shippingCompanyId === selectedCompanyId ||
      (!order.shippingCompanyId && currentCompany && order.vehicleDetails?.shippingAgency === currentCompany.name) ||
      (!order.shippingCompanyId && currentCompany && order.status === 'SENT_TO_FACTORY' && order.vehicleDetails?.shippingAgency === currentCompany.name);

    if (!isCompanyMatch) return false;

    if (activeTab === 'NEW_REQUESTS' && order.status !== 'SENT_TO_FACTORY') return false;
    if (activeTab === 'COMPLETED' && order.status !== 'VEHICLE_ASSIGNED' && order.status !== 'LOADED_AND_DISPATCHED') return false;

    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      const orderNum = (order.orderNumber || '').toLowerCase();
      const orderId = (order.id || '').toLowerCase();
      const customer = (order.customerName || '').toLowerCase();
      const buyer = (order.buyerName || '').toLowerCase();
      const product = (order.productName || '').toLowerCase();
      const city = (order.destinationCity || '').toLowerCase();
      const financialDoc = (order.financialDocId || '').toLowerCase();
      const paymentTrack = (order.paymentTrackingCode || '').toLowerCase();
      const driver = (order.vehicleDetails?.driverName || '').toLowerCase();
      const driverPhone = (order.vehicleDetails?.driverPhone || '').toLowerCase();
      const licensePlate = (order.vehicleDetails?.licensePlate || '').toLowerCase();
      const shippingAgency = (order.vehicleDetails?.shippingAgency || '').toLowerCase();
      const billNo = (order.vehicleDetails?.billOfLadingNumber || '').toLowerCase();

      return (
        orderNum.includes(q) ||
        orderId.includes(q) ||
        customer.includes(q) ||
        buyer.includes(q) ||
        product.includes(q) ||
        city.includes(q) ||
        financialDoc.includes(q) ||
        paymentTrack.includes(q) ||
        driver.includes(q) ||
        driverPhone.includes(q) ||
        licensePlate.includes(q) ||
        shippingAgency.includes(q) ||
        billNo.includes(q)
      );
    }

    return true;
  });

  // Sort by newest order
  const sortedOrders = [...filteredOrders].sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className="space-y-6 text-right dir-rtl font-sans" id="shipping-company-dashboard">
      
      {/* Simulation Selector Bar */}
      {currentUser?.role === 'SALES_MANAGER' ? (
        <div className="bg-gradient-to-r from-blue-900 to-indigo-950 text-white rounded-2xl p-5 shadow-md border border-indigo-800 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fade-in">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold flex items-center gap-2 justify-end">
              <span>درگاه اختصاصی و پنل تعاملی شرکت‌های حمل و نقل همکار</span>
              <Building className="w-5 h-5 text-emerald-400" />
            </h2>
            <p className="text-xs text-indigo-200 mt-1">
              جهت تست فرآیند، ابتدا شرکت باربری مورد نظر را انتخاب و درخواست‌های ارجاع داده شده کارخانه را مشاهده فرمایید.
            </p>
          </div>

          {sandboxEnabled && (
            <div className="flex items-center gap-2.5 bg-indigo-900/50 p-2 rounded-xl border border-indigo-700/60 self-start md:self-auto">
              <span className="text-xs text-indigo-200 font-bold shrink-0">ورود شبیه‌سازی باعنوان:</span>
              <select
                value={selectedCompanyId}
                onChange={(e) => {
                  setSelectedCompanyId(e.target.value);
                  setAssigningOrderId(null);
                }}
                className="bg-slate-900 text-white border border-indigo-500 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-emerald-400 font-bold focus:outline-none cursor-pointer"
                id="shipping-company-login-select"
              >
                {shippingCompanies.map((sc) => (
                  <option key={sc.id} value={sc.id}>
                    {sc.name} {sc.isEnabled ? '' : '(غیرفعال)'}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-gradient-to-r from-slate-900 to-slate-950 text-white rounded-2xl p-5 shadow-md border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4" id="shipping-company-locked-header">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold flex items-center gap-2 justify-end">
              <span>درگاه اختصاصی حمل و نقل همکار: {currentCompany?.name}</span>
              <Building className="w-5 h-5 text-emerald-400" />
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              اتصال امن • پنل اختصاصی ثبت مشخصات راننده، خودرو و صدور فوری برگ ترخیص بارهای سفال طبرستان
            </p>
          </div>
          <span className="text-[10px] bg-emerald-500/15 text-emerald-400 py-1 px-3 border border-emerald-500/20 rounded-full font-bold">🔐 اتصال امن فعال شد</span>
        </div>
      )}

      {/* Main Stats and Interface Container */}
      <div className="bg-white rounded-2xl border border-slate-205 shadow-sm p-6" id="shipping-main-card">
        
        {/* Profile Card Summary */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-rose-100 pb-5 mb-5 gap-3">
          <div className="text-right">
            <div className="flex items-center gap-3 justify-end">
              {onOpenEditProfile && (
                <button
                  type="button"
                  onClick={() => onOpenEditProfile(undefined, currentCompany?.id)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500 px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-sm hover:scale-102"
                  title="ویرایش شماره همراه و آدرس شرکت باربری"
                >
                  <User className="w-4 h-4 text-emerald-100" />
                  <span>✏️ ویرایش آدرس و همراه</span>
                </button>
              )}
              <h3 className="text-base font-bold text-slate-800">
                {currentCompany ? currentCompany.name : 'نام مشخص نشده'}
              </h3>
            </div>
            <div className="text-[11px] text-slate-500 mt-1 flex flex-wrap items-center justify-end gap-3">
              <span>👤 مدیر باربری: <strong className="text-slate-700">{currentCompany?.managerName || 'نامشخص'}</strong></span>
              <span>📞 تلفن تماس: <strong className="font-mono text-slate-700 dir-ltr inline-block">{currentCompany?.phoneNumber || currentUser?.phoneNumber || 'نامشخص'}</strong></span>
              {currentCompany?.nationalId && <span>🆔 شناسه ملی: <strong className="font-mono text-slate-700">{currentCompany.nationalId}</strong></span>}
              {currentCompany?.economicCode && <span>🏢 کد اقتصادی: <strong className="font-mono text-slate-700">{currentCompany.economicCode}</strong></span>}
              <span>📍 آدرس پایانه/دفتر: <span className="text-slate-700">{currentCompany?.address || 'نامشخص'}</span></span>
            </div>
          </div>
          
          {/* Quick Stats Indicator */}
          <div className="flex items-center gap-2" id="shipping-quick-stats">
            <div className="bg-amber-50 text-amber-800 border border-amber-100 px-3 py-1.5 rounded-xl text-center">
              <p className="text-[10px] text-slate-400">درخواست‌های فعال</p>
              <p className="text-xs font-black">{orders.filter(o => o.status === 'SENT_TO_FACTORY' && (o.shippingCompanyId === selectedCompanyId || (!o.shippingCompanyId && o.vehicleDetails?.shippingAgency === currentCompany?.name))).length} مورد</p>
            </div>
            <div className="bg-emerald-50 text-emerald-800 border border-emerald-100 px-3 py-1.5 rounded-xl text-center">
              <p className="text-[10px] text-slate-400">تخصیص‌های نهایی</p>
              <p className="text-xs font-black">{orders.filter(o => (o.status === 'VEHICLE_ASSIGNED' || o.status === 'LOADED_AND_DISPATCHED') && (o.shippingCompanyId === selectedCompanyId || o.vehicleDetails?.shippingAgency === currentCompany?.name)).length} خودرو</p>
            </div>
          </div>
        </div>

        {/* Tab Switcher & Search Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex gap-2 bg-slate-100 p-1.5 rounded-xl self-start" id="shipping-tabs">
            <button
              onClick={() => {
                setActiveTab('NEW_REQUESTS');
                setAssigningOrderId(null);
              }}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'NEW_REQUESTS' ? 'bg-white text-indigo-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>نیازمند وسیله نقلیه ({orders.filter(o => o.status === 'SENT_TO_FACTORY' && (o.shippingCompanyId === selectedCompanyId || (!o.shippingCompanyId && o.vehicleDetails?.shippingAgency === currentCompany?.name))).length})</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('COMPLETED');
                setAssigningOrderId(null);
              }}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'COMPLETED' ? 'bg-white text-indigo-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span>کامیون‌های تامین شده / سابقه ({orders.filter(o => (o.status === 'VEHICLE_ASSIGNED' || o.status === 'LOADED_AND_DISPATCHED') && (o.shippingCompanyId === selectedCompanyId || o.vehicleDetails?.shippingAgency === currentCompany?.name)).length})</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-80">
            <input
              type="text"
              placeholder="جستجو (کد رهگیری، خریدار، محصول، راننده، بارنامه...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 rounded-xl py-2 pr-9 pl-8 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-sans"
            />
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                title="پاکسازی جستجو"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Info Note: Minimal UI effort for shipping agent */}
        <div className="bg-blue-50 border-r-4 border-blue-500 p-3.5 rounded-xl text-slate-600 text-xs flex justify-end items-start gap-2 mb-6">
          <div className="text-right">
            <p className="font-bold text-slate-800 mb-0.5">کاربر گرامی باربری؛ زمان شما باارزش است</p>
            <p className="text-slate-500 leading-normal">
              جهت به حداقل رساندن فعالیت ثبتی، نیازی به تایپ مکرر مشخصات رانندگان همیشگی ندارید. دکمه‌های «درج سریع رانندگان پرتکرار» را بفشارید تا تمام فرم فوراً پر شود و سپس فقط <strong className="text-rose-600">شماره بارنامه صادرشده از نرم افزار حمل خودتان</strong> را نوشته و بفرستید!
            </p>
          </div>
          <ArrowLeftRight className="w-4 h-4 text-blue-600 mt-1 shrink-0" />
        </div>

        {/* Display Current Orders */}
        {sortedOrders.length === 0 ? (
          <div className="text-center py-20 bg-slate-50/50 border border-dashed border-slate-200 rounded-2xl">
            <Truck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h4 className="text-xs font-bold text-slate-600">هیچ درخواست ترابری در این بخش ثبت نشده است</h4>
            <p className="text-slate-400 text-[11px] mt-1">با کارتابل مدیریت بازرگانی یا فروش کارخانه سفارشات جدید را به این باربری ارجاع دهید.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {sortedOrders.map((order) => {
              const isAssigning = assigningOrderId === order.id;

              return (
                <div 
                  key={order.id}
                  className={`border rounded-2xl transition-all overflow-hidden ${
                    isAssigning ? 'border-indigo-500 shadow-md ring-1 ring-indigo-500' : 'border-slate-200 hover:border-slate-350 bg-slate-50/20'
                  }`}
                  id={`shipping-order-${order.id}`}
                >
                  
                  {/* Order Line Header */}
                  <div className="p-4 bg-slate-50 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="bg-slate-200 text-slate-700 px-2 py-1 rounded text-[10px] font-mono font-bold">{order.orderNumber}</span>
                      <span className="text-slate-400 text-xs">|</span>
                      <span className="text-xs font-bold text-slate-800">{order.customerName}</span>
                      <span className="text-slate-400 text-xs">({order.agentCode})</span>
                      {order.isExportOrder && (
                        <span className="bg-purple-100 text-purple-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-purple-200">
                          🌍 صادراتی (پالت شرینک)
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
                      <span className="text-slate-400 text-[11px] font-mono">ثبت: {new Date(order.createdAt).toLocaleDateString('fa-IR')}</span>
                      <span className="text-slate-200">|</span>
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        order.status === 'SENT_TO_FACTORY' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                        order.status === 'VEHICLE_ASSIGNED' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' :
                        'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}>
                        {order.status === 'SENT_TO_FACTORY' && 'منتظر وسیله نقلیه'}
                        {order.status === 'VEHICLE_ASSIGNED' && 'تخصیص‌یافته / در صف بارگیری کارخانه'}
                        {order.status === 'WAREHOUSE_LOADED' && 'بارگیری شده / در گیت حراست'}
                        {order.status === 'LOADED_AND_DISPATCHED' && 'ترخیص نهایی'}
                      </span>
                    </div>
                  </div>

                  {/* Pending Edit Suspension Warning */}
                  {order.hasPendingEdit && (
                    <div className="bg-amber-500/10 border-b border-amber-500/20 p-3 px-5 text-amber-900 text-xs font-bold flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>⚠️ این سفارش توسط نماینده ویرایش شده و تا زمان تایید مجدد توسط مدیر بازرگانی غیرفعال می‌باشد.</span>
                      </div>
                      <span className="text-[10px] bg-amber-200 text-amber-900 px-2 py-0.5 rounded-md font-mono shrink-0">معلق در انتظار مدیر</span>
                    </div>
                  )}

                  {/* Recently Edited Notice Banner */}
                  {order.recentlyEditedNotice && !order.hasPendingEdit && (
                    <div className="bg-blue-50 border-b border-blue-200 p-2.5 px-5 text-blue-900 text-xs font-bold flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                      <span>⚡ {order.recentlyEditedNotice}</span>
                    </div>
                  )}

                  {/* Discrepancy Notice */}
                  {order.warehouseDiscrepancy && (
                    <div className="bg-rose-50 border-b border-rose-200 p-2.5 px-5 text-rose-900 text-xs font-bold flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>⚠️ اعلام مغایرت انبار: {order.warehouseDiscrepancy.reason} (گزارش‌دهنده: {order.warehouseDiscrepancy.reporterName})</span>
                    </div>
                  )}

                  {/* Detained Notice */}
                  {order.securityDetained && (
                    <div className="bg-red-100 border-b border-red-300 p-2.5 px-5 text-red-900 text-xs font-bold flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                      <span>🛑 توقیف در گیت حراست: {order.securityDetained.reason} (افسر: {order.securityDetained.officerName})</span>
                    </div>
                  )}

                  {/* Shipment Details inside Card Body */}
                  <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
                    
                    {/* Left Column: Details */}
                    <div className="lg:col-span-4 space-y-3 border-l border-slate-100 pl-4">
                      <div>
                        <span className="text-[11px] text-slate-400 block mb-0.5">نوع و مقدار کالا سفال</span>
                        {order.itemsJson ? (
                          <div className="space-y-1.5 mt-1 bg-indigo-50/50 p-2 rounded-lg border border-indigo-100">
                            {(() => {
                              const parsed = parseAndHydrateItemsJson(order.itemsJson, products);
                              if (parsed.length > 0) {
                                return parsed.map((item, i) => (
                                  <div key={i} className="flex justify-between items-center text-[10.5px] text-slate-800">
                                    <strong className="text-right text-indigo-950">{item.productName}</strong>
                                    <span className="font-mono text-indigo-700 bg-white px-1.5 py-0.5 rounded border border-indigo-100/50 font-bold">{item.quantity.toLocaleString('fa-IR')} {item.unit || order.unit}</span>
                                  </div>
                                ));
                              }
                              return <p className="text-xs text-slate-700">{order.productName}</p>;
                            })()}
                          </div>
                        ) : (
                          <p className="text-xs font-extrabold text-indigo-950 flex items-center gap-1.5 justify-end">
                            <span>{order.productName}</span>
                            <span className="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded text-[10px] font-black">{order.quantity.toLocaleString('fa-IR')} {order.unit}</span>
                          </p>
                        )}
                      </div>

                      <div>
                        <span className="text-[11px] text-slate-400 block mb-0.5">خریدار بار (مشتری نهایی)</span>
                        <p className="text-xs text-emerald-800 flex items-center gap-1 justify-end font-extrabold bg-emerald-50 px-2 py-1 rounded">
                          <span>{order.buyerName || 'ثبت نشده'}</span>
                          <span className="text-emerald-600">👤</span>
                        </p>
                      </div>

                      <div>
                        <span className="text-[11px] text-slate-400 block mb-0.5">مقصد تخلیه بار</span>
                        <p className="text-xs text-slate-700 flex items-center gap-1 justify-end font-medium">
                          <span className="text-slate-800 font-extrabold">{order.destinationCity}</span>
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        </p>
                        <p className="text-[10px] text-slate-500 mt-1 leading-normal pr-4">{order.exactAddress}</p>
                      </div>

                      <div>
                        <span className="text-[11px] text-slate-400 block mb-0.5">شماره همراه گیرنده (خریدار)</span>
                        <p className="text-xs font-mono text-slate-700 flex items-center gap-1 justify-end">
                          <span>{order.phoneNumber}</span>
                          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        </p>
                      </div>

                      {order.notes && (
                        <div className="bg-slate-50 p-2 rounded-lg text-[10px] text-justify text-slate-500 leading-normal border border-slate-100">
                          <strong>یادداشت نمایندگی:</strong> {order.notes}
                        </div>
                      )}
                    </div>

                    {/* Right Column: Interaction or Output */}
                    <div className="lg:col-span-8 flex flex-col justify-center">
                      
                      {/* Return order form */}
                      {returningOrderId === order.id ? (
                        <div className="bg-rose-50/90 border border-rose-200 rounded-xl p-4 text-right space-y-3.5 shadow-sm animate-fade-in">
                          <div className="flex items-center justify-between border-b border-rose-200 pb-2">
                            <span className="text-xs font-black text-rose-950 flex items-center gap-1.5">
                              <Undo2 className="w-4 h-4 text-rose-600" />
                              <span>استرداد سفارش و عودت به دفتر مدیریت فروش کارخانه</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => setReturningOrderId(null)}
                              className="text-[11px] text-slate-500 hover:text-slate-800 font-bold cursor-pointer"
                            >
                              بستن فرم
                            </button>
                          </div>

                          <p className="text-[11px] text-rose-800 leading-relaxed font-medium">
                            با تایید استرداد، این درخواست حمل از پرتال باربری شما عودت داده شده و با دلیل ذکر شده مستقیماً به کارتابل سفارشات تأییدشده مدیر فروش کارخانه باز می‌گردد.
                          </p>

                          <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-slate-800 block">انتخاب علت اصلی استرداد سفارش: <span className="text-rose-600">*</span></label>
                            <select
                              value={returnReasonSelect}
                              onChange={(e) => setReturnReasonSelect(e.target.value)}
                              className="w-full bg-white border border-rose-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-rose-500 font-sans"
                            >
                              <option value="عدم امکان تامین کامیون / وسیله نقلیه در زمان مقرر">عدم امکان تامین کامیون / وسیله نقلیه در زمان مقرر</option>
                              <option value="عدم توافق راننده بر سر نرخ کرایه حمل">عدم توافق راننده بر سر نرخ کرایه حمل</option>
                              <option value="عدم تناسب ابعاد یا وزن بار با ناوگان موجود">عدم تناسب ابعاد یا وزن بار با ناوگان موجود</option>
                              <option value="انصراف یا تغییر آدرس توسط خریدار / نماینده">انصراف یا تغییر آدرس توسط خریدار / نماینده</option>
                              <option value="سایر علل (با درج توضیحات تکمیلی)">سایر علل (با درج توضیحات تکمیلی)</option>
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-800 block">توضیحات تکمیلی باربری برای مدیر فروش (اختیاری):</label>
                            <textarea
                              value={returnNote}
                              onChange={(e) => setReturnNote(e.target.value)}
                              placeholder="در صورت نیاز جزییات بیشتری جهت اطلاع مدیریت بنویسید..."
                              rows={2}
                              className="w-full bg-white border border-rose-300 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-rose-500 font-sans"
                            />
                          </div>

                          <div className="flex justify-end gap-2 pt-2 border-t border-rose-200">
                            <button
                              type="button"
                              onClick={() => setReturningOrderId(null)}
                              className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg text-xs transition-colors cursor-pointer"
                            >
                              انصراف
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReturnSubmit(order.id)}
                              className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded-lg text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
                            >
                              <Undo2 className="w-3.5 h-3.5" />
                              <span>تایید نهایی استرداد و عودت به مدیر فروش</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {/* Active assignment details (When already assigned) */}
                          {!isAssigning && order.vehicleDetails && order.status !== 'SENT_TO_FACTORY' && (
                            <div className="bg-emerald-50/20 border border-emerald-100 rounded-xl p-4 space-y-3">
                              <div className="flex items-center gap-2 border-b border-emerald-700/10 pb-2 mb-2 justify-end">
                                <span className="text-xs font-black text-emerald-800">مشخصات کامیون تامین شده</span>
                                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                              </div>

                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 text-xs text-slate-700">
                                <div>
                                  <span className="text-[10px] text-slate-400 block">نوع خودرو حمل</span>
                                  <strong className="text-slate-800 font-extrabold">{order.vehicleDetails.vehicleType}</strong>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 block">راننده</span>
                                  <span className="font-extrabold flex items-center gap-1 justify-end mt-0.5">
                                    <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    <span>{order.vehicleDetails.driverName}</span>
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 block">همراه راننده</span>
                                  <span className="font-mono mt-0.5 block font-bold">{order.vehicleDetails.driverPhone}</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 block">پلاک خودرو</span>
                                  <span className="bg-white border text-center font-bold font-mono py-0.5 px-2 rounded tracking-wider border-slate-300 block w-max ml-auto mt-0.5 select-all">{order.vehicleDetails.licensePlate}</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 block text-rose-600 font-extrabold">شماره بارنامه صادره</span>
                                  <strong className="text-red-700 font-extrabold text-[13px] font-mono bg-rose-50 border border-rose-200 px-2 py-0.5 rounded block w-max ml-auto mt-0.5 select-all">{order.vehicleDetails.billOfLadingNumber || 'درج نشده'}</strong>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 block">تاریخ بارگیری (صدور بارنامه)</span>
                                  <span className="text-slate-600 font-bold">{order.vehicleDetails.estimatedArrival || new Date().toLocaleDateString('fa-IR')}</span>
                                </div>
                              </div>

                              {/* Location Send Button and Edit Fleet Button for Driver */}
                              <div className="mt-3 border-t border-emerald-100/80 pt-2.5 flex items-center justify-between flex-wrap gap-2">
                                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                  <MapPin className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                                  <span>لوکیشن تخلیه بار: <strong>{order.deliveryLocationUrl ? 'ثبت شده روی نقشه' : 'هنوز لینکی ثبت نشده'}</strong></span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {order.status === 'VEHICLE_ASSIGNED' && !order.hasPendingEdit && (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenEditVehicle(order)}
                                      className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                                      title="ویرایش راننده، نوع خودرو، پلاک یا شماره بارنامه"
                                    >
                                      <UserCheck className="w-3.5 h-3.5" />
                                      <span>✏️ ویرایش ناوگان / تعویض راننده</span>
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setSelectedLocationOrder(order)}
                                    className="bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                                  >
                                    <Send className="w-3.5 h-3.5" />
                                    <span>📲 ارسال لوکیشن و آدرس به راننده</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Not assigned and not currently filling form */}
                          {!isAssigning && (order.status === 'SENT_TO_FACTORY' || !order.vehicleDetails || !order.vehicleDetails.driverName) && (
                            <div className="flex flex-col items-center justify-center p-6 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                              <p className="text-xs text-slate-500 font-bold mb-3">کامیونی برای این مورد ثبت نشده است</p>
                              <button
                                disabled={order.hasPendingEdit}
                                onClick={() => {
                                  setAssigningOrderId(order.id);
                                  setIsEditingExistingVehicle(false);
                                  // Prep-fill draft values to make fast
                                  setVehicleType('تریلی ۱۸ چرخ لبه‌دار');
                                  setDriverName('');
                                  setDriverPhone('');
                                  setLicensePlate('');
                                  setBillOfLadingNumber('');
                                  setEstimatedArrival(new Date().toLocaleDateString('fa-IR'));
                                }}
                                className={`text-white text-xs font-bold py-2 px-5 rounded-lg shadow-sm transition-all flex items-center gap-1.5 ${
                                  order.hasPendingEdit 
                                    ? 'bg-slate-400 cursor-not-allowed opacity-60' 
                                    : 'bg-indigo-600 hover:bg-indigo-700 cursor-pointer'
                                }`}
                              >
                                <Truck className="w-4 h-4" />
                                <span>{order.hasPendingEdit ? 'سفارش در حال ویرایش نماینده (غیرفعال)' : 'تخصیص خودرو و ثبت بارنامه جدید'}</span>
                              </button>
                            </div>
                          )}

                          {/* Dynamic form for creating / editing allocation */}
                          {isAssigning && (
                            <form onSubmit={(e) => handleAssignSubmit(e, order.id)} className="bg-slate-50 rounded-xl p-4 border border-indigo-200 space-y-4">
                              
                              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                                <span className="text-xs font-extrabold text-indigo-900 flex items-center gap-1">
                                  <UserCheck className="w-4 h-4 text-indigo-600" />
                                  <span>{isEditingExistingVehicle ? '✏️ ویرایش مشخصات ناوگان حمل و راننده' : 'فرم تامین خودرو ترابری'}</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAssigningOrderId(null);
                                    setIsEditingExistingVehicle(false);
                                  }}
                                  className="text-[10px] text-slate-400 hover:text-rose-500 font-bold"
                                >
                                  بستن فرم
                                </button>
                              </div>

                              {/* Quick fill automation */}
                              <div>
                                <span className="text-[10px] text-slate-400 block mb-1">درج فوری با رانندگان پرتکرار کارخانه:</span>
                                <div className="flex flex-wrap gap-1.5">
                                  {FREQUENT_DRIVERS.map((dr, index) => (
                                    <button
                                      key={index}
                                      type="button"
                                      onClick={() => handleQuickFill(dr)}
                                      className="px-2 py-1 bg-white hover:bg-slate-100 hover:text-indigo-900 border border-slate-300 rounded text-[9px] text-slate-600 font-bold transition-all cursor-pointer shadow-sm"
                                    >
                                      {dr.label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Inputs grid */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                
                                <div>
                                  <label className="text-[10px] font-bold text-slate-600 block mb-1">نوع تریلی/کامیون:</label>
                                  <select
                                    value={vehicleType}
                                    onChange={(e) => setVehicleType(e.target.value)}
                                    className="w-full bg-white border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-800 font-sans focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                  >
                                    <option value="تریلی ۱۸ چرخ لبه‌دار">تریلی ۱۸ چرخ لبه‌دار</option>
                                    <option value="تریلی چادردار ترانزیت">تریلی چادردار ترانزیت</option>
                                    <option value="کامیون جفت ۱۰ تن">کامیون جفت ۱۰ تن</option>
                                    <option value="کامیون تک ۶ تن">کامیون تک ۶ تن</option>
                                    <option value="نیسان بار سقف‌باز">نیسان بار سقف‌باز</option>
                                  </select>
                                </div>

                                <div>
                                  <label className="text-[10px] font-bold text-slate-600 block mb-1">نام کامل راننده:</label>
                                  <input
                                    type="text"
                                    value={driverName}
                                    onChange={(e) => setDriverName(e.target.value)}
                                    placeholder="احمد عابدی"
                                    className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-xs text-slate-800 font-sans focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                  />
                                </div>

                                <div>
                                  <label className="text-[10px] font-bold text-slate-600 block mb-1">شماره همراه راننده (جهت هماهنگی):</label>
                                  <input
                                    type="text"
                                    value={driverPhone}
                                    onChange={(e) => setDriverPhone(e.target.value)}
                                    placeholder="09115556677"
                                    className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-xs font-mono text-left focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                  />
                                </div>

                                <div>
                                  <label className="text-[10px] font-bold text-slate-600 block mb-1">شماره پلاک ملی کامیون:</label>
                                  <input
                                    type="text"
                                    value={licensePlate}
                                    onChange={(e) => setLicensePlate(e.target.value)}
                                    placeholder="۱۲ ع ۳۴۵ ایران ۷۲"
                                    className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-xs font-sans text-center focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                  />
                                </div>

                                <div className="sm:col-span-2">
                                  <label className="text-[10px] font-extrabold text-rose-700 block mb-1 flex items-center gap-1 justify-end">
                                    <span>شماره بارنامه صادرشده (از سیستم حمل شما):</span>
                                    <span className="bg-rose-100 text-rose-800 text-[9px] px-1.5 py-0.2 rounded">الزامی</span>
                                  </label>
                                  <input
                                    type="text"
                                    value={billOfLadingNumber}
                                    onChange={(e) => setBillOfLadingNumber(e.target.value)}
                                    placeholder="مثلا: BL-4020921"
                                    className="w-full bg-white border border-rose-300 rounded px-3 py-1.5 text-xs font-extrabold text-blue-900 font-mono text-center focus:outline-none focus:ring-2 focus:ring-rose-500 placeholder:text-rose-300 placeholder:font-sans"
                                  />
                                </div>

                                <div>
                                  <label className="text-[10px] font-extrabold text-indigo-950 block mb-1">تاریخ بارگیری (صدور بارنامه):</label>
                                  <input
                                    type="text"
                                    value={estimatedArrival}
                                    onChange={(e) => setEstimatedArrival(e.target.value)}
                                    placeholder="مثلا: ۱۴۰۵/۰۳/۲۵"
                                    className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-xs text-slate-800 font-sans focus:outline-none focus:ring-1 focus:ring-indigo-500 text-center font-bold"
                                  />
                                </div>

                              </div>

                              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                                <button
                                  type="button"
                                  onClick={() => setAssigningOrderId(null)}
                                  className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-600 font-bold rounded-lg text-xs transition-all cursor-pointer"
                                >
                                  لغو فرم
                                </button>
                                <button
                                  type="submit"
                                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-lg text-xs transition-all cursor-pointer flex items-center gap-1.5"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                  <span>ثبت و تخصیص قطعی خودرو</span>
                                </button>
                              </div>

                            </form>
                          )}

                          {/* Action Button: Return / Cancel Order */}
                          {!isAssigning && (
                            <div className="flex justify-end pt-3 mt-3 border-t border-slate-200/60">
                              <button
                                type="button"
                                onClick={() => {
                                  setReturningOrderId(order.id);
                                  setReturnReasonSelect('عدم امکان تامین کامیون / وسیله نقلیه در زمان مقرر');
                                  setReturnNote('');
                                }}
                                className="bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 py-1.5 px-3.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
                                title="استرداد و عودت سفارش به کارتابل مدیر فروش"
                              >
                                <Undo2 className="w-3.5 h-3.5 text-rose-600" />
                                <span>استرداد سفارش (انصراف و عودت به مدیر فروش)</span>
                              </button>
                            </div>
                          )}
                        </>
                      )}

                    </div>

                  </div>

                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* Location Modal */}
      {selectedLocationOrder && (
        <SendLocationModal
          isOpen={!!selectedLocationOrder}
          onClose={() => setSelectedLocationOrder(null)}
          order={selectedLocationOrder}
          onSaveLocation={onSaveLocation}
          onShowToast={showToast}
        />
      )}

    </div>
  );
}
