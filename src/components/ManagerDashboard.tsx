/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
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
  Truck,
  Edit,
  Printer
} from 'lucide-react';

import { printOrders } from '../utils/printHelper';

interface ManagerDashboardProps {
  orders: Order[];
  products: Product[];
  agents: Agent[];
  shippingCompanies: ShippingCompany[];
  onApproveOrder: (orderId: string) => void;
  onRejectOrder: (orderId: string, reason: string) => void;
  onDispatchToFactory: (orderId: string, comment?: string) => void;
  onUpdateAllOrders: (updatedOrders: Order[]) => void;
  onAddProduct: (newProduct: Product) => Promise<boolean>;
  onToggleProduct: (productId: string) => void;
  onDeleteProduct: (productId: string) => void;
  onUpdateProduct: (productData: Product) => Promise<boolean>;
  onAddAgent: (newAgent: Agent) => Promise<boolean>;
  onToggleAgent: (agentId: string) => void;
  onDeleteAgent: (agentId: string) => void;
  onUpdateAgent: (agentData: Agent) => Promise<boolean>;
  onAddShippingCompany: (newCompany: ShippingCompany) => Promise<boolean>;
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
  onUpdateProduct,
  onAddAgent,
  onToggleAgent,
  onDeleteAgent,
  onUpdateAgent,
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
  const [autoGenAgentCode, setAutoGenAgentCode] = useState(false);

