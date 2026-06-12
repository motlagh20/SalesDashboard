/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Order, VehicleDetails, OrderStatus, ShippingCompany } from '../types';
import { 
  Truck, 
  CheckSquare, 
  MapPin, 
  Phone, 
  User, 
  ChevronRight, 
  Archive, 
  Zap, 
  Search,
  Navigation,
  Check,
  Square,
  Send,
  Trash2
} from 'lucide-react';

interface FactoryDashboardProps {
  orders: Order[];
  shippingCompanies: ShippingCompany[];
  onAssignVehicle: (orderId: string, vehicle: VehicleDetails) => void;
  onDispatchOrder: (orderId: string) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  askConfirm: (title: string, message: string, onConfirm: () => void) => void;
}

export default function FactoryDashboard({
  orders,
  shippingCompanies = [],
  onAssignVehicle,
  onDispatchOrder,
  showToast,
  askConfirm,
}: FactoryDashboardProps) {
  const [activeTab, setActiveTab] = useState<'PENDING_TRANSPORT' | 'ASSIGNED' | 'DISPATCHED'>('PENDING_TRANSPORT');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Track selected orders for bulk actions
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  
  const activeShippingCompanies = shippingCompanies.filter(sc => sc.isEnabled);
  const firstAgencyName = activeShippingCompanies.length > 0 ? activeShippingCompanies[0].name : 'باربری ترانزیت طبرستان';

  // Specific assignment form states per order to keep things simple
  const [assigningOrderId, setAssigningOrderId] = useState<string | null>(null);
  const [vehicleType, setVehicleType] = useState('تریلی ۱۸ چرخ لبه‌دار');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('0911');
  const [licensePlate, setLicensePlate] = useState('۱۲ ع ۳۴۵ ایران ۷۲');
  const [shippingAgency, setShippingAgency] = useState(firstAgencyName);
  const [estimatedArrival, setEstimatedArrival] = useState('فردا صبح');

  // Form states for bulk assignment
  const [bulkShippingAgency, setBulkShippingAgency] = useState(firstAgencyName);
  const [bulkVehicleType, setBulkVehicleType] = useState('تریلی ۱۸ چرخ لبه‌دار');

  // Filter orders by transport-stage status
  const filteredOrders = orders.filter((order) => {
    // Drop canceled/pending sales approvals immediately in factory view
    if (order.status === 'PENDING_APPROVAL' || order.status === 'REJECTED') return false;

    if (activeTab === 'PENDING_TRANSPORT' && order.status !== 'SENT_TO_FACTORY') return false;
    if (activeTab === 'ASSIGNED' && order.status !== 'VEHICLE_ASSIGNED') return false;
    if (activeTab === 'DISPATCHED' && order.status !== 'LOADED_AND_DISPATCHED') return false;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        order.customerName.toLowerCase().includes(q) ||
        order.productName.toLowerCase().includes(q) ||
        order.destinationCity.toLowerCase().includes(q) ||
        order.orderNumber.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // مرتب‌سازی صف بر اساس زمان ارسال به کارخانه (اولویت با سفارشاتی است که زودتر ارسال شده‌اند)
  const sortedOrders = [...filteredOrders].sort((a, b) => {
    const timeA = a.sentToFactoryAt ? new Date(a.sentToFactoryAt).getTime() : new Date(a.createdAt).getTime();
    const timeB = b.sentToFactoryAt ? new Date(b.sentToFactoryAt).getTime() : new Date(b.createdAt).getTime();
    return timeA - timeB;
  });

  const handleAssignSubmit = (e: React.FormEvent, orderId: string) => {
    e.preventDefault();
    if (!driverName.trim()) {
      showToast('لطفاً نام راننده را بنویسید.', 'error');
      return;
    }
    onAssignVehicle(orderId, {
      vehicleType,
      driverName,
      driverPhone,
      licensePlate,
      shippingAgency,
      estimatedArrival,
    });
    setAssigningOrderId(null);
    // Reset form for next usage
    setDriverName('');
    setDriverPhone('0911');
    setLicensePlate('۱۲ ع ۳۴۵ ایران ۷۲');
  };

  const handleToggleSelectOrder = (orderId: string) => {
    setSelectedOrderIds(prev => 
      prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
    );
  };

  const handleSelectAllOrders = () => {
    const pendingInGrid = sortedOrders.map(o => o.id);
    const allSelected = pendingInGrid.length > 0 && pendingInGrid.every(id => selectedOrderIds.includes(id));
    if (allSelected) {
      setSelectedOrderIds(prev => prev.filter(id => !pendingInGrid.includes(id)));
    } else {
      setSelectedOrderIds(prev => {
        const others = prev.filter(id => !pendingInGrid.includes(id));
        return [...others, ...pendingInGrid];
      });
    }
  };

  const handleBulkAssignSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedOrderIds.length === 0) {
      showToast('هیچ سفارشی انتخاب نشده است.', 'error');
      return;
    }

    askConfirm(
      'تخصیص وسیله نقلیه دسته جمعی',
      `آیا مایلید برای هر ${selectedOrderIds.length} سفارش منتخب، درخواست کامیون را به شرکت حمل «${bulkShippingAgency}» ارسال نمایید؟`,
      () => {
        selectedOrderIds.forEach((orderId, idx) => {
          // Generate realistic mock details for sequential drivers
          const sequentialDrivers = [
            { name: 'اصغر کریمی', phone: '09123456789', plate: '۲۴ ع ۴۵۶ ایران ۷۲' },
            { name: 'مرتضی هاشمی', phone: '09112223344', plate: '۳۶ ب ۷۸۹ ایران ۶۲' },
            { name: 'جلال همتی', phone: '09156667788', plate: '۴۸ ج ۱۲۳ ایران ۹۳' },
            { name: 'قاسم نوروزی', phone: '09135554433', plate: '۱۵ د ۵۶۷ ایران ۵۳' },
            { name: 'حسن رضایی', phone: '09168889900', plate: '۲۲ ط ۳۴۵ ایران ۸۲' }
          ];
          const driver = sequentialDrivers[idx % sequentialDrivers.length];
          onAssignVehicle(orderId, {
            vehicleType: bulkVehicleType,
            driverName: driver.name,
            driverPhone: driver.phone,
            licensePlate: driver.plate,
            shippingAgency: bulkShippingAgency,
            estimatedArrival: 'بارگیری نوبتی تفصیلی'
          });
        });

        setSelectedOrderIds([]);
        showToast(`لیست شامل ${selectedOrderIds.length} سفارش با موفقیت به شرکت حمل «${bulkShippingAgency}» ارجاع و به وضعیت بارگیری منتقل گردید.`, 'success');
      }
    );
  };

  return (
    <div className="space-y-6 text-right dir-rtl font-sans" id="factory-dashboard">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6" id="factory-logistics-card">
        
        {/* Title and stats bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-5 mb-5 gap-3">
          <div className="flex items-center gap-2 bg-emerald-50 text-emerald-800 py-1 px-3 border border-emerald-100 rounded-lg text-xs font-mono font-bold self-start">
            <span>دریافت اتوماتیک سفارشات به ترتیب نوبت ثبت</span>
            <Zap className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-center gap-2.5 justify-end">
            <h3 className="text-lg font-bold text-slate-800">صـف مدیریت ترابری و بارگیری کارخانه سفال</h3>
            <Truck className="w-5 h-5 text-emerald-600" />
          </div>
        </div>

        {/* View switching Tabs */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex gap-2 bg-slate-100 p-1.5 rounded-xl self-start" id="factory-tabpicker">
            <button
              onClick={() => setActiveTab('PENDING_TRANSPORT')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'PENDING_TRANSPORT' ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              ۱. نیازمند تخصیص وسیله نقلیه ({orders.filter(o => o.status === 'SENT_TO_FACTORY').length})
            </button>
            <button
              onClick={() => setActiveTab('ASSIGNED')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'ASSIGNED' ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              ۲. تخصیص‌یافته / در انتظار بارگیری ({orders.filter(o => o.status === 'VEHICLE_ASSIGNED').length})
            </button>
            <button
              onClick={() => setActiveTab('DISPATCHED')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'DISPATCHED' ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              ۳. بارگیری و ترخیص‌شده ({orders.filter(o => o.status === 'LOADED_AND_DISPATCHED').length})
            </button>
          </div>

          {/* Table search query */}
          <div className="relative w-full md:w-80">
            <input
              type="text"
              placeholder="جستجو بر اساس مشخصات باربری..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 pl-3 pr-10 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-sans"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-auto right-3.5 top-3" />
          </div>
        </div>

        {/* Global Bulk Actions Panel for Pending Transport */}
        {activeTab === 'PENDING_TRANSPORT' && sortedOrders.length > 0 && (
          <div className="bg-amber-50/40 border border-amber-100 rounded-xl p-4 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSelectAllOrders}
                className="p-1.5 hover:bg-slate-200 rounded transition-all flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer"
              >
                {sortedOrders.length > 0 && sortedOrders.every(o => selectedOrderIds.includes(o.id)) ? (
                  <CheckSquare className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400" />
                )}
                <span>انتخاب همه سفارشات نیازمند وسیله ({selectedOrderIds.length} از {sortedOrders.length})</span>
              </button>
            </div>

            {selectedOrderIds.length > 0 && (
              <form onSubmit={handleBulkAssignSubmit} className="flex-1 md:flex items-center justify-end gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-600 font-bold shrink-0">شرکت حمل منتخب:</span>
                  <select
                    value={bulkShippingAgency}
                    onChange={(e) => setBulkShippingAgency(e.target.value)}
                    className="bg-white border border-slate-250 rounded px-2.5 py-1 text-xs text-slate-800 font-sans focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {activeShippingCompanies.map((sc) => (
                      <option key={sc.id} value={sc.name}>{sc.name}</option>
                    ))}
                    {activeShippingCompanies.length === 0 && (
                      <option value="باربری ترانزیت طبرستان">باربری ترانزیت طبرستان (پیش‌فرض)</option>
                    )}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-600 font-bold shrink-0">نوع خودرو:</span>
                  <select
                    value={bulkVehicleType}
                    onChange={(e) => setBulkVehicleType(e.target.value)}
                    className="bg-white border border-slate-250 rounded px-2.5 py-1 text-xs text-slate-800 font-sans focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="تریلی ۱۸ چرخ لبه‌دار">تریلی ۱۸ چرخ لبه‌دار</option>
                    <option value="کامیون جفت ۱۰ تن">کامیون جفت ۱۰ تن</option>
                    <option value="کامیون تک ۶ تن">کامیون تک ۶ تن</option>
                    <option value="نیسان بار صنعتی">نیسان بار صنعتی</option>
                  </select>
                </div>

                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-1.5 px-4 rounded-lg transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>ارسال دسته‌جمعی به باربری</span>
                </button>
              </form>
            )}
          </div>
        )}

        {/* Dynamic loading of queues */}
        {sortedOrders.length === 0 ? (
          <div className="text-center py-16 bg-slate-50 border border-slate-150 rounded-xl" id="empty-factory-orders">
            <p className="text-slate-400 text-xs font-bold font-sans">هیچ رکوردی در این بخش از صف ترابری موجود نیست.</p>
          </div>
        ) : (
          <div className="space-y-6" id="factory-orders-stack">
            {sortedOrders.map((order) => (
              <div 
                key={order.id} 
                className={`border rounded-xl p-5 hover:border-slate-300 transition-all bg-white relative ${
                  selectedOrderIds.includes(order.id) ? 'border-indigo-400 bg-indigo-50/10' : 'border-slate-200'
                }`}
                id={`factory-ord-card-${order.id}`}
              >
                {/* Visual Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    {activeTab === 'PENDING_TRANSPORT' && (
                      <button
                        type="button"
                        onClick={() => handleToggleSelectOrder(order.id)}
                        className="p-1 hover:bg-slate-100 rounded mr-1 cursor-pointer transition-colors"
                        title="انتخاب جهت تخصیص گروهی"
                      >
                        {selectedOrderIds.includes(order.id) ? (
                          <CheckSquare className="w-4 h-4 text-indigo-600" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-300" />
                        )}
                      </button>
                    )}
                    <span className="text-xs bg-slate-100 text-slate-800 py-1 px-2.5 rounded font-bold">{order.customerName}</span>
                    <span className="text-[10px] text-slate-400 font-mono">کد کلاینت: {order.agentCode}</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-700">{order.orderNumber}</span>
                </div>

                {/* Grid info */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs mb-4" id={`factory-info-grid-${order.id}`}>
                  <div>
                    <span className="text-slate-400 block mb-0.5">محصول سفری کارخانه:</span>
                    <strong className="text-slate-800 text-[11px] block">{order.productName}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-0.5">حجم کل سفارش بار:</span>
                    <strong className="text-slate-800 font-mono text-[11px] block">{order.quantity.toLocaleString()} {order.unit}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-0.5">منطقه تحویل تفصیلی:</span>
                    <strong className="text-slate-800 text-[11px] block flex items-center justify-end gap-1">
                      <span>{order.destinationCity}</span>
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    </strong>
                  </div>
                </div>

                {/* Address block */}
                <div className="bg-slate-50 p-3 rounded-lg text-xs text-slate-600 mb-4" id={`fac-address-box-${order.id}`}>
                  <p className="text-justify text-slate-500">📍 <strong>آدرس تخلیه کارگاه مقصد:</strong> {order.exactAddress}</p>
                  {order.notes && <p className="text-justify text-slate-600 mt-1 font-semibold">📝 ملاحظات ترابری نماینده: {order.notes}</p>}
                </div>

                {/* Sub-tab 1: Pending Assigning Form */}
                {activeTab === 'PENDING_TRANSPORT' && (
                  <div className="border-t border-slate-150 pt-4" id={`assign-form-parent-${order.id}`}>
                    {assigningOrderId !== order.id ? (
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="text-[11px] text-slate-500">جهت درج مشخصات راننده حمل‌ونقل دکمه مقابل را بفشارید.</span>
                        <button
                          onClick={() => {
                            setAssigningOrderId(order.id);
                            // Choose matching driver suggestions to make simulation super intuitive
                            if (order.destinationCity.includes('اصفهان')) {
                              setDriverName('غلامرضا صادقی');
                              setDriverPhone('09139998888');
                              setLicensePlate('۷۲ ب ۵۵۱ ایران ۵۳');
                            } else if (order.destinationCity.includes('تهران')) {
                              setDriverName('کریم قنبری');
                              setDriverPhone('09121112233');
                              setLicensePlate('۵۴ ع ۸۹۲ ایران ۷۲');
                            } else {
                              setDriverName('محمد یزدانی');
                              setDriverPhone('09114567890');
                              setLicensePlate('۳۲ ق ۳۴۵ ایران ۶۲');
                            }
                          }}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white py-1.5 px-4 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                        >
                          <Truck className="w-4 h-4" />
                          <span>تخصیص وسیله نقلیه و راننده</span>
                        </button>
                      </div>
                    ) : (
                      <form onSubmit={(e) => handleAssignSubmit(e, order.id)} className="bg-slate-50/50 p-4 rounded-xl border border-slate-200 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-2">
                          <span className="text-xs font-bold text-slate-700">تکمیل فرم حواله راننده جهت خروج</span>
                          <span className="text-[10px] text-slate-400">ثبت باربری همکار</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                          <div>
                            <label className="block text-slate-600 mb-1 font-bold">نوع وسیله نقلیه:</label>
                            <select
                              value={vehicleType}
                              onChange={(e) => setVehicleType(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                            >
                              <option value="تریلی ۱۸ چرخ لبه‌دار">تریلی ۱۸ چرخ لبه‌دار</option>
                              <option value="کامیون جفت ۱۰ تن">کامیون جفت ۱۰ تن</option>
                              <option value="کامیون تک ۶ تن">کامیون تک ۶ تن</option>
                              <option value="خاور مسقف پتودار">خاور مسقف پتودار</option>
                              <option value="نیسان بار صنعتی">نیسان بار صنعتی</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-slate-600 mb-1 font-bold">نام راننده مربوطه:</label>
                            <input
                              type="text"
                              required
                              value={driverName}
                              onChange={(e) => setDriverName(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                            />
                          </div>

                          <div>
                            <label className="block text-slate-600 mb-1 font-bold">شماره ارتباطی راننده:</label>
                            <input
                              type="text"
                              required
                              value={driverPhone}
                              onChange={(e) => setDriverPhone(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono text-left"
                            />
                          </div>

                          <div>
                            <label className="block text-slate-600 mb-1 font-bold">شماره پلاک وسیله نقلیه:</label>
                            <input
                              type="text"
                              required
                              placeholder="مثال: ۱۲ ع ۳۴۵ ایران ۷۲"
                              value={licensePlate}
                              onChange={(e) => setLicensePlate(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans text-center"
                            />
                          </div>

                          <div>
                            <label className="block text-slate-600 mb-1 font-bold">موسسه باربری معرفی‌کننده:</label>
                            <select
                              value={shippingAgency}
                              onChange={(e) => setShippingAgency(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans text-xs text-slate-800"
                            >
                              {activeShippingCompanies.map((sc) => (
                                <option key={sc.id} value={sc.name}>{sc.name}</option>
                              ))}
                              {activeShippingCompanies.length === 0 && (
                                <option value="باربری ترانزیت طبرستان">باربری ترانزیت طبرستان (پیش‌فرض)</option>
                              )}
                            </select>
                          </div>

                          <div>
                            <label className="block text-slate-600 mb-1 font-bold">زمان تخمینی بارگیری و رسیدن:</label>
                            <input
                              type="text"
                              value={estimatedArrival}
                              onChange={(e) => setEstimatedArrival(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                            />
                          </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                          <button
                            type="button"
                            onClick={() => setAssigningOrderId(null)}
                            className="bg-slate-200 hover:bg-slate-300 text-slate-700 py-1.5 px-4 rounded-lg text-xs cursor-pointer"
                          >
                            انصراف
                          </button>
                          <button
                            type="submit"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white py-1.5 px-5 rounded-lg text-xs font-bold cursor-pointer"
                          >
                            ثبت راننده و انتقال به فرآیند بارگیری
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}

                {/* Sub-tab 2: Complete Loading Button */}
                {activeTab === 'ASSIGNED' && order.vehicleDetails && (
                  <div className="border-t border-slate-150 pt-4 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs" id={`dispatch-box-${order.id}`}>
                    <div className="flex-1 text-slate-600 grid grid-cols-2 md:grid-cols-4 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-150">
                      <div>
                        <span className="text-slate-400 text-[10px] block">کامیون:</span>
                        <strong className="text-slate-700">{order.vehicleDetails.vehicleType}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">راننده:</span>
                        <strong className="text-slate-700">{order.vehicleDetails.driverName}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">شماره تماس راننده:</span>
                        <strong className="text-slate-700 font-mono">{order.vehicleDetails.driverPhone}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">شماره پلاک خودرو:</span>
                        <strong className="text-slate-700 font-mono">{order.vehicleDetails.licensePlate}</strong>
                      </div>
                    </div>

                    <button
                      onClick={() => onDispatchOrder(order.id)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-5 rounded-xl text-xs transition-colors cursor-pointer flex items-center justify-center gap-2 self-end shadow-sm"
                    >
                      <Navigation className="w-4 h-4" />
                      <span>بارگیری شد و ترخصیص خروج کامیون</span>
                    </button>
                  </div>
                )}

                {/* Sub-tab 3: Dispatched Logs (Completed History) */}
                {activeTab === 'DISPATCHED' && order.vehicleDetails && (
                  <div className="border-t border-dashed border-slate-200 pt-3 text-xs flex flex-wrap items-center justify-between text-slate-500 gap-2" id={`dispatched-receipt-${order.id}`}>
                    <span className="text-emerald-700 font-bold flex items-center gap-1">
                      <span>✓ ترخیص خروج با موفقیت انجام شده و به نمایندگی اطلاع رسانی گردید.</span>
                    </span>
                    <div className="text-[11px] font-mono">
                      توسط راننده: <strong>{order.vehicleDetails.driverName}</strong> (پلاک: {order.vehicleDetails.licensePlate}) • حمل‌ونقل {order.vehicleDetails.shippingAgency}
                    </div>
                  </div>
                )}

              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
