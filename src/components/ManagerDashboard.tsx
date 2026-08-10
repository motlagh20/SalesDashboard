import * as XLSX from 'xlsx';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Order, OrderStatus, Product, Agent, ShippingCompany, PermanentDriver, AppUser, UserRole, TerritoryAssignment, PersonType } from '../types';
import { parseAndHydrateItemsJson, serializeItemsJson } from '../utils/itemsJsonHelper';
import PermanentDriversManager from './PermanentDriversManager';
import CommercialAnalyticsDashboard from './CommercialAnalyticsDashboard';
import { IRAN_PROVINCES, getCitiesForProvince, formatTerritoriesSummary } from '../data/iranLocations';
import { 
  BarChart3,
  Activity,
  Shield,
  RefreshCw,
  UserCheck,
  Zap,
  Cpu,
  FileSpreadsheet,
  AlertTriangle,
  Server,
  Database,
  Wifi,
  Terminal,
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
  Printer,
  Globe,
  Check,
  CheckSquare,
  Square,
  ChevronUp,
  Maximize2,
  Minimize2,
  Image as ImageIcon,
  Upload
} from 'lucide-react';

import { printOrders } from '../utils/printHelper';
import { toEnglishDigits } from '../utils/numberUtils';

interface ManagerDashboardProps {
  orders: Order[];
  products: Product[];
  agents: Agent[];
  shippingCompanies: ShippingCompany[];
  permanentDrivers?: PermanentDriver[];
  initialTab?: PanelTab;
  initialPartnerSubTab?: 'AGENTS' | 'SHIPPING' | 'USERS' | 'DRIVERS';
  onApproveOrder: (orderId: string) => void;
  onRejectOrder: (orderId: string, reason: string) => void;
  onApproveOrderEdit?: (orderId: string) => void;
  onRejectOrderEdit?: (orderId: string) => void;
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
  onUpdateShippingCompany?: (companyData: ShippingCompany) => Promise<boolean>;
  onToggleShippingCompany: (companyId: string) => void;
  onDeleteShippingCompany: (companyId: string) => void;
  onAddPermanentDriver?: (driver: Partial<PermanentDriver>) => Promise<boolean>;
  onBulkImportPermanentDrivers?: (drivers: Partial<PermanentDriver>[]) => Promise<boolean>;
  onUpdatePermanentDriver?: (driver: PermanentDriver) => Promise<boolean>;
  onTogglePermanentDriver?: (driverId: string) => void;
  onDeletePermanentDriver?: (driverId: string) => void;
  onApproveAllOrders?: (orderIds?: string[]) => void;
  onDispatchAllToFactory?: () => void;
  onSaveLocation?: (orderId: string, deliveryLocationUrl: string) => Promise<void>;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  askConfirm: (title: string, message: string, onConfirm: () => void) => void;
}

type PanelTab = 'COMMERCIAL_ANALYTICS' | 'APPROVED_PRIORITIES' | 'PENDING_APPROVAL' | 'AGENTS_MGMT' | 'PRODUCTS_MGMT' | 'SHIPPING_MGMT' | 'ARCHIVAL_ORDERS' | 'USERS_MGMT' | 'PARTNERS_MGMT';

