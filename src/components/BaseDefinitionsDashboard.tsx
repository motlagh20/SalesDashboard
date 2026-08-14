import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Users, 
  Briefcase, 
  Truck, 
  Plus, 
  Edit, 
  Trash2, 
  Globe, 
  Key, 
  RefreshCw, 
  Building2, 
  UserCheck, 
  Power, 
  Lock,
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { Agent, Product, ShippingCompany, UserRole } from '../types';

export interface BaseDefinitionsDashboardProps {
  agents: Agent[];
  users: any[];
  products: Product[];
  shippingCompanies: ShippingCompany[];
  onClose: () => void;
  initialSubTab?: 'AGENTS' | 'USERS' | 'PRODUCTS' | 'SHIPPING';
  
  // Agent actions
  onAddAgent: (agent: Agent) => Promise<boolean> | void;
  onUpdateAgent: (agent: Agent) => Promise<boolean> | void;
  onToggleAgent: (id: string) => void;
  onDeleteAgent: (id: string) => void;
  
  // User actions
  fetchUsers: () => void;
  
  // Product actions
  onAddProduct: (product: Product) => Promise<boolean> | void;
  onUpdateProduct: (product: Product) => Promise<boolean> | void;
  onToggleProduct: (id: string) => void;
  onDeleteProduct: (id: string) => void;
  
  // Shipping actions
  onAddShippingCompany: (company: ShippingCompany) => Promise<boolean> | void;
  onUpdateShippingCompany?: (company: ShippingCompany) => Promise<boolean> | void;
  onToggleShippingCompany: (id: string) => void;
  onDeleteShippingCompany: (id: string) => void;
  
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  askConfirm: (title: string, message: string, onConfirm: () => void) => void;
}

