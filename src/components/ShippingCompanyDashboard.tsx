/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Order, VehicleDetails, ShippingCompany, Product, AppUser } from '../types';
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
  UserCheck
} from 'lucide-react';

interface ShippingCompanyDashboardProps {
  orders: Order[];
  shippingCompanies: ShippingCompany[];
  products: Product[];
  onAssignVehicle: (orderId: string, vehicle: VehicleDetails) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  askConfirm: (title: string, message: string, onConfirm: () => void) => void;
  currentUser?: AppUser | null;
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
  onAssignVehicle,
  showToast,
  askConfirm,
  currentUser,
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

  // Selected company object
  const currentCompany = shippingCompanies.find(sc => sc.id === selectedCompanyId) || shippingCompanies[0];

  // Specific assignment form states per order
  const [assigningOrderId, setAssigningOrderId] = useState<string | null>(null);
  const [vehicleType, setVehicleType] = useState('تریلی ۱۸ چرخ لبه‌دار');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [billOfLadingNumber, setBillOfLadingNumber] = useState('');
  const [estimatedArrival, setEstimatedArrival] = useState(new Date().toLocaleDateString('fa-IR'));

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
      const q = searchQuery.toLowerCase();
      return (
        order.customerName.toLowerCase().includes(q) ||
        order.productName.toLowerCase().includes(q) ||
        order.destinationCity.toLowerCase().includes(q) ||
        order.orderNumber.toLowerCase().includes(q) ||
        (order.vehicleDetails?.driverName && order.vehicleDetails.driverName.toLowerCase().includes(q)) ||
        (order.vehicleDetails?.billOfLadingNumber && order.vehicleDetails.billOfLadingNumber.toLowerCase().includes(q))
      );
    }

    return true;
  });

  // Sort by newest order
  const sortedOrders = [...filteredOrders].sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // Handle assign submission
  const handleAssignSubmit = (e: React.FormEvent, orderId: string) => {
    e.preventDefault();
    if (!driverName.trim()) {
      showToast('لطفا نام راننده را مشخص کنید.', 'error');
      return;
    }
    if (!driverPhone.trim()) {
      showToast('لطفا شماره همراه راننده را مشخص کنید.', 'error');
      return;
    }
    if (!licensePlate.trim()) {
      showToast('لطفا پلاک خودرو را بنویسید.', 'error');
      return;
    }
    if (!billOfLadingNumber.trim()) {
      showToast('خطا: ثبت شماره بارنامه صادره از نرم‌افزار حمل الزامی است.', 'error');
      return;
    }

    askConfirm(
      'تایید و تخصیص خودرو به سفارش',
      `آیا مشخصات راننده به همراه شماره بارنامه «${billOfLadingNumber}» مورد تایید است؟ این اطلاعات به کارخط کارخانه ارسال خواهد شد.`,
      () => {
        onAssignVehicle(orderId, {
          vehicleType,
          driverName,
          driverPhone,
          licensePlate,
          shippingAgency: currentCompany ? currentCompany.name : 'باربری',
          estimatedArrival,
          billOfLadingNumber
        });
        
        // Reset state
        setAssigningOrderId(null);
        setDriverName('');
        setDriverPhone('');
        setLicensePlate('');
        setBillOfLadingNumber('');
        setEstimatedArrival(new Date().toLocaleDateString('fa-IR'));
      }
    );
  };

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
            <h3 className="text-base font-bold text-slate-800">
              {currentCompany ? currentCompany.name : 'نام مشخص نشده'}
            </h3>
            <p className="text-[11px] text-slate-400 flex items-center gap-1.5 justify-end mt-0.5">
              <span>مدیر باربری: {currentCompany?.managerName || 'نامشخص'}</span>
              <span className="text-slate-300">|</span>
              <span>تلفن تماس مستقیم: {currentCompany?.phoneNumber || 'نامشخص'}</span>
            </p>
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
              placeholder="جستجو بر اساس نماینده، شهر، بارنامه یا کالا..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 pl-3 pr-10 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-auto right-3.5 top-3" />
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
            <p className="text-slate-400 text-[11px] mt-1">با کارتابل مدیریت بازرگانی یا ترابری کارخانه سفارشات جدید را به این باربری ارجاع دهید.</p>
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
                    <div className="flex items-center gap-2.5">
                      <span className="bg-slate-200 text-slate-700 px-2 py-1 rounded text-[10px] font-mono font-bold">{order.orderNumber}</span>
                      <span className="text-slate-400 text-xs">|</span>
                      <span className="text-xs font-bold text-slate-800">{order.customerName}</span>
                      <span className="text-slate-400 text-xs">({order.agentCode})</span>
                    </div>

                    <div className="flex items-center gap-2 self-start md:self-auto">
                      <span className="text-slate-400 text-[11px] font-mono">ثبت: {new Date(order.createdAt).toLocaleDateString('fa-IR')}</span>
                      <span className="text-slate-200">|</span>
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        order.status === 'SENT_TO_FACTORY' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                        order.status === 'VEHICLE_ASSIGNED' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' :
                        'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}>
                        {order.status === 'SENT_TO_FACTORY' && 'منتظر وسیله نقلیه'}
                        {order.status === 'VEHICLE_ASSIGNED' && 'تخصیص‌یافته / در صف بارگیری کارخانه'}
                        {order.status === 'LOADED_AND_DISPATCHED' && 'بارگیری کامل و ترخیص شده'}
                      </span>
                    </div>
                  </div>

                  {/* Shipment Details inside Card Body */}
                  <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
                    
                    {/* Left Column: Details */}
                    <div className="lg:col-span-4 space-y-3 border-l border-slate-100 pl-4">
                      <div>
                        <span className="text-[11px] text-slate-400 block mb-0.5">نوع و مقدار کالا سفال</span>
                        {order.itemsJson ? (
                          <div className="space-y-1.5 mt-1 bg-indigo-50/50 p-2 rounded-lg border border-indigo-100">
                            {(() => {
                              try {
                                const parsed = JSON.parse(order.itemsJson);
                                if (Array.isArray(parsed)) {
                                  return parsed.map((item: any, i: number) => (
                                    <div key={i} className="flex justify-between items-center text-[10.5px] text-slate-800">
                                      <span className="font-mono text-indigo-700 bg-white px-1.5 py-0.5 rounded border border-indigo-100/50 font-bold">{item.quantity.toLocaleString('fa-IR')} {item.unit || order.unit}</span>
                                      <strong className="text-right text-indigo-950">{item.productName}</strong>
                                    </div>
                                  ));
                                }
                              } catch(e) {}
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
                              <strong className="text-slate-850 font-extrabold">{order.vehicleDetails.vehicleType}</strong>
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
                              <span className="bg-white border text-center font-bold font-mono py-0.5 px-2 rounded tracking-wider border-slate-250 block w-max ml-auto mt-0.5 select-all">{order.vehicleDetails.licensePlate}</span>
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
                        </div>
                      )}

                      {/* Not assigned and not currently filling form */}
                      {!isAssigning && (order.status === 'SENT_TO_FACTORY' || !order.vehicleDetails || !order.vehicleDetails.driverName) && (
                        <div className="flex flex-col items-center justify-center p-6 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                          <p className="text-xs text-slate-500 font-bold mb-3">کامیونی برای این مورد ثبت نشده است</p>
                          <button
                            onClick={() => {
                              setAssigningOrderId(order.id);
                              // Prep-fill draft values to make fast
                              setVehicleType('تریلی ۱۸ چرخ لبه‌دار');
                              setDriverName('');
                              setDriverPhone('');
                              setLicensePlate('');
                              setBillOfLadingNumber('');
                              setEstimatedArrival(new Date().toLocaleDateString('fa-IR'));
                            }}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2 px-5 rounded-lg shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                          >
                            <Truck className="w-4 h-4" />
                            <span>تخصیص خودرو و ثبت بارنامه جدید</span>
                          </button>
                        </div>
                      )}

                      {/* Dynamic form for creating allocation */}
                      {isAssigning && (
                        <form onSubmit={(e) => handleAssignSubmit(e, order.id)} className="bg-slate-50 rounded-xl p-4 border border-indigo-200 space-y-4">
                          
                          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                            <span className="text-xs font-extrabold text-indigo-900 flex items-center gap-1">
                              <UserCheck className="w-4 h-4 text-indigo-600" />
                              <span>فرم تامین خودرو ترابری</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => setAssigningOrderId(null)}
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
                                  className="px-2 py-1 bg-white hover:bg-slate-100 hover:text-indigo-900 border border-slate-250 rounded text-[9px] text-slate-600 font-bold transition-all cursor-pointer shadow-sm"
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
                                className="w-full bg-white border border-slate-250 rounded px-2 py-1.5 text-xs text-slate-800 font-sans focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                                className="w-full bg-white border border-slate-250 rounded px-3 py-1.5 text-xs text-slate-850 font-sans focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </div>

                            <div>
                              <label className="text-[10px] font-bold text-slate-600 block mb-1">شماره همراه راننده (جهت هماهنگی):</label>
                              <input
                                type="text"
                                value={driverPhone}
                                onChange={(e) => setDriverPhone(e.target.value)}
                                placeholder="09115556677"
                                className="w-full bg-white border border-slate-250 rounded px-3 py-1.5 text-xs font-mono text-left focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </div>

                            <div>
                              <label className="text-[10px] font-bold text-slate-600 block mb-1">شماره پلاک ملی کامیون:</label>
                              <input
                                type="text"
                                value={licensePlate}
                                onChange={(e) => setLicensePlate(e.target.value)}
                                placeholder="۱۲ ع ۳۴۵ ایران ۷۲"
                                className="w-full bg-white border border-slate-250 rounded px-3 py-1.5 text-xs font-sans text-center focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                                className="w-full bg-white border border-slate-250 rounded px-3 py-1.5 text-xs text-slate-800 font-sans focus:outline-none focus:ring-1 focus:ring-indigo-500 text-center font-bold"
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
                              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-lg text-xs transition-all cursor-pointer flex items-center gap-1.5"
                            >
                              <CheckCircle className="w-4 h-4" />
                              <span>ثبت و تخصیص قطعی خودرو</span>
                            </button>
                          </div>

                        </form>
                      )}

                    </div>

                  </div>

                </div>
              );
            })}
          </div>
        )}

      </div>

    </div>
  );
}