  // Editing state for products and agents
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);

  const startEditingAgent = (agent: Agent) => {
    setEditingAgent(agent);
    setNewAgentName(agent.fullName);
    setNewAgentAlias(agent.alias);
    setNewAgentCode(agent.agentCode || '');
    setNewAgentPhone(agent.phoneNumber);
    setNewAgentAddress(agent.address);
    setNewAgentArea(agent.area);
    setAutoGenAgentCode(false);
  };

  const cancelEditingAgent = () => {
    setEditingAgent(null);
    setNewAgentName('');
    setNewAgentAlias('');
    setNewAgentCode('');
    setNewAgentPhone('');
    setNewAgentAddress('');
    setNewAgentArea('');
    setAutoGenAgentCode(false);
  };

  const startEditingProduct = (prod: Product) => {
    setEditingProduct(prod);
    setNewProdName(prod.name);
    setNewProdCategory(prod.category);
    setNewProdPrice(prod.pricePerUnit);
    setNewProdDesc(prod.description);
    setNewProdWeight(prod.weight || '');
    setNewProdDimensions(prod.dimensions || '');
    setNewProdPrimaryUnit(prod.primaryUnit || 'قالب');
    setNewProdSecondaryUnit(prod.secondaryUnit || 'مترمربع');
    setNewProdConversionRatio(prod.conversionRatio ? String(prod.conversionRatio) : '');
    setHasSecondaryUnit(!!prod.secondaryUnit);
  };

  const cancelEditingProduct = () => {
    setEditingProduct(null);
    setNewProdName('');
    setNewProdPrice(10000);
    setNewProdDesc('');
    setNewProdWeight('');
    setNewProdDimensions('');
    setNewProdPrimaryUnit('قالب');
    setNewProdSecondaryUnit('مترمربع');
    setNewProdConversionRatio('14');
    setHasSecondaryUnit(true);
  };

  // Auto-generate agent code on mount or when the agents list updates
  useEffect(() => {
    if (!autoGenAgentCode) return;
    let maxNum = 1000;
    if (agents && agents.length > 0) {
      agents.forEach(a => {
        const match = a.agentCode?.toUpperCase().match(/^TBN-(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) {
            maxNum = num;
          }
        }
      });
    }
    setNewAgentCode(`TBN-${maxNum + 1}`);
  }, [agents, autoGenAgentCode]);

  // Form: Create Product state
  const [newProdName, setNewProdName] = useState('');
  const [newProdCategory, setNewProdCategory] = useState('roof_tile');
  const [newProdPrice, setNewProdPrice] = useState(10000);
  const [newProdDesc, setNewProdDesc] = useState('');
  const [newProdWeight, setNewProdWeight] = useState('');
  const [newProdDimensions, setNewProdDimensions] = useState('');
  const [hasSecondaryUnit, setHasSecondaryUnit] = useState(true);
  const [newProdPrimaryUnit, setNewProdPrimaryUnit] = useState('قالب');
  const [newProdSecondaryUnit, setNewProdSecondaryUnit] = useState('مترمربع');
  const [newProdConversionRatio, setNewProdConversionRatio] = useState('14');

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
  const handleAgentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newAgentName.trim();
    const alias = newAgentAlias.trim();
    const code = newAgentCode.trim();
    const phone = newAgentPhone.trim();
    const address = newAgentAddress.trim();
    const area = newAgentArea.trim();

    if (!name) {
      showToast('لطفاً نام نماینده را وارد نمایید.', 'error');
      return;
    }
    if (!alias) {
      showToast('لطفاً نام برند یا نام مستعار نمایندگی را وارد نمایید.', 'error');
      return;
    }
    if (!code) {
      showToast('لطفاً کد یکتای نمایندگی را وارد نمایید.', 'error');
      return;
    }
    if (!phone) {
      showToast('لطفاً شماره تماس ارتباطی نمایندگی را وارد نمایید.', 'error');
      return;
    }
    if (!address) {
      showToast('لطفاً آدرس دقیق انبار نمایندگی را وارد نمایید.', 'error');
      return;
    }

    if (!editingAgent && agents.some(a => a.agentCode?.toUpperCase() === code.toUpperCase())) {
      showToast('این کد نمایندگی قبلاً تعریف شده است.', 'error');
      return;
    }

    if (editingAgent) {
      const updatedAgent: Agent = {
        ...editingAgent,
        fullName: name,
        alias: alias,
        agentCode: code,
        phoneNumber: phone,
        address: address,
        area: area || 'نامشخص'
      };
      const success = await onUpdateAgent(updatedAgent);
      if (success) {
        cancelEditingAgent();
      }
    } else {
      const newAgentObject: Agent = {
        id: `ag-${Date.now()}`,
        fullName: name,
        alias: alias,
        agentCode: code,
        phoneNumber: phone,
        address: address,
        area: area || 'نامشخص',
        isEnabled: true,
      };

      const success = await onAddAgent(newAgentObject);
      if (success) {
        cancelEditingAgent();
      }
    }
  };

  // Product submit form
  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newProdName.trim();
    const price = newProdPrice;
    const desc = newProdDesc.trim();
    const weight = newProdWeight.trim();
    const dims = newProdDimensions.trim();

    const pUnit = newProdPrimaryUnit.trim();
    const sUnit = hasSecondaryUnit ? newProdSecondaryUnit.trim() : undefined;
    const ratioVal = hasSecondaryUnit ? Number(newProdConversionRatio) : undefined;

    if (!name) {
      showToast('لطفاً نام کالا را وارد نمایید.', 'error');
      return;
    }
    if (!price || price <= 0) {
      showToast('لطفاً قیمت معتبری برای کالا تعیین نمایید.', 'error');
      return;
    }
    if (!pUnit) {
      showToast('لطفاً واحد اصلی کالا را انتخاب یا وارد نمایید.', 'error');
      return;
    }
    if (hasSecondaryUnit) {
      if (!sUnit) {
        showToast('لطفاً واحد فروش (فرعی) را انتخاب کنید.', 'error');
        return;
      }
      if (!ratioVal || ratioVal <= 0 || isNaN(ratioVal)) {
        showToast('لطفاً ضریب تبدیل معتبر وارد کنید (مثلاً ۱۴).', 'error');
        return;
      }
      if (newProdConversionRatio.includes('.')) {
        const decimalPart = newProdConversionRatio.split('.')[1];
        if (decimalPart.length > 1) {
          showToast('ضریب تبدیل حداکثر می‌تواند ۱ رقم اعشار داشته باشد (مثال: ۲.۵).', 'error');
          return;
        }
      }
    }

    // e.g., "هر ۱ مترمربع = ۱۴ قالب" or info representation
    const coverageInfoStr = hasSecondaryUnit && ratioVal
      ? `هر ۱ ${sUnit} = ${ratioVal} ${pUnit}`
      : undefined;

    const finalUnit = hasSecondaryUnit && sUnit ? sUnit : pUnit;

    if (editingProduct) {
      const updatedProduct: Product = {
        ...editingProduct,
        name: name,
        category: newProdCategory,
        pricePerUnit: Number(price),
        unit: finalUnit,
        description: desc || 'محصول سفالی درجه یک مناسب کاربری صنعتی و مسکونی.',
        weight: weight || undefined,
        dimensions: dims || undefined,
        coverageInfo: coverageInfoStr,
        primaryUnit: pUnit,
        secondaryUnit: sUnit,
        conversionRatio: ratioVal,
      };
      const success = await onUpdateProduct(updatedProduct);
      if (success) {
        cancelEditingProduct();
      }
    } else {
      const newProductObject: Product = {
        id: `prod-${Date.now()}`,
        name: name,
        category: newProdCategory,
        pricePerUnit: Number(price),
        unit: finalUnit,
        description: desc || 'محصول سفالی درجه یک مناسب کاربری صنعتی و مسکونی.',
        weight: weight || undefined,
        dimensions: dims || undefined,
        coverageInfo: coverageInfoStr,
        isEnabled: true,
        primaryUnit: pUnit,
        secondaryUnit: sUnit,
        conversionRatio: ratioVal,
      };

      const success = await onAddProduct(newProductObject);
      if (success) {
        cancelEditingProduct();
      }
    }
  };

  // Shipping Company submit form
  const handleShippingCompanySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newSCName.trim();
    const code = newSCCode.trim();
    const phone = newSCPhone.trim();
    const manager = newSCManagerName.trim();

    if (!name) {
      showToast('لطفاً نام آژانس حمل و نقل را وارد نمایید.', 'error');
      return;
    }
    if (!code) {
      showToast('لطفاً کد ترابری آژانس را وارد نمایید.', 'error');
      return;
    }
    if (!phone) {
      showToast('لطفاً شماره تماس پشتیبانی را وارد نمایید.', 'error');
      return;
    }

    if (shippingCompanies.some(sc => sc.code?.toUpperCase() === code.toUpperCase())) {
      showToast('این کد شرکت حمل و نقل قبلاً ثبت شده است.', 'error');
      return;
    }

    const newCompany: ShippingCompany = {
      id: `sc-${Date.now()}`,
      name: name,
      code: code.toUpperCase(),
      phoneNumber: phone,
      managerName: manager || 'نامشخص',
      isEnabled: true
    };

    const success = await onAddShippingCompany(newCompany);
    if (success) {
      // Reset forms
      setNewSCName('');
      setNewSCCode('');
      setNewSCPhone('');
      setNewSCManagerName('');
    }
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
    SENT_TO_FACTORY: { text: 'ارسال شده', css: 'bg-blue-100 text-blue-800' },
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
                      {order.buyerName && (
                        <span className="text-[10.5px] bg-emerald-50 text-emerald-800 font-bold border border-emerald-100 py-0.5 px-2 rounded">خریدار: {order.buyerName}</span>
                      )}
                    </div>
                    <span className="text-xs font-mono font-bold text-slate-700">{order.orderNumber}</span>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 text-xs py-3">
                    <div>
                      <span className="text-slate-400 block mb-0.5">نشانی کارگاه مقصد (شهرستان):</span>
                      <strong className="text-slate-800 flex items-center justify-end gap-1">
                        <span>{order.destinationCity}</span>
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block mb-0.5">زمان ثبت سیستمی درخواست:</span>
                      <strong className="text-slate-500 font-mono">{new Date(order.createdAt).toLocaleString('fa-IR')}</strong>
                    </div>
                    <div className="col-span-2 lg:col-span-1">
                      <span className="text-slate-400 block mb-0.5">خلاصه کل سفارش:</span>
                      <strong className="text-slate-700">
                        {(() => {
                          if (order.itemsJson) {
                            try {
                              const parsed = JSON.parse(order.itemsJson);
                              if (Array.isArray(parsed) && parsed.length > 0) {
                                return parsed.map((item: any) => `${item.productName} (${item.quantity?.toLocaleString()} ${item.unit || order.unit})`).join(' + ');
                              }
                            } catch (e) {}
                          }
                          return `${order.productName} به میزان ${order.quantity.toLocaleString()} ${order.unit}`;
                        })()}
                      </strong>
                    </div>
                  </div>

                  {/* Order items and pricing details block */}
                  <div className="my-3 bg-slate-50 border border-slate-200/60 rounded-xl p-3.5 text-right shadow-sm">
                    <h4 className="text-xs font-bold text-indigo-900 border-b border-indigo-100 pb-2 mb-3 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-indigo-600" />
                        <span>جزئیات دقیق اقلام سبد خرید فاکتور مالی</span>
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">سفارش #{order.orderNumber}</span>
                    </h4>

                    {order.itemsJson ? (
                      <div className="space-y-2">
                        {(() => {
                          try {
                            const parsed = JSON.parse(order.itemsJson);
                            if (Array.isArray(parsed) && parsed.length > 0) {
                              let totalSum = 0;
                              return (
                                <>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-xs text-slate-700 text-right">
                                      <thead>
                                        <tr className="border-b border-slate-200 text-slate-400 text-[10px] font-bold">
                                          <th className="pb-1.5 font-bold">نام محصول</th>
                                          <th className="pb-1.5 text-center font-bold">مقدار</th>
                                          <th className="pb-1.5 text-center font-bold">قیمت واحد (تومان)</th>
                                          <th className="pb-1.5 text-left font-bold">جمع کل (تومان)</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {parsed.map((item: any, idx: number) => {
                                          const rowTotal = (item.quantity || 0) * (item.pricePerUnit || 0);
                                          totalSum += rowTotal;
                                          return (
                                            <tr key={idx} className="hover:bg-slate-100/50">
                                              <td className="py-2 font-bold text-slate-800">{item.productName || order.productName}</td>
                                              <td className="py-2 text-center font-mono font-bold text-slate-700">
                                                {item.quantity ? item.quantity.toLocaleString() : '۱'} {item.unit || order.unit}
                                              </td>
                                              <td className="py-2 text-center font-mono text-slate-600">
                                                {item.pricePerUnit ? item.pricePerUnit.toLocaleString() : '۰'}
                                              </td>
                                              <td className="py-2 text-left font-mono font-extrabold text-indigo-700">
                                                {rowTotal.toLocaleString()}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>

                                  <div className="border-t border-slate-200 pt-3 mt-2 flex flex-col sm:flex-row items-center justify-between gap-2 bg-white/70 p-2.5 rounded-lg border border-slate-100">
                                    <div className="text-right">
                                      <span className="text-[10px] text-slate-400 block mb-0.5">کد رهگیری پیش‌پرداخت مالی:</span>
                                      {order.paymentTrackingCode ? (
                                        <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-100 py-1 px-2.5 rounded">
                                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                          <span>فیش واریزی: {order.paymentTrackingCode}</span>
                                        </div>
                                      ) : (
                                        <span className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-100 py-1 px-2.5 rounded">
                                          ⚠️ فاقد کد پیگیری پیش‌پرداخت (بدون ثبت فیش)
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-left font-sans sm:text-left self-stretch sm:self-auto flex items-center justify-between sm:justify-end gap-3">
                                      <span className="text-slate-500 font-normal">مبلغ کل فاکتور:</span>
                                      <strong className="text-sm font-black text-rose-600 font-mono">
                                        {totalSum.toLocaleString()} تومان
                                      </strong>
                                    </div>
                                  </div>
                                </>
                              );
                            }
                          } catch (e) {
                            console.error("Error parsing itemsJson", e);
                          }
                          return null;
                        })()}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {/* Single-product detailed presentation */}
                        {(() => {
                          const prod = products.find(p => p.id === order.productId);
                          const priceUnit = prod ? prod.pricePerUnit : 0;
                          const totalSum = order.quantity * priceUnit;
                          return (
                            <>
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs text-slate-700 text-right">
                                  <thead>
                                    <tr className="border-b border-slate-200 text-slate-400 text-[10px] font-bold">
                                      <th className="pb-1.5 font-bold">نام محصول</th>
                                      <th className="pb-1.5 text-center font-bold">مقدار سفارش</th>
                                      <th className="pb-1.5 text-center font-bold">قیمت واحد (تومان)</th>
                                      <th className="pb-1.5 text-left font-bold">جمع کل (تومان)</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    <tr className="hover:bg-slate-100/50">
                                      <td className="py-2.5 font-bold text-slate-800">{order.productName}</td>
                                      <td className="py-2.5 text-center font-mono font-bold text-slate-700">
                                        {order.quantity.toLocaleString()} {order.unit}
                                        {prod && order.unit !== (prod.primaryUnit || 'قالب') && (() => {
                                          let ratio = prod.conversionRatio;
                                          if (!ratio && prod.coverageInfo) {
                                            const parsedNum = prod.coverageInfo.match(/\d+/);
                                            if (parsedNum) ratio = parseInt(parsedNum[0], 10);
                                          }
                                          if (ratio) {
                                            return (
                                              <span className="text-[10px] text-emerald-600 block font-normal mt-0.5">
                                                ({(order.quantity * ratio).toLocaleString()} {prod.primaryUnit || 'قالب'} تولید)
                                              </span>
                                            );
                                          }
                                          return null;
                                        })()}
                                      </td>
                                      <td className="py-2.5 text-center font-mono text-slate-600">
                                        {priceUnit ? priceUnit.toLocaleString() : 'پیگیری تلفنی'}
                                      </td>
                                      <td className="py-2.5 text-left font-mono font-extrabold text-indigo-700">
                                        {totalSum ? totalSum.toLocaleString() : 'بررسی بازار'}
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>

                              <div className="border-t border-slate-200 pt-3 mt-2 flex flex-col sm:flex-row items-center justify-between gap-2 bg-white/70 p-2.5 rounded-lg border border-slate-100 text-xs">
                                <div className="text-right">
                                  <span className="text-[10px] text-slate-400 block mb-0.5">کد رهگیری پیش‌پرداخت مالی:</span>
                                  {order.paymentTrackingCode ? (
                                    <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-100 py-1 px-2.5 rounded">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                      <span>فیش واریزی: {order.paymentTrackingCode}</span>
                                    </div>
                                  ) : (
                                    <span className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-100 py-1 px-2.5 rounded">
                                      ⚠️ فاقد کد پیگیری پیش‌پرداخت (بدون ثبت فیش)
                                    </span>
                                  )}
                                </div>
                                <div className="text-left font-sans sm:text-left self-stretch sm:self-auto flex items-center justify-between sm:justify-end gap-3">
                                  <span className="text-slate-500 font-normal">مبلغ کل فاکتور:</span>
                                  <strong className="text-sm font-black text-rose-600 font-mono">
                                    {totalSum ? `${totalSum.toLocaleString()} تومان` : 'مشخص بازار'}
                                  </strong>
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>

                  <div className="bg-emerald-50/20 p-3.5 rounded-lg text-[11.5px] text-slate-600 mb-4 space-y-2 text-right border border-emerald-100/40 shadow-sm">
                    <p className="flex items-start gap-1.5 border-b border-emerald-100/20 pb-1.5 mb-1.5">
                      <span className="text-emerald-600">👤</span>
                      <span><strong>نام خریدار (مشتری نهایی):</strong> <strong className="text-emerald-800 text-xs">{order.buyerName || 'ثبت نشده'}</strong></span>
                    </p>
                    <p className="flex items-start gap-1.5">
                      <span className="text-emerald-600">📍</span>
                      <span><strong>آدرس دقیق تخلیه کالا (خریدار):</strong> <span className="text-slate-800 font-medium">{order.exactAddress}</span></span>
                    </p>
                    <p className="flex items-start gap-1.5">
                      <span className="text-emerald-600">📞</span>
                      <span><strong>تلفن همراه خریدار:</strong> <strong className="text-slate-800 font-mono text-xs">{order.phoneNumber}</strong></span>
                    </p>
                    {order.notes && (
                      <p className="text-slate-700 font-medium bg-amber-50/50 p-2 rounded border border-amber-100/60 flex items-start gap-1.5 mt-2">
                        <span>📝</span>
                        <span><strong>ملاحظات ارسال سفارش:</strong> {order.notes}</span>
                      </p>
                    )}
                  </div>

                  <div className="flex justify-end gap-2.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => printOrders([order], products, agents)}
                      className="bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 py-1.5 px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                      title="پیش‌نمایش و چاپ فاکتور سفارش"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>چاپ سفارش</span>
                    </button>

                    {rejectionInputId !== order.id ? (
                      <button
                        onClick={() => setRejectionInputId(order.id)}
                        className="bg-rose-50 hover:bg-rose-100 text-rose-700 py-1.5 px-3.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>رد سفارش</span>
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
                  <div className="flex flex-wrap gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        printOrders(visibleOrders, products, agents);
                        showToast('📥 فایل PDF گروهی کلیه سفارشات صف جهت چاپ صادر شد.', 'success');
                      }}
                      className="bg-white hover:bg-slate-100 border border-slate-350 text-slate-700 font-bold py-2 px-3.5 rounded-lg text-xs cursor-pointer transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                      title="چاپ و ایجاد PDF گروهی برای کل صف جاری"
                    >
                      <Printer className="w-4 h-4 text-slate-500" />
                      <span>چاپ دسته‌جمعی صف</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        askConfirm(
                          'ارسال نهایی و دسته‌جمعی به کارخانه',
                          'آیا مایلید تمامی سفارشات تأیید شده حاضر در صف را به خط تولید و ترابری کارخانه ارسال نمایید؟ همچنین فایل PDF رسمی کلیه سفارشات صادر و چاپ خواهد شد.',
                          () => {
                            printOrders(visibleOrders, products, agents);
                            showToast('📥 سند رسمی و PDF کلیه سفارشات صادر شد.', 'success');
                            onDispatchAllToFactory();
                          }
                        );
                      }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-3.5 rounded-lg text-xs cursor-pointer transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <Navigation className="w-4 h-4" />
                      <span>ارسال همه به کارخانه</span>
                    </button>
                  </div>
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
                        <div className="flex items-center gap-2 font-sans">
                          <strong className="text-slate-800 text-sm">{order.customerName}</strong>
                          <span className="text-[9px] bg-slate-100 text-slate-500 font-mono py-0.5 px-1.5 rounded">{order.orderNumber}</span>
                          {order.buyerName && (
                            <span className="text-[9px] bg-emerald-50 text-emerald-800 font-bold border border-emerald-100 py-0.5 px-1.5 rounded">خریدار: {order.buyerName}</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-1">
                          {(() => {
                            if (order.itemsJson) {
                              try {
                                const parsed = JSON.parse(order.itemsJson);
                                if (Array.isArray(parsed) && parsed.length > 0) {
                                  return (
                                    <div className="flex flex-wrap gap-1.5 mt-1">
                                      {parsed.map((item: any, i: number) => (
                                        <span key={i} className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 py-0.5 px-2 rounded-md font-medium text-[10px]">
                                          {item.productName}: <strong className="font-mono text-slate-950">{item.quantity?.toLocaleString()} {item.unit || order.unit}</strong>
                                        </span>
                                      ))}
                                    </div>
                                  );
                                }
                              } catch (e) {}
                            }
                            return (
                              <p className="flex flex-wrap items-center gap-1">
                                <span>{order.productName}</span>
                                <span>•</span>
                                <strong className="font-mono text-slate-700 text-[11px]">{order.quantity.toLocaleString()} {order.unit}</strong>
                              </p>
                            );
                          })()}
                          {(() => {
                            if (order.itemsJson) return null; // Skip ratio conversion for multi-item orders
                            const prod = products.find(p => p.id === order.productId);
                            if (prod) {
                              const pUnit = prod.primaryUnit || 'قالب';
                              if (order.unit !== pUnit) {
                                let ratio = prod.conversionRatio;
                                if (!ratio && prod.coverageInfo) {
                                  const parsedNum = prod.coverageInfo.match(/\d+/);
                                  if (parsedNum) ratio = parseInt(parsedNum[0], 10);
                                }
                                if (ratio) {
                                  return (
                                    <span className="text-[10px] text-emerald-600 font-sans font-normal">
                                      ({(order.quantity * ratio).toLocaleString()} {pUnit} تولید)
                                    </span>
                                  );
                                }
                              }
                            }
                            return null;
                          })()}
                        </div>
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

                      {/* Print single order document */}
                      <button
                        type="button"
                        onClick={() => {
                          printOrders([order], products, agents);
                          showToast('📥 پیش‌نمایش سفارش جهت چاپ و ذخیره PDF آماده شد.', 'info');
                        }}
                        className="bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 py-1.5 px-2.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                        title="چاپ سفارش"
                      >
                        <Printer className="w-3.5 h-3.5 text-slate-500" />
                        <span>چاپ سفارش</span>
                      </button>

                      {/* Explicit SEND action - moves to factory line */}
                      <button
                        onClick={() => {
                          printOrders([order], products, agents);
                          showToast('📥 سفارش خروج کالا صادر شد و به صف چاپ ارسال گردید.', 'success');
                          onDispatchToFactory(order.id);
                        }}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white py-1.5 px-3 rounded-lg text-[11px] font-bold cursor-pointer transition-colors flex items-center gap-1 shadow-sm"
                        title="ارسال نهایی به کارخانه و چاپ اتوماتیک نسخه سفارش"
                      >
                        <Navigation className="w-3.5 h-3.5" />
                        <span>ارسال و چاپ</span>
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
                          onClick={() => startEditingAgent(agent)}
                          className="bg-slate-100 hover:bg-emerald-100 text-slate-600 hover:text-emerald-700 p-1.5 rounded-lg transition-all cursor-pointer"
                          title="ویرایش اطلاعات نمایندگی"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
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
              <h4 
                onClick={() => {
                  const form = document.getElementById('agent-registration-form') as HTMLFormElement;
                  if (form) form.requestSubmit();
                }}
                className="font-bold text-slate-800 hover:text-emerald-700 text-xs flex items-center justify-end gap-1 mb-4 cursor-pointer select-none transition-colors border-b border-slate-200/60 pb-2"
                title="برای ارسال فرم کلیک کنید"
              >
                <span>{editingAgent ? `ویرایش نمایندگی فروش: ${editingAgent.alias}` : 'افزودن و ثبت پروتکل نمایندگی جدید'}</span>
                <PlusCircle className="w-4 h-4 text-emerald-600" />
              </h4>

              <form id="agent-registration-form" onSubmit={handleAgentSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-slate-600 text-[10px] mb-1 font-bold">
                    نام و نام خانوادگی نماینده مسئول: <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: آقای محمدی"
                    value={newAgentName}
                    onChange={(e) => setNewAgentName(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 text-[10px] mb-1 font-bold">
                    نام مستعار یا برند نمایندگی (جهت نمایش): <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: نمایندگی مازندران (احمد‌نژاد)"
                    value={newAgentAlias}
                    onChange={(e) => setNewAgentAlias(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-slate-600 text-[10px] font-bold">
                      کد نمایندگی (تفصیلی حسابداری): <span className="text-rose-500">*</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={autoGenAgentCode}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setAutoGenAgentCode(checked);
                          if (!checked) {
                            setNewAgentCode('');
                          }
                        }}
                        className="w-3.5 h-3.5 text-emerald-600 accent-emerald-600 cursor-pointer"
                      />
                      <span className="text-[10px] text-slate-500 font-sans font-medium">ایجاد خودکار سیستم</span>
                    </label>
                  </div>
                  {autoGenAgentCode ? (
                    <input
                      type="text"
                      readOnly
                      placeholder="TBN-1001"
                      value={newAgentCode}
                      className="w-full bg-slate-100/80 border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-500 font-mono text-left focus:outline-none cursor-not-allowed border-dashed"
                      title="کد یکتا به شکل خودکار توسط الگوریتم توالی سیستم تعیین می‌شود"
                    />
                  ) : (
                    <input
                      type="text"
                      placeholder="مثال: ۱۰۱۰۲ یا AG-2500"
                      value={newAgentCode}
                      onChange={(e) => setNewAgentCode(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 font-mono text-left focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  )}
                  <p className="text-[9px] text-slate-400 mt-1">
                    جهت تسهیل در فرآیند مغایرت‌گیری و کنترل حساب‌ها، کد تفصیلی نمایندگی در سیستم نرم‌افزاری حسابداری را درج کنید.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-600 text-[10px] mb-1 font-bold">
                      شماره ارتباطی نمایندگی: <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
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
                  <label className="block text-slate-600 text-[10px] mb-1 font-bold">
                    آدرس دقیق انبار نمایندگی: <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="نشانی کامل دفتر یا انبار بارگیری مجدد نمایندگی..."
                    value={newAgentAddress}
                    onChange={(e) => setNewAgentAddress(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    id="agent-submit-btn"
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-lg text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow"
                  >
                    {editingAgent ? <Edit className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    <span>{editingAgent ? 'ذخیره تغییرات نمایندگی' : 'افزودن و ثبت پروتکل نمایندگی جدید'}</span>
                  </button>
                  {editingAgent && (
                    <button
                      type="button"
                      onClick={cancelEditingAgent}
                      className="bg-slate-200 hover:bg-slate-300 text-slate-700 hover:text-slate-800 font-bold py-2.5 px-3 rounded-lg text-xs transition-colors cursor-pointer flex items-center justify-center"
                    >
                      <span>انصراف</span>
                    </button>
                  )}
                </div>
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
                          {prod.category === 'roof_tile' || prod.category === 'roofing' ? 'سفال (roof tile)' : 
                           prod.category === 'ridge_tile' ? 'تیزه (ridge tile)' : 
                           prod.category === 'ending_ridge_tile' ? 'تیزه انتهایی (ending ridge tile)' : 
                           prod.category === 'bricks' ? 'آجر و بلوک سفالی (bricks)' : 
                           prod.category === 'facade' ? 'آجر نما و نسوز' : prod.category}
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
                        onClick={() => startEditingProduct(prod)}
                        className="bg-slate-100 hover:bg-emerald-100 text-slate-600 hover:text-emerald-700 p-1.5 rounded-lg transition-all cursor-pointer"
                        title="ویرایش اطلاعات محصول"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
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
              <h4 
                onClick={() => {
                  const form = document.getElementById('product-registration-form') as HTMLFormElement;
                  if (form) form.requestSubmit();
                }}
                className="font-bold text-slate-800 hover:text-emerald-700 text-xs flex items-center justify-end gap-1 mb-4 cursor-pointer select-none transition-colors border-b border-slate-200/60 pb-2"
                title="برای ارسال فرم کلیک کنید"
              >
                <span>{editingProduct ? `ویرایش کالا: ${editingProduct.name}` : 'تعریف کالای جدید کارخانه با مشخصات'}</span>
                <FolderPlus className="w-4 h-4 text-emerald-600" />
              </h4>

              <form id="product-registration-form" onSubmit={handleProductSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-slate-600 text-[10px] mb-1 font-bold">
                    نام و عنوان محصول سفالی جدید: <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
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
                      <option value="roof_tile">سفال (roof tile)</option>
                      <option value="ridge_tile">تیزه (ridge tile)</option>
                      <option value="ending_ridge_tile">تیزه انتهایی (ending ridge tile)</option>
                      <option value="bricks">آجر و بلوک سفالی (bricks)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 text-[10px] mb-1 font-bold">واحد اصلی (تولید کارخانه): <span className="text-rose-500">*</span></label>
                    <select
                      value={newProdPrimaryUnit}
                      onChange={(e) => setNewProdPrimaryUnit(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans cursor-pointer"
                    >
                      <option value="قالب">قالب</option>
                      <option value="عدد">عدد</option>
                      <option value="مترمربع">مترمربع</option>
                      <option value="مترطول">مترطول</option>
                      <option value="پالت">پالت</option>
                      <option value="تن">تن فیزیکی</option>
                    </select>
                  </div>
                </div>

                {/* Switch for Secondary Sales Unit */}
                <div className="bg-slate-100 p-2.5 rounded-lg border border-slate-200 flex items-center justify-between">
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-slate-700">دارای واحد فروش متمایز (واحد فرعی)</p>
                    <p className="text-[9px] text-slate-500">مثال: فروش بر اساس مترمربع در حالی که تولید بر اساس قالب است</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={hasSecondaryUnit}
                    onChange={(e) => setHasSecondaryUnit(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 border-slate-300 rounded cursor-pointer"
                  />
                </div>

                {hasSecondaryUnit && (
                  <div className="grid grid-cols-2 gap-2 bg-slate-100/50 p-2.5 rounded-lg border border-slate-200/60">
                    <div>
                      <label className="block text-slate-600 text-[10px] mb-1 font-bold">واحد فروش متمایز (فرعی):</label>
                      <select
                        value={newProdSecondaryUnit}
                        onChange={(e) => setNewProdSecondaryUnit(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans cursor-pointer"
                      >
                        <option value="مترمربع">مترمربع</option>
                        <option value="مترطول">مترطول</option>
                        <option value="عدد">عدد</option>
                        <option value="قالب">قالب</option>
                        <option value="پالت">پالت</option>
                        <option value="تن">تن فیزیکی</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-600 text-[10px] mb-1 font-bold">ضریب تبدیل واحد (تعداد در یک واحد فروش):</label>
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={newProdConversionRatio}
                        onChange={(e) => setNewProdConversionRatio(e.target.value)}
                        placeholder="مثال: ۱۴ یا ۲.۵"
                        className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono text-center font-bold"
                      />
                    </div>
                    <div className="col-span-2 text-center text-[9px] text-emerald-800 font-bold bg-emerald-50 py-1 rounded">
                      💡 هر ۱ {newProdSecondaryUnit} معادل {newProdConversionRatio || '...'} {newProdPrimaryUnit} در فرآیند تولید خواهد بود.
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-600 text-[10px] mb-1 font-bold">قیمت هر واحد {hasSecondaryUnit ? `فروش (${newProdSecondaryUnit})` : `اصلی (${newProdPrimaryUnit})`} (تومان): <span className="text-rose-500">*</span></label>
                    <input
                      type="number"
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

                <div className="grid grid-cols-1 gap-2">
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

                <div className="flex gap-2">
                  <button
                    type="submit"
                    id="product-submit-btn"
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-lg text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow"
                  >
                    {editingProduct ? <Edit className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    <span>{editingProduct ? 'ذخیره تغییرات محصول' : 'تعریف و ثبت کالای جدید کارخانه'}</span>
                  </button>
                  {editingProduct && (
                    <button
                      type="button"
                      onClick={cancelEditingProduct}
                      className="bg-slate-200 hover:bg-slate-300 text-slate-700 hover:text-slate-800 font-bold py-2.5 px-3 rounded-lg text-xs transition-colors cursor-pointer flex items-center justify-center"
                    >
                      <span>انصراف</span>
                    </button>
                  )}
                </div>
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
                <h3 
                  onClick={() => {
                    const form = document.getElementById('shipping-registration-form') as HTMLFormElement;
                    if (form) form.requestSubmit();
                  }}
                  className="text-xs font-extrabold text-slate-800 border-b border-slate-100 pb-2 mb-4 flex items-center justify-end gap-1.5 cursor-pointer select-none hover:text-emerald-700 transition-colors"
                  title="برای ارسال فرم کلیک کنید"
                >
                  <span>تعریف آژانس حمل و نقل همکار جدید</span>
                  <PlusCircle className="w-4 h-4 text-emerald-600" />
                </h3>

                <form id="shipping-registration-form" onSubmit={handleShippingCompanySubmit} className="space-y-4 text-right">
                  <div>
                    <label className="block text-slate-600 text-[10px] mb-1 font-bold">نام شرکت حمل و نقل: <span className="text-rose-500">*</span></label>
                    <input
                      type="text"
                      placeholder="مثال: ترابری جهان گستر شمال"
                      value={newSCName}
                      onChange={(e) => setNewSCName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 text-[10px] mb-1 font-bold">کد یکتا ترابری (به انگلیسی): <span className="text-rose-500">*</span></label>
                    <input
                      type="text"
                      placeholder="مثال: TRANS-NORTH"
                      value={newSCCode}
                      onChange={(e) => setNewSCCode(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-855 font-mono text-left focus:outline-none focus:ring-1 focus:ring-emerald-500"
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
                    <label className="block text-slate-600 text-[10px] mb-1 font-bold">تلفن پشتیبانی و هماهنگی: <span className="text-rose-500">*</span></label>
                    <input
                      type="text"
                      placeholder="مثال: 01133224422"
                      value={newSCPhone}
                      onChange={(e) => setNewSCPhone(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 font-mono text-left focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <button
                    type="submit"
                    id="shipping-submit-btn"
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-lg text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow"
                  >
                    <Plus className="w-4 h-4" />
                    <span>تعریف و افزودن آژانس حمل و نقل جدید</span>
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
              <span>در زیر می‌توانید وضعیت تمامی سفارش‌های صادر شده گذشته، رد شده یا ارسال شده به مقصد را دنبال کنید.</span>
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
                        {order.buyerName && (
                          <span className="text-[10px] bg-emerald-50 text-emerald-800 font-bold border border-emerald-100 py-0.5 px-1.5 rounded">خریدار: {order.buyerName}</span>
                        )}
                        <span className={`text-[9px] font-bold py-0.5 px-2 rounded-full ${statusTags[order.status]?.css}`}>
                          {statusTags[order.status]?.text}
                        </span>
                      </div>
                      
                      <div className="text-xs text-slate-600 mt-1">
                        {(() => {
                          if (order.itemsJson) {
                            try {
                              const parsed = JSON.parse(order.itemsJson);
                              if (Array.isArray(parsed) && parsed.length > 0) {
                                return (
                                  <div className="flex flex-wrap gap-1.5 mt-1">
                                    <span>📦 اقلام سفارش چندمحصولی:</span>
                                    {parsed.map((item: any, i: number) => (
                                      <span key={i} className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 py-0.5 px-2 rounded font-medium text-[10px]">
                                        {item.productName}: <strong className="font-mono text-slate-950">{item.quantity?.toLocaleString()} {item.unit || order.unit}</strong>
                                      </span>
                                    ))}
                                  </div>
                                );
                              }
                            } catch (e) {}
                          }
                          return (
                            <p className="text-xs text-slate-600">
                              📦 محصول: <strong>{order.productName}</strong> ({order.quantity.toLocaleString()} {order.unit}
                              {(() => {
                                const prod = products.find(p => p.id === order.productId);
                                if (prod) {
                                  const pUnit = prod.primaryUnit || 'قالب';
                                  if (order.unit !== pUnit) {
                                    let ratio = prod.conversionRatio;
                                    if (!ratio && prod.coverageInfo) {
                                      const parsedNum = prod.coverageInfo.match(/\d+/);
                                      if (parsedNum) ratio = parseInt(parsedNum[0], 10);
                                    }
                                    if (ratio) {
                                      return ` - معادل ${(order.quantity * ratio).toLocaleString()} ${pUnit}`;
                                    }
                                  }
                                }
                                return '';
                              })()})
                            </p>
                          );
                        })()}
                      </div>
                      <p className="text-[10px] text-slate-400">📍 مقصد: {order.destinationCity} • ثبت‌شده در: {new Date(order.createdAt).toLocaleString('fa-IR')}</p>
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {order.vehicleDetails && (
                        <div className="bg-emerald-50/50 rounded-lg p-2 border border-emerald-100/50 text-[10px] text-slate-600 font-mono text-right">
                          <p className="font-bold text-emerald-800 text-[11px]">🚒 ترابری اختصاص‌یافته:</p>
                          <p>{order.vehicleDetails.vehicleType} • {order.vehicleDetails.driverName}</p>
                          <p>📞 {order.vehicleDetails.driverPhone} • 🏷️ {order.vehicleDetails.licensePlate}</p>
                        </div>
                      )}

                      {order.status === 'REJECTED' && order.rejectionReason && (
                        <div className="bg-rose-50 rounded border border-rose-100 p-2 text-[10px] text-rose-800 text-right">
                          <strong>❌ علت لغو سفارش:</strong> {order.rejectionReason}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          printOrders([order], products, agents);
                          showToast('📥 پیش‌نمایش سفارش آرشیوی جهت پرینت مجدد و ذخیره PDF بارگذاری شد.', 'success');
                        }}
                        className="bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 hover:text-slate-850 py-1 px-3 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-all self-end"
                        title="چاپ مجدد سفارش خروج رسمی"
                      >
                        <Printer className="w-3.5 h-3.5 text-slate-500" />
                        <span>چاپ مجدد سفارش</span>
                      </button>
                    </div>

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