export function BaseDefinitionsDashboard({
  agents,
  users,
  products,
  shippingCompanies,
  onClose,
  initialSubTab = 'AGENTS',
  onAddAgent,
  onUpdateAgent,
  onToggleAgent,
  onDeleteAgent,
  fetchUsers,
  onAddProduct,
  onUpdateProduct,
  onToggleProduct,
  onDeleteProduct,
  onAddShippingCompany,
  onUpdateShippingCompany,
  onToggleShippingCompany,
  onDeleteShippingCompany,
  showToast,
  askConfirm,
}: BaseDefinitionsDashboardProps) {
  const [activeTab, setActiveTab] = useState<'AGENTS' | 'USERS' | 'PRODUCTS' | 'SHIPPING'>(initialSubTab);

  useEffect(() => {
    fetchUsers();
  }, []);

  // --- AGENT STATE ---
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [newAgentAlias, setNewAgentAlias] = useState('');
  const [newAgentCode, setNewAgentCode] = useState('');
  const [newAgentArea, setNewAgentArea] = useState('');
  const [newAgentFullName, setNewAgentFullName] = useState('');
  const [newAgentPhone, setNewAgentPhone] = useState('');
  const [newAgentAddress, setNewAgentAddress] = useState('');
  const [newAgentPersonType, setNewAgentPersonType] = useState<'NATURAL' | 'LEGAL'>('NATURAL');
  const [newAgentCompanyName, setNewAgentCompanyName] = useState('');
  const [newAgentNationalId, setNewAgentNationalId] = useState('');
  const [newAgentRegistrationNumber, setNewAgentRegistrationNumber] = useState('');
  const [newAgentEconomicCode, setNewAgentEconomicCode] = useState('');
  const [newAgentNationalCode, setNewAgentNationalCode] = useState('');
  const [newAgentIsExport, setNewAgentIsExport] = useState(false);

  const startEditingAgent = (agent: Agent) => {
    setEditingAgent(agent);
    setNewAgentAlias(agent.alias);
    setNewAgentCode(agent.agentCode);
    setNewAgentArea(agent.area);
    setNewAgentFullName(agent.fullName);
    setNewAgentPhone(agent.phoneNumber);
    setNewAgentAddress(agent.address);
    setNewAgentPersonType(agent.personType || 'NATURAL');
    setNewAgentCompanyName(agent.companyName || '');
    setNewAgentNationalId(agent.nationalId || '');
    setNewAgentRegistrationNumber(agent.registrationNumber || '');
    setNewAgentEconomicCode(agent.economicCode || '');
    setNewAgentNationalCode(agent.nationalCode || '');
    setNewAgentIsExport(agent.isExportAgent || false);
  };

  const cancelEditingAgent = () => {
    setEditingAgent(null);
    setNewAgentAlias('');
    setNewAgentCode('');
    setNewAgentArea('');
    setNewAgentFullName('');
    setNewAgentPhone('');
    setNewAgentAddress('');
    setNewAgentPersonType('NATURAL');
    setNewAgentCompanyName('');
    setNewAgentNationalId('');
    setNewAgentRegistrationNumber('');
    setNewAgentEconomicCode('');
    setNewAgentNationalCode('');
    setNewAgentIsExport(false);
  };

  const handleSaveAgent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAgentAlias.trim() || !newAgentCode.trim() || !newAgentFullName.trim()) {
      showToast('لطفاً عنوان نمایندگی، کد و نام مسئول را وارد نمایید.', 'error');
      return;
    }

    const payload: Agent = {
      id: editingAgent ? editingAgent.id : `agent-${Date.now()}`,
      alias: newAgentAlias.trim(),
      agentCode: newAgentCode.trim(),
      area: newAgentArea.trim(),
      fullName: newAgentFullName.trim(),
      phoneNumber: newAgentPhone.trim(),
      address: newAgentAddress.trim(),
      personType: newAgentPersonType,
      companyName: newAgentPersonType === 'LEGAL' ? newAgentCompanyName.trim() : undefined,
      nationalId: newAgentPersonType === 'LEGAL' ? newAgentNationalId.trim() : undefined,
      registrationNumber: newAgentPersonType === 'LEGAL' ? newAgentRegistrationNumber.trim() : undefined,
      economicCode: newAgentEconomicCode.trim() || undefined,
      nationalCode: newAgentPersonType === 'REAL' ? newAgentNationalCode.trim() : undefined,
      isExportAgent: newAgentIsExport,
      isEnabled: editingAgent ? editingAgent.isEnabled : true,
    };

    if (editingAgent) {
      onUpdateAgent(payload);
      showToast('اطلاعات نمایندگی با موفقیت به‌روزرسانی شد.', 'success');
    } else {
      onAddAgent(payload);
      showToast('نمایندگی جدید با موفقیت ثبت شد.', 'success');
    }
    cancelEditingAgent();
  };

  // --- USER STATE ---
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [newUsername, setNewUsername] = useState('');
  const [newUserFullName, setNewUserFullName] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('REPRESENTATIVE');
  const [newUserAgentCode, setNewUserAgentCode] = useState('');
  const [newUserSCId, setNewUserSCId] = useState('');

  const startEditingUser = (u: any) => {
    setEditingUser(u);
    setNewUsername(u.username);
    setNewUserFullName(u.fullName || '');
    setNewUserPhone(u.phoneNumber || '');
    setNewUserPassword('');
    setNewUserRole(u.role);
    setNewUserAgentCode(u.agentCode || '');
    setNewUserSCId(u.shippingCompanyId || '');
  };

  const cancelEditingUser = () => {
    setEditingUser(null);
    setNewUsername('');
    setNewUserFullName('');
    setNewUserPhone('');
    setNewUserPassword('');
    setNewUserRole('REPRESENTATIVE');
    setNewUserAgentCode('');
    setNewUserSCId('');
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newUserFullName.trim() || !newUserPhone.trim()) {
      showToast('نام کاربری، نام کامل و شماره تماس الزامی هستند.', 'error');
      return;
    }

    if (!editingUser && !newUserPassword.trim()) {
      showToast('تعیین رمز عبور برای کاربر جدید الزامی است.', 'error');
      return;
    }

    try {
      const payload: any = {
        username: newUsername.trim(),
        fullName: newUserFullName.trim(),
        phoneNumber: newUserPhone.trim(),
        role: newUserRole,
        agentCode: newUserRole === 'REPRESENTATIVE' ? newUserAgentCode : undefined,
        shippingCompanyId: newUserRole === 'SHIPPING_COMPANY' ? newUserSCId : undefined,
      };

      if (newUserPassword.trim()) {
        payload.password = newUserPassword.trim();
      }

      if (editingUser) {
        const res = await fetch(`/api/users/${editingUser.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          showToast('اطلاعات کاربر با موفقیت ویرایش شد.', 'success');
          fetchUsers();
          cancelEditingUser();
        } else {
          showToast('خطا در به‌روزرسانی اطلاعات کاربر.', 'error');
        }
      } else {
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          showToast('کاربر جدید با موفقیت ایجاد شد.', 'success');
          fetchUsers();
          cancelEditingUser();
        } else {
          const err = await res.json().catch(() => ({}));
          showToast(err.error || 'خطا در تعریف کاربر جدید.', 'error');
        }
      }
    } catch {
      showToast('خطای شبکه در ذخیره‌سازی کاربر.', 'error');
    }
  };

  const handleToggleUserStatus = async (userItem: any) => {
    try {
      const res = await fetch(`/api/users/${userItem.id}/toggle`, { method: 'POST' });
      if (res.ok) {
        showToast(`وضعیت کاربر ${userItem.fullName || userItem.username} تغییر یافت.`, 'success');
        fetchUsers();
      }
    } catch {
      showToast('خطا در تغییر وضعیت دسترسی کاربر.', 'error');
    }
  };

  const handleDeleteUser = (userItem: any) => {
    askConfirm(
      'حذف حساب کاربری',
      `آیا از حذف دائم حساب کاربری «${userItem.fullName || userItem.username}» اطمینان دارید؟`,
      async () => {
        try {
          const res = await fetch(`/api/users/${userItem.id}`, { method: 'DELETE' });
          if (res.ok) {
            showToast('کاربر با موفقیت حذف شد.', 'success');
            fetchUsers();
          }
        } catch {
          showToast('خطا در حذف کاربر.', 'error');
        }
      }
    );
  };

  const handleResetUserPassword = async (userItem: any) => {
    const defaultPassword = '123';
    askConfirm(
      'بازنشانی رمز عبور',
      `رمز عبور کاربر «${userItem.fullName || userItem.username}» به "${defaultPassword}" تغییر خواهد کرد. ادامه می‌دهید؟`,
      async () => {
        try {
          const res = await fetch(`/api/users/${userItem.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: defaultPassword }),
          });
          if (res.ok) {
            showToast(`رمز عبور به ${defaultPassword} تغییر یافت.`, 'success');
          } else {
            showToast('خطا در تغییر رمز عبور.', 'error');
          }
        } catch {
          showToast('خطا در ریست رمز عبور.', 'error');
        }
      }
    );
  };

  // --- PRODUCT STATE ---
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [newProdName, setNewProdName] = useState('');
  const [newProdCategory, setNewProdCategory] = useState('roof_tile');
  const [newProdPrice, setNewProdPrice] = useState(0);
  const [newProdUnit, setNewProdUnit] = useState('عدد');
  const [newProdWeight, setNewProdWeight] = useState('');
  const [newProdDimensions, setNewProdDimensions] = useState('');
  const [newProdImageUrl, setNewProdImageUrl] = useState('');

  const startEditingProduct = (p: Product) => {
    setEditingProduct(p);
    setNewProdName(p.name);
    setNewProdCategory(p.category || 'roof_tile');
    setNewProdPrice(p.pricePerUnit || 0);
    setNewProdUnit(p.unit || 'عدد');
    setNewProdWeight(p.weight || '');
    setNewProdDimensions(p.dimensions || '');
    setNewProdImageUrl(p.imageUrl || '');
  };

  const cancelEditingProduct = () => {
    setEditingProduct(null);
    setNewProdName('');
    setNewProdCategory('roof_tile');
    setNewProdPrice(0);
    setNewProdUnit('عدد');
    setNewProdWeight('');
    setNewProdDimensions('');
    setNewProdImageUrl('');
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdName.trim() || newProdPrice <= 0) {
      showToast('لطفاً نام کالا و قیمت معتبر را وارد کنید.', 'error');
      return;
    }

    const payload: Product = {
      id: editingProduct ? editingProduct.id : `prod-${Date.now()}`,
      name: newProdName.trim(),
      category: newProdCategory,
      pricePerUnit: Number(newProdPrice),
      unit: newProdUnit.trim(),
      description: editingProduct ? editingProduct.description : '',
      weight: newProdWeight.trim() || undefined,
      dimensions: newProdDimensions.trim() || undefined,
      imageUrl: newProdImageUrl.trim() || undefined,
      isEnabled: editingProduct ? editingProduct.isEnabled : true,
    };

    if (editingProduct) {
      onUpdateProduct(payload);
      showToast('اطلاعات محصول به‌روزرسانی شد.', 'success');
    } else {
      onAddProduct(payload);
      showToast('محصول جدید ثبت گردید.', 'success');
    }
    cancelEditingProduct();
  };

  // --- SHIPPING STATE ---
  const [editingShippingCompany, setEditingShippingCompany] = useState<ShippingCompany | null>(null);
  const [newSCName, setNewSCName] = useState('');
  const [newSCCode, setNewSCCode] = useState('');
  const [newSCManager, setNewSCManager] = useState('');
  const [newSCPhone, setNewSCPhone] = useState('');
  const [newSCAddress, setNewSCAddress] = useState('');
  const [newSCNationalId, setNewSCNationalId] = useState('');
  const [newSCEconomicCode, setNewSCEconomicCode] = useState('');

  const startEditingShippingCompany = (sc: ShippingCompany) => {
    setEditingShippingCompany(sc);
    setNewSCName(sc.name);
    setNewSCCode(sc.code || '');
    setNewSCManager(sc.managerName || '');
    setNewSCPhone(sc.phoneNumber || '');
    setNewSCAddress(sc.address || '');
    setNewSCNationalId(sc.nationalId || '');
    setNewSCEconomicCode(sc.economicCode || '');
  };

  const cancelEditingShippingCompany = () => {
    setEditingShippingCompany(null);
    setNewSCName('');
    setNewSCCode('');
    setNewSCManager('');
    setNewSCPhone('');
    setNewSCAddress('');
    setNewSCNationalId('');
    setNewSCEconomicCode('');
  };

  const handleSaveShippingCompany = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSCName.trim() || !newSCPhone.trim()) {
      showToast('نام شرکت باربری و شماره تماس الزامی است.', 'error');
      return;
    }

    const payload: ShippingCompany = {
      id: editingShippingCompany ? editingShippingCompany.id : `sc-${Date.now()}`,
      name: newSCName.trim(),
      code: newSCCode.trim(),
      managerName: newSCManager.trim(),
      phoneNumber: newSCPhone.trim(),
      address: newSCAddress.trim() || undefined,
      nationalId: newSCNationalId.trim() || undefined,
      economicCode: newSCEconomicCode.trim() || undefined,
      isEnabled: editingShippingCompany ? editingShippingCompany.isEnabled : true,
    };

    if (editingShippingCompany && onUpdateShippingCompany) {
      onUpdateShippingCompany(payload);
      showToast('اطلاعات باربری به‌روزرسانی شد.', 'success');
    } else {
      onAddShippingCompany(payload);
      showToast('شرکت باربری جدید ثبت گردید.', 'success');
    }
    cancelEditingShippingCompany();
  };

  return (
    <div className="space-y-6 text-right dir-rtl font-sans animate-fade-in" id="base-definitions-dashboard">
      
      {/* Top Banner & Return Button */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-50 text-indigo-700 rounded-2xl border border-indigo-100 shadow-xs">
            <ShieldCheck className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
              <span>اطلاعات پایه و دسترسی</span>
              <span className="text-[11px] font-bold bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-full border border-indigo-200">
                سامانه مدیریت طبرستان
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              تعریف و مدیریت نمایندگان فروش، کاربران و کدهای امنیتی، کاتالوگ محصولات و ناوگان حمل‌ونقل
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0"
          id="back-to-orders-btn"
        >
          <ArrowRight className="w-4 h-4" />
          <span>بازگشت به کارتابل سفارشات</span>
        </button>
      </div>

      {/* Main Workspace Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 md:p-6 space-y-6">
        
        {/* Navigation Sub-Tabs */}
        <div className="flex flex-wrap bg-slate-100 p-1.5 rounded-xl max-w-3xl mx-auto border border-slate-200/80 gap-1.5" id="base-data-sub-navigation">
          <button
            type="button"
            onClick={() => setActiveTab('AGENTS')}
            className={`flex-1 min-w-[140px] py-2 px-3 rounded-lg text-xs font-black cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'AGENTS'
                ? 'bg-slate-900 text-amber-300 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Users className="w-4 h-4 text-amber-400" />
            <span>نمایندگان فروش ({agents.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('USERS');
              fetchUsers();
            }}
            className={`flex-1 min-w-[140px] py-2 px-3 rounded-lg text-xs font-black cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'USERS'
                ? 'bg-slate-900 text-amber-300 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-indigo-400" />
            <span>کاربران و دسترسی‌ها ({users.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('PRODUCTS')}
            className={`flex-1 min-w-[140px] py-2 px-3 rounded-lg text-xs font-black cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'PRODUCTS'
                ? 'bg-slate-900 text-amber-300 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Briefcase className="w-4 h-4 text-emerald-400" />
            <span>کاتالوگ محصولات ({products.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('SHIPPING')}
            className={`flex-1 min-w-[140px] py-2 px-3 rounded-lg text-xs font-black cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'SHIPPING'
                ? 'bg-slate-900 text-amber-300 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Truck className="w-4 h-4 text-blue-400" />
            <span>شرکت‌های حمل ({shippingCompanies.length})</span>
          </button>
        </div>

        {/* 1. AGENTS PANEL */}
        {activeTab === 'AGENTS' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-right" id="agents-mgmt-panel">
            {/* List */}
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
                              <Building2 className="w-3 h-3 text-indigo-700" />
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
                            askConfirm('حذف نمایندگی', `آیا از حذف نمایندگی «${agent.alias}» اطمینان دارید؟`, () => {
                              onDeleteAgent(agent.id);
                            });
                          }}
                          className="bg-rose-50 hover:bg-rose-100 text-rose-600 p-1.5 rounded-lg transition-all cursor-pointer"
                          title="حذف نمایندگی"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Form */}
            <div className="lg:col-span-5 bg-slate-50 border border-slate-200 p-5 rounded-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <h4 className="font-bold text-slate-800 text-xs">
                  {editingAgent ? 'ویرایش اطلاعات نمایندگی رسمی' : 'ثبت نمایندگی رسمی جدید'}
                </h4>
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
              </div>

              <form onSubmit={handleSaveAgent} className="space-y-3 font-sans">
                {/* Person Type */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">نوع شخصیت طرف قرارداد:</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setNewAgentPersonType('NATURAL')}
                      className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        newAgentPersonType === 'NATURAL'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-white text-slate-700 border border-slate-200'
                      }`}
                    >
                      <span>شخص حقیقی</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewAgentPersonType('LEGAL')}
                      className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        newAgentPersonType === 'LEGAL'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-white text-slate-700 border border-slate-200'
                      }`}
                    >
                      <Building2 className="w-3.5 h-3.5" />
                      <span>شخص حقوقی (شرکت)</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1">نام یا عنوان نمایندگی *</label>
                    <input
                      type="text"
                      placeholder="مثال: نمایندگی مازندران"
                      value={newAgentAlias}
                      onChange={(e) => setNewAgentAlias(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1">کد اختصاصی تفصیلی *</label>
                    <input
                      type="text"
                      placeholder="مثال: 104"
                      value={newAgentCode}
                      onChange={(e) => setNewAgentCode(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                    />
                  </div>
                </div>

                {newAgentPersonType === 'LEGAL' ? (
                  <div className="space-y-2.5 p-2.5 bg-indigo-50/50 rounded-xl border border-indigo-100">
                    <div className="text-[11px] font-bold text-indigo-900 flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                      <span>مشخصات ثبتی و حقوقی شرکت:</span>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-1">نام رسمی شرکت حقوقی</label>
                      <input
                        type="text"
                        placeholder="مثال: بازرگانی سفال سازان طبرستان (سهامی خاص)"
                        value={newAgentCompanyName}
                        onChange={(e) => setNewAgentCompanyName(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-1">شناسه ملی شرکت (۱۱ رقم)</label>
                        <input
                          type="text"
                          placeholder="مثال: 10100123456"
                          value={newAgentNationalId}
                          onChange={(e) => setNewAgentNationalId(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-1">شماره ثبت شرکت</label>
                        <input
                          type="text"
                          placeholder="مثال: 45892"
                          value={newAgentRegistrationNumber}
                          onChange={(e) => setNewAgentRegistrationNumber(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-1">شماره اقتصادی شرکت (۱۲ رقم)</label>
                      <input
                        type="text"
                        placeholder="مثال: 411122334455"
                        value={newAgentEconomicCode}
                        onChange={(e) => setNewAgentEconomicCode(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 p-2.5 bg-emerald-50/40 rounded-xl border border-emerald-100">
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-1">کد ملی شخص نماینده (۱۰ رقم)</label>
                      <input
                        type="text"
                        placeholder="مثال: 0012345678"
                        value={newAgentNationalCode}
                        onChange={(e) => setNewAgentNationalCode(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-1">شماره اقتصادی (اختیاری)</label>
                      <input
                        type="text"
                        placeholder="مثال: 411122334455"
                        value={newAgentEconomicCode}
                        onChange={(e) => setNewAgentEconomicCode(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1">نام نماینده / مدیرعامل *</label>
                    <input
                      type="text"
                      placeholder="مثال: علی حسینی"
                      value={newAgentFullName}
                      onChange={(e) => setNewAgentFullName(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1">شماره همراه مستقیم *</label>
                    <input
                      type="text"
                      placeholder="مثال: 09121234567"
                      value={newAgentPhone}
                      onChange={(e) => setNewAgentPhone(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono text-left"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">حوزه سرپرستی / استان و شهر</label>
                  <input
                    type="text"
                    placeholder="مثال: مازندران - ساری و حومه"
                    value={newAgentArea}
                    onChange={(e) => setNewAgentArea(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                  />
                </div>

                {/* Export Agent Checkbox */}
                <div className="bg-sky-50/70 border border-sky-200/80 p-2 rounded-xl flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="new-agent-export-checkbox"
                    checked={newAgentIsExport}
                    onChange={(e) => setNewAgentIsExport(e.target.checked)}
                    className="w-4 h-4 text-sky-600 rounded cursor-pointer"
                  />
                  <label htmlFor="new-agent-export-checkbox" className="text-xs text-sky-950 font-bold cursor-pointer flex items-center gap-1">
                    <Globe className="w-3.5 h-3.5 text-sky-600" />
                    <span>نمایندگی صادراتی (مجاز به ثبت حواله‌های ارزی و مقاصد خارجی)</span>
                  </label>
                </div>

                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">نشانی پستی دقیق انبار و دفتر</label>
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

        {/* 2. USERS & PERMISSIONS PANEL */}
        {activeTab === 'USERS' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-right animate-fade-in font-sans" id="users-mgmt-panel">
            {/* List */}
            <div className="lg:col-span-8 space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span className="font-bold text-slate-800">سامانه کنترل دسترسی و کدهای امنیتی کاربران</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500">کاربران فعال:</span>
                  <strong className="font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    {users.filter(u => u.isEnabled !== false).length} نفر
                  </strong>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-right border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-bold border-b border-rose-100">
                        <th className="p-3">نام و مسئولیت</th>
                        <th className="p-3">نام کاربری</th>
                        <th className="p-3">شماره تماس (جهت پیامک)</th>
                        <th className="p-3">نقش سیستمی</th>
                        <th className="p-3">منتسب به</th>
                        <th className="p-3 text-center">وضعیت ورود</th>
                        <th className="p-3 text-center w-28">عملیات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => {
                        let matchDesc = '-';
                        if (u.role === 'REPRESENTATIVE' && u.agentCode) {
                          const ag = agents.find(a => a.agentCode === u.agentCode);
                          matchDesc = ag ? `نمایندگی ${ag.alias}` : `کد نمایندگی ${u.agentCode}`;
                        } else if (u.role === 'SHIPPING_COMPANY' && u.shippingCompanyId) {
                          const sc = shippingCompanies.find(s => s.id === u.shippingCompanyId);
                          matchDesc = sc ? `شرکت ${sc.name}` : `شناسه باربری ${u.shippingCompanyId}`;
                        }

                        let roleColor = 'bg-slate-100 text-slate-800';
                        let roleLabel = 'ناشناس';
                        if (u.role === 'SALES_MANAGER') {
                          roleColor = 'bg-amber-100 text-amber-800 border border-amber-200';
                          roleLabel = 'مدیریت بازرگانی';
                        } else if (u.role === 'FACTORY_TRANSPORT') {
                          roleColor = 'bg-blue-100 text-blue-800 border border-blue-200';
                          roleLabel = 'ترابری کارخانه';
                        } else if (u.role === 'REPRESENTATIVE') {
                          roleColor = 'bg-emerald-100 text-emerald-800 border border-emerald-200';
                          roleLabel = 'نمایندگی رسمی';
                        } else if (u.role === 'SHIPPING_COMPANY') {
                          roleColor = 'bg-purple-100 text-purple-800 border border-purple-200';
                          roleLabel = 'شرکت حمل‌ونقل';
                        } else if (u.role === 'DRIVER') {
                          roleColor = 'bg-cyan-100 text-cyan-800 border border-cyan-200';
                          roleLabel = 'راننده ترابری';
                        }

                        return (
                          <tr key={u.id} className={`border-b border-slate-100 hover:bg-slate-50 transition-all ${u.isEnabled === false ? 'opacity-50 bg-rose-50/20' : ''}`}>
                            <td className="p-3">
                              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                                <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                                <span>{u.fullName || u.username}</span>
                              </div>
                            </td>
                            <td className="p-3 font-mono text-slate-600 font-bold">{u.username}</td>
                            <td className="p-3 font-mono text-slate-600 text-left">{u.phoneNumber || '-'}</td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${roleColor}`}>
                                {roleLabel}
                              </span>
                            </td>
                            <td className="p-3 text-[11px] text-slate-500 font-sans">{matchDesc}</td>
                            <td className="p-3 text-center">
                              {u.isEnabled !== false ? (
                                <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 py-0.5 px-2 rounded-full text-[10px] font-bold">
                                  مجاز
                                </span>
                              ) : (
                                <span className="bg-rose-100 text-rose-800 border border-rose-200 py-0.5 px-2 rounded-full text-[10px] font-bold">
                                  مسدود
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => startEditingUser(u)}
                                  className="p-1 hover:bg-indigo-50 text-indigo-600 rounded transition-colors cursor-pointer"
                                  title="ویرایش مشخصات"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleResetUserPassword(u)}
                                  className="p-1 hover:bg-amber-50 text-amber-600 rounded transition-colors cursor-pointer"
                                  title="تغییر رمز عبور"
                                >
                                  <Key className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleToggleUserStatus(u)}
                                  className={`p-1 rounded transition-colors cursor-pointer ${
                                    u.isEnabled !== false ? 'hover:bg-rose-50 text-rose-600' : 'hover:bg-emerald-50 text-emerald-600'
                                  }`}
                                  title={u.isEnabled !== false ? 'مسدودسازی دسترسی' : 'فعال‌سازی مجدد'}
                                >
                                  <Power className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteUser(u)}
                                  className="p-1 hover:bg-rose-50 text-rose-600 rounded transition-colors cursor-pointer"
                                  title="حذف حساب کاربری"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Form */}
            <div className="lg:col-span-4 bg-slate-50 border border-slate-200 p-5 rounded-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <h4 className="font-bold text-slate-800 text-xs">
                  {editingUser ? 'ویرایش حساب کاربری' : 'تعریف کاربر جدید با مجوز اختصاصی'}
                </h4>
                <Lock className="w-4 h-4 text-indigo-600" />
              </div>

              <form onSubmit={handleSaveUser} className="space-y-3 font-sans">
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">نام و نام خانوادگی مسئول *</label>
                  <input
                    type="text"
                    placeholder="مثال: مهندس احمدی"
                    value={newUserFullName}
                    onChange={(e) => setNewUserFullName(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1">نام کاربری لاگین *</label>
                    <input
                      type="text"
                      placeholder="مثال: ahmadi"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-left"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1">شماره همراه (OTP) *</label>
                    <input
                      type="text"
                      placeholder="0912..."
                      value={newUserPhone}
                      onChange={(e) => setNewUserPhone(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-left"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">
                    {editingUser ? 'رمز عبور جدید (اختیاری):' : 'رمز عبور ورودی اولیه *'}
                  </label>
                  <input
                    type="password"
                    placeholder={editingUser ? 'فقط در صورت نیاز به تغییر وارد کنید' : 'کلمه عبور'}
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">سطح و نقش کاربری *</label>
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                    className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans cursor-pointer"
                  >
                    <option value="REPRESENTATIVE">نمایندگی رسمی فروش</option>
                    <option value="SALES_MANAGER">مدیریت بازرگانی و فروش</option>
                    <option value="FACTORY_TRANSPORT">ترابری و بارگیری کارخانه</option>
                    <option value="SHIPPING_COMPANY">شرکت حمل و نقل باربری</option>
                    <option value="DRIVER">راننده اختصاصی ناوگان</option>
                  </select>
                </div>

                {newUserRole === 'REPRESENTATIVE' && (
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1">انتساب به نمایندگی</label>
                    <select
                      value={newUserAgentCode}
                      onChange={(e) => setNewUserAgentCode(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans cursor-pointer"
                    >
                      <option value="">-- انتخاب نمایندگی همکار --</option>
                      {agents.map((ag) => (
                        <option key={ag.id} value={ag.agentCode}>
                          {ag.alias} (کد: {ag.agentCode})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {newUserRole === 'SHIPPING_COMPANY' && (
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1">انتساب به شرکت باربری</label>
                    <select
                      value={newUserSCId}
                      onChange={(e) => setNewUserSCId(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans cursor-pointer"
                    >
                      <option value="">-- انتخاب ناوگان باربری --</option>
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
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow"
                  >
                    {editingUser ? <Edit className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    <span>{editingUser ? 'ذخیره مشخصات کاربر' : 'صدور و فعال‌سازی حساب'}</span>
                  </button>
                  {editingUser && (
                    <button
                      type="button"
                      onClick={cancelEditingUser}
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

        {/* 3. PRODUCTS PANEL */}
        {activeTab === 'PRODUCTS' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-right" id="products-mgmt-panel">
            {/* Grid */}
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
                      <div className="text-xs font-mono font-bold text-emerald-800 bg-emerald-50/50 p-2 rounded-lg border border-emerald-100 flex items-center justify-between">
                        <span className="text-[10px] text-emerald-600 font-sans">نرخ واحد:</span>
                        <span>{prod.pricePerUnit.toLocaleString()} تومان / {prod.unit}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono space-y-0.5">
                        {prod.weight ? <div>⚖️ وزن: <strong className="text-slate-700">{prod.weight}</strong></div> : null}
                        {prod.dimensions ? <div>📐 ابعاد: <strong className="text-slate-700">{prod.dimensions}</strong></div> : null}
                        {prod.coverageInfo ? <div>📋 پوشش: <strong className="text-slate-700">{prod.coverageInfo}</strong></div> : null}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-2.5">
                      <button
                        onClick={() => startEditingProduct(prod)}
                        className="bg-slate-100 hover:bg-emerald-100 text-slate-600 hover:text-emerald-700 p-1.5 rounded-lg transition-all cursor-pointer"
                        title="ویرایش کالا"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
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
                        onClick={() => {
                          askConfirm('حذف محصول', `آیا از حذف محصول «${prod.name}» اطمینان دارید؟`, () => {
                            onDeleteProduct(prod.id);
                          });
                        }}
                        className="bg-rose-50 hover:bg-rose-100 text-rose-600 p-1.5 rounded-lg transition-all cursor-pointer"
                        title="حذف کالا"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Form */}
            <div className="lg:col-span-5 bg-slate-50 border border-slate-200 p-5 rounded-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <h4 className="font-bold text-slate-800 text-xs">
                  {editingProduct ? 'ویرایش مشخصات فنی و قیمتی کالا' : 'تعریف کالای سفالی جدید'}
                </h4>
                <Briefcase className="w-4 h-4 text-emerald-600" />
              </div>

              <form onSubmit={handleSaveProduct} className="space-y-3 font-sans">
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">نام دقیق تجاری کالا *</label>
                  <input
                    type="text"
                    placeholder="مثال: سفال طبرستان دو قالبه (طرح مارسی)"
                    value={newProdName}
                    onChange={(e) => setNewProdName(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1">دسته‌بندی محصول</label>
                    <select
                      value={newProdCategory}
                      onChange={(e) => setNewProdCategory(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans cursor-pointer"
                    >
                      <option value="roof_tile">سفال بام (roof tile)</option>
                      <option value="ridge_tile">تیزه استاندارد (ridge tile)</option>
                      <option value="ending_ridge_tile">تیزه انتهایی (ending ridge tile)</option>
                      <option value="bricks">آجر و بلوک سفالی (bricks)</option>
                      <option value="facade">آجر نما و نسوز (facade)</option>
                      <option value="other">سایر اتصالات و لوازم جانبی</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1">واحد سنجش *</label>
                    <input
                      type="text"
                      placeholder="مثال: عدد، قالب، مترمربع"
                      value={newProdUnit}
                      onChange={(e) => setNewProdUnit(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">قیمت پایه فروش کارخانه (تومان) *</label>
                  <input
                    type="number"
                    placeholder="مثال: 45000"
                    value={newProdPrice || ''}
                    onChange={(e) => setNewProdPrice(Number(e.target.value))}
                    className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono text-left"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1">وزن و مشخصات (اختیاری)</label>
                    <input
                      type="text"
                      placeholder="مثال: ۳.۱ کیلوگرم"
                      value={newProdWeight}
                      onChange={(e) => setNewProdWeight(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-right"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1">ابعاد و مشخصات هندسی (اختیاری)</label>
                    <input
                      type="text"
                      placeholder="مثال: ۲۵ * ۴۰ سانتی‌متر"
                      value={newProdDimensions}
                      onChange={(e) => setNewProdDimensions(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-right"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">آدرس تصویر کالا (اختیاری)</label>
                  <input
                    type="url"
                    placeholder="https://example.com/tile.jpg"
                    value={newProdImageUrl}
                    onChange={(e) => setNewProdImageUrl(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono text-left"
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

        {/* 4. SHIPPING COMPANIES PANEL */}
        {activeTab === 'SHIPPING' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-right animate-fade-in font-sans pb-10" id="shipping-subtab-panel">
            {/* List */}
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
                        <td className="p-3 font-mono text-slate-700 font-bold">{company.code || '-'}</td>
                        <td className="p-3 text-slate-600 font-sans">{company.managerName || '-'}</td>
                        <td className="p-3 font-mono text-slate-700">{company.phoneNumber}</td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => onToggleShippingCompany(company.id)}
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold cursor-pointer transition-all ${
                              company.isEnabled
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : 'bg-rose-100 text-rose-800 border border-rose-200'
                            }`}
                          >
                            {company.isEnabled ? 'فعال' : 'غیرفعال'}
                          </button>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => startEditingShippingCompany(company)}
                              className="p-1 hover:bg-indigo-50 text-indigo-600 rounded transition-colors cursor-pointer"
                              title="ویرایش باربری"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                askConfirm('حذف شرکت باربری', `آیا از حذف «${company.name}» اطمینان دارید؟`, () => {
                                  onDeleteShippingCompany(company.id);
                                });
                              }}
                              className="p-1 hover:bg-rose-50 text-rose-600 rounded transition-colors cursor-pointer"
                              title="حذف باربری"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Form */}
            <div className="lg:col-span-4 bg-slate-50 border border-slate-200 p-5 rounded-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <h4 className="font-bold text-slate-800 text-xs">
                  {editingShippingCompany ? 'ویرایش ناوگان باربری' : 'ثبت شرکت حمل و نقل جدید'}
                </h4>
                <Truck className="w-4 h-4 text-blue-600" />
              </div>

              <form onSubmit={handleSaveShippingCompany} className="space-y-3 font-sans">
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">نام رسمی شرکت حمل و نقل *</label>
                  <input
                    type="text"
                    placeholder="مثال: ترابری سراسری پیشتازان خزر"
                    value={newSCName}
                    onChange={(e) => setNewSCName(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1">کد ترابری اختصاصی</label>
                    <input
                      type="text"
                      placeholder="مثال: TR-99"
                      value={newSCCode}
                      onChange={(e) => setNewSCCode(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-left"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1">شماره تماس دیسپچ *</label>
                    <input
                      type="text"
                      placeholder="011-33445566"
                      value={newSCPhone}
                      onChange={(e) => setNewSCPhone(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-left"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">نام مدیر عامل یا مسئول هماهنگی</label>
                  <input
                    type="text"
                    placeholder="مثال: آقای مهندس کریمی"
                    value={newSCManager}
                    onChange={(e) => setNewSCManager(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1">شناسه ملی شرکت</label>
                    <input
                      type="text"
                      placeholder="مثال: 10100987654"
                      value={newSCNationalId}
                      onChange={(e) => setNewSCNationalId(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1">کد اقتصادی</label>
                    <input
                      type="text"
                      placeholder="مثال: 411199887766"
                      value={newSCEconomicCode}
                      onChange={(e) => setNewSCEconomicCode(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">آدرس پایانه بارگیری / دفتر مرکزی</label>
                  <textarea
                    rows={2}
                    placeholder="مازندران، پایانه باربری ساری..."
                    value={newSCAddress}
                    onChange={(e) => setNewSCAddress(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow"
                  >
                    {editingShippingCompany ? <Edit className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    <span>{editingShippingCompany ? 'ذخیره تغییرات باربری' : 'ثبت شرکت باربری جدید'}</span>
                  </button>
                  {editingShippingCompany && (
                    <button
                      type="button"
                      onClick={cancelEditingShippingCompany}
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

      </div>
    </div>
  );
}