export default function ManagerDashboard({
  orders,
  products,
  agents,
  shippingCompanies = [],
  permanentDrivers = [],
  initialTab,
  initialPartnerSubTab,
  onApproveOrder,
  onRejectOrder,
  onApproveOrderEdit,
  onRejectOrderEdit,
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
  onUpdateShippingCompany,
  onToggleShippingCompany,
  onDeleteShippingCompany,
  onAddPermanentDriver,
  onBulkImportPermanentDrivers,
  onUpdatePermanentDriver,
  onTogglePermanentDriver,
  onDeletePermanentDriver,
  onApproveAllOrders,
  onDispatchAllToFactory,
  showToast,
  askConfirm,
}: ManagerDashboardProps) {
  // Navigation tabs for the Manager workspace
  const [activeTab, setActiveTab] = useState<PanelTab>(initialTab || 'PENDING_APPROVAL');
  
  // Sub-filter for combined Partners & Users view
  const [partnerSubTab, setPartnerSubTab] = useState<'AGENTS' | 'SHIPPING' | 'USERS' | 'DRIVERS'>(initialPartnerSubTab || 'USERS');
  
  // Sub-filter state for archival logs
  const [archiveStatusFilter, setArchiveStatusFilter] = useState<string>('ALL');
  const [archiveAgentFilter, setArchiveAgentFilter] = useState<string>('ALL');
  const [selectedOrderForHistory, setSelectedOrderForHistory] = useState<Order | null>(null);
  const [reviewingEditOrder, setReviewingEditOrder] = useState<Order | null>(null);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Collapsible accordion state for order cards
  const [expandedOrderIds, setExpandedOrderIds] = useState<Record<string, boolean>>({});

  const toggleExpandOrder = (orderId: string) => {
    setExpandedOrderIds(prev => ({
      ...prev,
      [orderId]: !prev[orderId]
    }));
  };

  const expandAllOrders = (ordersList: Order[]) => {
    const next: Record<string, boolean> = {};
    ordersList.forEach(o => { next[o.id] = true; });
    setExpandedOrderIds(next);
  };

  const collapseAllOrders = () => {
    setExpandedOrderIds({});
  };
  
  // Rejection input controls
  const [rejectionInputId, setRejectionInputId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Batch selection state for orders (in PENDING_APPROVAL / APPROVED_PRIORITIES)
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);

  const toggleSelectOrder = (orderId: string) => {
    setSelectedOrderIds(prev =>
      prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
    );
  };

  const toggleSelectAllVisibleOrders = (currentVisibleOrders: Order[]) => {
    const visibleIds = currentVisibleOrders.map(o => o.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedOrderIds.includes(id));
    if (allSelected) {
      setSelectedOrderIds(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      setSelectedOrderIds(prev => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const handleBatchApproveSelected = (currentVisibleOrders: Order[]) => {
    const selectedVisible = currentVisibleOrders.filter(o => selectedOrderIds.includes(o.id));
    if (selectedVisible.length === 0) {
      showToast('لطفاً ابتدا حداقل یک سفارش را جهت تایید انتخاب نمایید.', 'error');
      return;
    }

    askConfirm(
      'تأیید دسته‌جمعی سفارشات انتخاب‌شده',
      `آیا مایلید تعداد ${selectedVisible.length} سفارش انتخاب‌شده را تایید نهایی کرده و به صف ارسال کارخانه ارجاع دهید؟`,
      () => {
        const targetIds = selectedVisible.map(o => o.id);
        if (onApproveAllOrders) {
          onApproveAllOrders(targetIds);
        } else {
          targetIds.forEach(id => onApproveOrder(id));
        }
        setSelectedOrderIds(prev => prev.filter(id => !targetIds.includes(id)));
      }
    );
  };

  const handleBatchPrintSelected = (currentVisibleOrders: Order[]) => {
    const selectedVisible = currentVisibleOrders.filter(o => selectedOrderIds.includes(o.id));
    if (selectedVisible.length === 0) {
      showToast('لطفاً ابتدا حداقل یک سفارش را جهت چاپ انتخاب نمایید.', 'error');
      return;
    }

    printOrders(selectedVisible, products, agents);
    showToast(`📥 فایل پیش‌نمایش و چاپ برای ${selectedVisible.length} سفارش انتخاب‌شده صادر شد.`, 'success');
  };

  // Form: Create Agent state
  const [newAgentPersonType, setNewAgentPersonType] = useState<PersonType>('REAL');
  const [newAgentCompanyName, setNewAgentCompanyName] = useState('');
  const [newAgentRegistrationNumber, setNewAgentRegistrationNumber] = useState('');
  const [newAgentEconomicCode, setNewAgentEconomicCode] = useState('');
  const [newAgentNationalId, setNewAgentNationalId] = useState('');
  const [newAgentNationalCode, setNewAgentNationalCode] = useState('');
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentAlias, setNewAgentAlias] = useState('');
  const [newAgentCode, setNewAgentCode] = useState('');
  const [newAgentPhone, setNewAgentPhone] = useState('');
  const [newAgentAddress, setNewAgentAddress] = useState('');
  const [newAgentArea, setNewAgentArea] = useState('');
  const [newAgentTerritories, setNewAgentTerritories] = useState<TerritoryAssignment[]>([]);
  const [newAgentIsExport, setNewAgentIsExport] = useState<boolean>(false);
  const [autoGenAgentCode, setAutoGenAgentCode] = useState(false);

  // Territory builder inputs
  const [builderProvince, setBuilderProvince] = useState<string>('تهران');
  const [builderAllCities, setBuilderAllCities] = useState<boolean>(true);
  const [builderSelectedCities, setBuilderSelectedCities] = useState<string[]>([]);

  // Editing state for products and agents
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);

  const startEditingAgent = (agent: Agent) => {
    setEditingAgent(agent);
    setNewAgentPersonType(agent.personType || 'REAL');
    setNewAgentCompanyName(agent.companyName || '');
    setNewAgentRegistrationNumber(agent.registrationNumber || '');
    setNewAgentEconomicCode(agent.economicCode || '');
    setNewAgentNationalId(agent.nationalId || '');
    setNewAgentNationalCode(agent.nationalCode || '');
    setNewAgentName(agent.fullName);
    setNewAgentAlias(agent.alias);
    setNewAgentCode(agent.agentCode || '');
    setNewAgentPhone(agent.phoneNumber);
    setNewAgentAddress(agent.address);
    setNewAgentArea(agent.area);
    setNewAgentTerritories(agent.territories && Array.isArray(agent.territories) ? [...agent.territories] : []);
    setNewAgentIsExport(!!agent.isExportAgent);
    setAutoGenAgentCode(false);
  };

  const cancelEditingAgent = () => {
    setEditingAgent(null);
    setNewAgentPersonType('REAL');
    setNewAgentCompanyName('');
    setNewAgentRegistrationNumber('');
    setNewAgentEconomicCode('');
    setNewAgentNationalId('');
    setNewAgentNationalCode('');
    setNewAgentName('');
    setNewAgentAlias('');
    setNewAgentCode('');
    setNewAgentPhone('');
    setNewAgentAddress('');
    setNewAgentArea('');
    setNewAgentTerritories([]);
    setNewAgentIsExport(false);
    setAutoGenAgentCode(false);
  };

  // Helper to add or update province rule in newAgentTerritories
  const handleAddTerritoryRule = () => {
    if (!builderProvince) return;
    const existingIndex = newAgentTerritories.findIndex(t => t.province === builderProvince);
    const newRule: TerritoryAssignment = {
      province: builderProvince,
      allCities: builderAllCities,
      cities: builderAllCities ? undefined : [...builderSelectedCities]
    };

    let updated: TerritoryAssignment[];
    if (existingIndex >= 0) {
      updated = [...newAgentTerritories];
      updated[existingIndex] = newRule;
    } else {
      updated = [...newAgentTerritories, newRule];
    }
    setNewAgentTerritories(updated);
    // Auto-update area text representation
    setNewAgentArea(formatTerritoriesSummary(updated));
    showToast(`محدوده استان ${builderProvince} با موفقیت اضافه/بروزرسانی شد.`, 'info');
  };

  const handleRemoveTerritoryRule = (provName: string) => {
    const updated = newAgentTerritories.filter(t => t.province !== provName);
    setNewAgentTerritories(updated);
    setNewAgentArea(formatTerritoriesSummary(updated));
  };

  const startEditingProduct = (prod: Product) => {
    setEditingProduct(prod);
    setNewProdName(prod.name);
    setNewProdCategory(prod.category);
    
    // Clean price digits
    const cleanPriceStr = toEnglishDigits(prod.pricePerUnit);
    setNewProdPrice(cleanPriceStr || '10000');
    
    setNewProdDesc(prod.description || '');
    setNewProdWeight(toEnglishDigits(prod.weight || ''));
    setNewProdDimensions(toEnglishDigits(prod.dimensions || ''));
    
    const pUnit = prod.primaryUnit || prod.unit || 'قالب';
    setNewProdPrimaryUnit(pUnit);
    setNewProdSecondaryUnit(prod.secondaryUnit || 'مترمربع');

    // Extract ratio and convert any Persian numbers
    let ratioStr = '';
    if (prod.conversionRatio !== undefined && prod.conversionRatio !== null) {
      const numRatio = Number(prod.conversionRatio);
      if (!isNaN(numRatio)) {
        ratioStr = String(Math.round(numRatio * 100) / 100);
      } else {
        ratioStr = toEnglishDigits(prod.conversionRatio);
      }
    } else if (prod.coverageInfo) {
      const cleanCov = toEnglishDigits(prod.coverageInfo);
      const match = cleanCov.match(/(\d+(?:\.\d+)?)/);
      if (match) {
        ratioStr = match[1];
      }
    }
    if (!ratioStr) ratioStr = '14';

    setNewProdConversionRatio(ratioStr);
    setHasSecondaryUnit(!!prod.secondaryUnit || !!prod.coverageInfo);
    setNewProdDefaultQuantity(prod.defaultQuantity !== undefined && prod.defaultQuantity !== null ? String(prod.defaultQuantity) : '330');
    setNewProdImageUrl(prod.imageUrl || '');
  };

  const cancelEditingProduct = () => {
    setEditingProduct(null);
    setNewProdName('');
    setNewProdPrice('10000');
    setNewProdDesc('');
    setNewProdWeight('');
    setNewProdDimensions('');
    setNewProdPrimaryUnit('قالب');
    setNewProdSecondaryUnit('مترمربع');
    setNewProdConversionRatio('14');
    setHasSecondaryUnit(true);
    setNewProdDefaultQuantity('330');
    setNewProdImageUrl('');
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
  const [newProdPrice, setNewProdPrice] = useState<string | number>('10000');
  const [newProdDesc, setNewProdDesc] = useState('');
  const [newProdWeight, setNewProdWeight] = useState('');
  const [newProdDimensions, setNewProdDimensions] = useState('');
  const [hasSecondaryUnit, setHasSecondaryUnit] = useState(true);
  const [newProdPrimaryUnit, setNewProdPrimaryUnit] = useState('قالب');
  const [newProdSecondaryUnit, setNewProdSecondaryUnit] = useState('مترمربع');
  const [newProdConversionRatio, setNewProdConversionRatio] = useState('14');
  const [newProdDefaultQuantity, setNewProdDefaultQuantity] = useState('330');
  const [newProdImageUrl, setNewProdImageUrl] = useState('');

  const PRESET_PRODUCT_IMAGES = [
    { label: 'سفال سقف', url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=150&auto=format&fit=crop&q=80' },
    { label: 'آجر ۱۰ سانتی', url: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=150&auto=format&fit=crop&q=80' },
    { label: 'آجر ۱۵ سانتی', url: 'https://images.unsplash.com/photo-1590069261209-f8e9b8642343?w=150&auto=format&fit=crop&q=80' },
    { label: 'آجر نما', url: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=150&auto=format&fit=crop&q=80' },
    { label: 'بلوک سقفی', url: 'https://images.unsplash.com/photo-1541888946425-d0fbb186a5b2?w=150&auto=format&fit=crop&q=80' },
  ];

  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast('حجم تصویر نباید بیشتر از ۲ مگابایت باشد.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      if (uploadEvent.target?.result) {
        setNewProdImageUrl(uploadEvent.target.result as string);
        showToast('تصویر محصول انتخاب شد.', 'info');
      }
    };
    reader.readAsDataURL(file);
  };

  // Form: Create Shipping Company state
  const [newSCName, setNewSCName] = useState('');
  const [newSCCode, setNewSCCode] = useState('');
  const [newSCPhone, setNewSCPhone] = useState('');
  const [newSCManagerName, setNewSCManagerName] = useState('');
  const [newSCNationalId, setNewSCNationalId] = useState('');
  const [newSCEconomicCode, setNewSCEconomicCode] = useState('');
  const [newSCPassword, setNewSCPassword] = useState('');
  const [editingShippingCompany, setEditingShippingCompany] = useState<ShippingCompany | null>(null);

  const startEditingShippingCompany = (company: ShippingCompany) => {
    setEditingShippingCompany(company);
    setNewSCName(company.name);
    setNewSCCode(company.code);
    setNewSCManagerName(company.managerName || '');
    setNewSCPhone(company.phoneNumber);
    setNewSCNationalId(company.nationalId || '');
    setNewSCEconomicCode(company.economicCode || '');
    setNewSCPassword('');
  };

  const cancelEditingShippingCompany = () => {
    setEditingShippingCompany(null);
    setNewSCName('');
    setNewSCCode('');
    setNewSCManagerName('');
    setNewSCPhone('');
    setNewSCNationalId('');
    setNewSCEconomicCode('');
    setNewSCPassword('');
  };

  // --- USERS MANAGEMENT STATE ---
  const [users, setUsers] = useState<AppUser[]>([]);
  const [userOnlineFilter, setUserOnlineFilter] = useState<'ALL' | 'ONLINE' | 'OFFLINE'>('ALL');
  const [newUsername, setNewUsername] = useState('');
  const [newUserFullName, setNewUserFullName] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('REPRESENTATIVE');
  const [newUserAgentCode, setNewUserAgentCode] = useState('');
  const [newUserSCId, setNewUserSCId] = useState('');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setUsers(data);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  };

  useEffect(() => {
    fetchUsers();
    const interval = setInterval(fetchUsers, 10000);
    return () => clearInterval(interval);
  }, [agents, shippingCompanies]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newUserFullName.trim() || !newUserPhone.trim() || !newUserRole) {
      showToast('لطفاً کلیه فیلدهای ستاره‌دار را تکمیل کنید.', 'error');
      return;
    }
    try {
      const payload: any = {
        username: newUsername,
        fullName: newUserFullName,
        phoneNumber: newUserPhone,
        role: newUserRole,
        agentCode: newUserRole === 'REPRESENTATIVE' ? newUserAgentCode : null,
        shippingCompanyId: newUserRole === 'SHIPPING_COMPANY' ? newUserSCId : null,
      };
      if (newUserPassword.trim()) {
        payload.password = newUserPassword.trim();
      }

      const endpoint = editingUserId ? `/api/users/${editingUserId}` : '/api/users';
      const method = editingUserId ? 'PUT' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        showToast(editingUserId ? '✅ اطلاعات کاربر با موفقیت ویرایش شد.' : '✅ کاربر جدید با موفقیت به سامانه اضافه گردید.', 'success');
        setNewUsername('');
        setNewUserFullName('');
        setNewUserPhone('');
        setNewUserPassword('');
        setNewUserRole('REPRESENTATIVE');
        setNewUserAgentCode('');
        setNewUserSCId('');
        setEditingUserId(null);
        fetchUsers();
      } else {
        let errorMsg = 'خطایی در ثبت اطلاعات کاربر رخ داد.';
        try {
          const ct = res.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            const errData = await res.json();
            errorMsg = errData.error || errorMsg;
          }
        } catch {}
        showToast(errorMsg, 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('ارتباط با سرور برقرار نشد.', 'error');
    }
  };

  const handleToggleUser = async (userId: string) => {
    try {
      const res = await fetch(`/api/users/${userId}/toggle`, { method: 'PATCH' });
      if (res.ok) {
        showToast('🔄 وضعیت حساب کاربری تغییر یافت.', 'success');
        fetchUsers();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    askConfirm(
      'حذف کاربر',
      'آیا از حذف کامل این کاربر از سیستم اطمینان دارید؟',
      async () => {
        try {
          const res = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
          if (res.ok) {
            showToast('🗑️ کاربر با موفقیت از سیستم حذف گردید.', 'success');
            fetchUsers();
            if (editingUserId === userId) {
              setEditingUserId(null);
              setNewUsername('');
              setNewUserFullName('');
              setNewUserPhone('');
            }
          }
        } catch (err) {
          console.error(err);
        }
      }
    );
  };

  const handleStartEditUser = (user: AppUser) => {
    setEditingUserId(user.id);
    setNewUsername(user.username);
    setNewUserFullName(user.fullName);
    setNewUserPhone(user.phoneNumber);
    setNewUserPassword('');
    setNewUserRole(user.role);
    setNewUserAgentCode(user.agentCode || '');
    setNewUserSCId(user.shippingCompanyId || '');
  };

  // Metrics calculations
  const totalVolume = orders.reduce((sum, o) => o.status !== 'REJECTED' ? sum + o.quantity : sum, 0);
  const totalPending = orders.filter((o) => o.status === 'PENDING_APPROVAL' || o.hasPendingEdit).length;
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
    const companyName = newAgentCompanyName.trim();
    const registrationNumber = newAgentRegistrationNumber.trim();
    const economicCode = newAgentEconomicCode.trim();
    const nationalId = newAgentNationalId.trim();
    const nationalCode = newAgentNationalCode.trim();

    if (!name) {
      showToast('لطفاً نام نماینده را وارد نمایید.', 'error');
      return;
    }
    if (!alias) {
      showToast('لطفاً نام برند یا نام مستعار نمایندگی را وارد نمایید.', 'error');
      return;
    }
    if (newAgentPersonType === 'LEGAL' && !companyName) {
      showToast('لطفاً نام شرکت یا موسسه حقوقی را وارد نمایید.', 'error');
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

    const summaryArea = newAgentTerritories.length > 0 
      ? formatTerritoriesSummary(newAgentTerritories) 
      : (area || 'سراسر کشور');

    if (editingAgent) {
      const updatedAgent: Agent = {
        ...editingAgent,
        fullName: name,
        alias: alias,
        agentCode: code,
        phoneNumber: phone,
        address: address,
        area: summaryArea,
        territories: newAgentTerritories,
        isExportAgent: newAgentIsExport,
        personType: newAgentPersonType,
        companyName: newAgentPersonType === 'LEGAL' ? companyName : undefined,
        registrationNumber: newAgentPersonType === 'LEGAL' ? registrationNumber : undefined,
        economicCode: economicCode || undefined,
        nationalId: newAgentPersonType === 'LEGAL' ? nationalId : undefined,
        nationalCode: newAgentPersonType === 'REAL' ? nationalCode : undefined,
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
        area: summaryArea,
        territories: newAgentTerritories,
        isExportAgent: newAgentIsExport,
        isEnabled: true,
        personType: newAgentPersonType,
        companyName: newAgentPersonType === 'LEGAL' ? companyName : undefined,
        registrationNumber: newAgentPersonType === 'LEGAL' ? registrationNumber : undefined,
        economicCode: economicCode || undefined,
        nationalId: newAgentPersonType === 'LEGAL' ? nationalId : undefined,
        nationalCode: newAgentPersonType === 'REAL' ? nationalCode : undefined,
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
    const cleanPriceStr = toEnglishDigits(newProdPrice).trim();
    const price = parseFloat(cleanPriceStr);
    const desc = newProdDesc.trim();
    const weight = toEnglishDigits(newProdWeight).trim();
    const dims = toEnglishDigits(newProdDimensions).trim();

    const pUnit = newProdPrimaryUnit.trim();
    const sUnit = hasSecondaryUnit ? newProdSecondaryUnit.trim() : undefined;
    
    const cleanRatioStr = toEnglishDigits(newProdConversionRatio).trim();
    const ratioVal = hasSecondaryUnit && cleanRatioStr ? parseFloat(cleanRatioStr) : undefined;

    const cleanDefQtyStr = toEnglishDigits(newProdDefaultQuantity).trim();
    const defQtyVal = cleanDefQtyStr ? parseInt(cleanDefQtyStr, 10) : 330;
    const finalDefaultQuantity = isNaN(defQtyVal) || defQtyVal <= 0 ? 330 : defQtyVal;

    if (!name) {
      showToast('لطفاً نام کالا را وارد نمایید.', 'error');
      return;
    }
    if (isNaN(price) || price <= 0) {
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
      if (cleanRatioStr.includes('.')) {
        const decimalPart = cleanRatioStr.split('.')[1];
        if (decimalPart && decimalPart.length > 2) {
          showToast('ضریب تبدیل حداکثر می‌تواند ۲ رقم اعشار داشته باشد (مثال: ۲.۲۵ یا ۱۴.۵).', 'error');
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
        pricePerUnit: price,
        unit: finalUnit,
        description: desc || 'محصول سفالی درجه یک مناسب کاربری صنعتی و مسکونی.',
        weight: weight || undefined,
        dimensions: dims || undefined,
        coverageInfo: coverageInfoStr,
        primaryUnit: pUnit,
        secondaryUnit: sUnit,
        conversionRatio: ratioVal,
        defaultQuantity: finalDefaultQuantity,
        imageUrl: newProdImageUrl.trim() || undefined,
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
        pricePerUnit: price,
        unit: finalUnit,
        description: desc || 'محصول سفالی درجه یک مناسب کاربری صنعتی و مسکونی.',
        weight: weight || undefined,
        dimensions: dims || undefined,
        coverageInfo: coverageInfoStr,
        isEnabled: true,
        primaryUnit: pUnit,
        secondaryUnit: sUnit,
        conversionRatio: ratioVal,
        defaultQuantity: finalDefaultQuantity,
        imageUrl: newProdImageUrl.trim() || undefined,
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

    if (!editingShippingCompany && shippingCompanies.some(sc => sc.code?.toUpperCase() === code.toUpperCase())) {
      showToast('این کد شرکت حمل و نقل قبلاً ثبت شده است.', 'error');
      return;
    }

    if (editingShippingCompany) {
      const updatedCompany: ShippingCompany = {
        ...editingShippingCompany,
        name: name,
        code: code.toUpperCase(),
        phoneNumber: phone,
        managerName: manager || 'نامشخص',
        nationalId: newSCNationalId.trim() || undefined,
        economicCode: newSCEconomicCode.trim() || undefined,
        password: newSCPassword.trim() || undefined,
      };

      const success = await onUpdateShippingCompany?.(updatedCompany);
      if (success) {
        cancelEditingShippingCompany();
      }
    } else {
      const newCompany: ShippingCompany = {
        id: `sc-${Date.now()}`,
        name: name,
        code: code.toUpperCase(),
        phoneNumber: phone,
        managerName: manager || 'نامشخص',
        isEnabled: true,
        nationalId: newSCNationalId.trim() || undefined,
        economicCode: newSCEconomicCode.trim() || undefined,
        password: newSCPassword.trim() || '123456',
      };

      const success = await onAddShippingCompany(newCompany);
      if (success) {
        cancelEditingShippingCompany();
      }
    }
  };

  // Filter orders by active panel tab criteria
  const getTabOrders = () => {
    return orders.filter((order) => {
      // Basic Tab status matches
      if (activeTab === 'PENDING_APPROVAL') {
        if (order.status !== 'PENDING_APPROVAL' && !order.hasPendingEdit) return false;
      } else if (activeTab === 'APPROVED_PRIORITIES') {
        if (order.status !== 'APPROVED_BY_SALES') return false;
      } else if (activeTab === 'ARCHIVAL_ORDERS') {
        if ((order.status === 'PENDING_APPROVAL' || order.status === 'APPROVED_BY_SALES') && !order.hasPendingEdit) return false;
        
        // اعمال فیلتر هوشمند زیرشاخه آرشیو
        if (archiveStatusFilter !== 'ALL') {
          if (order.status !== archiveStatusFilter) return false;
        }

        // اعمال فیلتر نمایندگی انتخاب‌شده
        if (archiveAgentFilter !== 'ALL') {
          if (order.agentCode !== archiveAgentFilter) return false;
        }
      } else {
        return false; // Non-orders tabs handled separately
      }

      // Query Filter match
      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        const orderId = (order.id || '').toLowerCase();
        const financialDoc = (order.financialDocId || '').toLowerCase();
        const billNo = (order.vehicleDetails?.billOfLadingNumber || '').toLowerCase();
        const driverName = order.vehicleDetails?.driverName?.toLowerCase() || '';
        const driverPhone = order.vehicleDetails?.driverPhone?.toLowerCase() || '';
        const licensePlate = order.vehicleDetails?.licensePlate?.toLowerCase() || '';
        const shippingAgency = order.vehicleDetails?.shippingAgency?.toLowerCase() || '';
        const buyerName = order.buyerName?.toLowerCase() || '';
        const agentCode = order.agentCode?.toLowerCase() || '';
        const paymentCode = order.paymentTrackingCode?.toLowerCase() || '';

        return (
          order.customerName.toLowerCase().includes(q) ||
          order.productName.toLowerCase().includes(q) ||
          order.orderNumber.toLowerCase().includes(q) ||
          order.destinationCity.toLowerCase().includes(q) ||
          orderId.includes(q) ||
          financialDoc.includes(q) ||
          billNo.includes(q) ||
          buyerName.includes(q) ||
          agentCode.includes(q) ||
          driverName.includes(q) ||
          driverPhone.includes(q) ||
          licensePlate.includes(q) ||
          shippingAgency.includes(q) ||
          paymentCode.includes(q)
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
        
        {/* Workspace navigation: Visually separated into Order Operations & Base System Definitions */}
        <div className="space-y-4 border-b border-slate-200 pb-5 mb-5">
          
          {/* Top Row: Group 1 & Group 2 Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3" id="manager-panel-tabs">
            
            {/* Group 1: Order Operations & Analytics (7 Cols) */}
            <div className="lg:col-span-7 bg-slate-50 border border-slate-200/90 rounded-2xl p-3 shadow-2xs space-y-2">
              <div className="flex items-center justify-between border-b border-slate-200/80 pb-2 px-1">
                <span className="text-[11px] font-black text-slate-700 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  🛒 مدیریت و پردازش سفارشات (جریان لایو)
                </span>
                <span className="text-[10px] text-slate-500 font-medium">سفارشات، ارسال‌ها و آمار</span>
              </div>
              
              <div className="flex flex-wrap gap-1.5">
                {/* Tab 0: Commercial Analytics Dashboard */}
                <button
                  onClick={() => setActiveTab('COMMERCIAL_ANALYTICS')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'COMMERCIAL_ANALYTICS'
                      ? 'bg-amber-600 text-white shadow-sm ring-2 ring-amber-300'
                      : 'bg-white text-amber-900 border border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5 text-amber-700" />
                  <span>آمار و تحلیل بازرگانی</span>
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                </button>

                {/* Tab 1: Received Orders (formerly "کارتابل تایید سفارشات") */}
                <button
                  onClick={() => setActiveTab('PENDING_APPROVAL')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'PENDING_APPROVAL'
                      ? 'bg-amber-500 text-slate-950 shadow-sm ring-2 ring-amber-400'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  <span>سفارشات رسیده ({totalPending})</span>
                </button>

                {/* Tab 2: Dispatch to Sales (formerly "اولویت‌بندی ارسال کارخانه") */}
                <button
                  onClick={() => setActiveTab('APPROVED_PRIORITIES')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'APPROVED_PRIORITIES'
                      ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-300'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5 text-indigo-500" />
                  <span>ارسال به فروش ({approvedButPendingDispatch.length})</span>
                </button>

                {/* Tab 6: Archival & Factory Tracking */}
                <button
                  onClick={() => setActiveTab('ARCHIVAL_ORDERS')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'ARCHIVAL_ORDERS'
                      ? 'bg-slate-800 text-white shadow-sm ring-2 ring-slate-400'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 text-indigo-600" />
                  <span>رهگیری و آرشیو ({orders.filter(o => o.status !== 'PENDING_APPROVAL' && o.status !== 'APPROVED_BY_SALES').length})</span>
                </button>
              </div>
            </div>

            {/* Group 2: Base System Definitions & Users (5 Cols - DISTINCT VISUAL STYLE) */}
            <div className="lg:col-span-5 bg-gradient-to-br from-indigo-50/90 to-purple-50/90 border-2 border-indigo-200/90 rounded-2xl p-3 shadow-xs space-y-2">
              <div className="flex items-center justify-between border-b border-indigo-200/80 pb-2 px-1">
                <span className="text-[11px] font-black text-indigo-950 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                  ⚙️ تعریف اطلاعات پایه و دسترسی کاربران
                </span>
                <span className="px-2 py-0.5 bg-indigo-600 text-white text-[9px] rounded-full font-bold">پایه سیستم</span>
              </div>
              
              <div className="flex flex-wrap gap-1.5">
                {/* Tab 3: Unified Partners & Users Management */}
                <button
                  onClick={() => {
                    setActiveTab('PARTNERS_MGMT');
                    fetchUsers();
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'PARTNERS_MGMT' && partnerSubTab !== 'SHIPPING'
                      ? 'bg-slate-900 text-amber-300 shadow-md ring-2 ring-amber-400'
                      : 'bg-white text-slate-800 border border-indigo-200 hover:bg-indigo-100/70'
                  }`}
                >
                  <Users className="w-3.5 h-3.5 text-amber-500" />
                  <span>کاربران و نمایندگی‌ها ({agents.length} نمایندگی / {users.length} کاربر)</span>
                </button>

                {/* Tab 4: Products */}
                <button
                  onClick={() => setActiveTab('PRODUCTS_MGMT')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'PRODUCTS_MGMT'
                      ? 'bg-emerald-600 text-white shadow-md ring-2 ring-emerald-300'
                      : 'bg-white text-emerald-950 border border-emerald-200 hover:bg-emerald-100/70'
                  }`}
                >
                  <Briefcase className="w-3.5 h-3.5 text-emerald-600" />
                  <span>محصولات ({products.length})</span>
                </button>

                {/* Tab 5: Shipping Companies */}
                <button
                  onClick={() => {
                    setActiveTab('PARTNERS_MGMT');
                    setPartnerSubTab('SHIPPING');
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'PARTNERS_MGMT' && partnerSubTab === 'SHIPPING'
                      ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-300'
                      : 'bg-white text-blue-950 border border-blue-200 hover:bg-blue-100/70'
                  }`}
                >
                  <Truck className="w-3.5 h-3.5 text-blue-600" />
                  <span>شرکت‌های حمل ({shippingCompanies.length})</span>
                </button>
              </div>
            </div>

          </div>

          {/* Top Pending Edit Notification Banner */}
          {orders.some(o => o.hasPendingEdit) && (
            <div className="bg-gradient-to-r from-amber-500/15 via-amber-100/80 to-amber-50 border-2 border-amber-400 rounded-2xl p-3.5 shadow-sm flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500 text-slate-950 rounded-xl font-bold text-lg shadow-xs shrink-0 animate-bounce">
                  ⚠️
                </div>
                <div>
                  <h4 className="font-extrabold text-slate-900 text-xs md:text-sm flex items-center gap-2">
                    <span>درخواست اصلاحیه سفارش از سوی نمایندگی فروش</span>
                    <span className="bg-amber-500 text-slate-950 font-mono text-xs px-2 py-0.5 rounded-full font-black">
                      {orders.filter(o => o.hasPendingEdit).length} مورد
                    </span>
                  </h4>
                  <p className="text-[11px] text-amber-900 mt-0.5">
                    تغییراتی در مشخصات سفارش (مقدار، خریدار، آدرس، باربری و...) توسط نمایندگی ثبت شده و در انتظار بررسی و تایید شماست. (نوبت سفارش در کارخانه ثابت است)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {orders.filter(o => o.hasPendingEdit).map(ord => (
                  <button
                    key={ord.id}
                    type="button"
                    onClick={() => setReviewingEditOrder(ord)}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-black text-xs px-3.5 py-2 rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5 animate-pulse"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    <span>بررسی اصلاحیه سفارش #{ord.orderNumber}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick query filter (only for order views) */}
          {(activeTab === 'PENDING_APPROVAL' || activeTab === 'APPROVED_PRIORITIES' || activeTab === 'ARCHIVAL_ORDERS') && (
            <div className="relative w-full" id="manager-tab-search">
              <input
                type="text"
                placeholder="جستجوی سریع سفارش (کد رهگیری، خریدار، نماینده، شهر...)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-500 rounded-xl py-2 pr-9 pl-8 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all font-sans"
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                  title="پاکسازی عبارت جستجو"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* RENDER SECTION 0: COMMERCIAL ANALYTICS DASHBOARD (داشبورد آمار و تحلیل بازرگانی) */}
        {activeTab === 'COMMERCIAL_ANALYTICS' && (
          <CommercialAnalyticsDashboard
            orders={orders}
            products={products}
            agents={agents}
            shippingCompanies={shippingCompanies}
            onApproveOrder={onApproveOrder}
            onDispatchToFactory={onDispatchToFactory}
            showToast={showToast}
            askConfirm={askConfirm}
          />
        )}

        {/* RENDER SECTION A: CARPARTY ORDERS WAITING FOR APPROVAL (تایید سفارش) */}
        {activeTab === 'PENDING_APPROVAL' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-amber-50/50 rounded-xl p-3 border border-amber-100">
              <div className="text-[11px] text-slate-600 flex items-center gap-2 justify-end order-2 sm:order-1 sm:text-right">
                <span>کلیه سفارشات نمایندگی‌ها ابتدا به کارتابل بالا آمده و در انتظار ارزیابی اعتبار مالی/فروش قرار می‌گیرند.</span>
                <Clock className="w-4 h-4 text-amber-500 flex-shrink-0" />
              </div>
            </div>

            {/* Batch Selection Control Bar */}
            {visibleOrders.length > 0 && (
              <div className="bg-slate-900 text-white rounded-xl p-3.5 md:p-4 border border-slate-800 shadow-md flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => toggleSelectAllVisibleOrders(visibleOrders)}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer border border-slate-700"
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                      visibleOrders.length > 0 && visibleOrders.every(o => selectedOrderIds.includes(o.id))
                        ? 'bg-amber-500 border-amber-500 text-slate-950'
                        : 'border-slate-400 bg-slate-900'
                    }`}>
                      {visibleOrders.length > 0 && visibleOrders.every(o => selectedOrderIds.includes(o.id)) && (
                        <Check className="w-3 h-3 stroke-[3]" />
                      )}
                    </div>
                    <span>
                      {visibleOrders.length > 0 && visibleOrders.every(o => selectedOrderIds.includes(o.id))
                        ? 'لغو انتخاب همه'
                        : `انتخاب همه (${visibleOrders.length} سفارش)`}
                    </span>
                  </button>

                  <div className="text-xs text-slate-300">
                    تعداد انتخاب‌شده: <strong className="text-amber-400 font-mono text-sm">{visibleOrders.filter(o => selectedOrderIds.includes(o.id)).length}</strong> از <span className="font-mono">{visibleOrders.length}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleBatchPrintSelected(visibleOrders)}
                    disabled={visibleOrders.filter(o => selectedOrderIds.includes(o.id)).length === 0}
                    className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm ${
                      visibleOrders.filter(o => selectedOrderIds.includes(o.id)).length > 0
                        ? 'bg-slate-100 hover:bg-white text-slate-900'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-60'
                    }`}
                  >
                    <Printer className="w-4 h-4 text-slate-700" />
                    <span>چاپ دسته‌جمعی انتخاب‌شده‌ها</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleBatchApproveSelected(visibleOrders)}
                    disabled={visibleOrders.filter(o => selectedOrderIds.includes(o.id)).length === 0}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm ${
                      visibleOrders.filter(o => selectedOrderIds.includes(o.id)).length > 0
                        ? 'bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-60'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>تأیید دسته‌جمعی انتخاب‌شده‌ها ({visibleOrders.filter(o => selectedOrderIds.includes(o.id)).length})</span>
                  </button>
                </div>
              </div>
            )}

            {visibleOrders.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-xl" id="empty-pending-mgr">
                <p className="text-slate-400 text-xs font-bold">هیچ سفارشی در انتظار تایید وجود ندارد.</p>
              </div>
            ) : (
              visibleOrders.map((order) => (
                <div 
                  key={order.id} 
                  className={`border rounded-xl p-4 md:p-5 transition-all ${
                    selectedOrderIds.includes(order.id)
                      ? 'border-amber-500 bg-amber-50/30 ring-2 ring-amber-400/40 shadow-md'
                      : 'border-amber-200/80 bg-amber-50/5 hover:border-amber-300'
                  }`}
                >
                  <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-rose-100/30">
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={selectedOrderIds.includes(order.id)}
                        onChange={() => toggleSelectOrder(order.id)}
                        className="w-5 h-5 accent-amber-500 rounded cursor-pointer shrink-0"
                        title="انتخاب این سفارش جهت تایید یا چاپ دسته‌جمعی"
                      />
                      <strong className="text-slate-800 text-sm">{order.customerName}</strong>
                      <span className="text-[10px] bg-slate-100 text-slate-500 font-mono py-0.5 px-2 rounded">کد نماینده: {order.agentCode}</span>
                      {order.buyerName && (
                        <span className="text-[10.5px] bg-emerald-50 text-emerald-800 font-bold border border-emerald-100 py-0.5 px-2 rounded">خریدار: {order.buyerName}</span>
                      )}
                      {order.hasPendingEdit && (
                        <button
                          type="button"
                          onClick={() => setReviewingEditOrder(order)}
                          className="text-[10.5px] bg-amber-500 hover:bg-amber-600 text-white font-bold py-1 px-3 rounded-full flex items-center gap-1.5 shadow-xs transition-all cursor-pointer animate-pulse"
                        >
                          <Edit className="w-3.5 h-3.5" />
                          <span>⚠️ بررسی و تایید ویرایش سفارش</span>
                        </button>
                      )}
                      {order.isExportOrder && (
                        <span className="text-[10px] bg-sky-100 text-sky-900 font-bold border border-sky-300/80 py-0.5 px-2.5 rounded-full flex items-center gap-1">
                          <Globe className="w-3 h-3 text-sky-600" />
                          سفارش صادراتی ({order.destinationCountry || 'خارجی'})
                        </span>
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
                            const parsed = parseAndHydrateItemsJson(order.itemsJson, products);
                            if (parsed.length > 0) {
                              return parsed.map((item) => `${item.productName} (${item.quantity?.toLocaleString()} ${item.unit || order.unit})`).join(' + ');
                            }
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
                          const parsed = parseAndHydrateItemsJson(order.itemsJson, products);
                          if (parsed.length > 0) {
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
                                            const cleanCov = toEnglishDigits(prod.coverageInfo);
                                            const parsedNum = cleanCov.match(/\d+(?:\.\d+)?/);
                                            if (parsedNum) ratio = parseFloat(parsedNum[0]);
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
                          'آیا مایلید تمامی سفارشات تأیید شده حاضر در صف را به خط تولید و فروش کارخانه ارسال نمایید؟ همچنین فایل PDF رسمی کلیه سفارشات صادر و چاپ خواهد شد.',
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
                          {order.hasPendingEdit && (
                            <button
                              type="button"
                              onClick={() => setReviewingEditOrder(order)}
                              className="text-[9px] bg-amber-500 hover:bg-amber-600 text-white font-bold py-0.5 px-2 rounded-full flex items-center gap-1 shadow-xs transition-all cursor-pointer animate-pulse"
                            >
                              <Edit className="w-3 h-3" />
                              <span>⚠️ اصلاحیه جدید</span>
                            </button>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-1">
                          {(() => {
                            if (order.itemsJson) {
                              const parsed = parseAndHydrateItemsJson(order.itemsJson, products);
                              if (parsed.length > 0) {
                                return (
                                  <div className="flex flex-wrap gap-1.5 mt-1">
                                    {parsed.map((item, i) => (
                                      <span key={i} className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 py-0.5 px-2 rounded-md font-medium text-[10px]">
                                        {item.productName}: <strong className="font-mono text-slate-950">{item.quantity?.toLocaleString()} {item.unit || order.unit}</strong>
                                      </span>
                                    ))}
                                  </div>
                                );
                              }
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
                                  const cleanCov = toEnglishDigits(prod.coverageInfo);
                                  const parsedNum = cleanCov.match(/\d+(?:\.\d+)?/);
                                  if (parsedNum) ratio = parseFloat(parsedNum[0]);
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

        {/* RENDER SECTION C: PARTNERS & USERS WORKSPACE (مدیریت متمرکز همکاران رسمی و کدهای امنیتی) */}
        {activeTab === 'PARTNERS_MGMT' && (
          <div className="space-y-6 text-right">
            
            {/* Explanatory Banner on Corporate Security Policy */}
            <div className="bg-gradient-to-l from-slate-900 to-indigo-950 border border-slate-700/60 rounded-2xl p-5 shadow-lg flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-right animate-fade-in" id="security-control-banner">
              <div className="space-y-1">
                <h4 className="text-sm font-black text-amber-400 flex items-center gap-1.5 justify-end">
                  <span>مدیریت متمرکز نمایندگی‌های رسمی و دسترسی به سامانه (سفال طبرستان)</span>
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                </h4>
                <p className="text-[11px] text-slate-300 leading-relaxed font-sans max-w-4xl">
                  پیرو آیین‌نامه انضباطی سازمان فروش، اختصاص پنل نمایندگان صرفاً بر اساس قراردادهای تجاری منعقد شده مقدور است. هرگونه تعریف حساب کاربری غیراز این بخش ممنوع بوده و حق فعال‌سازی، غیرفعالسازی و تغییر کدهای تفصیلیِ نمایندگان و باربری‌های همکار منحصراً در غیاب ثبت‌نام عمومی، در اختیار اداره بازرگانی است.
                </p>
              </div>
            </div>

             {/* Sub-tab Switches */}
             <div className="flex bg-slate-100 p-1 rounded-xl max-w-2xl mx-auto border border-slate-200" id="partners-sub-navigation">
               <button
                 type="button"
                 onClick={() => setPartnerSubTab('USERS')}
                 className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-extrabold cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
                   partnerSubTab === 'USERS'
                     ? 'bg-slate-800 text-white shadow-sm font-bold'
                     : 'text-slate-500 hover:text-slate-800'
                 }`}
               >
                 <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
                 <span>کلیدها و حساب‌ها ({users.length} کاربر)</span>
               </button>
               
               <button
                 type="button"
                 onClick={() => setPartnerSubTab('AGENTS')}
                 className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-extrabold cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
                   partnerSubTab === 'AGENTS'
                     ? 'bg-slate-800 text-white shadow-sm font-bold'
                     : 'text-slate-500 hover:text-slate-800'
                 }`}
               >
                 <Users className="w-3.5 h-3.5" />
                 <span>نمایندگان فروش ({agents.length})</span>
               </button>

               <button
                 type="button"
                 onClick={() => setPartnerSubTab('SHIPPING')}
                 className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-extrabold cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
                   partnerSubTab === 'SHIPPING'
                     ? 'bg-slate-800 text-white shadow-sm font-bold'
                     : 'text-slate-500 hover:text-slate-800'
                 }`}
               >
                 <Truck className="w-3.5 h-3.5 text-blue-500" />
                 <span>شرکت‌های حمل و نقل ({shippingCompanies.length})</span>
               </button>
             </div>

            {partnerSubTab === 'AGENTS' && (
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
                        <div className="flex items-center gap-2 wrap flex-wrap">
                          <strong className="text-slate-800 text-sm">{agent.alias}</strong>
                          <span className="text-[9px] bg-slate-100 text-slate-500 font-mono py-0.5 px-2 rounded">کد: {agent.agentCode}</span>
                          {agent.personType === 'LEGAL' ? (
                            <span className="text-[9px] bg-indigo-100 text-indigo-900 border border-indigo-200/80 py-0.5 px-2 rounded-full font-bold flex items-center gap-1">
                              🏢 شخص حقوقی {agent.companyName ? `(${agent.companyName})` : ''}
                            </span>
                          ) : (
                            <span className="text-[9px] bg-emerald-100 text-emerald-900 border border-emerald-200/80 py-0.5 px-2 rounded-full font-bold flex items-center gap-1">
                              👤 شخص حقیقی
                            </span>
                          )}
                          {agent.isExportAgent && (
                            <span className="text-[9px] bg-sky-100 text-sky-800 border border-sky-200/80 py-0.5 px-2 rounded-full font-bold flex items-center gap-1">
                              <Globe className="w-2.5 h-2.5 text-sky-600" />
                              نمایندگی صادرات
                            </span>
                          )}
                          {!agent.isEnabled && <span className="text-[9px] bg-rose-100 text-rose-700 py-0.5 px-2 rounded-full font-bold">غیرفعال‌شده</span>}
                        </div>
                        <p className="text-[11px] text-slate-600 mt-1 font-sans">
                          💼 مسئول: <strong>{agent.fullName}</strong> • محدوده: {agent.area}
                        </p>
                        {agent.personType === 'LEGAL' ? (
                          <div className="text-[10px] text-slate-600 font-mono mt-1 bg-indigo-50/50 p-1.5 rounded border border-indigo-100/80 space-y-0.5">
                            <div>🏛️ شرکت: <strong className="text-indigo-950 font-sans">{agent.companyName || '-'}</strong></div>
                            <div>شناسه ملی: <strong className="text-slate-800">{agent.nationalId || '-'}</strong> | شماره ثبت: <strong className="text-slate-800">{agent.registrationNumber || '-'}</strong> | شماره اقتصادی: <strong className="text-slate-800">{agent.economicCode || '-'}</strong></div>
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-600 font-mono mt-1 bg-emerald-50/40 p-1.5 rounded border border-emerald-100/80">
                            🆔 کد ملی نماینده: <strong className="text-slate-800">{agent.nationalCode || '-'}</strong> | شماره اقتصادی: <strong className="text-slate-800">{agent.economicCode || '-'}</strong>
                          </div>
                        )}
                        <p className="text-[10px] text-slate-400 leading-snug mt-1">📍 آدرس: {agent.address}</p>
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
                {/* Person Type Selector */}
                <div className="bg-white p-2.5 rounded-lg border border-slate-200 space-y-1.5">
                  <label className="block text-slate-700 text-[10px] font-bold">
                    نوع شخص نماینده: <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewAgentPersonType('REAL')}
                      className={`py-1.5 px-3 rounded text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer border ${
                        newAgentPersonType === 'REAL'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span>👤 شخص حقیقی</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewAgentPersonType('LEGAL')}
                      className={`py-1.5 px-3 rounded text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer border ${
                        newAgentPersonType === 'LEGAL'
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span>🏢 شخص حقوقی</span>
                    </button>
                  </div>
                </div>

                {/* Conditional Fields: Legal vs Real Person */}
                {newAgentPersonType === 'LEGAL' ? (
                  <div className="bg-indigo-50/60 border border-indigo-200/70 p-3 rounded-lg space-y-3">
                    <div className="text-[10px] font-bold text-indigo-900 flex items-center gap-1 border-b border-indigo-100 pb-1">
                      <span>اطلاعات تکمیلی شخص حقوقی / شرکت</span>
                    </div>
                    <div>
                      <label className="block text-slate-700 text-[10px] mb-1 font-bold">
                        نام شرکت یا موسسه حقوقی: <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="مثال: شرکت بازرگانی کاشی و سرامیک طبرستان (سهامی خاص)"
                        value={newAgentCompanyName}
                        onChange={(e) => setNewAgentCompanyName(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-slate-700 text-[10px] mb-1 font-bold">
                          شناسه ملی (۱۱ رقمی):
                        </label>
                        <input
                          type="text"
                          placeholder="1010..."
                          value={newAgentNationalId}
                          onChange={(e) => setNewAgentNationalId(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-left"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-700 text-[10px] mb-1 font-bold">
                          شماره ثبت شرکت:
                        </label>
                        <input
                          type="text"
                          placeholder="مثال: ۴۵۸۹۲"
                          value={newAgentRegistrationNumber}
                          onChange={(e) => setNewAgentRegistrationNumber(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-left"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-slate-700 text-[10px] mb-1 font-bold">
                        شماره اقتصادی شخص حقوقی:
                      </label>
                      <input
                        type="text"
                        placeholder="411..."
                        value={newAgentEconomicCode}
                        onChange={(e) => setNewAgentEconomicCode(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-left"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="bg-emerald-50/50 border border-emerald-200/70 p-3 rounded-lg space-y-3">
                    <div className="text-[10px] font-bold text-emerald-900 flex items-center gap-1 border-b border-emerald-100 pb-1">
                      <span>اطلاعات تکمیلی شخص حقیقی</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-slate-700 text-[10px] mb-1 font-bold">
                          کد ملی نماینده (۱۰ رقمی):
                        </label>
                        <input
                          type="text"
                          placeholder="209..."
                          value={newAgentNationalCode}
                          onChange={(e) => setNewAgentNationalCode(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono text-left"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-700 text-[10px] mb-1 font-bold">
                          شماره اقتصادی:
                        </label>
                        <input
                          type="text"
                          placeholder="411..."
                          value={newAgentEconomicCode}
                          onChange={(e) => setNewAgentEconomicCode(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono text-left"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-slate-600 text-[10px] mb-1 font-bold">
                    نام و نام خانوادگی نماینده مسئول / مدیریت: <span className="text-rose-500">*</span>
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

                {/* Territory Selection Component */}
                <div className="bg-slate-50/80 border border-slate-200 rounded-lg p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-slate-800 text-xs font-bold flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                      <span>تعیین محدوده فعالیت و قلمرو مجاز نمایندگی</span>
                    </label>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-medium">
                      {newAgentTerritories.length === 0 ? 'سراسر کشور' : `${newAgentTerritories.length} استان ثبت‌شده`}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    می‌توانید کل یک استان یا شهرهای خاصی از یک استان را برای این نماینده تعیین کنید. در زمان ثبت سفارش توسط نماینده، فقط لیست شهرهای مجاز در این محدوده نمایش داده خواهد شد.
                  </p>

                  {/* Current Assigned Territories List */}
                  {newAgentTerritories.length > 0 && (
                    <div className="space-y-1.5 bg-white p-2.5 rounded-md border border-slate-200">
                      <div className="text-[10px] font-bold text-slate-600 mb-1">استان‌ها و شهرهای تخصیص داده شده:</div>
                      <div className="flex flex-wrap gap-1.5">
                        {newAgentTerritories.map((t) => (
                          <div key={t.province} className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-900 text-[11px] px-2.5 py-1 rounded-md font-sans">
                            <span className="font-bold">{t.province}:</span>
                            <span>{t.allCities ? 'کل استان' : (t.cities && t.cities.length > 0 ? t.cities.join('، ') : 'همه شهرها')}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveTerritoryRule(t.province)}
                              className="text-rose-500 hover:text-rose-700 hover:bg-rose-100 rounded p-0.5 transition-colors mr-1 cursor-pointer"
                              title="حذف این استان از محدوده"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Territory Adding Controls */}
                  <div className="bg-white p-2.5 rounded-md border border-slate-200 space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-slate-600 font-bold mb-1">انتخاب استان:</label>
                        <select
                          value={builderProvince}
                          onChange={(e) => {
                            const p = e.target.value;
                            setBuilderProvince(p);
                            setBuilderSelectedCities(getCitiesForProvince(p));
                          }}
                          className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans cursor-pointer"
                        >
                          {IRAN_PROVINCES.map(p => (
                            <option key={p.name} value={p.name}>{p.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] text-slate-600 font-bold mb-1">نوع پوشش در استان:</label>
                        <div className="flex items-center gap-3 py-1">
                          <label className="flex items-center gap-1 cursor-pointer text-xs text-slate-700 select-none">
                            <input
                              type="radio"
                              name="builderAllCities"
                              checked={builderAllCities}
                              onChange={() => setBuilderAllCities(true)}
                              className="accent-emerald-600 cursor-pointer"
                            />
                            <span className="font-medium">کل استان (تمام شهرها)</span>
                          </label>
                          <label className="flex items-center gap-1 cursor-pointer text-xs text-slate-700 select-none">
                            <input
                              type="radio"
                              name="builderAllCities"
                              checked={!builderAllCities}
                              onChange={() => {
                                setBuilderAllCities(false);
                                if (builderSelectedCities.length === 0) {
                                  setBuilderSelectedCities(getCitiesForProvince(builderProvince));
                                }
                              }}
                              className="accent-emerald-600 cursor-pointer"
                            />
                            <span className="font-medium">شهرهای خاص</span>
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Cities Selector if 'شهرهای خاص' selected */}
                    {!builderAllCities && (
                      <div className="pt-2 border-t border-slate-100 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-600">
                            شهرهای مجاز در استان {builderProvince}:
                          </span>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setBuilderSelectedCities(getCitiesForProvince(builderProvince))}
                              className="text-[10px] text-emerald-700 hover:underline cursor-pointer"
                            >
                              انتخاب همه
                            </button>
                            <button
                              type="button"
                              onClick={() => setBuilderSelectedCities([])}
                              className="text-[10px] text-rose-600 hover:underline cursor-pointer"
                            >
                              پاکسازی
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1 bg-slate-50/50 rounded border border-slate-100">
                          {getCitiesForProvince(builderProvince).map(cityName => {
                            const isSelected = builderSelectedCities.includes(cityName);
                            return (
                              <button
                                type="button"
                                key={cityName}
                                onClick={() => {
                                  if (isSelected) {
                                    setBuilderSelectedCities(builderSelectedCities.filter(c => c !== cityName));
                                  } else {
                                    setBuilderSelectedCities([...builderSelectedCities, cityName]);
                                  }
                                }}
                                className={`text-[10px] px-2.5 py-1 rounded-full border transition-all cursor-pointer ${
                                  isSelected 
                                    ? 'bg-emerald-600 text-white border-emerald-600 font-bold' 
                                    : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300'
                                }`}
                              >
                                {cityName}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleAddTerritoryRule}
                      className="w-full mt-1 bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border border-slate-200 hover:border-emerald-300 text-xs py-1.5 px-3 rounded-md font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5 text-emerald-600" />
                      <span>ثبت/بروزرسانی محدوده استان {builderProvince}</span>
                    </button>
                  </div>
                </div>

                {/* Export Agent Toggle Option */}
                <div className="bg-sky-50/80 border border-sky-200/80 rounded-xl p-3">
                  <label htmlFor="isExportAgentCheck" className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      id="isExportAgentCheck"
                      checked={newAgentIsExport}
                      onChange={(e) => setNewAgentIsExport(e.target.checked)}
                      className="w-4 h-4 text-sky-600 rounded border-sky-300 focus:ring-sky-500 cursor-pointer accent-sky-600"
                    />
                    <div className="flex items-center gap-1.5 text-xs font-bold text-sky-950">
                      <Globe className="w-4 h-4 text-sky-600" />
                      <span>مجوز ثبت سفارشات صادراتی (نمایندگی صادرات)</span>
                    </div>
                  </label>
                  <p className="text-[10px] text-sky-700 mt-1 mr-6.5 leading-relaxed">
                    با فعال‌سازی این گزینه، در داشبورد این نمایندگی گزینه سفارش صادراتی فعال شده و امکان انتخاب کشور مقصد، مرز/گمرک خروجی و ارسال به خارج از کشور فراهم خواهد شد.
                  </p>
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

        {partnerSubTab === 'USERS' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-right animate-fade-in font-sans" id="users-mgmt-panel">
            
            {/* Right block: Users list (8 columns) */}
            <div className="lg:col-span-8 space-y-4">
              {/* Online Users Status Bar */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  </span>
                  <div>
                    <span className="font-extrabold text-slate-800">وضعیت حضور زنده کاربران: </span>
                    <span className="font-black text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full mr-1">
                      {users.filter(u => u.isOnline).length} نفر آنلاین
                    </span>
                    <span className="text-slate-500 mr-2 text-[11px]">(از کل {users.length} کاربر تعریف شده)</span>
                  </div>
                </div>

                {/* Filter buttons */}
                <div className="flex items-center gap-1 bg-white border border-slate-200 p-1 rounded-lg">
                  <button
                    onClick={() => setUserOnlineFilter('ALL')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                      userOnlineFilter === 'ALL' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    همه ({users.length})
                  </button>
                  <button
                    onClick={() => setUserOnlineFilter('ONLINE')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      userOnlineFilter === 'ONLINE' ? 'bg-emerald-600 text-white shadow-sm' : 'text-emerald-700 hover:bg-emerald-50'
                    }`}
                  >
                    <span>🟢 آنلاین ({users.filter(u => u.isOnline).length})</span>
                  </button>
                  <button
                    onClick={() => setUserOnlineFilter('OFFLINE')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      userOnlineFilter === 'OFFLINE' ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span>⚪ آفلاین ({users.filter(u => !u.isOnline).length})</span>
                  </button>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-right border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                        <th className="p-3 font-sans">نام و مسئولیت</th>
                        <th className="p-3 font-sans">نام کاربری</th>
                        <th className="p-3 font-sans">شماره تماس (جهت پیامک)</th>
                        <th className="p-3 font-sans">نقش سیستمی</th>
                        <th className="p-3 font-sans">منتسب به</th>
                        <th className="p-3 font-sans text-center">اتصال آنلاین</th>
                        <th className="p-3 font-sans text-center">دسترسی ورود</th>
                        <th className="p-3 font-sans text-center w-20">عملیات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users
                        .filter(u => {
                          if (userOnlineFilter === 'ONLINE') return u.isOnline;
                          if (userOnlineFilter === 'OFFLINE') return !u.isOnline;
                          return true;
                        })
                        .map((u) => {
                          const matchedAgent = agents.find(a => a.agentCode === u.agentCode);
                          const matchedSC = shippingCompanies.find(sc => sc.id === u.shippingCompanyId);
                          return (
                            <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                              <td className="p-3 font-bold text-slate-800 font-sans">{u.fullName}</td>
                              <td className="p-3 font-mono text-slate-600">{u.username}</td>
                              <td className="p-3 font-mono text-slate-600">{u.phoneNumber}</td>
                              <td className="p-3 font-sans">
                                <span className={`py-0.5 px-2 rounded-full text-[10px] font-bold font-sans ${
                                  u.role === 'SYSTEM_ADMIN' ? 'bg-purple-100 text-purple-800' :
                                  u.role === 'SALES_MANAGER' ? 'bg-amber-100 text-amber-800' :
                                  u.role === 'REPRESENTATIVE' ? 'bg-emerald-100 text-emerald-800' :
                                  u.role === 'FACTORY_TRANSPORT' ? 'bg-blue-100 text-blue-800' :
                                  'bg-indigo-100 text-indigo-800'
                                }`}>
                                  {u.role === 'SYSTEM_ADMIN' ? 'ادمین ارشد سیستم' :
                                   u.role === 'SALES_MANAGER' ? 'مدیر بازرگانی' :
                                   u.role === 'REPRESENTATIVE' ? 'نماینده فروش' :
                                   u.role === 'FACTORY_TRANSPORT' ? 'فروش کارخانه' :
                                   'شرکت باربری'}
                                </span>
                              </td>
                              <td className="p-3 text-slate-500 font-sans">
                                {u.role === 'REPRESENTATIVE' && matchedAgent ? (
                                  <span className="text-[10px] font-extrabold text-emerald-700">🏢 {matchedAgent.alias}</span>
                                ) : u.role === 'SHIPPING_COMPANY' && matchedSC ? (
                                  <span className="text-[10px] font-extrabold text-blue-700 font-sans">🚚 {matchedSC.name}</span>
                                ) : (
                                  <span className="text-slate-400 font-sans">-</span>
                                )}
                              </td>
                              <td className="p-3 text-center font-sans">
                                {u.isOnline ? (
                                  <span className="inline-flex items-center gap-1.5 py-0.5 px-2 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    <span className="relative flex h-2 w-2">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                    </span>
                                    <span>آنلاین</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 py-0.5 px-2 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                    <span>آفلاین</span>
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-center font-sans">
                                <span className={`inline-flex items-center gap-1 py-0.5 px-2 rounded text-[10px] font-bold ${
                                  u.isEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                                }`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${u.isEnabled ? 'bg-emerald-600' : 'bg-rose-600'}`} />
                                  {u.isEnabled ? 'مجاز' : 'تعلیق'}
                                </span>
                              </td>
                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => {
                                    setEditingUserId(u.id);
                                    setNewUserFullName(u.fullName);
                                    setNewUsername(u.username);
                                    setNewUserPhone(u.phoneNumber);
                                    setNewUserRole(u.role);
                                    setNewUserAgentCode(u.agentCode || '');
                                    setNewUserSCId(u.shippingCompanyId || '');
                                  }}
                                  className="text-slate-500 hover:text-emerald-600 p-1 cursor-pointer transition-colors"
                                  title="ویرایش دسترسی کاربر"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleToggleUser(u.id)}
                                  className="text-slate-500 hover:text-amber-600 p-1 cursor-pointer transition-colors"
                                  title={u.isEnabled ? 'تعلیق موقت' : 'مجاز نمودن ورود'}
                                >
                                  <ShieldCheck className={`w-3.5 h-3.5 ${u.isEnabled ? 'text-slate-400' : 'text-rose-500'}`} />
                                </button>
                                <button
                                  onClick={() => {
                                    askConfirm(
                                      'حذف دسترسی کاربری',
                                      `آیا نسبت به حذف دائمی مجوز ورود جناب «${u.fullName}» به سامانه اطمینان حاصل دارید؟ پرونده‌های نمایندگی وی در سایر جداول حفظ و فقط ورود با این مشخصات مسدود می‌گردد.`,
                                      () => handleDeleteUser(u.id)
                                    );
                                  }}
                                  className="text-slate-500 hover:text-rose-600 p-1 cursor-pointer transition-colors"
                                  title="حذف دسترسی"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {users.length === 0 && (
                        <tr>
                          <td colSpan={7} className="text-center py-8 text-slate-400 font-sans">
                            هیچ حسابی تعریف نشده است.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Left block: Add/Edit User (4 columns) */}
            <div className="lg:col-span-4 bg-slate-50 p-4 md:p-5 rounded-xl border border-slate-200 shadow-inner">
              <h4 className="font-bold text-slate-800 text-xs flex items-center justify-end gap-1 mb-4 border-b border-slate-200/60 pb-2">
                <span>{editingUserId ? 'ویرایش مجوز دسترسی کاربر' : 'تعریف دسترسی سیستمی جدید'}</span>
                <ShieldCheck className="w-4 h-4 text-amber-500" />
              </h4>

              <form onSubmit={handleAddUser} className="space-y-3.5">
                <div>
                  <label className="block text-slate-600 text-[10px] mb-1 font-bold">
                    نام و نام خانوادگی مسئول: <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: حمیدرضا احمدی"
                    value={newUserFullName}
                    onChange={(e) => setNewUserFullName(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-600 text-[10px] mb-1 font-bold">
                    نام کاربری ورود (یکتا - انگلیسی): <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: hammid_ahmadi"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono text-left"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-600 text-[10px] mb-1 font-bold">
                    تلفن همراه فعال (جهت دریافت پیامک OTP ورود): <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="tel"
                    placeholder="مثال: 09120000001"
                    value={newUserPhone}
                    onChange={(e) => setNewUserPhone(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono text-left"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-600 text-[10px] mb-1 font-bold">
                    کلمه عبور / رمز ورود: {editingUserId ? <span className="text-amber-600 font-normal">(اختیاری - در صورت خالی بودن تغییر نمی‌کند)</span> : <span className="text-slate-400 font-normal">(پیش‌فرض: 123456)</span>}
                  </label>
                  <input
                    type="text"
                    placeholder={editingUserId ? "تغییر رمز عبور (اختیاری)" : "123456"}
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono text-left"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 text-[10px] mb-1 font-bold">
                    سطح و نقش دسترسی به دشبورد: <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={newUserRole}
                    onChange={(e) => {
                      const val = e.target.value as UserRole;
                      setNewUserRole(val);
                      setNewUserAgentCode('');
                      setNewUserSCId('');
                    }}
                    className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans cursor-pointer"
                    required
                  >
                    <option value="SYSTEM_ADMIN">🛡️ ادمین ارشد / مدیر کل نرم‌افزار</option>
                    <option value="SALES_MANAGER">👔 معـاونت / مدیر بازرگانی کارخانه</option>
                    <option value="REPRESENTATIVE">📱 نماینده مقیم فروش (دارنده کد نمایندگی)</option>
                    <option value="FACTORY_TRANSPORT">🏭 مسئول فروش کارخانه</option>
                    <option value="SHIPPING_COMPANY">🚚 متصدی شرکت باربری همکار (پیمانکار)</option>
                  </select>
                </div>

                {newUserRole === 'REPRESENTATIVE' && (
                  <div className="animate-fade-in bg-emerald-50/50 p-2.5 rounded-lg border border-emerald-100 font-sans">
                    <label className="block text-emerald-800 text-[9px] mb-1 font-bold">
                      لینک به دیتای نمایندگی رسمی: <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={newUserAgentCode}
                      onChange={(e) => setNewUserAgentCode(e.target.value)}
                      className="w-full bg-white border border-emerald-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-emerald-500 font-sans cursor-pointer"
                      required
                    >
                      <option value="">-- انتخاب نمایندگی متناظر در قراردادها --</option>
                      {agents.map((ag) => (
                        <option key={ag.id} value={ag.agentCode}>
                          {ag.alias} (کد تفصیلی: {ag.agentCode})
                        </option>
                      ))}
                    </select>
                    <p className="text-[8px] text-emerald-600 mt-1 font-sans">پس از ورود، داده‌های این نماینده به‌صورت خودکار و انحصاری فیلتر می‌شوند.</p>
                  </div>
                )}

                {newUserRole === 'SHIPPING_COMPANY' && (
                  <div className="animate-fade-in bg-blue-50/50 p-2.5 rounded-lg border border-blue-100 font-sans">
                    <label className="block text-blue-800 text-[9px] mb-1 font-bold">
                      لینک به هویت شرکت ترانزیت: <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={newUserSCId}
                      onChange={(e) => setNewUserSCId(e.target.value)}
                      className="w-full bg-white border border-blue-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-emerald-500 font-sans cursor-pointer"
                      required
                    >
                      <option value="">-- انتخاب شرکت حمل و نقل متناظر --</option>
                      {shippingCompanies.map((sc) => (
                        <option key={sc.id} value={sc.id}>
                          {sc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg text-xs transition-colors cursor-pointer flex items-center justify-center gap-1 shadow font-sans"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{editingUserId ? 'ثبت ویرایش دسترسی' : 'ایجاد حساب کاربری'}</span>
                  </button>
                  {editingUserId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingUserId(null);
                        setNewUsername('');
                        setNewUserFullName('');
                        setNewUserPhone('');
                        setNewUserPassword('');
                        setNewUserRole('REPRESENTATIVE');
                        setNewUserAgentCode('');
                        setNewUserSCId('');
                      }}
                      className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-2 px-3 rounded-lg text-xs transition-colors cursor-pointer font-sans"
                    >
                      انصراف
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
        )}

        {partnerSubTab === 'SHIPPING' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-right animate-fade-in font-sans pb-10" id="shipping-subtab-panel">
            {/* Right block: Companies List (8 columns) */}
            <div className="lg:col-span-8 space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-600 flex items-center justify-between gap-1.5">
                <div className="text-right">
                  <h4 className="font-bold text-slate-800">ناوگان‌های همکار طبرستان</h4>
                  <p className="text-[10px] text-slate-500 mt-0.5">در زمان تخصیص وسیله نقلیه در کارخانه، امکان ارجاع تکی یا گروهی سفارش به ترابری شرکت‌های منتخب زیر فراهم خواهد بود.</p>
                </div>
                <Truck className="w-5 h-5 text-indigo-500 flex-shrink-0" />
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-right border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-bold border-b border-rose-100">
                      <th className="p-3">نام شرکت حمل و نقل</th>
                      <th className="p-3 font-sans">کد ترابری</th>
                      <th className="p-3">مدیر عامل / رابط</th>
                      <th className="p-3">شماره تماس پشتیبانی</th>
                      <th className="p-3 text-center">وضعیت همکاری</th>
                      <th className="p-3 text-center">عملیات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shippingCompanies.map((company) => (
                      <tr key={company.id} className="border-b border-slate-100 hover:bg-slate-50 transition-all">
                        <td className="p-3">
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded bg-blue-500 block"></span>
                            <span>{company.name}</span>
                          </div>
                          {(company.nationalId || company.economicCode) && (
                            <div className="text-[10px] text-slate-500 font-mono mt-1 pr-4">
                              {company.nationalId && <span>شناسه ملی: <strong className="text-slate-700">{company.nationalId}</strong></span>}
                              {company.nationalId && company.economicCode && <span className="mx-1 text-slate-300">|</span>}
                              {company.economicCode && <span>کد اقتصادی: <strong className="text-slate-700">{company.economicCode}</strong></span>}
                            </div>
                          )}
                        </td>
                        <td className="p-3 font-mono text-slate-600 font-bold">{company.code}</td>
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
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => startEditingShippingCompany(company)}
                              className="p-1 px-1.5 hover:bg-amber-50 text-amber-600 hover:text-amber-800 rounded transition-all cursor-pointer"
                              title="ویرایش مشخصات"
                            >
                              <Edit className="w-4 h-4 mx-auto" />
                            </button>
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
                          </div>
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

            {/* Left block: Create Company Form (4 columns) */}
            <div className="lg:col-span-4 space-y-4">
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <h3 
                  className="text-xs font-extrabold text-slate-800 border-b border-slate-100 pb-2 mb-4 flex items-center justify-end gap-1.5 select-none"
                >
                  <span>{editingShippingCompany ? `ویرایش شرکت حمل و نقل: ${editingShippingCompany.name}` : 'تعریف آژانس حمل و نقل همکار جدید'}</span>
                  {editingShippingCompany ? <Edit className="w-4 h-4 text-amber-600" /> : <PlusCircle className="w-4 h-4 text-emerald-600" />}
                </h3>

                <form id="shipping-registration-form-sub" onSubmit={handleShippingCompanySubmit} className="space-y-4 text-right">
                  <div>
                    <label className="block text-slate-600 text-[10px] mb-1 font-bold">نام شرکت حمل و نقل: <span className="text-rose-500">*</span></label>
                    <input
                      type="text"
                      placeholder="مثال: ترابری جهان گستر شمال"
                      value={newSCName}
                      onChange={(e) => setNewSCName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 text-[10px] mb-1 font-bold">کد یکتا ترابری (به انگلیسی): <span className="text-rose-500">*</span></label>
                    <input
                      type="text"
                      placeholder="مثال: TRANS-NORTH"
                      value={newSCCode}
                      onChange={(e) => setNewSCCode(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 font-mono text-left focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      required
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
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-600 text-[10px] mb-1 font-bold">شناسه ملی شرکت (۱۱ رقمی):</label>
                      <input
                        type="text"
                        placeholder="1010..."
                        value={newSCNationalId}
                        onChange={(e) => setNewSCNationalId(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 font-mono text-left focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 text-[10px] mb-1 font-bold">شماره / کد اقتصادی:</label>
                      <input
                        type="text"
                        placeholder="411..."
                        value={newSCEconomicCode}
                        onChange={(e) => setNewSCEconomicCode(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 font-mono text-left focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-600 text-[10px] mb-1 font-bold">
                      کلمه عبور / رمز ورود حساب کاربری: {editingShippingCompany ? <span className="text-amber-600 font-normal">(اختیاری - در صورت خالی بودن تغییر نمی‌کند)</span> : <span className="text-slate-400 font-normal">(پیش‌فرض: 123456)</span>}
                    </label>
                    <input
                      type="text"
                      placeholder={editingShippingCompany ? "تغییر رمز عبور (اختیاری)" : "123456"}
                      value={newSCPassword}
                      onChange={(e) => setNewSCPassword(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 font-mono text-left focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-2 px-4 rounded text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      {editingShippingCompany ? <Edit className="w-4 h-4" /> : <PlusCircle className="w-4 h-4" />}
                      <span>{editingShippingCompany ? 'ذخیره تغییرات شرکت' : 'ثبت شرکت حمل و نقل جدید'}</span>
                    </button>
                    {editingShippingCompany && (
                      <button
                        type="button"
                        onClick={cancelEditingShippingCompany}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-2 px-3 rounded text-xs transition-all cursor-pointer"
                      >
                        انصراف
                      </button>
                    )}
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
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
                      <div className="flex items-start gap-2.5">
                        {prod.imageUrl ? (
                          <img 
                            src={prod.imageUrl} 
                            alt={prod.name} 
                            className="w-10 h-10 object-cover rounded-lg border border-slate-200 shrink-0 shadow-xs" 
                            referrerPolicy="no-referrer" 
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-200/60 flex items-center justify-center shrink-0 text-amber-700 font-bold text-[10px] shadow-xs">
                            سفال
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <strong className="text-slate-800 text-sm block truncate">{prod.name}</strong>
                          <span className="text-[9px] text-slate-400 font-sans block">{prod.category}</span>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed text-justify h-14 overflow-y-auto pr-1">
                        {prod.description}
                      </p>
                      
                      {/* Technical metrics displaying Weight/Dimension/Coverage */}
                      <div className="bg-slate-50 p-2 rounded text-[10px] text-slate-500 space-y-0.5 border border-slate-100 font-sans">
                        {prod.weight && <p>⚖️ <strong>وزن واحد:</strong> {prod.weight}</p>}
                        {prod.dimensions && <p>📐 <strong>ابعاد دقیق:</strong> {prod.dimensions}</p>}
                        {prod.coverageInfo && <p>📊 <strong>مترطول/مربع:</strong> {prod.coverageInfo}</p>}
                        <p>📦 <strong>پیش‌فرض سفارش:</strong> <span className="font-mono font-bold text-slate-700">{(prod.defaultQuantity || 330).toLocaleString()} {prod.unit}</span></p>
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
                        type="text"
                        inputMode="decimal"
                        value={newProdConversionRatio}
                        onChange={(e) => setNewProdConversionRatio(toEnglishDigits(e.target.value))}
                        placeholder="مثال: ۱۴ یا ۲.۲۵"
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
                      type="text"
                      inputMode="numeric"
                      placeholder="مثال: ۱۵۰۰۰"
                      value={newProdPrice}
                      onChange={(e) => setNewProdPrice(toEnglishDigits(e.target.value))}
                      className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono text-center font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 text-[10px] mb-1 font-bold">وزن واحد نمونه کالا (⚖️):</label>
                    <input
                      type="text"
                      placeholder="مثال: ۳.۲ کیلوگرم"
                      value={newProdWeight}
                      onChange={(e) => setNewProdWeight(toEnglishDigits(e.target.value))}
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
                      onChange={(e) => setNewProdDimensions(toEnglishDigits(e.target.value))}
                      className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 text-[10px] mb-1 font-bold">مقدار پیش‌فرض سفارش (📦):</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="مثال: ۳۳۰"
                      value={newProdDefaultQuantity}
                      onChange={(e) => setNewProdDefaultQuantity(toEnglishDigits(e.target.value))}
                      className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono text-center font-bold"
                    />
                  </div>
                </div>

                {/* Compact Product Image Selector */}
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-slate-700 text-[10px] font-bold">
                      🖼️ تصویر یا عکس کالا (اختیاری - فشرده):
                    </label>
                    {newProdImageUrl && (
                      <button
                        type="button"
                        onClick={() => setNewProdImageUrl('')}
                        className="text-[9px] text-rose-600 hover:text-rose-800 font-bold cursor-pointer"
                      >
                        حذف تصویر
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-lg border border-slate-200 bg-white overflow-hidden flex items-center justify-center shrink-0 shadow-xs">
                      {newProdImageUrl ? (
                        <img src={newProdImageUrl} alt="پیش‌نمایش" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <ImageIcon className="w-4 h-4 text-slate-300" />
                      )}
                    </div>

                    <div className="flex-1 space-y-1.5 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          placeholder="آدرس URL تصویر..."
                          value={newProdImageUrl}
                          onChange={(e) => setNewProdImageUrl(e.target.value)}
                          className="flex-1 bg-white border border-slate-200 rounded px-2 py-1 text-[10px] text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                        />
                        <label className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-[9px] px-2 py-1 rounded cursor-pointer font-bold shrink-0 flex items-center gap-1 transition-colors">
                          <Upload className="w-3 h-3 text-emerald-600" />
                          <span>آپلود عکس</span>
                          <input type="file" accept="image/*" className="hidden" onChange={handleImageFileUpload} />
                        </label>
                      </div>

                      <div className="flex items-center gap-1 overflow-x-auto pb-0.5 no-scrollbar">
                        <span className="text-[9px] text-slate-400 shrink-0 font-bold">انتخاب سریع:</span>
                        {PRESET_PRODUCT_IMAGES.map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => setNewProdImageUrl(preset.url)}
                            className={`text-[9px] px-1.5 py-0.5 rounded border whitespace-nowrap cursor-pointer transition-colors ${
                              newProdImageUrl === preset.url 
                                ? 'bg-emerald-100 border-emerald-400 text-emerald-800 font-bold' 
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
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


        {/* RENDER SECTION F: USERS & PERMISSIONS SYSTEM (تعریف کاربران و سطوح دسترسی) */}
        {activeTab === 'USERS_MGMT' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-right animate-fadeIn" id="users-mgmt-panel">
            
            {/* Right block: Users list (8 columns) */}
            <div className="lg:col-span-8 space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-600 flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-sans">
                <div className="text-right">
                  <h4 className="font-bold text-slate-800 flex items-center gap-2">
                    <span>تعریف کاربران و مدیریت سطوح دسترسی سامانه طبرستان</span>
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      <span>{users.filter(u => u.isOnline).length} آنلاین</span>
                    </span>
                  </h4>
                  <p className="text-[10px] text-slate-500 mt-0.5 font-sans">کاربران تعریف‌شده می‌توانند با شماره تلفن خود و دریافت کد تایید پیامکی (OTP) وارد کارتابل اختصاصی خود شوند.</p>
                </div>
                <Users className="w-5 h-5 text-amber-500 flex-shrink-0" />
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-right border-collapse text-xs font-sans">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-bold border-b border-rose-100">
                        <th className="p-3">نام و مسئولیت</th>
                        <th className="p-3">نام کاربری</th>
                        <th className="p-3">شماره تماس (جهت پیامک)</th>
                        <th className="p-3">نقش سیستمی</th>
                        <th className="p-3">منتسب به</th>
                        <th className="p-3 text-center">اتصال آنلاین</th>
                        <th className="p-3 text-center">وضعیت ورود</th>
                        <th className="p-3 text-center w-20">عملیات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => {
                        // Resolve assignment description
                        let matchDesc = '-';
                        if (u.role === 'REPRESENTATIVE' && u.agentCode) {
                          const ag = agents.find(a => a.agentCode === u.agentCode);
                          matchDesc = ag ? `نمایندگی ${ag.alias}` : `کد نمایندگی ${u.agentCode}`;
                        } else if (u.role === 'SHIPPING_COMPANY' && u.shippingCompanyId) {
                          const sc = shippingCompanies.find(s => s.id === u.shippingCompanyId);
                          matchDesc = sc ? `شرکت ${sc.name}` : `شناسه باربری ${u.shippingCompanyId}`;
                        }

                        // Resolve Role Badge colors
                        let roleColor = 'bg-slate-100 text-slate-800';
                        let roleLabel = 'ناشناس';
                        if (u.role === 'SALES_MANAGER') {
                          roleColor = 'bg-amber-100 text-amber-800 border border-amber-200';
                          roleLabel = 'مدیر بازرگانی و مالی';
                        } else if (u.role === 'REPRESENTATIVE') {
                          roleColor = 'bg-blue-100 text-blue-800 border border-blue-200';
                          roleLabel = 'نماینده فروش مقیم';
                        } else if (u.role === 'FACTORY_TRANSPORT') {
                          roleColor = 'bg-purple-100 text-purple-800 border border-purple-200';
                          roleLabel = 'فروش کارخانه';
                        } else if (u.role === 'SHIPPING_COMPANY') {
                          roleColor = 'bg-emerald-100 text-emerald-800 border border-emerald-200';
                          roleLabel = 'اپراتور باربری همکار';
                        }

                        return (
                          <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50 transition-all">
                            <td className="p-3 font-bold text-slate-900 flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-full ${u.isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></span>
                              <span>{u.fullName}</span>
                            </td>
                            <td className="p-3 font-mono text-slate-600">{u.username}</td>
                            <td className="p-3 font-mono text-slate-600 font-bold">{u.phoneNumber}</td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${roleColor}`}>
                                {roleLabel}
                              </span>
                            </td>
                            <td className="p-3 text-slate-500 font-bold">{matchDesc}</td>
                            <td className="p-3 text-center">
                              {u.isOnline ? (
                                <span className="inline-flex items-center gap-1.5 py-0.5 px-2 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                  </span>
                                  <span>آنلاین</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 py-0.5 px-2 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                  <span>آفلاین</span>
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              <button
                                onClick={() => handleToggleUser(u.id)}
                                className={`px-2 py-0.5 rounded text-[10px] font-extrabold transition-colors cursor-pointer border ${
                                  u.isEnabled
                                    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200'
                                    : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border-rose-200'
                                }`}
                              >
                                {u.isEnabled ? '✅ مجاز به ورود' : '🔒 مسدود شده'}
                              </button>
                            </td>
                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => handleStartEditUser(u)}
                                  className="p-1 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded transition-all cursor-pointer"
                                  title="ویرایش کاربر"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteUser(u.id)}
                                  className="p-1 hover:bg-rose-50 text-rose-500 hover:text-rose-700 rounded transition-all cursor-pointer"
                                  title="حذف کاربر"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {users.length === 0 && (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-400">
                            هیچ کاربری در حال حاضر وجود ندارد.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Left block: Add/Edit User form (4 columns) */}
            <div className="lg:col-span-4 space-y-4 font-sans">
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-xs font-extrabold text-slate-800 border-b border-slate-100 pb-2 mb-4 flex items-center justify-end gap-1.5 font-sans">
                  <span>{editingUserId ? 'ویرایش مشخصات حساب کاربر' : 'تعریف و ثبت نام کاربر جدید'}</span>
                  <PlusCircle className="w-4 h-4 text-emerald-600" />
                </h3>

                <form onSubmit={handleAddUser} className="space-y-4 text-right">
                  <div>
                    <label className="block text-slate-600 text-[10px] mb-1 font-bold">نام و نام خانوادگی مسئول: <span className="text-rose-500">*</span></label>
                    <input
                      type="text"
                      placeholder="مثال: سهراب امیری"
                      value={newUserFullName}
                      onChange={(e) => setNewUserFullName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 text-[10px] mb-1 font-bold">شماره تلفن همراه (جهت احراز هویت پیامکی): <span className="text-rose-500">*</span></label>
                    <input
                      type="text"
                      placeholder="مثال: 09123456789"
                      value={newUserPhone}
                      onChange={(e) => setNewUserPhone(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 font-mono text-left focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      required
                    />
                    <p className="text-[9px] text-slate-400 mt-0.5 font-sans">کد تایید پیامکی شبیه‌سازی شده هنگام ورود به این شماره ارسال خواهد شد.</p>
                  </div>

                  <div>
                    <label className="block text-slate-600 text-[10px] mb-1 font-bold">نام کاربری سیستمی: <span className="text-rose-500">*</span></label>
                    <input
                      type="text"
                      placeholder="مثال: sohrab_shiraz"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 font-mono text-left focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 text-[10px] mb-1 font-bold">
                      کلمه عبور (رمز ورود): {editingUserId ? <span className="text-amber-600 font-normal">(اختیاری - در صورت خالی بودن تغییر نمی‌کند)</span> : <span className="text-slate-400 font-normal">(پیش‌فرض: 123456)</span>}
                    </label>
                    <input
                      type="text"
                      placeholder={editingUserId ? "تغییر رمز (اختیاری)" : "123456"}
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 font-mono text-left focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 text-[10px] mb-1 font-bold">نقش و مسئولیت سازمان: <span className="text-rose-500">*</span></label>
                    <select
                      value={newUserRole}
                      onChange={(e) => {
                        setNewUserRole(e.target.value as UserRole);
                        setNewUserAgentCode('');
                        setNewUserSCId('');
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded px-2 text-xs py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                    >
                      <option value="SYSTEM_ADMIN">🛡️ ادمین ارشد / مدیر کل نرم‌افزار</option>
                      <option value="SALES_MANAGER">👔 مدیر مالی و بازرگانی تهران</option>
                      <option value="REPRESENTATIVE">📱 نماینده فروش (دارنده نمایندگی رسمی)</option>
                      <option value="FACTORY_TRANSPORT">🏭 فروش و خروج متمرکز کارخانه</option>
                      <option value="SHIPPING_COMPANY">🚚 باربری و اتوبار همکار طبرستان (پیمانکار)</option>
                    </select>
                  </div>

                  {/* Representative Link Field */}
                  {newUserRole === 'REPRESENTATIVE' && (
                    <div className="bg-blue-50/50 p-2.5 rounded-lg border border-blue-100 animate-fadeIn font-sans">
                      <label className="block text-slate-600 text-[10px] mb-1 font-bold">منتسب به کدام نمایندگی؟: <span className="text-rose-500">*</span></label>
                      <select
                        value={newUserAgentCode}
                        onChange={(e) => setNewUserAgentCode(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                        required
                      >
                        <option value="">-- لطفاً نمایندگی را انتخاب کنید --</option>
                        {agents.map(ag => (
                          <option key={ag.id} value={ag.agentCode}>{ag.alias} (کد {ag.agentCode})</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Shipping Company Link Field */}
                  {newUserRole === 'SHIPPING_COMPANY' && (
                    <div className="bg-emerald-50/50 p-2.5 rounded-lg border border-emerald-100 animate-fadeIn font-sans">
                      <label className="block text-slate-600 text-[10px] mb-1 font-bold font-sans">شغل اپراتوری کدام شرکت باربری؟: <span className="text-rose-500">*</span></label>
                      <select
                        value={newUserSCId}
                        onChange={(e) => setNewUserSCId(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                        required
                      >
                        <option value="">-- لطفاً شرکت باربری را انتخاب کنید --</option>
                        {shippingCompanies.map(sc => (
                          <option key={sc.id} value={sc.id}>{sc.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button
                      type="submit"
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-3 rounded-lg text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow font-sans"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{editingUserId ? 'ذخیره تغییرات کاربر' : 'ثبت نام قطعی کاربر'}</span>
                    </button>
                    {editingUserId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingUserId(null);
                          setNewUsername('');
                          setNewUserFullName('');
                          setNewUserPhone('');
                          setNewUserPassword('');
                          setNewUserRole('REPRESENTATIVE');
                          setNewUserAgentCode('');
                          setNewUserSCId('');
                        }}
                        className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-2 px-3 rounded-lg text-xs transition-colors cursor-pointer font-sans"
                      >
                        انصراف
                      </button>
                    )}
                  </div>
                </form>
              </div>
            </div>

          </div>
        )}

        {/* RENDER SECTION E: FACTOR LOGS ARCHIVE & LIVE FACTORY TRACKING (رهگیری کامل سفارشات کارخانه و سوابق) */}
        {activeTab === 'ARCHIVAL_ORDERS' && (
          <div className="space-y-5">
            
            {/* Banner & Summary Stats Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-right">
              <div className="bg-slate-800 text-white p-3 rounded-xl border border-slate-700 shadow-sm">
                <span className="text-[10px] text-slate-300 block font-bold">🏭 کل ارسالی به کارخانه</span>
                <strong className="text-base font-black font-mono text-amber-400">
                  {orders.filter(o => o.status !== 'PENDING_APPROVAL' && o.status !== 'APPROVED_BY_SALES').length} سفارش
                </strong>
              </div>
              <div className="bg-blue-50 border border-blue-200/80 p-3 rounded-xl text-blue-900 shadow-sm">
                <span className="text-[10px] text-blue-600 block font-bold">⚙️ ۱. در صف خط کارخانه</span>
                <strong className="text-base font-black font-mono">
                  {orders.filter(o => o.status === 'SENT_TO_FACTORY').length} مورد
                </strong>
              </div>
              <div className="bg-amber-50 border border-amber-200/80 p-3 rounded-xl text-amber-900 shadow-sm">
                <span className="text-[10px] text-amber-600 block font-bold">🚒 ۲. تخصیص خودرو باربری</span>
                <strong className="text-base font-black font-mono">
                  {orders.filter(o => o.status === 'VEHICLE_ASSIGNED').length} مورد
                </strong>
              </div>
              <div className="bg-emerald-50 border border-emerald-200/80 p-3 rounded-xl text-emerald-900 shadow-sm">
                <span className="text-[10px] text-emerald-600 block font-bold">🚚 ۳. ترخیص و در مسیر</span>
                <strong className="text-base font-black font-mono">
                  {orders.filter(o => o.status === 'LOADED_AND_DISPATCHED').length} مورد
                </strong>
              </div>
            </div>

            {/* Sub-Filters and Agent Selector Control Bar */}
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl space-y-3" id="archival-sub-filters">
              
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2.5">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-500" />
                  <span className="text-xs font-black text-slate-800">سامانه متمرکز رهگیری وضعیت سفارشات و تاریخچه سوابق (مدیریت بازرگانی)</span>
                </div>

                {/* Filter by Representative Agent */}
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-slate-600 font-bold">فیلتر نمایندگی:</label>
                  <select
                    value={archiveAgentFilter}
                    onChange={(e) => setArchiveAgentFilter(e.target.value)}
                    className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-800 font-bold focus:outline-none focus:ring-1 focus:ring-slate-500 cursor-pointer"
                  >
                    <option value="ALL">همه نمایندگی‌ها ({agents.length})</option>
                    {agents.map((ag) => (
                      <option key={ag.id} value={ag.agentCode}>
                        {ag.alias} (کد {ag.agentCode})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Status Tabs and Accordion Expand/Collapse Controls */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => expandAllOrders(visibleOrders)}
                    className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 py-1 px-2.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                    title="باز کردن تمامی کارت‌های سفارش جهت مشاهده کامل جزئیات"
                  >
                    <Maximize2 className="w-3 h-3 text-indigo-600" />
                    <span>باز کردن همه</span>
                  </button>
                  <button
                    type="button"
                    onClick={collapseAllOrders}
                    className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 py-1 px-2.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                    title="جمع کردن تمام کارت‌ها به حالت خلاصه و فشرده"
                  >
                    <Minimize2 className="w-3 h-3 text-slate-500" />
                    <span>بستن همه</span>
                  </button>
                  <span className="text-[10px] bg-slate-200/80 text-slate-700 font-bold py-1 px-2 rounded-lg font-mono">
                    {visibleOrders.length} مورد
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 justify-end">
                  <span className="text-[10px] text-slate-400 font-bold self-center ml-1">📍 گام اجرا:</span>
                  <button
                    type="button"
                    onClick={() => setArchiveStatusFilter('ALL')}
                    className={`py-1 px-2.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                      archiveStatusFilter === 'ALL'
                        ? 'bg-slate-800 text-white shadow-sm'
                        : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200/80'
                    }`}
                  >
                    همه ({orders.filter(o => o.status !== 'PENDING_APPROVAL' && o.status !== 'APPROVED_BY_SALES').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setArchiveStatusFilter('SENT_TO_FACTORY')}
                    className={`py-1 px-2.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                      archiveStatusFilter === 'SENT_TO_FACTORY'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200/80'
                    }`}
                  >
                    ۱. در صف کارخانه ({orders.filter(o => o.status === 'SENT_TO_FACTORY').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setArchiveStatusFilter('VEHICLE_ASSIGNED')}
                    className={`py-1 px-2.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                      archiveStatusFilter === 'VEHICLE_ASSIGNED'
                        ? 'bg-amber-500 text-slate-950 shadow-sm'
                        : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200/80'
                    }`}
                  >
                    ۲. تخصیص کامیون ({orders.filter(o => o.status === 'VEHICLE_ASSIGNED').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setArchiveStatusFilter('LOADED_AND_DISPATCHED')}
                    className={`py-1 px-2.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                      archiveStatusFilter === 'LOADED_AND_DISPATCHED'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200/80'
                    }`}
                  >
                    ۳. ترخیص و در حرکت ({orders.filter(o => o.status === 'LOADED_AND_DISPATCHED').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setArchiveStatusFilter('REJECTED')}
                    className={`py-1 px-2.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                      archiveStatusFilter === 'REJECTED'
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200/80'
                    }`}
                  >
                    ابطال / لغو ({orders.filter(o => o.status === 'REJECTED').length})
                  </button>
                </div>
              </div>

            </div>

            {visibleOrders.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <p className="text-slate-400 text-xs font-bold">هیچ سفارشی مطابق فیلترهای رهگیری جاری یافت نشد.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {visibleOrders.map((order) => {
                  const historyCount = order.statusHistory ? order.statusHistory.length : 0;
                  const isExpanded = !!expandedOrderIds[order.id];

                  // Product summary string
                  let productSummaryText = `${order.productName} (${order.quantity.toLocaleString()} ${order.unit})`;
                  if (order.itemsJson) {
                    const parsed = parseAndHydrateItemsJson(order.itemsJson, products);
                    if (parsed.length > 0) {
                      productSummaryText = parsed.map((item) => `${item.productName}: ${item.quantity?.toLocaleString()} ${item.unit || order.unit}`).join(' | ');
                    }
                  }

                  return (
                    <div 
                      key={order.id} 
                      className={`border rounded-2xl transition-all bg-white shadow-2xs overflow-hidden ${
                        isExpanded ? 'border-slate-300 ring-2 ring-slate-100 p-4 md:p-5 space-y-4' : 'border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/50 p-3 md:p-3.5'
                      }`}
                    >
                      {/* Compact Header Summary Row (Always visible & clickable) */}
                      <div 
                        onClick={() => toggleExpandOrder(order.id)}
                        className="flex flex-wrap items-center justify-between gap-2.5 cursor-pointer select-none text-right"
                      >
                        {/* Right Group: Customer, Order #, Agent, Destination */}
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <span className="font-mono bg-slate-900 text-amber-400 text-xs font-bold py-0.5 px-2.5 rounded-lg shadow-xs">
                            #{order.orderNumber}
                          </span>
                          <strong className="text-slate-900 text-xs md:text-sm truncate max-w-[180px] md:max-w-[260px]">
                            {order.customerName}
                          </strong>
                          {order.buyerName && (
                            <span className="text-[10px] bg-emerald-50 text-emerald-800 font-bold border border-emerald-100 py-0.5 px-2 rounded-full hidden sm:inline-block">
                              خریدار: {order.buyerName}
                            </span>
                          )}
                          <span className="text-[10px] bg-slate-100 text-slate-600 font-mono py-0.5 px-2 rounded">
                            کد {order.agentCode}
                          </span>
                          <span className="text-[11px] text-slate-500 font-bold bg-slate-100/80 px-2 py-0.5 rounded-md flex items-center gap-0.5">
                            📍 {order.destinationCity}
                          </span>
                        </div>

                        {/* Middle Group: Main Product Summary (Hidden on tiny screens if space limited, visible on sm+) */}
                        <div className="hidden lg:flex items-center text-[11px] text-slate-600 font-medium truncate max-w-[280px]">
                          <span className="truncate">📦 {productSummaryText}</span>
                        </div>

                        {/* Left Group: Driver Badge, Status Badge & Expand Toggle */}
                        <div className="flex items-center gap-2 shrink-0">
                          {order.vehicleDetails ? (
                            <span className="text-[10px] bg-emerald-50 text-emerald-800 font-bold border border-emerald-200/80 py-0.5 px-2 rounded-full hidden md:inline-flex items-center gap-1">
                              🚚 {order.vehicleDetails.driverName} ({order.vehicleDetails.vehicleType})
                            </span>
                          ) : null}

                          <span className={`text-[10px] font-extrabold py-0.5 px-2.5 rounded-full ${statusTags[order.status]?.css}`}>
                            {statusTags[order.status]?.text}
                          </span>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpandOrder(order.id);
                            }}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold px-2 py-1 rounded-lg border border-slate-200/80 flex items-center gap-1 transition-all cursor-pointer ml-1"
                          >
                            <span>{isExpanded ? 'بستن' : 'جزئیات'}</span>
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-600" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-600" />}
                          </button>
                        </div>
                      </div>

                      {/* Expanded Details Body */}
                      {isExpanded && (
                        <div className="pt-3 border-t border-slate-100 space-y-4 animate-fade-in">
                          
                          {/* Card Content Grid */}
                          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center text-right">
                            
                            {/* Column 1: Order Items & Delivery Info (7 cols) */}
                            <div className="md:col-span-7 space-y-2">
                              <div className="text-xs text-slate-700">
                                {(() => {
                                  if (order.itemsJson) {
                                    const parsed = parseAndHydrateItemsJson(order.itemsJson, products);
                                    if (parsed.length > 0) {
                                      return (
                                        <div className="flex flex-wrap gap-1.5">
                                          <span className="font-bold text-slate-500">📦 اقلام سبد سفارش:</span>
                                          {parsed.map((item, i) => (
                                            <span key={i} className="inline-flex items-center gap-1 bg-slate-100 text-slate-800 py-0.5 px-2 rounded-lg font-bold text-[11px]">
                                              {item.productName}: <strong className="font-mono text-indigo-700">{item.quantity?.toLocaleString()} {item.unit || order.unit}</strong>
                                            </span>
                                          ))}
                                        </div>
                                      );
                                    }
                                  }
                                  return (
                                    <p className="text-xs text-slate-700">
                                      📦 محصول اصلی: <strong>{order.productName}</strong> ({order.quantity.toLocaleString()} {order.unit})
                                    </p>
                                  );
                                })()}
                              </div>

                              <p className="text-[11px] text-slate-500">
                                📍 مقصد ارسال: <strong>{order.destinationCity}</strong> {order.exactAddress ? '(' + order.exactAddress + ')' : ''} • ثبت: <span className="font-mono">{new Date(order.createdAt).toLocaleString('fa-IR')}</span>
                              </p>

                              {order.paymentTrackingCode && (
                                <p className="text-[10px] text-emerald-800 bg-emerald-50 border border-emerald-100 py-0.5 px-2 rounded-md inline-block font-mono font-bold">
                                  💳 کد پیگیری واریز: {order.paymentTrackingCode}
                                </p>
                              )}
                            </div>

                            {/* Column 2: Transport Passport / Driver Details (5 cols) */}
                            <div className="md:col-span-5 flex flex-col justify-center space-y-2">
                              {order.vehicleDetails ? (
                                <div className="bg-emerald-50/70 rounded-xl p-2.5 border border-emerald-200/80 text-[11px] text-slate-700 space-y-0.5">
                                  <p className="font-extrabold text-emerald-900 flex items-center justify-between">
                                    <span>🚒 ناوگان حمل تخصیص‌یافته:</span>
                                    <span className="font-mono text-[10px] text-emerald-700">{order.vehicleDetails.shippingAgency}</span>
                                  </p>
                                  <p>🚚 {order.vehicleDetails.vehicleType} • راننده: <strong>{order.vehicleDetails.driverName}</strong></p>
                                  <p className="flex items-center gap-3 font-mono text-[10px]">
                                    <span>📞 <a href={'tel:' + order.vehicleDetails.driverPhone} className="hover:underline font-bold text-emerald-800">{order.vehicleDetails.driverPhone}</a></span>
                                    <span>🏷️ پلاک: {order.vehicleDetails.licensePlate}</span>
                                  </p>
                                </div>
                              ) : order.status === 'REJECTED' ? (
                                <div className="bg-rose-50 rounded-xl p-2.5 border border-rose-200 text-[11px] text-rose-800 text-right">
                                  <strong>❌ علت رد/لغو سفارش:</strong> {order.rejectionReason || 'توسط مدیر لغو گردید.'}
                                </div>
                              ) : (
                                <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200 text-[11px] text-slate-500 text-center">
                                  ⏳ در انتظار اعلام راننده و تخصیص خودرو از سوی باربری
                                </div>
                              )}
                            </div>

                          </div>

                          {/* Card Lifecycle Progress Dots */}
                          <div className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-100 flex items-center justify-between gap-2 overflow-x-auto text-[10px] text-slate-600 font-bold">
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                              <span>۱. ثبت اولیه</span>
                            </div>
                            <span className="text-slate-300">←</span>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className={`w-2.5 h-2.5 rounded-full ${order.status !== 'PENDING_APPROVAL' && order.status !== 'REJECTED' ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                              <span>۲. تایید بازرگانی</span>
                            </div>
                            <span className="text-slate-300">←</span>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className={`w-2.5 h-2.5 rounded-full ${order.status === 'SENT_TO_FACTORY' || order.status === 'VEHICLE_ASSIGNED' || order.status === 'LOADED_AND_DISPATCHED' ? 'bg-blue-500' : 'bg-slate-300'}`}></span>
                              <span>۳. خط تولید کارخانه</span>
                            </div>
                            <span className="text-slate-300">←</span>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className={`w-2.5 h-2.5 rounded-full ${order.status === 'VEHICLE_ASSIGNED' || order.status === 'LOADED_AND_DISPATCHED' ? 'bg-amber-500' : 'bg-slate-300'}`}></span>
                              <span>۴. تخصیص ناوگان باربری</span>
                            </div>
                            <span className="text-slate-300">←</span>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className={`w-2.5 h-2.5 rounded-full ${order.status === 'LOADED_AND_DISPATCHED' ? 'bg-emerald-600' : 'bg-slate-300'}`}></span>
                              <span>۵. بارگیری و حرکت</span>
                            </div>
                          </div>

                          {/* Card Action Buttons */}
                          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                            <button
                              type="button"
                              onClick={() => setSelectedOrderForHistory(order)}
                              className="bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-800 py-1.5 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-xs"
                              title="نمایش تاریخچه دقیق تغییرات و شناسنامه کامل"
                            >
                              <Clock className="w-3.5 h-3.5 text-indigo-600" />
                              <span>مشاهده شناسنامه و سوابق کامل ({historyCount} تغییر)</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                printOrders([order], products, agents);
                                showToast('📥 پیش‌نمایش سفارش آرشیوی جهت پرینت مجدد و ذخیره PDF بارگذاری شد.', 'success');
                              }}
                              className="bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 py-1.5 px-3 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer transition-all"
                              title="چاپ مجدد سفارش خروج رسمی"
                            >
                              <Printer className="w-3.5 h-3.5 text-slate-500" />
                              <span>چاپ فاکتور خروج</span>
                            </button>
                          </div>

                        </div>
                      )}

                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>


      {/* DETAILED ORDER HISTORY MODAL (شناسنامه و سوابق کامل سفارش) */}
      {selectedOrderForHistory && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-2xl max-w-3xl w-full border border-slate-200 shadow-2xl overflow-hidden my-8 dir-rtl text-right">
            
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-4 px-6 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-600/30 border border-indigo-400/40 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-100 flex items-center gap-2">
                    <span>شناسنامه و سوابق کامل سفارش:</span>
                    <span className="font-mono text-amber-400">#{selectedOrderForHistory.orderNumber}</span>
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    تاریخ ایجاد: {new Date(selectedOrderForHistory.createdAt).toLocaleString('fa-IR')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedOrderForHistory(null)}
                className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto font-sans">
              
              {/* Order Lifecycle Progress Bar */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-800">چرخه حیات و زنجیره تامین کارخانه (مراحل طی شده)</h4>
                  <span className={`text-[10px] font-bold py-0.5 px-2.5 rounded-full ${statusTags[selectedOrderForHistory.status]?.css}`}>
                    {statusTags[selectedOrderForHistory.status]?.text}
                  </span>
                </div>

                {/* Stepper visualization */}
                <div className="relative flex items-center justify-between pt-2 px-2">
                  <div className="absolute left-6 right-6 top-[22px] h-1 bg-slate-200 -z-0"></div>
                  
                  {/* Step 1 */}
                  <div className="relative z-10 flex flex-col items-center gap-1 bg-slate-50 px-1">
                    <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                      ✓
                    </div>
                    <span className="text-[10px] font-bold text-slate-700">۱. ثبت توسط نماینده</span>
                  </div>

                  {/* Step 2 */}
                  <div className="relative z-10 flex flex-col items-center gap-1 bg-slate-50 px-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shadow-sm ${
                      selectedOrderForHistory.status !== 'PENDING_APPROVAL' && selectedOrderForHistory.status !== 'REJECTED'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-200 text-slate-500'
                    }`}>
                      {selectedOrderForHistory.status !== 'PENDING_APPROVAL' && selectedOrderForHistory.status !== 'REJECTED' ? '✓' : '۲'}
                    </div>
                    <span className="text-[10px] font-bold text-slate-700">۲. تایید بازرگانی</span>
                  </div>

                  {/* Step 3 */}
                  <div className="relative z-10 flex flex-col items-center gap-1 bg-slate-50 px-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shadow-sm ${
                      selectedOrderForHistory.status === 'SENT_TO_FACTORY' || selectedOrderForHistory.status === 'VEHICLE_ASSIGNED' || selectedOrderForHistory.status === 'LOADED_AND_DISPATCHED'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-200 text-slate-500'
                    }`}>
                      {selectedOrderForHistory.status === 'VEHICLE_ASSIGNED' || selectedOrderForHistory.status === 'LOADED_AND_DISPATCHED' ? '✓' : '۳'}
                    </div>
                    <span className="text-[10px] font-bold text-slate-700">۳. خط کارخانه</span>
                  </div>

                  {/* Step 4 */}
                  <div className="relative z-10 flex flex-col items-center gap-1 bg-slate-50 px-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shadow-sm ${
                      selectedOrderForHistory.status === 'VEHICLE_ASSIGNED' || selectedOrderForHistory.status === 'LOADED_AND_DISPATCHED'
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-200 text-slate-500'
                    }`}>
                      {selectedOrderForHistory.status === 'LOADED_AND_DISPATCHED' ? '✓' : '۴'}
                    </div>
                    <span className="text-[10px] font-bold text-slate-700">۴. تخصیص خودرو</span>
                  </div>

                  {/* Step 5 */}
                  <div className="relative z-10 flex flex-col items-center gap-1 bg-slate-50 px-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shadow-sm ${
                      selectedOrderForHistory.status === 'LOADED_AND_DISPATCHED'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-200 text-slate-500'
                    }`}>
                      {selectedOrderForHistory.status === 'LOADED_AND_DISPATCHED' ? '✓' : '۵'}
                    </div>
                    <span className="text-[10px] font-bold text-slate-700">۵. خروج و بارگیری</span>
                  </div>
                </div>
              </div>

              {/* Detailed Status History Logs Table */}
              <div className="space-y-3">
                <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5 border-b border-slate-200 pb-2">
                  <Clock className="w-4 h-4 text-indigo-600" />
                  <span>سوابق دقیق تغییرات و تاریخچه گردش کار (Audit Trail)</span>
                </h4>

                {(!selectedOrderForHistory.statusHistory || selectedOrderForHistory.statusHistory.length === 0) ? (
                  <p className="text-[11px] text-slate-400 bg-slate-50 p-3 rounded-lg text-center">
                    تاریخچه ثبتی مجزا برای این سفارش یافت نشد.
                  </p>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-xs text-right">
                      <thead className="bg-slate-100 text-slate-600 border-b border-slate-200 text-[10px] font-bold">
                        <tr>
                          <th className="p-2.5">#</th>
                          <th className="p-2.5">وضعیت ثبت‌شده</th>
                          <th className="p-2.5">زمان دقیق تغییر وضعیت</th>
                          <th className="p-2.5">توضیحات و پیام سیستم</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-sans">
                        {selectedOrderForHistory.statusHistory.map((h, index) => (
                          <tr key={index} className="hover:bg-slate-50 transition-colors">
                            <td className="p-2.5 text-slate-400 font-mono text-[10px]">{index + 1}</td>
                            <td className="p-2.5 font-bold">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] ${statusTags[h.status]?.css || 'bg-slate-100 text-slate-700'}`}>
                                {statusTags[h.status]?.text || h.status}
                              </span>
                            </td>
                            <td className="p-2.5 font-mono text-slate-600 text-[11px] dir-ltr text-right">
                              {new Date(h.updatedAt).toLocaleString('fa-IR')}
                            </td>
                            <td className="p-2.5 text-slate-700 text-[11px]">
                              {h.comment || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Vehicle and Transport Info Card */}
              {selectedOrderForHistory.vehicleDetails && (
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 space-y-2">
                  <h4 className="text-xs font-black text-emerald-900 flex items-center gap-1.5">
                    <Truck className="w-4 h-4 text-emerald-700" />
                    <span>اطلاعات دقیق ناوگان ترابری و راننده باربری</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs text-slate-700 font-sans">
                    <div>
                      <span className="text-[10px] text-slate-500 block">نوع وسیله نقلیه:</span>
                      <strong className="text-slate-900">{selectedOrderForHistory.vehicleDetails.vehicleType}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">نام راننده:</span>
                      <strong className="text-slate-900">{selectedOrderForHistory.vehicleDetails.driverName}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">شماره تماس راننده:</span>
                      <a href={'tel:' + selectedOrderForHistory.vehicleDetails.driverPhone} className="text-emerald-700 font-mono font-bold hover:underline">
                        📞 {selectedOrderForHistory.vehicleDetails.driverPhone}
                      </a>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">شماره پلاک:</span>
                      <strong className="text-slate-900 font-mono">{selectedOrderForHistory.vehicleDetails.licensePlate}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">شرکت باربری پیمانکار:</span>
                      <strong className="text-slate-900">{selectedOrderForHistory.vehicleDetails.shippingAgency}</strong>
                    </div>
                    {selectedOrderForHistory.vehicleDetails.billOfLadingNumber && (
                      <div>
                        <span className="text-[10px] text-slate-500 block">شماره بارنامه دولتی:</span>
                        <strong className="text-slate-900 font-mono">{selectedOrderForHistory.vehicleDetails.billOfLadingNumber}</strong>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Customer & Location Identity */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200/80 text-xs text-slate-700">
                <div className="space-y-1.5">
                  <p>💼 <strong>نمایندگی ثبت کننده:</strong> {selectedOrderForHistory.customerName} (کد: {selectedOrderForHistory.agentCode})</p>
                  {selectedOrderForHistory.buyerName && (
                    <p>👤 <strong>خریدار اصلی / پروژه:</strong> {selectedOrderForHistory.buyerName}</p>
                  )}
                  <p>📞 <strong>شماره تماس سفارش:</strong> <span className="font-mono font-bold">{selectedOrderForHistory.phoneNumber || '—'}</span></p>
                </div>
                <div className="space-y-1.5">
                  <p>📍 <strong>شهر مقصد تخلیه:</strong> {selectedOrderForHistory.destinationCity}</p>
                  <p>🏠 <strong>آدرس دقیق پروژه:</strong> {selectedOrderForHistory.exactAddress || '—'}</p>
                  {selectedOrderForHistory.paymentTrackingCode && (
                    <p>💳 <strong>کد پیگیری پیش‌پرداخت:</strong> <span className="font-mono font-bold text-emerald-800">{selectedOrderForHistory.paymentTrackingCode}</span></p>
                  )}
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 p-4 px-6 border-t border-slate-200 flex items-center justify-between gap-3">
              <button
                onClick={() => {
                  printOrders([selectedOrderForHistory], products, agents);
                  showToast('📥 پیش‌نمایش چاپ شناسنامه سفارش آماده گردید.', 'success');
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold py-2 px-4 rounded-xl text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Printer className="w-4 h-4" />
                <span>چاپ شناسه و فاکتور کامل سفارش</span>
              </button>

              <button
                onClick={() => setSelectedOrderForHistory(null)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-2 px-4 rounded-xl text-xs transition-colors cursor-pointer"
              >
                بستن پنجره
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Review Edit Comparison Modal */}
      {reviewingEditOrder && (() => {
        const pendingData = (() => {
          try {
            return JSON.parse(reviewingEditOrder.pendingEditData || '{}');
          } catch {
            return {};
          }
        })();

        let currentItems: any[] = [];
        if (reviewingEditOrder.itemsJson) {
          currentItems = parseAndHydrateItemsJson(reviewingEditOrder.itemsJson, products);
        }
        if (currentItems.length === 0) {
          currentItems = [{ productName: reviewingEditOrder.productName, quantity: reviewingEditOrder.quantity, unit: reviewingEditOrder.unit }];
        }

        let pendingItems: any[] = [];
        if (pendingData.itemsJson) {
          pendingItems = parseAndHydrateItemsJson(pendingData.itemsJson, products);
        }
        if (pendingItems.length === 0 && pendingData.productName) {
          pendingItems = [{ productName: pendingData.productName, quantity: pendingData.quantity, unit: pendingData.unit }];
        }

        const isDiff = (currVal: any, newVal: any) => {
          if (newVal === undefined) return false;
          return String(currVal || '').trim() !== String(newVal || '').trim();
        };

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-3xl w-full p-5 space-y-4 shadow-2xl border border-slate-200 animate-scale-up max-h-[90vh] overflow-y-auto">
              
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
                    <Edit className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-base">
                      بررسی درخواست ویرایش سفارش #{reviewingEditOrder.orderNumber}
                    </h3>
                    <p className="text-xs text-slate-500">
                      ثبت شده توسط نمایندگی: <strong>{reviewingEditOrder.customerName}</strong> ({reviewingEditOrder.agentCode})
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setReviewingEditOrder(null)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg text-lg cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Informational Box */}
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-950 text-xs space-y-1">
                <span className="font-bold block text-sm">📌 راهنمای مدیر بازرگانی:</span>
                <p>تایید این ویرایش، <strong>هیچ‌گونه تاثیری روی اولویت صف بارگیری یا نوبت سفارش در فروشگاه و کارخانه ندارد</strong>. در صورت تایید، مشخصات جدید جایگزین فاکتور خواهد شد.</p>
              </div>

              {/* Side by Side Comparison Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-200 text-xs">
                <table className="w-full text-right divide-y divide-slate-200">
                  <thead className="bg-slate-100 text-slate-700 font-bold">
                    <tr>
                      <th className="p-3">عنوان فیلد</th>
                      <th className="p-3 bg-slate-100">مشخصات فعلی فاکتور (قبلی)</th>
                      <th className="p-3 bg-amber-100/70 text-amber-900">مشخصات جدید پیشنهادی (ویرایش شده)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    
                    {/* Buyer Name */}
                    <tr className={isDiff(reviewingEditOrder.buyerName, pendingData.buyerName) ? 'bg-emerald-50/70' : ''}>
                      <td className="p-2.5 font-bold text-slate-600">نام خریدار / پروژه:</td>
                      <td className="p-2.5">{reviewingEditOrder.buyerName || '—'}</td>
                      <td className="p-2.5 font-bold text-emerald-900">
                        {pendingData.buyerName || '—'}
                        {isDiff(reviewingEditOrder.buyerName, pendingData.buyerName) && <span className="mr-2 text-[10px] bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded font-bold">تغییر یافته</span>}
                      </td>
                    </tr>

                    {/* Phone Number */}
                    <tr className={isDiff(reviewingEditOrder.phoneNumber, pendingData.phoneNumber) ? 'bg-emerald-50/70' : ''}>
                      <td className="p-2.5 font-bold text-slate-600">شماره تماس:</td>
                      <td className="p-2.5 font-mono">{reviewingEditOrder.phoneNumber || '—'}</td>
                      <td className="p-2.5 font-mono font-bold text-emerald-900">
                        {pendingData.phoneNumber || '—'}
                        {isDiff(reviewingEditOrder.phoneNumber, pendingData.phoneNumber) && <span className="mr-2 text-[10px] bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded font-bold">تغییر یافته</span>}
                      </td>
                    </tr>

                    {/* Destination City */}
                    <tr className={isDiff(reviewingEditOrder.destinationCity, pendingData.destinationCity) ? 'bg-emerald-50/70' : ''}>
                      <td className="p-2.5 font-bold text-slate-600">شهر مقصد:</td>
                      <td className="p-2.5">{reviewingEditOrder.destinationCity || '—'}</td>
                      <td className="p-2.5 font-bold text-emerald-900">
                        {pendingData.destinationCity || '—'}
                        {isDiff(reviewingEditOrder.destinationCity, pendingData.destinationCity) && <span className="mr-2 text-[10px] bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded font-bold">تغییر یافته</span>}
                      </td>
                    </tr>

                    {/* Vehicle Type */}
                    <tr className={isDiff(reviewingEditOrder.vehicleDetails?.vehicleType, pendingData.vehicleType) ? 'bg-emerald-50/70' : ''}>
                      <td className="p-2.5 font-bold text-slate-600">نوع ناوگان باربری:</td>
                      <td className="p-2.5">{reviewingEditOrder.vehicleDetails?.vehicleType || 'تریلی'}</td>
                      <td className="p-2.5 font-bold text-emerald-900">
                        {pendingData.vehicleType || '—'}
                        {isDiff(reviewingEditOrder.vehicleDetails?.vehicleType, pendingData.vehicleType) && <span className="mr-2 text-[10px] bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded font-bold">تغییر یافته</span>}
                      </td>
                    </tr>

                    {/* Address */}
                    <tr className={isDiff(reviewingEditOrder.exactAddress, pendingData.exactAddress) ? 'bg-emerald-50/70' : ''}>
                      <td className="p-2.5 font-bold text-slate-600">آدرس دقیق تخلیه:</td>
                      <td className="p-2.5">{reviewingEditOrder.exactAddress || '—'}</td>
                      <td className="p-2.5 font-bold text-emerald-900">
                        {pendingData.exactAddress || '—'}
                        {isDiff(reviewingEditOrder.exactAddress, pendingData.exactAddress) && <span className="mr-2 text-[10px] bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded font-bold">تغییر یافته</span>}
                      </td>
                    </tr>

                    {/* Delivery Location Map URL */}
                    <tr className={isDiff(reviewingEditOrder.deliveryLocationUrl, pendingData.deliveryLocationUrl) ? 'bg-emerald-50/70' : ''}>
                      <td className="p-2.5 font-bold text-slate-600">موقعیت نقشه:</td>
                      <td className="p-2.5 font-mono text-[11px] truncate max-w-[150px]">{reviewingEditOrder.deliveryLocationUrl || 'ثبت نشده'}</td>
                      <td className="p-2.5 font-mono text-[11px] font-bold text-emerald-900 truncate max-w-[150px]">
                        {pendingData.deliveryLocationUrl || 'ثبت نشده'}
                        {isDiff(reviewingEditOrder.deliveryLocationUrl, pendingData.deliveryLocationUrl) && <span className="mr-2 text-[10px] bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded font-bold">تغییر یافته</span>}
                      </td>
                    </tr>

                    {/* Payment Tracking Code */}
                    <tr className={isDiff(reviewingEditOrder.paymentTrackingCode, pendingData.paymentTrackingCode) ? 'bg-emerald-50/70' : ''}>
                      <td className="p-2.5 font-bold text-slate-600">کد فیش واریزی:</td>
                      <td className="p-2.5 font-mono">{reviewingEditOrder.paymentTrackingCode || '—'}</td>
                      <td className="p-2.5 font-mono font-bold text-emerald-900">
                        {pendingData.paymentTrackingCode || '—'}
                        {isDiff(reviewingEditOrder.paymentTrackingCode, pendingData.paymentTrackingCode) && <span className="mr-2 text-[10px] bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded font-bold">تغییر یافته</span>}
                      </td>
                    </tr>

                    {/* Products / Items */}
                    <tr className="bg-slate-50/50">
                      <td className="p-2.5 font-bold text-slate-600">اقلام و مقادیر سبد خرید:</td>
                      <td className="p-2.5 space-y-1">
                        {currentItems.map((it: any, idx: number) => (
                          <div key={idx} className="font-semibold">
                            • {it.productName}: <strong>{it.quantity?.toLocaleString()}</strong> {it.unit}
                          </div>
                        ))}
                      </td>
                      <td className="p-2.5 space-y-1 font-bold text-emerald-900 bg-emerald-50/40">
                        {pendingItems.length > 0 ? (
                          pendingItems.map((it: any, idx: number) => (
                            <div key={idx} className="font-bold">
                              • {it.productName}: <strong>{it.quantity?.toLocaleString()}</strong> {it.unit}
                            </div>
                          ))
                        ) : (
                          '— بدون تغییر —'
                        )}
                      </td>
                    </tr>

                    {/* Notes */}
                    <tr className={isDiff(reviewingEditOrder.notes, pendingData.notes) ? 'bg-emerald-50/70' : ''}>
                      <td className="p-2.5 font-bold text-slate-600">توضیحات و یادداشت:</td>
                      <td className="p-2.5">{reviewingEditOrder.notes || '—'}</td>
                      <td className="p-2.5 font-bold text-emerald-900">
                        {pendingData.notes || '—'}
                        {isDiff(reviewingEditOrder.notes, pendingData.notes) && <span className="mr-2 text-[10px] bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded font-bold">تغییر یافته</span>}
                      </td>
                    </tr>

                  </tbody>
                </table>
              </div>

              {/* Actions Footer */}
              <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    if (onRejectOrderEdit) {
                      onRejectOrderEdit(reviewingEditOrder.id);
                      setReviewingEditOrder(null);
                    }
                  }}
                  className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl border border-rose-200 transition-colors cursor-pointer"
                >
                  ❌ عدم موافقت و رد ویرایش
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setReviewingEditOrder(null)}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
                  >
                    بستن
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (onApproveOrderEdit) {
                        onApproveOrderEdit(reviewingEditOrder.id);
                        setReviewingEditOrder(null);
                      }
                    }}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
                  >
                    <Check className="w-4 h-4" />
                    <span>تایید موافقت و اعمال تغییرات روی فاکتور</span>
                  </button>
                </div>
              </div>

            </div>
          </div>
        );
      })()}

      </div>
  );
}
