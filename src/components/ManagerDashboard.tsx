/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Order, OrderStatus, Product, Agent, ShippingCompany } from '../types';
import { 
  CheckCircle, 
  XCircle, 
  ChevronDown, 
  ShieldCheck, 
  ArrowLeft, 
  FileText, 
  MapPin, 
  Layers, 
  TrendingUp, 
  Clock, 
  Search,
  Plus,
  Trash2,
  CheckCircle2,
  X,
  PlusCircle,
  FolderPlus,
  Users,
  MoveUp,
  MoveDown,
  Navigation,
  DollarSign,
  Briefcase,
  ExternalLink,
  Truck
} from 'lucide-react';

interface ManagerDashboardProps {
  orders: Order[];
  products: Product[];
  agents: Agent[];
  shippingCompanies: ShippingCompany[];
  onApproveOrder: (orderId: string) => void;
  onRejectOrder: (orderId: string, reason: string) => void;
  onDispatchToFactory: (orderId: string, comment?: string) => void;
  onUpdateAllOrders: (updatedOrders: Order[]) => void;
  onAddProduct: (newProduct: Product) => void;
  onToggleProduct: (productId: string) => void;
  onDeleteProduct: (productId: string) => void;
  onAddAgent: (newAgent: Agent) => void;
  onToggleAgent: (agentId: string) => void;
  onDeleteAgent: (agentId: string) => void;
  onAddShippingCompany: (newCompany: ShippingCompany) => void;
  onToggleShippingCompany: (companyId: string) => void;
  onDeleteShippingCompany: (companyId: string) => void;
  onApproveAllOrders?: () => void;
  onDispatchAllToFactory?: () => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  askConfirm: (title: string, message: string, onConfirm: () => void) => void;
}

type PanelTab = 'APPROVED_PRIORITIES' | 'PENDING_APPROVAL' | 'AGENTS_MGMT' | 'PRODUCTS_MGMT' | 'SHIPPING_MGMT' | 'ARCHIVAL_ORDERS';

export default function ManagerDashboard({
  orders,
  products,
  agents,
  shippingCompanies = [],
  onApproveOrder,
  onRejectOrder,
  onDispatchToFactory,
  onUpdateAllOrders,
  onAddProduct,
  onToggleProduct,
  onDeleteProduct,
  onAddAgent,
  onToggleAgent,
  onDeleteAgent,
  onAddShippingCompany,
  onToggleShippingCompany,
  onDeleteShippingCompany,
  onApproveAllOrders,
  onDispatchAllToFactory,
  showToast,
  askConfirm,
}: ManagerDashboardProps) {
  // Navigation tabs for the Manager workspace
  const [activeTab, setActiveTab] = useState<PanelTab>('PENDING_APPROVAL');
  
  // Sub-filter state for archival logs
  const [archiveStatusFilter, setArchiveStatusFilter] = useState<string>('ALL');
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  
  // Rejection input controls
  const [rejectionInputId, setRejectionInputId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Form: Create Agent state
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentAlias, setNewAgentAlias] = useState('');
  const [newAgentCode, setNewAgentCode] = useState('');
  const [newAgentPhone, setNewAgentPhone] = useState('');
  const [newAgentAddress, setNewAgentAddress] = useState('');
  const [newAgentArea, setNewAgentArea] = useState('');

  // Form: Create Product state
  const [newProdName, setNewProdName] = useState('');
  const [newProdCategory, setNewProdCategory] = useState('roofing');
  const [newProdPrice, setNewProdPrice] = useState(10000);
  const [newProdUnit, setNewProdUnit] = useState('عدد');
  const [newProdDesc, setNewProdDesc] = useState('');
  const [newProdWeight, setNewProdWeight] = useState('');
  const [newProdDimensions, setNewProdDimensions] = useState('');
  const [coverageType, setCoverageType] = useState<'square' | 'linear'>('square');
  const [coverageVal, setCoverageVal] = useState('');

  // Form: Create Shipping Company state
  const [newSCName, setNewSCName] = useState('');
  const [newSCCode, setNewSCCode] = useState('');
  const [newSCPhone, setNewSCPhone] = useState('');
  const [newSCManagerName, setNewSCManagerName] = useState('');

  // Metrics calculations
  const totalVolume = orders.reduce((sum, o) => o.status !== 'REJECTED' ? sum + o.quantity : sum, 0);
  const totalPending = orders.filter((o) => o.status === 'PENDING_APPROVAL').length;
  const approvedButPendingDispatch = orders.filter((o) => o.status === 'APPROVED_BY_SALES');
  const sentToFactoryCount = orders.filter((o) => o.status === 'SENT_TO_FACTORY').length;
  const inTransitCount = orders.filter((o) => o.status === 'VEHICLE_ASSIGNED' || o.status === 'LOADED_AND_DISPATCHED').length;

  const handleRejectSubmit = (orderId: string) => {
    if (!rejectionReason.trim()) {
      showToast('لطفاً دلیل رد کردن سفارش را وارد کنید.', 'error');
      return;
    }
    onRejectOrder(orderId, rejectionReason);
    setRejectionInputId(null);
    setRejectionReason('');
  };

  // Re-ordering priority engine
  const movePriority = (indexInActiveList: number, direction: 'UP' | 'DOWN') => {
    const list = orders.filter(o => o.status === 'APPROVED_BY_SALES');
    if (direction === 'UP' && indexInActiveList === 0) return;
    if (direction === 'DOWN' && indexInActiveList === list.length - 1) return;

    const swapWithIndex = direction === 'UP' ? indexInActiveList - 1 : indexInActiveList + 1;
    const itemA = list[indexInActiveList];
    const itemB = list[swapWithIndex];

    const updatedMaster = [...orders];
    const absA = updatedMaster.findIndex(o => o.id === itemA.id);
    const absB = updatedMaster.findIndex(o => o.id === itemB.id);

    if (absA !== -1 && absB !== -1) {
      const temp = updatedMaster[absA];
      updatedMaster[absA] = updatedMaster[absB];
      updatedMaster[absB] = temp;
      onUpdateAllOrders(updatedMaster);
    }
  };

  // Agent submit form
  const handleAgentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAgentName.trim() || !newAgentAlias.trim() || !newAgentCode.trim()) {
      showToast('لطفاً کلیه مشخصات اساسی نمایندگی را تکمیل نمایید.', 'error');
      return;
    }

    if (agents.some(a => a.agentCode === newAgentCode.trim())) {
      showToast('این کد نمایندگی قبلاً تعریف شده است.', 'error');
      return;
    }

    const newAgentObject: Agent = {
      id: `ag-${Date.now()}`,
      fullName: newAgentName.trim(),
      alias: newAgentAlias.trim(),
      agentCode: newAgentCode.trim(),
      phoneNumber: newAgentPhone.trim(),
      address: newAgentAddress.trim(),
      area: newAgentArea.trim() || 'نامشخص',
      isEnabled: true,
    };

    onAddAgent(newAgentObject);
    
    // Reset forms
    setNewAgentName('');
    setNewAgentAlias('');
    setNewAgentCode('');
    setNewAgentPhone('');
    setNewAgentAddress('');
    setNewAgentArea('');
    showToast('نمایندگی جدید با موفقیت در سیستم ثبت گردید.', 'success');
  };

  // Product submit form
  const handleProductSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdName.trim() || !newProdPrice || !newProdUnit) {
      showToast('لطفاً نام محصول، قیمت و واحد فروش را مشخص نمایید.', 'error');
      return;
    }

    const coverageInfoStr = coverageVal.trim() 
      ? `${coverageVal.trim()} عدد در هر متر ${coverageType === 'square' ? 'مربع' : 'طول'}`
      : undefined;

    const newProductObject: Product = {
      id: `prod-${Date.now()}`,
      name: newProdName.trim(),
      category: newProdCategory,
      pricePerUnit: Number(newProdPrice),
      unit: newProdUnit,
      description: newProdDesc.trim() || 'محصول سفالی درجه یک مناسب کاربری صنعتی و مسکونی.',
      weight: newProdWeight.trim() || undefined,
      dimensions: newProdDimensions.trim() || undefined,
      coverageInfo: coverageInfoStr,
      isEnabled: true,
    };

    onAddProduct(newProductObject);

    // Reset forms
    setNewProdName('');
    setNewProdPrice(10000);
    setNewProdUnit('عدد');
    setNewProdDesc('');
    setNewProdWeight('');
    setNewProdDimensions('');
    setCoverageVal('');
    showToast('محصول جدید با موفقیت به بانک کالا صنعت اضافه گردید.', 'success');
  };

  // Shipping Company submit form
  const handleShippingCompanySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSCName.trim() || !newSCCode.trim() || !newSCPhone.trim()) {
      showToast('لطفاً نام شرکت حمل‌ و نقل، کد و شماره تماس را وارد نمایید.', 'error');
      return;
    }

    if (shippingCompanies.some(sc => sc.code.toUpperCase() === newSCCode.trim().toUpperCase())) {
      showToast('این کد شرکت حمل و نقل قبلاً ثبت شده است.', 'error');
      return;
    }

    const newCompany: ShippingCompany = {
      id: `sc-${Date.now()}`,
      name: newSCName.trim(),
      code: newSCCode.trim().toUpperCase(),
      phoneNumber: newSCPhone.trim(),
      managerName: newSCManagerName.trim() || 'نامشخص',
      isEnabled: true
    };

    onAddShippingCompany(newCompany);

    // Reset forms
    setNewSCName('');
    setNewSCCode('');
    setNewSCPhone('');
    setNewSCManagerName('');
    showToast('شرکت حمل و نقل جدید با موفقیت ثبت گردید.', 'success');
  };

  // Filter orders by active panel tab criteria
  const getTabOrders = () => {
    return orders.filter((order) => {
      // Basic Tab status matches
      if (activeTab === 'PENDING_APPROVAL') {
        if (order.status !== 'PENDING_APPROVAL') return false;
      } else if (activeTab === 'APPROVED_PRIORITIES') {
        if (order.status !== 'APPROVED_BY_SALES') return false;
      } else if (activeTab === 'ARCHIVAL_ORDERS') {
        if (order.status === 'PENDING_APPROVAL' || order.status === 'APPROVED_BY_SALES') return false;
        
        // اعمال فیلتر هوشمند زیرشاخه آرشیو
        if (archiveStatusFilter !== 'ALL') {
          if (order.status !== archiveStatusFilter) return false;
        }
      } else {
        return false; // Non-orders tabs handled separately
      }

      // Query Filter match
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          order.customerName.toLowerCase().includes(q) ||
          order.productName.toLowerCase().includes(q) ||
          order.orderNumber.toLowerCase().includes(q) ||
          order.destinationCity.toLowerCase().includes(q)
        );
      }
      return true;
    });
  };

  const visibleOrders = getTabOrders();

  const statusTags: Record<OrderStatus, { text: string; css: string }> = {
    PENDING_APPROVAL: { text: 'در انتظار تایید', css: 'bg-amber-100 text-amber-800' },
    APPROVED_BY_SALES: { text: 'تایید شده (در صف اولویت‌بندی)', css: 'bg-indigo-100 text-indigo-800' },
    SENT_TO_FACTORY: { text: 'ارسال شده به کارخانه', css: 'bg-blue-100 text-blue-800' },
    VEHICLE_ASSIGNED: { text: 'وسیله نقلیه تخصیص یافته', css: 'bg-amber-100 text-amber-800' },
    LOADED_AND_DISPATCHED: { text: 'بارگیری شده و حرکت کرده', css: 'bg-emerald-100 text-emerald-800' },
    REJECTED: { text: 'رد شده توسط مدیریت', css: 'bg-rose-100 text-rose-800' },
  };

  return (
    <div className="space-y-6 text-right dir-rtl font-sans" id="manager-dashboard">
      
      {/* High-level status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="manager-metrics-row">
        
        {/* Metric 1 */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between" id="metric-pending">
          <div className="p-2.5 bg-amber-50 rounded-lg text-amber-600">
            <Clock className="w-5 h-5" />
          </div>
          <div className="text-right">
            <span className="text-slate-400 text-[10px] block">در انتظار بررسی</span>
            <strong className="text-base font-bold text-slate-800 font-mono">{totalPending} مورد</strong>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between" id="metric-priority">
          <div className="p-2.5 bg-indigo-50 rounded-lg text-indigo-600">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div className="text-right">
            <span className="text-slate-400 text-[10px] block">آماده ارسال / اولویت‌بندی</span>
            <strong className="text-base font-bold text-slate-800 font-mono">{approvedButPendingDispatch.length} سفارش</strong>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between" id="metric-factory">
          <div className="p-2.5 bg-blue-50 rounded-lg text-blue-600">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="text-right">
            <span className="text-slate-400 text-[10px] block">در خط کارخانه</span>
            <strong className="text-base font-bold text-slate-800 font-mono">{sentToFactoryCount} سفارش</strong>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between" id="metric-in-transit">
          <div className="p-2.5 bg-emerald-50 rounded-lg text-emerald-600">
            <Navigation className="w-5 h-5" />
          </div>
          <div className="text-right">
            <span className="text-slate-400 text-[10px] block">در مسیر بارگیری/حمل</span>
            <strong className="text-base font-bold text-slate-800 font-mono">{inTransitCount} سفارش</strong>
          </div>
        </div>
      </div>

      {/* Main workspace navigation tabs */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 md:p-6" id="manager-control-hub">
        
        {/* Workspace navigation */}
        <div className="flex flex-wrap items-center justify-between border-b border-slate-200 pb-4 mb-5 gap-3">
          <div className="flex flex-wrap gap-1.5" id="manager-panel-tabs">
            {/* Tab 1: Pending */}
            <button
              onClick={() => setActiveTab('PENDING_APPROVAL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'PENDING_APPROVAL'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>کارتابل تایید سفارشات ({totalPending})</span>
            </button>

            {/* Tab 2: Re-order/Dispatch approved */}
            <button
              onClick={() => setActiveTab('APPROVED_PRIORITIES')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'APPROVED_PRIORITIES'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>اولویت‌بندی ارسال کارخانه ({approvedButPendingDispatch.length})</span>
            </button>

            {/* Tab 3: Agents */}
            <button
              onClick={() => setActiveTab('AGENTS_MGMT')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'AGENTS_MGMT'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>مدیریت نمایندگی‌ها ({agents.length})</span>
            </button>

            {/* Tab 4: Products */}
            <button
              onClick={() => setActiveTab('PRODUCTS_MGMT')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'PRODUCTS_MGMT'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>تعریف و مدیریت محصولات ({products.length})</span>
            </button>

            {/* Tab 5: Shipping Companies */}
            <button
              onClick={() => setActiveTab('SHIPPING_MGMT')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'SHIPPING_MGMT'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              <Truck className="w-3.5 h-3.5 text-blue-500" />
              <span>شرکت‌های حمل و نقل ({shippingCompanies.length})</span>
            </button>

            {/* Tab 6: Archival & Factory Tracking */}
            <button
              onClick={() => setActiveTab('ARCHIVAL_ORDERS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'ARCHIVAL_ORDERS'
                  ? 'bg-slate-700 text-white shadow-sm ring-2 ring-slate-300'
                  : 'bg-indigo-50/70 text-indigo-900 border border-indigo-100 hover:bg-indigo-100'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-indigo-600" />
              <span className="font-extrabold text-slate-900">رهگیری لایو کارخانه و آرشیو ({orders.filter(o => o.status !== 'PENDING_APPROVAL' && o.status !== 'APPROVED_BY_SALES').length} مورد)</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            </button>
          </div>

          {/* Quick query filter (only for order views) */}
          {(activeTab === 'PENDING_APPROVAL' || activeTab === 'APPROVED_PRIORITIES' || activeTab === 'ARCHIVAL_ORDERS') && (
            <div className="relative w-full md:w-64" id="manager-tab-search">
              <input
                type="text"
                placeholder="جستجو در فاکتورها..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 pl-3 pr-9 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-auto right-3.5 top-2.5" />
            </div>
          )}
        </div>

        {/* RENDER SECTION A: CARPARTY ORDERS WAITING FOR APPROVAL (تایید سفارش) */}
        {activeTab === 'PENDING_APPROVAL' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-amber-50/50 rounded-xl p-3 border border-amber-100">
              <div className="text-[11px] text-slate-600 flex items-center gap-2 justify-end order-2 sm:order-1 sm:text-right">
                <span>کلیه سفارشات نمایندگی‌ها ابتدا به کارتابل بالا آمده و در انتظار ارزیابی اعتبار مالی/فروش قرار می‌گیرند.</span>
                <Clock className="w-4 h-4 text-amber-500 flex-shrink-0" />
              </div>
              {visibleOrders.length > 0 && onApproveAllOrders && (
                <button
                  type="button"
                  onClick={() => {
                    askConfirm(
                      'تأیید دسته‌جمعی تمامی سفارشات',
                      `آیا مایلید کلیه ${visibleOrders.length} سفارش معلق در صف را یک‌جا تایید کرده و به صف تامین و بارگیری ارجاع دهید؟`,
                      () => {
                        onApproveAllOrders();
                      }
                    );
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-3.5 rounded-lg text-xs cursor-pointer transition-colors flex items-center gap-1.5 shadow-sm shrink-0 self-start sm:self-auto order-1 sm:order-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>تأیید همه سفارش‌ها ({visibleOrders.length} مورد)</span>
                </button>
              )}
            </div>

            {visibleOrders.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-xl" id="empty-pending-mgr">
                <p className="text-slate-400 text-xs font-bold">هیچ سفارشی در انتظار تایید وجود ندارد.</p>
              </div>
            ) : (
              visibleOrders.map((order) => (
                <div key={order.id} className="border border-amber-200/80 bg-amber-50/5 rounded-xl p-4 md:p-5 hover:border-amber-300 transition-all">
                  <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-rose-100/30">
                    <div className="flex items-center gap-2">
                      <strong className="text-slate-800 text-sm">{order.customerName}</strong>
                      <span className="text-[10px] bg-slate-100 text-slate-500 font-mono py-0.5 px-2 rounded">کد نماینده: {order.agentCode}</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-slate-700">{order.orderNumber}</span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs py-3.5">
                    <div>
                      <span className="text-slate-400 block mb-0.5">محصول مورد معامله:</span>
                      <strong className="text-slate-800">{order.productName}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block mb-0.5">مقدار کل سفارش:</span>
                      <strong className="text-slate-800 font-mono">{order.quantity.toLocaleString()} {order.unit}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block mb-0.5">نشانی کارگاه مقصد:</span>
                      <strong className="text-slate-800 flex items-center justify-end gap-1">
                        <span>{order.destinationCity}</span>
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block mb-0.5">درج حواله سیستمی:</span>
                      <strong className="text-slate-500 font-mono">{new Date(order.createdAt).toLocaleString('fa-IR')}</strong>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-2.5 rounded-lg text-[11px] text-slate-600 mb-4 space-y-1 text-right">
                    <p>📍 <strong>آدرس تخلیه کالا:</strong> {order.exactAddress}</p>
                    <p>📞 <strong>تلفن تخلیه کالا:</strong> {order.phoneNumber}</p>
                    {order.notes && <p className="text-slate-600 font-medium">📝 <strong>ملاحظات ارسال:</strong> {order.notes}</p>}
                  </div>

                  <div className="flex justify-end gap-2.5">
                    {rejectionInputId !== order.id ? (
                      <button
                        onClick={() => setRejectionInputId(order.id)}
                        className="bg-rose-50 hover:bg-rose-100 text-rose-700 py-1.5 px-3.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>رد حواله سفارش</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 bg-rose-50 p-1.5 rounded-lg border border-rose-200">
                        <input
                          type="text"
                          placeholder="علت رد سفارش..."
                          value={rejectionReason}
                          onChange={(e) => setRejectionReason(e.target.value)}
                          className="bg-white border border-rose-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-rose-500 font-sans"
                        />
                        <button
                          onClick={() => handleRejectSubmit(order.id)}
                          className="bg-rose-600 hover:bg-rose-700 text-white rounded py-1 px-2.5 text-xs font-bold cursor-pointer"
                        >
                          تایید لغو
                        </button>
                        <button
                          onClick={() => {
                            setRejectionInputId(null);
                            setRejectionReason('');
                          }}
                          className="text-slate-400 hover:text-slate-600 text-xs p-1"
                        >
                          انصراف
                        </button>
                      </div>
                    )}

                    <button
                      onClick={() => onApproveOrder(order.id)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white py-1.5 px-4 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>تأیید سفارش و انتقال به خط صف</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* RENDER SECTION B: PRIORITIZER FLOW AND SEND TO FACTORY (اولویت‌بندی و ارسال به کارخانه) */}
        {activeTab === 'APPROVED_PRIORITIES' && (
          <div className="space-y-4">
            <div className="bg-indigo-50 border border-indigo-150 rounded-xl p-4 text-[11px] text-indigo-950 flex flex-col md:flex-row md:items-center justify-between gap-4 text-right">
              <div className="space-y-1">
                <strong className="block mb-0.5 font-bold">🔄 فرآیند تایید اولویت‌بندی ارسال بارها به کارخانه (فروش تا ترابری)</strong>
                <span className="text-slate-600 block">می‌توانید ترتیب اولویت ارسال را متناسب با صلاحدید مدیریت تغییر دهید. سفارش‌ها به ترتیب نوبت پشت سر هم قرار می‌گیرند و پس از آماده‌سازی اولویت ارسالی دکمه «ارسال نهایی به کارخانه» را بفشارید.</span>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                <span className="px-2.5 py-2 bg-indigo-200 text-indigo-800 rounded font-bold self-start md:self-auto text-center font-mono">
                  صف فعال: {visibleOrders.length} مورد
                </span>
                {visibleOrders.length > 0 && onDispatchAllToFactory && (
                  <button
                    type="button"
                    onClick={() => {
                      askConfirm(
                        'ارسال نهایی و دسته‌جمعی به کارخانه',
                        'آیا مایلید تمامی سفارشات تأیید شده حاضر در صف را به بخش تولید و ترابری کارخانه جهت تخصیص فوری کامیون ارسال نمایید؟',
                        () => {
                          onDispatchAllToFactory();
                        }
                      );
                    }}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-3.5 rounded-lg text-xs cursor-pointer transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <Navigation className="w-4 h-4" />
                    <span>ارسال همه به کارخانه</span>
                  </button>
                )}
              </div>
            </div>

            {visibleOrders.length === 0 ? (
              <div className="text-center py-16 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <p className="text-slate-400 text-xs">هیچ سفارش بررسی‌شده‌ای در صف اولویت‌بندی موجود نیست.</p>
                <p className="text-slate-500 text-[11px] mt-1">سفارش‌ها را ابتدا از تب قبلی تایید کنید تا وارد این بخش شوند.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {visibleOrders.map((order, idx) => (
                  <div key={order.id} className="border border-slate-200 bg-white rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm hover:border-slate-300 transition-all">
                    
                    {/* Visual Number indicator indicating sequence */}
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 bg-indigo-50 border border-indigo-200 rounded-full flex items-center justify-center font-mono font-black text-indigo-700 text-xs" title={`اولویت نوبت ${idx + 1}`}>
                        {idx + 1}
                      </div>

                      <div className="text-right">
                        <div className="flex items-center gap-2">
                          <strong className="text-slate-800 text-sm">{order.customerName}</strong>
                          <span className="text-[9px] bg-slate-100 text-slate-500 font-mono py-0.5 px-1.5 rounded">{order.orderNumber}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {order.productName} • <strong className="font-mono text-slate-700 text-[11px]">{order.quantity.toLocaleString()} {order.unit}</strong>
                        </p>
                        <p className="text-[10px] text-slate-400">📍 مقصد: {order.destinationCity}</p>
                      </div>
                    </div>

                    {/* Operational tools: Sequence up/down arrows and Send button */}
                    <div className="flex items-center justify-end gap-2.5 pt-3 md:pt-0 border-t md:border-t-0 border-slate-100">
                      
                      {/* Priority shufflers */}
                      <div className="flex gap-1">
                        <button
                          onClick={() => movePriority(idx, 'UP')}
                          disabled={idx === 0}
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded text-slate-600 disabled:opacity-30 disabled:hover:bg-slate-100 cursor-pointer"
                          title="انتقال به اولویت بالاتر ⬆️"
                        >
                          <MoveUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => movePriority(idx, 'DOWN')}
                          disabled={idx === visibleOrders.length - 1}
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded text-slate-600 disabled:opacity-30 disabled:hover:bg-slate-100 cursor-pointer"
                          title="انتقال به اولویت پایین‌تر ⬇️"
                        >
                          <MoveDown className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Explicit SEND action - moves to factory line */}
                      <button
                        onClick={() => onDispatchToFactory(order.id)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white py-1.5 px-3 rounded-lg text-[11px] font-bold cursor-pointer transition-colors flex items-center gap-1 shadow-sm"
                      >
                        <Navigation className="w-3.5 h-3.5" />
                        <span>ارسال نهایی به کارخانه</span>
                      </button>
                    </div>

                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* RENDER SECTION C: AGENTS WORKSPACE (مدیریت نمایندگی‌ها) */}
        {activeTab === 'AGENTS_MGMT' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-right" id="agents-mgmt-panel">
            
            {/* Left Box: Simple list of agents (Take 7 columns) */}
            <div className="lg:col-span-7 space-y-4">
              <h4 className="font-bold text-slate-800 text-xs flex items-center justify-end gap-1 mb-2">
                <span>فهرست کلیه نمایندگان فعال و غیرفعال</span>
                <Users className="w-4 h-4 text-slate-500" />
              </h4>

              {agents.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-xl" id="no-agents-found">
                  <p className="text-slate-400 text-xs">هیچ نمایندگی ثبت شده‌ای موجود نیست.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {agents.map((agent) => (
                    <div 
                      key={agent.id} 
                      className={`border rounded-xl p-4 transition-all bg-white shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        agent.isEnabled ? 'border-slate-200' : 'border-rose-200 bg-rose-50/10'
                      }`}
                    >
                      <div className="text-right">
                        <div className="flex items-center gap-2">
                          <strong className="text-slate-800 text-sm">{agent.alias}</strong>
                          <span className="text-[9px] bg-slate-100 text-slate-500 font-mono py-0.5 px-2 rounded">کد: {agent.agentCode}</span>
                          {!agent.isEnabled && <span className="text-[9px] bg-rose-100 text-rose-700 py-0.5 px-2 rounded-full font-bold">غیرفعال‌شده</span>}
                        </div>
                        <p className="text-[11px] text-slate-600 mt-1 font-sans">
                          💼 مسئول: <strong>{agent.fullName}</strong> • محدوده: {agent.area}
                        </p>
                        <p className="text-[10px] text-slate-400 leading-snug">📍 آدرس: {agent.address}</p>
                        <p className="text-[10px] text-slate-400 font-mono">📞 تماس: {agent.phoneNumber}</p>
                      </div>

                      {/* Utility buttons for agents */}
                      <div className="flex items-center justify-end gap-2 border-t sm:border-t-0 border-slate-100 pt-2 sm:pt-0">
                        <button
                          onClick={() => onToggleAgent(agent.id)}
                          className={`text-[10px] py-1 px-2.5 rounded-lg font-bold transition-all cursor-pointer ${
                            agent.isEnabled 
                              ? 'bg-rose-50 hover:bg-rose-100 text-rose-700' 
                              : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {agent.isEnabled ? 'غیرفعال‌سازی' : 'فعال‌سازی'}
                        </button>
                        <button
                          onClick={() => {
                            askConfirm(
                              'لغو مجوز نمایندگی و حذف ثبت‌نام',
                              `آیا نسبت به حذف و غیرفعال‌سازی دائمی نمایندگی «${agent.alias}» با کد نمایندگی ${agent.agentCode} اطمینان دارید؟`,
                              () => {
                                onDeleteAgent(agent.id);
                              }
                            );
                          }}
                          className="bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 p-1.5 rounded-lg transition-all cursor-pointer"
                          title="امکان حذف دائم"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right Box: Register agent Form (Take 5 columns) */}
            <div className="lg:col-span-5 bg-slate-50 p-4 md:p-5 rounded-xl border border-slate-200 shadow-inner">
              <h4 className="font-bold text-slate-800 text-xs flex items-center justify-end gap-1 mb-4">
                <span>افزودن و ثبت پروتکل نمایندگی جدید</span>
                <PlusCircle className="w-4 h-4 text-emerald-600" />
              </h4>

              <form onSubmit={handleAgentSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-slate-600 text-[10px] mb-1 font-bold">نام و نام خانوادگی نماینده مسئول:</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: آقای محمدی"
                    value={newAgentName}
                    onChange={(e) => setNewAgentName(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 text-[10px] mb-1 font-bold">نام مستعار یا برند نمایندگی (جهت نمایش):</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: نمایندگی مازندران (احمد‌نژاد)"
                    value={newAgentAlias}
                    onChange={(e) => setNewAgentAlias(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 text-[10px] mb-1 font-bold">کد یکتای نمایندگی:</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: AG-2342"
                    value={newAgentCode}
                    onChange={(e) => setNewAgentCode(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono text-left"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-600 text-[10px] mb-1 font-bold">شماره ارتباطی نمایندگی:</label>
                    <input
                      type="text"
                      required
                      placeholder="0911..."
                      value={newAgentPhone}
                      onChange={(e) => setNewAgentPhone(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono text-left"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 text-[10px] mb-1 font-bold">محدوده فعالیت جغرافیایی:</label>
                    <input
                      type="text"
                      placeholder="مثال: بابل و بابلسر"
                      value={newAgentArea}
                      onChange={(e) => setNewAgentArea(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 text-[10px] mb-1 font-bold">آدرس دقیق انبار نمایندگی:</label>
                  <textarea
                    rows={2}
                    required
                    placeholder="نشانی کامل دفتر یا انبار بارگیری مجدد نمایندگی..."
                    value={newAgentAddress}
                    onChange={(e) => setNewAgentAddress(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-slate-850 hover:bg-slate-900 text-white font-bold py-2 px-4 rounded-lg text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>ثبت و صدور مجوز نمایندگی</span>
                </button>
              </form>
            </div>
          </div>
        )}

        {/* RENDER SECTION D: FACTORY PRODUCTS MANAGEMENT (تعریف و مدیریت محصولات) */}
        {activeTab === 'PRODUCTS_MGMT' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-right" id="products-mgmt-panel">
            
            {/* Left Box: Product Card Grid (Take 7 columns) */}
            <div className="lg:col-span-7 space-y-4">
              <h4 className="font-bold text-slate-800 text-xs flex items-center justify-end gap-1 mb-2">
                <span>کاتالوگ جاری محصولات سفالی و آجر ساختمان</span>
                <Briefcase className="w-4 h-4 text-slate-500" />
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {products.map((prod) => (
                  <div 
                    key={prod.id} 
                    className={`border rounded-xl p-4 shadow-sm text-right space-y-2 flex flex-col justify-between transition-all bg-white ${
                      prod.isEnabled !== false ? 'border-slate-200' : 'border-rose-200 bg-rose-50/10 opacity-75'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] bg-slate-100 text-slate-600 border border-slate-200 py-0.5 px-2 rounded font-bold">
                          {prod.category === 'roofing' ? 'سفال سقف' : prod.category === 'bricks' ? 'آجر و بلوک سفالی' : 'آجر نما و نسوز'}
                        </span>
                        {prod.isEnabled === false && (
                          <span className="text-[9px] bg-rose-100 text-rose-700 py-0.5 px-1.5 rounded-full font-bold">غیرفعال</span>
                        )}
                      </div>
                      <strong className="text-slate-800 text-sm block">{prod.name}</strong>
                      <p className="text-[11px] text-slate-500 leading-relaxed text-justify h-16 overflow-y-auto pr-1">
                        {prod.description}
                      </p>
                      
                      {/* Technical metrics displaying Weight/Dimension/Coverage */}
                      <div className="bg-slate-50 p-2 rounded text-[10px] text-slate-500 space-y-0.5 border border-slate-100 font-sans">
                        {prod.weight && <p>⚖️ <strong>وزن واحد:</strong> {prod.weight}</p>}
                        {prod.dimensions && <p>📐 <strong>ابعاد دقیق:</strong> {prod.dimensions}</p>}
                        {prod.coverageInfo && <p>📊 <strong>مترطول/مربع:</strong> {prod.coverageInfo}</p>}
                        <p className="text-emerald-700 font-bold font-mono text-xs pt-1 border-t border-slate-200/50">
                          قیمت هر {prod.unit}: {prod.pricePerUnit.toLocaleString()} تومان
                        </p>
                      </div>
                    </div>

                    {/* Operational buttons for products */}
                    <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-2.5 mt-2">
                      <button
                        type="button"
                        onClick={() => onToggleProduct(prod.id)}
                        className={`text-[10px] py-1 px-2.5 rounded-lg font-bold transition-all cursor-pointer ${
                          prod.isEnabled !== false 
                            ? 'bg-rose-50 hover:bg-rose-100 text-rose-700' 
                            : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {prod.isEnabled !== false ? 'غیرفعال‌سازی' : 'فعال‌سازی'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          askConfirm(
                            'حذف کالا از کاتالوگ فروشگاه',
                            `آیا می‌خواهید محصول «${prod.name}» را به طور کامل از سبد توزیع و تولیدات فعال کارخانه حذف کنید؟`,
                            () => {
                              onDeleteProduct(prod.id);
                            }
                          );
                        }}
                        className="bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 p-1.5 rounded-lg transition-all cursor-pointer"
                        title="حذف محصول"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Box: Register new Product form (Take 5 columns) */}
            <div className="lg:col-span-5 bg-slate-50 p-4 md:p-5 rounded-xl border border-slate-200 shadow-inner">
              <h4 className="font-bold text-slate-800 text-xs flex items-center justify-end gap-1 mb-4">
                <span>تعریف کالای جدید کارخانه با مشخصات</span>
                <FolderPlus className="w-4 h-4 text-emerald-600" />
              </h4>

              <form onSubmit={handleProductSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-slate-600 text-[10px] mb-1 font-bold">نام و عنوان محصول سفالی جدید:</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: سفال سقف لعاب‌دار آبی فیروزه‌ای"
                    value={newProdName}
                    onChange={(e) => setNewProdName(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-600 text-[10px] mb-1 font-bold">دسته‌بندی طبقاتی:</label>
                    <select
                      value={newProdCategory}
                      onChange={(e) => setNewProdCategory(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans cursor-pointer"
                    >
                      <option value="roofing">سفال سقف</option>
                      <option value="bricks">آجر و بلوک سفالی</option>
                      <option value="facade">آجر نما و نسوز</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 text-[10px] mb-1 font-bold">واحد شمارش فروش:</label>
                    <select
                      value={newProdUnit}
                      onChange={(e) => setNewProdUnit(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans cursor-pointer"
                    >
                      <option value="عدد">عدد (سفال سقف)</option>
                      <option value="قالب">قالب (آجرها)</option>
                      <option value="مترطول">مترطول</option>
                      <option value="تن">تن فیزیکی</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-600 text-[10px] mb-1 font-bold">قیمت هر واحد (تومان):</label>
                    <input
                      type="number"
                      required
                      min="1"
                      placeholder="مثال: ۱۵۰۰۰"
                      value={newProdPrice}
                      onChange={(e) => setNewProdPrice(Number(e.target.value))}
                      className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono text-center font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 text-[10px] mb-1 font-bold">وزن واحد نمونه کالا (⚖️):</label>
                    <input
                      type="text"
                      placeholder="مثال: ۳.۲ کیلوگرم"
                      value={newProdWeight}
                      onChange={(e) => setNewProdWeight(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans text-center"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-600 text-[10px] mb-1 font-bold">ابعاد فیزیکی نمونه (📐):</label>
                    <input
                      type="text"
                      placeholder="مثال: ۲۵ × ۴۰ سانتی‌متر"
                      value={newProdDimensions}
                      onChange={(e) => setNewProdDimensions(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 text-[10px] mb-1 font-bold">نوع پوشش (متر طول vs مربع):</label>
                    <select
                      value={coverageType}
                      onChange={(e) => setCoverageType(e.target.value as 'square' | 'linear')}
                      className="w-full bg-white border border-slate-200 rounded px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans cursor-pointer"
                    >
                      <option value="square">برحسب مترمربع</option>
                      <option value="linear">برحسب متر طول</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 text-[10px] mb-1 font-bold">تعداد در متراژ کلید اصلی (مثال: ۱۴):</label>
                  <input
                    type="text"
                    placeholder={`مثال: ۱۴ قالب در هر متر ${coverageType === 'square' ? 'مربع' : 'طول'}`}
                    value={coverageVal}
                    onChange={(e) => setCoverageVal(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 text-[10px] mb-1 font-bold">توضیحات معرفی و کاربرد کالا:</label>
                  <textarea
                    rows={2}
                    placeholder="جهت دیوارهای خارجی، مقاومت دمایی بالا، نوع پخت و لعاب طبیعی..."
                    value={newProdDesc}
                    onChange={(e) => setNewProdDesc(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-lg text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>ثبت و انژکت محصول به کل چرخه</span>
                </button>
              </form>
            </div>
          </div>
        )}

        {/* RENDER SECTION F: SHIPPING COMPANIES MANAGEMENT (مدیریت شرکت‌های حمل و نقل) */}
        {activeTab === 'SHIPPING_MGMT' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="shipping-companies-workspace">
            
            {/* Right block: Companies List (2/3 width) */}
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-600 flex items-center justify-between gap-1.5">
                <div className="text-right">
                  <h4 className="font-bold text-slate-800">ناوگان‌های همکار طبرستان</h4>
                  <p className="text-[10px] text-slate-500 mt-0.5">در زمان تخصیص وسیله نقلیه در کارخانه، امکان ارجاع تکی یا گروهی سفارش به ترابری شرکت‌های منتخب زیر فراهم خواهد بود.</p>
                </div>
                <Truck className="w-5 h-5 text-indigo-500 flex-shrink-0" />
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-right border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-bold border-b border-rose-100">
                      <th className="p-3">نام شرکت حمل و نقل</th>
                      <th className="p-3">کد ترابری</th>
                      <th className="p-3">مدیر عامل / رابط</th>
                      <th className="p-3">شماره تماس پشتیبانی</th>
                      <th className="p-3 text-center">وضعیت همکاری</th>
                      <th className="p-3 text-center">عملیات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shippingCompanies.map((company) => (
                      <tr key={company.id} className="border-b border-slate-100 hover:bg-slate-50 transition-all">
                        <td className="p-3 font-bold text-slate-900 flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded bg-blue-500 block"></span>
                          <span>{company.name}</span>
                        </td>
                        <td className="p-3 font-mono text-slate-600">{company.code}</td>
                        <td className="p-3 text-slate-600">{company.managerName}</td>
                        <td className="p-3 font-mono text-slate-600">{company.phoneNumber}</td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => onToggleShippingCompany(company.id)}
                            className={`px-2 py-1 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                              company.isEnabled
                                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                            }`}
                          >
                            {company.isEnabled ? '✅ فعال و در دسترس' : '❌ تعلیق موقت'}
                          </button>
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => {
                              askConfirm(
                                'حذف شرکت حمل و نقل',
                                `آیا از حذف شرکت حمل و نقل «${company.name}» مطمئن هستید؟ با این کار دیگر امکان ارجاع سفارش به این شرکت وجود نخواهد داشت.`,
                                () => {
                                  onDeleteShippingCompany(company.id);
                                  showToast(`شرکت حمل و نقل ${company.name} از ناوگان حذف شد.`, 'info');
                                }
                              );
                            }}
                            className="p-1 px-1.5 hover:bg-rose-50 text-rose-500 hover:text-rose-700 rounded transition-all cursor-pointer"
                            title="حذف شرکت"
                          >
                            <Trash2 className="w-4 h-4 mx-auto" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {shippingCompanies.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400">
                          هیچ شرکت حمل و نقل تعریف شده‌ای یافت نشد. لطفاً از پنل سمت چپ اقدام نمایید.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Left block: Create Company Form (1/3 width) */}
            <div className="space-y-4">
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-xs font-extrabold text-slate-800 border-b border-slate-100 pb-2 mb-4 flex items-center justify-end gap-1.5">
                  <span>تعریف آژانس حمل و نقل همکار جدید</span>
                  <PlusCircle className="w-4 h-4 text-emerald-600" />
                </h3>

                <form onSubmit={handleShippingCompanySubmit} className="space-y-4 text-right">
                  <div>
                    <label className="block text-slate-600 text-[10px] mb-1 font-bold">نام شرکت حمل و نقل:</label>
                    <input
                      type="text"
                      required
                      placeholder="مثال: ترابری جهان گستر شمال"
                      value={newSCName}
                      onChange={(e) => setNewSCName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 text-[10px] mb-1 font-bold">کد یکتا ترابری (به انگلیسی):</label>
                    <input
                      type="text"
                      required
                      placeholder="مثال: TRANS-NORTH"
                      value={newSCCode}
                      onChange={(e) => setNewSCCode(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-850 font-mono text-left focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 text-[10px] mb-1 font-bold">نام مدیر عامل / مسئول ترابری:</label>
                    <input
                      type="text"
                      placeholder="مثال: جناب آقای مهندس موسوی"
                      value={newSCManagerName}
                      onChange={(e) => setNewSCManagerName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 text-[10px] mb-1 font-bold">تلفن پشتیبانی و هماهنگی:</label>
                    <input
                      type="text"
                      required
                      placeholder="مثال: 01133224422"
                      value={newSCPhone}
                      onChange={(e) => setNewSCPhone(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 font-mono text-left focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-lg text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>افزودن و فعال‌سازی شرکت حمل</span>
                  </button>
                </form>
              </div>
            </div>

          </div>
        )}

        {/* RENDER SECTION E: FACTOR LOGS ARCHIVE (آرشیو کل فاکتورها) */}
        {activeTab === 'ARCHIVAL_ORDERS' && (
          <div className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] text-slate-600 flex items-center justify-end gap-1.5">
              <span>در زیر می‌توانید وضعیت تمامی حواله‌های صادر شده گذشته، رد شده یا ارسال شده به مقصد را دنبال کنید.</span>
              <FileText className="w-4 h-4 text-slate-500 flex-shrink-0" />
            </div>

            {/* کلیدهای فیلتر هوشمند برای ردیابی وضعیت در کارخانه و ترابری */}
            <div className="flex flex-wrap gap-1.5 bg-slate-50/55 p-2 rounded-xl border border-slate-200 justify-end" id="archival-sub-filters">
              <span className="text-[10px] text-slate-400 font-bold self-center ml-2">📍 ردیابی فرآیند ارسال کارخانه:</span>
              <button
                type="button"
                onClick={() => setArchiveStatusFilter('ALL')}
                className={`py-1 px-2.5 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${
                  archiveStatusFilter === 'ALL'
                    ? 'bg-slate-700 text-white shadow-sm font-bold'
                    : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200/60'
                }`}
              >
                همه ({orders.filter(o => o.status !== 'PENDING_APPROVAL' && o.status !== 'APPROVED_BY_SALES').length})
              </button>
              <button
                type="button"
                onClick={() => setArchiveStatusFilter('SENT_TO_FACTORY')}
                className={`py-1 px-2.5 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${
                  archiveStatusFilter === 'SENT_TO_FACTORY'
                    ? 'bg-blue-600 text-white shadow-sm font-bold'
                    : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200/60'
                }`}
              >
                ۱. خط کارخانه ({orders.filter(o => o.status === 'SENT_TO_FACTORY').length})
              </button>
              <button
                type="button"
                onClick={() => setArchiveStatusFilter('VEHICLE_ASSIGNED')}
                className={`py-1 px-2.5 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${
                  archiveStatusFilter === 'VEHICLE_ASSIGNED'
                    ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                    : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200/60'
                }`}
              >
                ۲. تخصیص خودرو ({orders.filter(o => o.status === 'VEHICLE_ASSIGNED').length})
              </button>
              <button
                type="button"
                onClick={() => setArchiveStatusFilter('LOADED_AND_DISPATCHED')}
                className={`py-1 px-2.5 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${
                  archiveStatusFilter === 'LOADED_AND_DISPATCHED'
                    ? 'bg-emerald-600 text-white shadow-sm font-bold'
                    : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200/60'
                }`}
              >
                ۳. ترخیص و حرکت ({orders.filter(o => o.status === 'LOADED_AND_DISPATCHED').length})
              </button>
              <button
                type="button"
                onClick={() => setArchiveStatusFilter('REJECTED')}
                className={`py-1 px-2.5 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${
                  archiveStatusFilter === 'REJECTED'
                    ? 'bg-rose-600 text-white shadow-sm font-bold'
                    : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200/60'
                }`}
              >
                ابطال‌شده ها ({orders.filter(o => o.status === 'REJECTED').length})
              </button>
            </div>

            {visibleOrders.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <p className="text-slate-400 text-xs">هیچ رکوردی در بخش آرشیو یافت نشد.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {visibleOrders.map((order) => (
                  <div key={order.id} className="border border-slate-200 bg-white rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-slate-300 transition-all">
                    
                    <div className="text-right">
                      <div className="flex items-center gap-2">
                        <strong className="text-slate-800 text-sm">{order.customerName}</strong>
                        <span className="text-[10px] bg-slate-100 text-slate-500 font-mono py-0.5 px-1.5 rounded">{order.orderNumber}</span>
                        <span className={`text-[9px] font-bold py-0.5 px-2 rounded-full ${statusTags[order.status]?.css}`}>
                          {statusTags[order.status]?.text}
                        </span>
                      </div>
                      
                      <p className="text-xs text-slate-600 mt-1">
                        📦 محصول: <strong>{order.productName}</strong> ({order.quantity.toLocaleString()} {order.unit})
                      </p>
                      <p className="text-[10px] text-slate-400">📍 مقصد: {order.destinationCity} • ثبت‌شده در: {new Date(order.createdAt).toLocaleString('fa-IR')}</p>
                    </div>

                    {order.vehicleDetails && (
                      <div className="bg-emerald-50/50 rounded-lg p-2 border border-emerald-100/50 text-[10px] text-slate-600 font-mono text-right shrink-0">
                        <p className="font-bold text-emerald-800 text-[11px]">🚒 ترابری اختصاص‌یافته:</p>
                        <p>{order.vehicleDetails.vehicleType} • {order.vehicleDetails.driverName}</p>
                        <p>📞 {order.vehicleDetails.driverPhone} • 🏷️ {order.vehicleDetails.licensePlate}</p>
                      </div>
                    )}

                    {order.status === 'REJECTED' && order.rejectionReason && (
                      <div className="bg-rose-50 rounded border border-rose-100 p-2 text-[10px] text-rose-800 shrink-0 text-right">
                        <strong>❌ علت لغو حواله:</strong> {order.rejectionReason}
                      </div>
                    )}

                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
