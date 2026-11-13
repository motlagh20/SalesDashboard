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
  Sparkles,
  AlertCircle,
  Copy,
  Check,
  Eye,
  EyeOff,
  Mail,
  Send,
  Activity,
  CheckCircle2
} from 'lucide-react';
import { Agent, Product, ShippingCompany, UserRole, TerritoryAssignment, EmailSettings, EmailProviderType } from '../types';
import { TerritorySelector } from './TerritorySelector';
import { TerritoryBadgeList } from './TerritoryBadgeList';
import { formatTerritoriesSummary, parseTerritoriesFromArea, normalizeProvinceName } from '../data/iranLocations';

export interface BaseDefinitionsDashboardProps {
  agents: Agent[];
  users: any[];
  products: Product[];
  shippingCompanies: ShippingCompany[];
  onClose: () => void;
  initialSubTab?: 'AGENTS' | 'USERS' | 'PRODUCTS' | 'SHIPPING' | 'EMAIL_SETTINGS';
  
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
  const [activeTab, setActiveTab] = useState<'AGENTS' | 'USERS' | 'PRODUCTS' | 'SHIPPING' | 'EMAIL_SETTINGS'>(initialSubTab);

  useEffect(() => {
    fetchUsers();
  }, []);

  // --- USER-FIRST LINKING STATE ---
  const [selectedAgentUserId, setSelectedAgentUserId] = useState('');
  const [selectedSCUserId, setSelectedSCUserId] = useState('');

  // --- AGENT STATE ---
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [newAgentAlias, setNewAgentAlias] = useState('');
  const [newAgentCode, setNewAgentCode] = useState('');
  const [newAgentArea, setNewAgentArea] = useState('');
  const [newAgentTerritories, setNewAgentTerritories] = useState<TerritoryAssignment[]>([]);
  const [newAgentFullName, setNewAgentFullName] = useState('');
  const [newAgentPhone, setNewAgentPhone] = useState('');
  const [newAgentAddress, setNewAgentAddress] = useState('');
  const [newAgentPersonType, setNewAgentPersonType] = useState<'REAL' | 'LEGAL'>('REAL');
  const [newAgentCompanyName, setNewAgentCompanyName] = useState('');
  const [newAgentNationalId, setNewAgentNationalId] = useState('');
  const [newAgentRegistrationNumber, setNewAgentRegistrationNumber] = useState('');
  const [newAgentEconomicCode, setNewAgentEconomicCode] = useState('');
  const [newAgentNationalCode, setNewAgentNationalCode] = useState('');
  const [newAgentIsExport, setNewAgentIsExport] = useState(false);

  // Available representative users who don't have an agent assigned yet
  const availableRepUsers = users.filter((u: any) => {
    if (u.role !== 'REPRESENTATIVE') return false;
    if (editingAgent) {
      if (editingAgent.userId && u.id === editingAgent.userId) return true;
      if (editingAgent.agentCode && u.agentCode === editingAgent.agentCode) return true;
      if (editingAgent.phoneNumber && u.phoneNumber === editingAgent.phoneNumber) return true;
    }
    const isClaimed = agents.some((a) => {
      if (editingAgent && a.id === editingAgent.id) return false;
      return (a.userId && a.userId === u.id) || (u.agentCode && a.agentCode === u.agentCode) || (a.phoneNumber && a.phoneNumber === u.phoneNumber);
    });
    return !isClaimed;
  });

  // Available shipping company users who don't have a shipping company assigned yet
  const availableScUsers = users.filter((u: any) => {
    if (u.role !== 'SHIPPING_COMPANY') return false;
    if (editingShippingCompany) {
      if (editingShippingCompany.userId && u.id === editingShippingCompany.userId) return true;
      if (editingShippingCompany.id && u.shippingCompanyId === editingShippingCompany.id) return true;
      if (editingShippingCompany.phoneNumber && u.phoneNumber === editingShippingCompany.phoneNumber) return true;
    }
    const isClaimed = shippingCompanies.some((s) => {
      if (editingShippingCompany && s.id === editingShippingCompany.id) return false;
      return (s.userId && s.userId === u.id) || (u.shippingCompanyId && s.id === u.shippingCompanyId) || (s.phoneNumber && s.phoneNumber === u.phoneNumber);
    });
    return !isClaimed;
  });

  const handleSelectAgentUser = (userId: string) => {
    setSelectedAgentUserId(userId);
    const selectedUser = users.find((u: any) => u.id === userId);
    if (selectedUser) {
      setNewAgentFullName(selectedUser.fullName || '');
      setNewAgentPhone(selectedUser.phoneNumber || '');
      if (!newAgentAlias.trim()) {
        setNewAgentAlias(`نمایندگی ${selectedUser.fullName || selectedUser.username}`);
      }
      if (selectedUser.agentCode && !newAgentCode.trim()) {
        setNewAgentCode(selectedUser.agentCode);
      }
    }
  };

  const handleSelectSCUser = (userId: string) => {
    setSelectedSCUserId(userId);
    const selectedUser = users.find((u: any) => u.id === userId);
    if (selectedUser) {
      if (!newSCName.trim()) {
        setNewSCName(selectedUser.fullName || `باربری ${selectedUser.username}`);
      }
      setNewSCPhone(selectedUser.phoneNumber || '');
      setNewSCManager(selectedUser.fullName || '');
    }
  };

  const startEditingAgent = (agent: Agent) => {
    setEditingAgent(agent);
    setNewAgentAlias(agent.alias);
    setNewAgentCode(agent.agentCode);
    setNewAgentArea(agent.area || '');

    // Robust territory parsing & restoration to ensure all assigned provinces are preserved
    let initialTerritories: TerritoryAssignment[] = [];
    if (agent.territories) {
      if (Array.isArray(agent.territories)) {
        initialTerritories = agent.territories.map(t => ({
          ...t,
          province: normalizeProvinceName(t.province),
          allCities: t.allCities !== undefined ? !!t.allCities : !(t.cities && t.cities.length > 0)
        }));
      } else if (typeof agent.territories === 'string') {
        try {
          const parsed = JSON.parse(agent.territories);
          if (Array.isArray(parsed)) {
            initialTerritories = parsed.map((t: any) => ({
              ...t,
              province: normalizeProvinceName(t.province),
              allCities: t.allCities !== undefined ? !!t.allCities : !(t.cities && t.cities.length > 0)
            }));
          } else if (parsed && typeof parsed === 'object') {
            initialTerritories = [{
              ...parsed,
              province: normalizeProvinceName(parsed.province),
              allCities: parsed.allCities !== undefined ? !!parsed.allCities : !(parsed.cities && parsed.cities.length > 0)
            }];
          }
        } catch {}
      } else if (typeof agent.territories === 'object') {
        const tObj = agent.territories as any;
        initialTerritories = [{
          ...tObj,
          province: normalizeProvinceName(tObj.province),
          allCities: tObj.allCities !== undefined ? !!tObj.allCities : !(tObj.cities && tObj.cities.length > 0)
        }];
      }
    }

    // Deduplicate by clean province name
    const seenProvinces = new Set<string>();
    initialTerritories = initialTerritories.filter(t => {
      const clean = normalizeProvinceName(t.province);
      if (!clean || seenProvinces.has(clean)) return false;
      seenProvinces.add(clean);
      return true;
    });

    // If territories is empty or missing provinces that exist in area text, merge from area text
    if (agent.area) {
      const parsedFromArea = parseTerritoriesFromArea(agent.area).map(t => ({
        ...t,
        province: normalizeProvinceName(t.province)
      }));
      for (const item of parsedFromArea) {
        const cleanItemProv = normalizeProvinceName(item.province);
        if (cleanItemProv && !initialTerritories.some(t => normalizeProvinceName(t.province) === cleanItemProv)) {
          initialTerritories.push(item);
        }
      }
    }

    const matchingUser = users.find((u: any) => 
      (agent.userId && u.id === agent.userId) ||
      (agent.agentCode && u.agentCode === agent.agentCode) ||
      (agent.phoneNumber && u.phoneNumber === agent.phoneNumber)
    );
    setSelectedAgentUserId(matchingUser ? matchingUser.id : (agent.userId || ''));

    setNewAgentTerritories(initialTerritories);
    setNewAgentFullName(agent.fullName);
    setNewAgentPhone(agent.phoneNumber);
    setNewAgentAddress(agent.address);
    setNewAgentPersonType((agent.personType as any) === 'LEGAL' ? 'LEGAL' : 'REAL');
    setNewAgentCompanyName(agent.companyName || '');
    setNewAgentNationalId(agent.nationalId || '');
    setNewAgentRegistrationNumber(agent.registrationNumber || '');
    setNewAgentEconomicCode(agent.economicCode || '');
    setNewAgentNationalCode(agent.nationalCode || '');
    setNewAgentIsExport(agent.isExportAgent || false);
  };

  const cancelEditingAgent = () => {
    setEditingAgent(null);
    setSelectedAgentUserId('');
    setNewAgentAlias('');
    setNewAgentCode('');
    setNewAgentArea('');
    setNewAgentTerritories([]);
    setNewAgentFullName('');
    setNewAgentPhone('');
    setNewAgentAddress('');
    setNewAgentPersonType('REAL');
    setNewAgentCompanyName('');
    setNewAgentNationalId('');
    setNewAgentRegistrationNumber('');
    setNewAgentEconomicCode('');
    setNewAgentNationalCode('');
    setNewAgentIsExport(false);
  };

  const handleSaveAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAgent && !selectedAgentUserId) {
      showToast('خطا: ابتدا باید حساب کاربری نماینده را از لیست انتخاب نمایید (یا از بخش کاربران تعریف کنید).', 'error');
      return;
    }

    if (!newAgentAlias.trim() || !newAgentCode.trim() || !newAgentFullName.trim()) {
      showToast('لطفاً عنوان نمایندگی، کد و نام مسئول را وارد نمایید.', 'error');
      return;
    }

    const normalizedTerritories = newAgentTerritories.map(t => ({
      ...t,
      province: normalizeProvinceName(t.province)
    }));

    const summaryArea = normalizedTerritories.length > 0
      ? formatTerritoriesSummary(normalizedTerritories)
      : (newAgentArea.trim() || 'سراسر کشور');

    const payload: Agent = {
      id: editingAgent ? editingAgent.id : `agent-${Date.now()}`,
      userId: selectedAgentUserId || (editingAgent ? editingAgent.userId : undefined),
      alias: newAgentAlias.trim(),
      agentCode: newAgentCode.trim(),
      area: summaryArea,
      territories: normalizedTerritories,
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
      await onUpdateAgent(payload);
    } else {
      await onAddAgent(payload);
    }
    cancelEditingAgent();
  };

  // --- USER STATE ---
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [newUsername, setNewUsername] = useState('');
  const [newUserFullName, setNewUserFullName] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserEmailVerified, setNewUserEmailVerified] = useState(false);
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('REPRESENTATIVE');
  const [newUserAgentCode, setNewUserAgentCode] = useState('');
  const [newUserSCId, setNewUserSCId] = useState('');

  const startEditingUser = (u: any) => {
    setEditingUser(u);
    setNewUsername(u.username);
    setNewUserFullName(u.fullName || '');
    setNewUserPhone(u.phoneNumber || '');
    setNewUserEmail(u.email || '');
    setNewUserEmailVerified(Boolean(u.emailVerified));
    setNewUserPassword('');
    setNewUserRole(u.role);
    setNewUserAgentCode(u.agentCode || '');
    setNewUserSCId(u.shippingCompanyId || '');
  };

  // --- CREDENTIALS ISSUED MODAL STATE ---
  const [issuedCredentials, setIssuedCredentials] = useState<{
    username: string;
    fullName: string;
    phoneNumber?: string;
    role: string;
    tempPassword: string;
    isReset?: boolean;
  } | null>(null);

  const [copiedPassword, setCopiedPassword] = useState(false);
  const [showUserPassword, setShowUserPassword] = useState(false);

  const handleGenerateTempPassword = () => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let randomPart = "";
    for (let i = 0; i < 6; i++) {
      randomPart += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    const generated = `Tb9#${randomPart}`;
    setNewUserPassword(generated);
    setShowUserPassword(true);
    copyToClipboard(generated, 'رمز عبور موقت ایجاد و در حافظه کپی شد.');
  };

  const copyToClipboard = (text: string, customMessage?: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
      } else {
        // Fallback for older browsers/contexts
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopiedPassword(true);
      showToast(customMessage || 'رمز عبور موقت در کلیپ‌بورد کپی شد.', 'success');
      setTimeout(() => setCopiedPassword(false), 2500);
    } catch {
      showToast('خطا در کپی کردن رمز.', 'error');
    }
  };

  const cancelEditingUser = () => {
    setEditingUser(null);
    setNewUsername('');
    setNewUserFullName('');
    setNewUserPhone('');
    setNewUserEmail('');
    setNewUserEmailVerified(false);
    setNewUserPassword('');
    setShowUserPassword(false);
    setNewUserRole('REPRESENTATIVE');
    setNewUserAgentCode('');
    setNewUserSCId('');
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newUserFullName.trim() || !newUserPhone.trim() || !newUserRole) {
      showToast('نام کاربری، نام کامل، شماره تماس و نقش کاربر الزامی هستند.', 'error');
      return;
    }

    if (!editingUser && !newUserPassword.trim()) {
      showToast('تعیین رمز عبور برای کاربر جدید الزامی است (می‌توانید روی «ایجاد رمز موقت» کلیک نمایید).', 'error');
      return;
    }

    try {
      const cleanedEmail = newUserEmail.trim() || null;
      const payload: any = {
        username: newUsername.trim(),
        fullName: newUserFullName.trim(),
        phoneNumber: newUserPhone.trim(),
        email: cleanedEmail,
        emailVerified: cleanedEmail ? Boolean(newUserEmailVerified) : false,
        role: newUserRole || 'REPRESENTATIVE',
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
        const resData = await res.json().catch(() => ({}));
        if (res.ok) {
          showToast('اطلاعات کاربر با موفقیت ویرایش شد.', 'success');
          fetchUsers();
          cancelEditingUser();
        } else {
          showToast(resData.message || resData.error || 'خطا در به‌روزرسانی اطلاعات کاربر.', 'error');
        }
      } else {
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const resData = await res.json().catch(() => ({}));
        if (res.ok) {
          fetchUsers();
          cancelEditingUser();
          const createdUser = resData.user || { ...payload, id: resData.id };
          const issuedPass = resData.tempPassword || payload.password;

          // Open one-time visible credentials modal
          if (issuedPass) {
            setIssuedCredentials({
              username: createdUser.username || payload.username,
              fullName: createdUser.fullName || payload.fullName,
              phoneNumber: createdUser.phoneNumber || payload.phoneNumber,
              role: createdUser.role || payload.role,
              tempPassword: issuedPass,
              isReset: false
            });
          }

          if (payload.role === 'REPRESENTATIVE') {
            showToast('حساب کاربر نماینده با موفقیت ایجاد گردید. اکنون می‌توانید در تب «نمایندگان فروش»، سایر مشخصات و مناطق را تکمیل نمایید.', 'success');
            setSelectedAgentUserId(createdUser.id || '');
            setNewAgentFullName(createdUser.fullName || payload.fullName);
            setNewAgentPhone(createdUser.phoneNumber || payload.phoneNumber);
            setNewAgentAlias(`نمایندگی ${createdUser.fullName || payload.fullName}`);
            setActiveTab('AGENTS');
          } else if (payload.role === 'SHIPPING_COMPANY') {
            showToast('حساب کاربر باربری با موفقیت ایجاد گردید. اکنون می‌توانید در تب «شرکت‌های حمل»، کد ترابری و پایانه را ثبت نمایید.', 'success');
            setSelectedSCUserId(createdUser.id || '');
            setNewSCName(createdUser.fullName || payload.fullName);
            setNewSCPhone(createdUser.phoneNumber || payload.phoneNumber);
            setNewSCManager(createdUser.fullName || payload.fullName);
            setActiveTab('SHIPPING');
          } else {
            showToast('کاربر جدید با موفقیت ایجاد شد.', 'success');
          }
        } else {
          showToast(resData.message || resData.error || 'خطا در تعریف کاربر جدید.', 'error');
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
    askConfirm(
      'بازنشانی رمز عبور کاربر',
      `آیا از بازنشانی رمز عبور کاربر «${userItem.fullName || userItem.username}» به یک رمز عبور موقت جدید اطمینان دارید؟ این رمز فقط یکبار در کادر اختصاصی به شما نمایش داده می‌شود و کاربر در اولین ورود موظف به تغییر آن خواهد بود.`,
      async () => {
        try {
          const res = await fetch(`/api/users/${userItem.id}/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.tempPassword) {
            fetchUsers();
            setIssuedCredentials({
              username: data.username || userItem.username,
              fullName: data.fullName || userItem.fullName,
              phoneNumber: userItem.phoneNumber,
              role: userItem.role,
              tempPassword: data.tempPassword,
              isReset: true
            });
            showToast('رمز عبور موقت با موفقیت صادر گردید.', 'success');
          } else {
            showToast(data.message || data.error || 'خطا در بازنشانی رمز عبور.', 'error');
          }
        } catch {
          showToast('خطای شبکه در بازنشانی رمز عبور.', 'error');
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
    const matchingUser = users.find((u: any) =>
      (sc.userId && u.id === sc.userId) ||
      (sc.id && u.shippingCompanyId === sc.id) ||
      (sc.phoneNumber && u.phoneNumber === sc.phoneNumber)
    );
    setSelectedSCUserId(matchingUser ? matchingUser.id : (sc.userId || ''));

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
    setSelectedSCUserId('');
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
    if (!editingShippingCompany && !selectedSCUserId) {
      showToast('خطا: ابتدا باید حساب کاربری شرکت حمل‌ونقل را از لیست انتخاب نمایید (یا از بخش کاربران تعریف کنید).', 'error');
      return;
    }

    if (!newSCName.trim() || !newSCPhone.trim()) {
      showToast('نام شرکت باربری و شماره تماس الزامی است.', 'error');
      return;
    }

    const payload: ShippingCompany = {
      id: editingShippingCompany ? editingShippingCompany.id : `sc-${Date.now()}`,
      userId: selectedSCUserId || (editingShippingCompany ? editingShippingCompany.userId : undefined),
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

  // --- EMAIL SERVICE MANAGEMENT STATE ---
  const [emailSettings, setEmailSettings] = useState<EmailSettings>({
    providerType: 'SMTP',
    isEnabled: false,
    senderName: 'سامانه مدیریت فروش',
    senderEmail: 'noreply@company.com',
    allowPasswordReset: true,
    allowNotifications: true,
    smtpHost: 'smtp.example.com',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: '',
    smtpPassword: '',
    passwordConfigured: false,
    webhookProvider: 'GENERIC',
    apiUrl: '',
    apiKey: '',
    apiKeyConfigured: false,
    apiMethod: 'POST',
    customHeaders: '',
    encryptionKeyConfigured: true
  });

  const [isLoadingEmailSettings, setIsLoadingEmailSettings] = useState(false);
  const [isSavingEmailSettings, setIsSavingEmailSettings] = useState(false);
  const [isTestingEmailConnection, setIsTestingEmailConnection] = useState(false);
  const [testRecipientEmail, setTestRecipientEmail] = useState('');
  const [diagnosticResult, setDiagnosticResult] = useState<{
    success: boolean;
    message: string;
    timestamp: string;
    provider: EmailProviderType;
    logs: string[];
    messageId?: string;
  } | null>(null);

  const fetchEmailSettings = async () => {
    setIsLoadingEmailSettings(true);
    try {
      const res = await fetch('/api/system/email-settings');
      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          setEmailSettings({
            ...data.settings,
            smtpPassword: '',
            apiKey: ''
          });
        }
      }
    } catch {
      showToast('خطا در دریافت تنظیمات ایمیل.', 'error');
    } finally {
      setIsLoadingEmailSettings(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'EMAIL_SETTINGS') {
      fetchEmailSettings();
    }
  }, [activeTab]);

  const buildEmailSettingsRequestBody = (source: EmailSettings) => {
    const body: any = {
      providerType: source.providerType,
      isEnabled: source.isEnabled,
      senderName: source.senderName,
      senderEmail: source.senderEmail,
      allowPasswordReset: source.allowPasswordReset,
      allowNotifications: source.allowNotifications,
      smtpHost: source.smtpHost,
      smtpPort: Number(source.smtpPort) || 587,
      smtpSecure: Number(source.smtpPort) === 465 ? true : Number(source.smtpPort) === 587 ? false : Boolean(source.smtpSecure),
      smtpUser: source.smtpUser,
      webhookProvider: source.webhookProvider || 'GENERIC',
      apiUrl: source.apiUrl,
      apiMethod: source.apiMethod || 'POST',
      customHeaders: source.customHeaders || ''
    };
    if (source.smtpPassword && source.smtpPassword.length > 0) {
      body.smtpPassword = source.smtpPassword;
    }
    if (source.apiKey && source.apiKey.length > 0) {
      body.apiKey = source.apiKey;
    }
    return body;
  };

  const handleSaveEmailSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingEmailSettings(true);
    try {
      const res = await fetch('/api/system/email-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildEmailSettingsRequestBody(emailSettings))
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (data.settings) {
          setEmailSettings({
            ...data.settings,
            smtpPassword: '',
            apiKey: ''
          });
        }
        showToast('تنظیمات سرویس ایمیل با موفقیت رمزگذاری و ذخیره شد.', 'success');
      } else {
        showToast(data.message || data.error || 'خطا در ذخیره تنظیمات ایمیل.', 'error');
      }
    } catch {
      showToast('خطای شبکه در ذخیره تنظیمات ایمیل.', 'error');
    } finally {
      setIsSavingEmailSettings(false);
    }
  };

  const handleClearEmailSecret = (type: 'smtpPassword' | 'apiKey') => {
    const label = type === 'smtpPassword' ? 'رمز عبور SMTP' : 'کلید API وب‌هوک';
    askConfirm(
      `حذف ${label}`,
      `آیا از حذف دائمی ${label} ذخیره شده اطمینان دارید؟`,
      async () => {
        setIsSavingEmailSettings(true);
        try {
          const payload = type === 'smtpPassword' ? { clearSmtpPassword: true } : { clearApiKey: true };
          const res = await fetch('/api/system/email-settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.settings) {
            setEmailSettings({
              ...data.settings,
              smtpPassword: '',
              apiKey: ''
            });
            showToast(`${label} با موفقیت حذف شد.`, 'success');
          } else {
            showToast(data.message || data.error || `خطا در حذف ${label}.`, 'error');
          }
        } catch {
          showToast('خطای شبکه در حذف اطلاعات محرمانه.', 'error');
        } finally {
          setIsSavingEmailSettings(false);
        }
      }
    );
  };

  const handleRunEmailDiagnostic = async () => {
    setIsTestingEmailConnection(true);
    setDiagnosticResult(null);
    try {
      const res = await fetch('/api/system/email-settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: testRecipientEmail.trim() || undefined,
          settings: buildEmailSettingsRequestBody(emailSettings)
        })
      });
      const data = await res.json().catch(() => ({}));
      if (data && Array.isArray(data.logs)) {
        setDiagnosticResult(data);
      }
      if (res.ok && data.success) {
        showToast('تست اتصال و ارسال ایمیل با موفقیت انجام شد.', 'success');
      } else {
        showToast(data.message || data.error || 'تست اتصال با خطا مواجه شد.', 'error');
      }
    } catch {
      showToast('خطا در برقراری ارتباط با سرور برای تست.', 'error');
    } finally {
      setIsTestingEmailConnection(false);
    }
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

          <button
            type="button"
            onClick={() => {
              setActiveTab('EMAIL_SETTINGS');
              fetchEmailSettings();
            }}
            className={`flex-1 min-w-[140px] py-2 px-3 rounded-lg text-xs font-black cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'EMAIL_SETTINGS'
                ? 'bg-slate-900 text-amber-300 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Mail className="w-4 h-4 text-rose-400" />
            <span>تنظیمات ایمیل {emailSettings.isEnabled && <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>}</span>
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
                        <div className="text-[11px] text-slate-600 mt-1 font-sans flex items-center gap-1.5 flex-wrap">
                          <span>💼 مسئول: <strong>{agent.fullName}</strong> • حوزه سرپرستی:</span>
                          <TerritoryBadgeList territories={agent.territories} fallbackArea={agent.area} />
                        </div>
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
                  {editingAgent ? 'ویرایش اطلاعات نمایندگی رسمی' : 'ثبت مشخصات نمایندگی رسمی'}
                </h4>
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
              </div>

              {/* Requirement: User Account must exist first */}
              {!editingAgent ? (
                availableRepUsers.length === 0 ? (
                  <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-xl space-y-2.5 text-right shadow-xs">
                    <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>نیاز به تعریف کاربر در بخش «کاربران و دسترسی‌ها»</span>
                    </div>
                    <p className="text-[11px] text-amber-800 leading-relaxed font-sans">
                      طبق فرآیند سیستم، ابتدا باید حساب کاربری نماینده (نام کاربری، رمز عبور و شماره تماس OTP) در بخش <strong>«کاربران و دسترسی‌ها»</strong> با نقش <em>«نمایندگی رسمی فروش»</em> ایجاد شود. سپس در این بخش می‌توانید کد تفصیلی، مناطق تحت سرپرستی و مشخصات حقوقی را تکمیل فرمایید.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('USERS');
                        setNewUserRole('REPRESENTATIVE');
                      }}
                      className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-2.5 px-3 rounded-lg text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs font-sans"
                    >
                      <Users className="w-4 h-4" />
                      <span>انتقال به بخش کاربران جهت تعریف نماینده جدید ⬅️</span>
                    </button>
                  </div>
                ) : (
                  <div className="bg-emerald-50/80 border border-emerald-300 p-3 rounded-xl space-y-1.5 shadow-xs">
                    <label className="text-[11px] font-bold text-emerald-950 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <UserCheck className="w-4 h-4 text-emerald-700" />
                        <span>انتخاب حساب کاربری نماینده *</span>
                      </span>
                      <span className="text-[9px] bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded-full font-bold font-mono">
                        {availableRepUsers.length} کاربر در انتظار پرونده
                      </span>
                    </label>
                    <select
                      value={selectedAgentUserId}
                      onChange={(e) => handleSelectAgentUser(e.target.value)}
                      className="w-full bg-white border border-emerald-300 rounded-lg px-2.5 py-2 text-xs text-slate-800 font-sans focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                    >
                      <option value="">-- انتخاب حساب کاربری نماینده (الزامی) --</option>
                      {availableRepUsers.map((u: any) => (
                        <option key={u.id} value={u.id}>
                          👤 {u.fullName} (نام کاربری: {u.username} | تماس: {u.phoneNumber})
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-emerald-700">
                      با انتخاب کاربر، نام مسئول و شماره تماس به طور خودکار بارگذاری و متصل می‌گردد.
                    </p>
                  </div>
                )
              ) : (
                <div className="bg-slate-100 border border-slate-200 p-2.5 rounded-xl text-xs text-slate-700 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-slate-500" />
                    <span>حساب کاربری متصل:</span>
                    <strong className="text-slate-900 font-sans">
                      {users.find((u: any) => (editingAgent.userId && u.id === editingAgent.userId) || (editingAgent.agentCode && u.agentCode === editingAgent.agentCode) || (editingAgent.phoneNumber && u.phoneNumber === editingAgent.phoneNumber))?.fullName || editingAgent.fullName}
                    </strong>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">
                    {editingAgent.phoneNumber}
                  </span>
                </div>
              )}

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

                {/* Modern Territory Selector */}
                <TerritorySelector
                  value={newAgentTerritories}
                  onChange={setNewAgentTerritories}
                  onSummaryChange={setNewAgentArea}
                />

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
                    disabled={!editingAgent && (!selectedAgentUserId || availableRepUsers.length === 0)}
                    className={`flex-1 font-bold py-2.5 px-4 rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 shadow ${
                      !editingAgent && (!selectedAgentUserId || availableRepUsers.length === 0)
                        ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                    }`}
                  >
                    {editingAgent ? <Edit className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    <span>
                      {editingAgent 
                        ? 'ذخیره تغییرات نمایندگی' 
                        : (!selectedAgentUserId ? 'لطفاً ابتدا حساب کاربری نماینده را انتخاب کنید' : 'افزودن و ثبت مشخصات نمایندگی')}
                    </span>
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
                        <th className="p-3">آدرس ایمیل</th>
                        <th className="p-3">نقش سیستمی</th>
                        <th className="p-3">منتسب به</th>
                        <th className="p-3 text-center">وضعیت ورود</th>
                        <th className="p-3 text-center w-28">عملیات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => {
                        let matchDescNode: React.ReactNode = '-';
                        if (u.role === 'REPRESENTATIVE') {
                          const ag = agents.find(a => (u.agentCode && a.agentCode === u.agentCode) || (a.phoneNumber && a.phoneNumber === u.phoneNumber) || (a.userId && a.userId === u.id));
                          if (ag) {
                            matchDescNode = (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                🏢 {ag.alias} (کد: {ag.agentCode})
                              </span>
                            );
                          } else {
                            matchDescNode = (
                              <div className="flex flex-col gap-1 items-start">
                                <span className="text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                                  ⏳ در انتظار پرونده نمایندگی
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedAgentUserId(u.id);
                                    setNewAgentFullName(u.fullName || '');
                                    setNewAgentPhone(u.phoneNumber || '');
                                    setNewAgentAlias(`نمایندگی ${u.fullName || u.username}`);
                                    setActiveTab('AGENTS');
                                  }}
                                  className="text-[10px] text-emerald-700 hover:text-emerald-900 font-bold underline cursor-pointer"
                                >
                                  تکمیل پرونده در تب نمایندگان ⬅️
                                </button>
                              </div>
                            );
                          }
                        } else if (u.role === 'SHIPPING_COMPANY') {
                          const sc = shippingCompanies.find(s => (u.shippingCompanyId && s.id === u.shippingCompanyId) || (s.phoneNumber && s.phoneNumber === u.phoneNumber) || (s.userId && s.userId === u.id));
                          if (sc) {
                            matchDescNode = (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                🚛 {sc.name} (کد: {sc.code || '-'})
                              </span>
                            );
                          } else {
                            matchDescNode = (
                              <div className="flex flex-col gap-1 items-start">
                                <span className="text-[10px] font-bold bg-blue-100 text-blue-900 border border-blue-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                                  ⏳ در انتظار پرونده باربری
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedSCUserId(u.id);
                                    setNewSCName(u.fullName || `باربری ${u.username}`);
                                    setNewSCPhone(u.phoneNumber || '');
                                    setNewSCManager(u.fullName || '');
                                    setActiveTab('SHIPPING');
                                  }}
                                  className="text-[10px] text-blue-700 hover:text-blue-900 font-bold underline cursor-pointer"
                                >
                                  تکمیل پرونده در تب باربری ⬅️
                                </button>
                              </div>
                            );
                          }
                        }

                        let roleColor = 'bg-slate-100 text-slate-800';
                        let roleLabel = 'کاربر سیستم';
                        if (u.role === 'SALES_MANAGER') {
                          roleColor = 'bg-amber-100 text-amber-800 border border-amber-200';
                          roleLabel = 'مدیریت بازرگانی';
                        } else if (u.role === 'FACTORY_TRANSPORT') {
                          roleColor = 'bg-blue-100 text-blue-800 border border-blue-200';
                          roleLabel = 'ترابری کارخانه';
                        } else if (u.role === 'PRODUCT_WAREHOUSE') {
                          roleColor = 'bg-teal-100 text-teal-800 border border-teal-200';
                          roleLabel = 'انبار محصول (بارگیری و حواله)';
                        } else if (u.role === 'SECURITY_GATE') {
                          roleColor = 'bg-slate-800 text-amber-300 border border-slate-700';
                          roleLabel = 'گیت حراست و انتظامات';
                        } else if (u.role === 'REPRESENTATIVE') {
                          roleColor = 'bg-emerald-100 text-emerald-800 border border-emerald-200';
                          roleLabel = 'نمایندگی رسمی';
                        } else if (u.role === 'SHIPPING_COMPANY') {
                          roleColor = 'bg-purple-100 text-purple-800 border border-purple-200';
                          roleLabel = 'شرکت حمل‌ونقل';
                        } else if (u.role === 'DRIVER') {
                          roleColor = 'bg-cyan-100 text-cyan-800 border border-cyan-200';
                          roleLabel = 'راننده ترابری';
                        } else if (u.role === 'SYSTEM_ADMIN') {
                          roleColor = 'bg-rose-100 text-rose-900 border border-rose-200';
                          roleLabel = 'ادمین ارشد سیستم';
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
                            <td className="p-3 font-mono text-[11px] text-slate-600 text-left">
                              {u.email ? (
                                <div className="flex flex-col items-start gap-0.5">
                                  <span className="inline-flex items-center gap-1 text-slate-700 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                                    <Mail className="w-3 h-3 text-indigo-500 shrink-0" />
                                    <span className="truncate max-w-[140px]" title={u.email}>{u.email}</span>
                                  </span>
                                  {u.emailVerified ? (
                                    <span className="text-[9px] font-sans font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 rounded-full">
                                      تایید شده
                                    </span>
                                  ) : (
                                    <span className="text-[9px] font-sans font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 rounded-full">
                                      تایید نشده
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-400 text-[10px]">ثبت نشده</span>
                              )}
                            </td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${roleColor}`}>
                                {roleLabel}
                              </span>
                            </td>
                            <td className="p-3 text-[11px] font-sans">{matchDescNode}</td>
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
                  <label className="text-[10px] text-slate-500 block mb-1">آدرس ایمیل (جهت بازیابی رمز و اطلاعیه‌ها)</label>
                  <input
                    type="email"
                    placeholder="example@company.com"
                    value={newUserEmail}
                    onChange={(e) => {
                      setNewUserEmail(e.target.value);
                      if (editingUser && e.target.value.trim().toLowerCase() !== (editingUser.email || '').trim().toLowerCase()) {
                        setNewUserEmailVerified(false);
                      }
                    }}
                    className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-left"
                  />
                  {newUserEmail.trim() && (
                    <label className="mt-1.5 flex items-center gap-1.5 text-[10px] text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newUserEmailVerified}
                        onChange={(e) => setNewUserEmailVerified(e.target.checked)}
                        className="w-3.5 h-3.5 text-emerald-600 rounded focus:ring-emerald-500"
                      />
                      <span>ایمیل متعلق به این کاربر تایید شده است (مجاز برای بازیابی رمز عبور)</span>
                    </label>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] text-slate-500 font-bold">
                      {editingUser ? 'رمز عبور جدید (اختیاری):' : 'رمز عبور ورودی اولیه *'}
                    </label>
                    <button
                      type="button"
                      onClick={handleGenerateTempPassword}
                      className="text-[10px] font-bold text-indigo-700 hover:text-indigo-900 flex items-center gap-1 cursor-pointer transition-colors bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded border border-indigo-200"
                      title="ایجاد کلمه عبور موقت تصادفی و امن"
                    >
                      <Sparkles className="w-3 h-3 text-indigo-600" />
                      <span>⚡ ایجاد رمز موقت</span>
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showUserPassword ? 'text' : 'password'}
                      placeholder={editingUser ? 'فقط در صورت نیاز به تغییر وارد کنید' : 'کلمه عبور (یا کلیک روی ایجاد رمز موقت)'}
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 pl-20 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-left"
                    />
                    <div className="absolute left-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      {newUserPassword && (
                        <button
                          type="button"
                          onClick={() => copyToClipboard(newUserPassword, 'کلمه عبور در حافظه کپی شد.')}
                          className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-0.5 transition-colors cursor-pointer"
                          title="کپی سریع رمز در حافظه"
                        >
                          <Copy className="w-3 h-3" />
                          <span>کپی</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowUserPassword(!showUserPassword)}
                        className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer rounded"
                        title={showUserPassword ? 'پنهان کردن رمز' : 'مشاهده رمز'}
                      >
                        {showUserPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <p className="text-[9px] text-slate-400 mt-1 leading-relaxed">
                    با کلیک بر روی <strong>«ایجاد رمز موقت»</strong>، یک رمز امن تولید می‌شود که پس از ثبت فقط یک‌بار نمایش داده خواهد شد و کاربر در اولین ورود موظف به تغییر آن است.
                  </p>
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
                    <option value="FACTORY_TRANSPORT">ترابری و برنامه بارگیری کارخانه</option>
                    <option value="PRODUCT_WAREHOUSE">انبار محصول (بارگیری و صدور حواله)</option>
                    <option value="SECURITY_GATE">گیت حراست و ترخیص نهایی</option>
                    <option value="SHIPPING_COMPANY">شرکت حمل و نقل باربری</option>
                    <option value="DRIVER">راننده اختصاصی ناوگان</option>
                    <option value="SYSTEM_ADMIN">ادمین ارشد سیستم</option>
                  </select>
                </div>

                {newUserRole === 'REPRESENTATIVE' && (
                  <div className="space-y-2">
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] text-emerald-900 space-y-1">
                      <p className="font-bold flex items-center gap-1 text-emerald-950">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                        <span>فرآیند دو مرحله‌ای نمایندگی فروش:</span>
                      </p>
                      <p className="text-[10px] text-emerald-800 leading-relaxed font-sans">
                        ابتدا نام کاربری، رمز عبور و شماره تماس نماینده را در این فرم ثبت فرمایید. پس از ثبت، به تب «نمایندگان فروش» هدایت می‌شوید تا محدوده استانی، کد تفصیلی و مشخصات حقوقی را تکمیل نمایید.
                      </p>
                    </div>
                    {agents.length > 0 && (
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-1">انتساب به نمایندگی موجود (اختیاری)</label>
                        <select
                          value={newUserAgentCode}
                          onChange={(e) => setNewUserAgentCode(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans cursor-pointer"
                        >
                          <option value="">-- پرونده نمایندگی جدید (تکمیل در مرحله بعد) --</option>
                          {agents.map((ag) => (
                            <option key={ag.id} value={ag.agentCode}>
                              {ag.alias} (کد: {ag.agentCode})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {newUserRole === 'SHIPPING_COMPANY' && (
                  <div className="space-y-2">
                    <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-900 space-y-1">
                      <p className="font-bold flex items-center gap-1 text-blue-950">
                        <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                        <span>فرآیند دو مرحله‌ای شرکت حمل و نقل:</span>
                      </p>
                      <p className="text-[10px] text-blue-800 leading-relaxed font-sans">
                        ابتدا نام کاربری و شماره تماس باربری را در این فرم ایجاد فرمایید. پس از ثبت، در تب «شرکت‌های حمل» کد ترابری و اطلاعات پایانه ناوگان را ثبت خواهید فرمود.
                      </p>
                    </div>
                    {shippingCompanies.length > 0 && (
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-1">انتساب به شرکت باربری موجود (اختیاری)</label>
                        <select
                          value={newUserSCId}
                          onChange={(e) => setNewUserSCId(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans cursor-pointer"
                        >
                          <option value="">-- پرونده باربری جدید (تکمیل در مرحله بعد) --</option>
                          {shippingCompanies.map((sc) => (
                            <option key={sc.id} value={sc.id}>
                              {sc.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
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
                  {editingShippingCompany ? 'ویرایش ناوگان باربری' : 'ثبت مشخصات شرکت حمل و نقل جدید'}
                </h4>
                <Truck className="w-4 h-4 text-blue-600" />
              </div>

              {/* Requirement: User Account must exist first */}
              {!editingShippingCompany ? (
                availableScUsers.length === 0 ? (
                  <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-xl space-y-2.5 text-right shadow-xs">
                    <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>نیاز به تعریف کاربر در بخش «کاربران و دسترسی‌ها»</span>
                    </div>
                    <p className="text-[11px] text-amber-800 leading-relaxed font-sans">
                      طبق فرآیند سیستم، ابتدا باید حساب کاربری شرکت باربری (نام کاربری، رمز عبور و شماره تماس OTP) در بخش <strong>«کاربران و دسترسی‌ها»</strong> با نقش <em>«شرکت حمل و نقل باربری»</em> ایجاد شود. سپس در این بخش می‌توانید کد ترابری، مشخصات پایانه و شناسه ملی را تکمیل فرمایید.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('USERS');
                        setNewUserRole('SHIPPING_COMPANY');
                      }}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-3 rounded-lg text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs font-sans"
                    >
                      <Users className="w-4 h-4" />
                      <span>انتقال به بخش کاربران جهت تعریف کاربر باربری ⬅️</span>
                    </button>
                  </div>
                ) : (
                  <div className="bg-blue-50/80 border border-blue-300 p-3 rounded-xl space-y-1.5 shadow-xs">
                    <label className="text-[11px] font-bold text-blue-950 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <UserCheck className="w-4 h-4 text-blue-700" />
                        <span>انتخاب حساب کاربری باربری *</span>
                      </span>
                      <span className="text-[9px] bg-blue-200 text-blue-900 px-2 py-0.5 rounded-full font-bold font-mono">
                        {availableScUsers.length} کاربر در انتظار پرونده
                      </span>
                    </label>
                    <select
                      value={selectedSCUserId}
                      onChange={(e) => handleSelectSCUser(e.target.value)}
                      className="w-full bg-white border border-blue-300 rounded-lg px-2.5 py-2 text-xs text-slate-800 font-sans focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    >
                      <option value="">-- انتخاب حساب کاربری باربری (الزامی) --</option>
                      {availableScUsers.map((u: any) => (
                        <option key={u.id} value={u.id}>
                          🚛 {u.fullName} (نام کاربری: {u.username} | تماس: {u.phoneNumber})
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-blue-700">
                      با انتخاب کاربر، نام مسئول و شماره تماس به طور خودکار بارگذاری و متصل می‌گردد.
                    </p>
                  </div>
                )
              ) : (
                <div className="bg-slate-100 border border-slate-200 p-2.5 rounded-xl text-xs text-slate-700 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-slate-500" />
                    <span>حساب کاربری متصل:</span>
                    <strong className="text-slate-900 font-sans">
                      {users.find((u: any) => (editingShippingCompany.userId && u.id === editingShippingCompany.userId) || (editingShippingCompany.id && u.shippingCompanyId === editingShippingCompany.id) || (editingShippingCompany.phoneNumber && u.phoneNumber === editingShippingCompany.phoneNumber))?.fullName || editingShippingCompany.name}
                    </strong>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">
                    {editingShippingCompany.phoneNumber}
                  </span>
                </div>
              )}

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
                    disabled={!editingShippingCompany && (!selectedSCUserId || availableScUsers.length === 0)}
                    className={`flex-1 font-bold py-2.5 px-4 rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 shadow ${
                      !editingShippingCompany && (!selectedSCUserId || availableScUsers.length === 0)
                        ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                    }`}
                  >
                    {editingShippingCompany ? <Edit className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    <span>
                      {editingShippingCompany 
                        ? 'ذخیره تغییرات باربری' 
                        : (!selectedSCUserId ? 'لطفاً ابتدا حساب کاربری باربری را انتخاب کنید' : 'افزودن و ثبت مشخصات باربری')}
                    </span>
                  </button>
                  {editingShippingCompany && (
                    <button
                      type="button"
                      onClick={cancelEditingShippingCompany}
                      className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-2.5 px-3 rounded-lg text-xs transition-colors cursor-pointer font-sans"
                    >
                      انصراف
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 5. EMAIL SERVICE SETTINGS PANEL */}
        {activeTab === 'EMAIL_SETTINGS' && (
          <div className="space-y-6 text-right animate-fade-in font-sans pb-10" id="email-settings-panel">
            {/* Header info banner */}
            <div className="bg-gradient-to-l from-slate-900 to-indigo-950 text-white rounded-2xl p-5 border border-indigo-900/50 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-300 border border-indigo-500/30">
                    <Mail className="w-5 h-5 text-amber-400" />
                  </div>
                  <h3 className="font-black text-sm md:text-base text-white">پیکربندی سرور و درگاه ارسال ایمیل سازمانی</h3>
                </div>
                <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                  مدیریت اتصال به میل‌سرورهای SMTP یا وب‌هوک‌های API جهت ارسال خودکار کدهای بازیابی کلمه عبور، اعلان‌های سیستمی و اخبار کارتابل.
                </p>
              </div>

              <div className="flex items-center gap-3 bg-slate-800/80 px-4 py-2.5 rounded-xl border border-slate-700">
                <span className="text-xs font-bold text-slate-300">وضعیت کلی سرویس:</span>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black ${
                  emailSettings.isEnabled 
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${emailSettings.isEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`}></span>
                  {emailSettings.isEnabled ? 'سرویس فعال است' : 'سرویس غیرفعال است'}
                </span>
              </div>
            </div>

            {emailSettings.encryptionKeyConfigured === false && (
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-3 text-xs text-rose-900">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1 leading-relaxed">
                  <div className="font-black text-rose-950">کلید رمزگذاری اطلاعات محرمانه ایمیل (EMAIL_SETTINGS_ENCRYPTION_KEY) روی سرور تنظیم نشده است</div>
                  <p className="text-[11px] text-rose-800">
                    جهت رعایت الزامات امنیتی، ذخیره یا رمزگشایی رمز عبور SMTP و کلید API بدون تنظیم این متغیر محیطی مسدود می‌باشد. لطفاً یک کلید ۳۲ بایتی امن در تنظیمات محیطی سرور تعریف نمایید.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Form Column */}
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
                <form onSubmit={handleSaveEmailSettings} className="space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <Key className="w-4 h-4 text-indigo-600" />
                      <h4 className="font-bold text-slate-800 text-xs sm:text-sm">مشخصات پروتکل و احراز هویت</h4>
                    </div>
                    {isLoadingEmailSettings && (
                      <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        <RefreshCw className="w-3 h-3 animate-spin" /> در حال بارگذاری...
                      </span>
                    )}
                  </div>

                  {/* Service Toggle & Feature Flags */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={emailSettings.isEnabled}
                        onChange={(e) => setEmailSettings({ ...emailSettings, isEnabled: e.target.checked })}
                        className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                      />
                      <span className="text-xs font-black text-slate-800">فعال‌سازی ماژول ارسال ایمیل در سامانه</span>
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-200">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={emailSettings.allowPasswordReset}
                          onChange={(e) => setEmailSettings({ ...emailSettings, allowPasswordReset: e.target.checked })}
                          className="w-3.5 h-3.5 text-indigo-600 rounded focus:ring-indigo-500"
                        />
                        <span className="text-xs text-slate-700">مجاز بودن بازیابی رمز عبور با ایمیل</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={emailSettings.allowNotifications}
                          onChange={(e) => setEmailSettings({ ...emailSettings, allowNotifications: e.target.checked })}
                          className="w-3.5 h-3.5 text-indigo-600 rounded focus:ring-indigo-500"
                        />
                        <span className="text-xs text-slate-700">ارسال اعلان‌ها و هشدارهای سیستمی</span>
                      </label>
                    </div>
                  </div>

                  {/* Provider Selector */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-2">نوع پروتکل / ارائه‌دهنده سرویس:</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setEmailSettings({ ...emailSettings, providerType: 'SMTP' })}
                        className={`p-3 rounded-xl border text-right transition-all cursor-pointer ${
                          emailSettings.providerType === 'SMTP'
                            ? 'border-indigo-600 bg-indigo-50/60 shadow-xs ring-1 ring-indigo-500'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className="font-bold text-xs text-slate-900 flex items-center justify-between">
                          <span>پروتکل SMTP استاندارد</span>
                          <span className={`w-3 h-3 rounded-full border ${emailSettings.providerType === 'SMTP' ? 'border-4 border-indigo-600' : 'border-slate-300'}`}></span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">اتصال مستقیم رمزنگاری‌شده به سرورهای ایمیل سازمانی با اعتبارسنجی گواهی TLS</p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setEmailSettings({ ...emailSettings, providerType: 'WEBHOOK_API' })}
                        className={`p-3 rounded-xl border text-right transition-all cursor-pointer ${
                          emailSettings.providerType === 'WEBHOOK_API'
                            ? 'border-indigo-600 bg-indigo-50/60 shadow-xs ring-1 ring-indigo-500'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className="font-bold text-xs text-slate-900 flex items-center justify-between">
                          <span>وب‌سرویس HTTPS API / Webhook</span>
                          <span className={`w-3 h-3 rounded-full border ${emailSettings.providerType === 'WEBHOOK_API' ? 'border-4 border-indigo-600' : 'border-slate-300'}`}></span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">ارسال امن از طریق HTTPS (Resend، Postmark یا Webhook اختصاصی)</p>
                      </button>
                    </div>
                  </div>

                  {/* Sender Details */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">نام فرستنده ایمیل *</label>
                      <input
                        type="text"
                        placeholder="سامانه جامع مدیریت فروش طبرستان"
                        value={emailSettings.senderName}
                        onChange={(e) => setEmailSettings({ ...emailSettings, senderName: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">آدرس ایمیل فرستنده (From) *</label>
                      <input
                        type="email"
                        placeholder="noreply@company.com"
                        value={emailSettings.senderEmail}
                        onChange={(e) => setEmailSettings({ ...emailSettings, senderEmail: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-left"
                        required
                      />
                    </div>
                  </div>

                  {/* SMTP Form Fields */}
                  {emailSettings.providerType === 'SMTP' && (
                    <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-2">
                          <label className="text-xs font-bold text-slate-700 block mb-1">آدرس هاست SMTP *</label>
                          <input
                            type="text"
                            placeholder="mail.domain.com یا smtp.gmail.com"
                            value={emailSettings.smtpHost || ''}
                            onChange={(e) => setEmailSettings({ ...emailSettings, smtpHost: e.target.value })}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-left"
                            required
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-700 block mb-1">پورت سرور *</label>
                          <input
                            type="number"
                            placeholder="587 یا 465"
                            value={emailSettings.smtpPort || 587}
                            onChange={(e) => {
                              const nextPort = Number(e.target.value);
                              setEmailSettings({
                                ...emailSettings,
                                smtpPort: nextPort,
                                smtpSecure: nextPort === 465 ? true : nextPort === 587 ? false : emailSettings.smtpSecure
                              });
                            }}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-left"
                            required
                          />
                        </div>
                      </div>

                      <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-lg px-3 py-2 text-[11px] text-indigo-950 flex items-center justify-between gap-2">
                        <span>
                          حالت امنیتی فعال: <strong>{Number(emailSettings.smtpPort) === 465 ? 'TLS مستقیم (پورت ۴۶۵)' : 'STARTTLS الزامی (پورت ۵۸۷)'}</strong>
                        </span>
                        <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                          اعتبارسنجی گواهی TLS فعال
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                        <div>
                          <label className="text-xs font-bold text-slate-700 block mb-1">نام کاربری SMTP</label>
                          <input
                            type="text"
                            placeholder="user@domain.com"
                            value={emailSettings.smtpUser || ''}
                            onChange={(e) => setEmailSettings({ ...emailSettings, smtpUser: e.target.value })}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-left"
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-bold text-slate-700">
                              رمز عبور SMTP {emailSettings.passwordConfigured && <span className="text-[10px] text-emerald-600 font-normal">(ذخیره شده)</span>}
                            </label>
                            {emailSettings.passwordConfigured && (
                              <button
                                type="button"
                                onClick={() => handleClearEmailSecret('smtpPassword')}
                                className="text-[10px] text-rose-600 hover:text-rose-800 font-bold cursor-pointer"
                              >
                                حذف رمز ذخیره شده
                              </button>
                            )}
                          </div>
                          <input
                            type="password"
                            placeholder={emailSettings.passwordConfigured ? '•••••••• (خالی = بدون تغییر)' : 'رمز عبور سرور ایمیل'}
                            value={emailSettings.smtpPassword || ''}
                            onChange={(e) => setEmailSettings({ ...emailSettings, smtpPassword: e.target.value })}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-left"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Webhook API Form Fields */}
                  {emailSettings.providerType === 'WEBHOOK_API' && (
                    <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <div className="sm:col-span-2">
                          <label className="text-xs font-bold text-slate-700 block mb-1">آدرس وب‌سرویس / HTTPS URL *</label>
                          <input
                            type="url"
                            placeholder="https://api.resend.com/emails"
                            value={emailSettings.apiUrl || ''}
                            onChange={(e) => setEmailSettings({ ...emailSettings, apiUrl: e.target.value })}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-left"
                            required
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-700 block mb-1">نوع سرویس</label>
                          <select
                            value={emailSettings.webhookProvider || 'GENERIC'}
                            onChange={(e) => setEmailSettings({ ...emailSettings, webhookProvider: e.target.value as any })}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                          >
                            <option value="GENERIC">Webhook عمومی</option>
                            <option value="RESEND">Resend API</option>
                            <option value="POSTMARK">Postmark API</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-700 block mb-1">متد HTTP</label>
                          <select
                            value={emailSettings.apiMethod || 'POST'}
                            onChange={(e) => setEmailSettings({ ...emailSettings, apiMethod: e.target.value as any })}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                          >
                            <option value="POST">POST</option>
                            <option value="PUT">PUT</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-bold text-slate-700">
                            کلید احراز هویت (API Key) {emailSettings.apiKeyConfigured && <span className="text-[10px] text-emerald-600 font-normal">(ذخیره شده)</span>}
                          </label>
                          {emailSettings.apiKeyConfigured && (
                            <button
                              type="button"
                              onClick={() => handleClearEmailSecret('apiKey')}
                              className="text-[10px] text-rose-600 hover:text-rose-800 font-bold cursor-pointer"
                            >
                              حذف کلید ذخیره شده
                            </button>
                          )}
                        </div>
                        <input
                          type="password"
                          placeholder={emailSettings.apiKeyConfigured ? '•••••••• (خالی = بدون تغییر)' : 'Bearer token یا کلید API'}
                          value={emailSettings.apiKey || ''}
                          onChange={(e) => setEmailSettings({ ...emailSettings, apiKey: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-left"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">هدرهای اختصاصی (اختیاری - هر هدر در یک خط به فرمت Key: Value)</label>
                        <textarea
                          rows={2}
                          placeholder="X-Custom-Client: SalesDashboard&#10;X-Tenant-Id: 1002"
                          value={emailSettings.customHeaders || ''}
                          onChange={(e) => setEmailSettings({ ...emailSettings, customHeaders: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-left"
                        />
                      </div>
                    </div>
                  )}

                  <div className="pt-2 flex items-center justify-end gap-3">
                    <button
                      type="submit"
                      disabled={isSavingEmailSettings}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-5 rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                    >
                      {isSavingEmailSettings ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      <span>ذخیره و اعمال تنظیمات ایمیل</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Diagnostics & Test Delivery Column */}
              <div className="lg:col-span-5 space-y-5">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
                  <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
                    <Activity className="w-4 h-4 text-emerald-600" />
                    <h4 className="font-bold text-slate-800 text-xs sm:text-sm">تست اتصال و ارسال آزمایشی (Diagnostics)</h4>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    جهت اطمینان از صحت دسترسی به سرور و گذر از فایروال، می‌توانید یک پیام آزمایشی به آدرس ایمیل دلخواه ارسال کنید و لاگ خط‌به‌خط اتصال را مشاهده فرمایید.
                  </p>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 block">آدرس ایمیل گیرنده آزمایشی:</label>
                    <div className="flex gap-2">
                      <input
                        type="email"
                        placeholder="your-email@company.com"
                        value={testRecipientEmail}
                        onChange={(e) => setTestRecipientEmail(e.target.value)}
                        className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-left"
                      />
                      <button
                        type="button"
                        onClick={handleRunEmailDiagnostic}
                        disabled={isTestingEmailConnection}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-lg text-xs transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        {isTestingEmailConnection ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        <span>ارسال و تست</span>
                      </button>
                    </div>
                  </div>

                  {/* Diagnostic Output Log Window */}
                  {diagnosticResult && (
                    <div className="mt-4 pt-4 border-t border-slate-200 space-y-3 animate-fade-in">
                      <div className={`p-3 rounded-xl border flex items-center gap-2 text-xs font-bold ${
                        diagnosticResult.success 
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                          : 'bg-rose-50 border-rose-200 text-rose-800'
                      }`}>
                        {diagnosticResult.success ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                        )}
                        <span>{diagnosticResult.message}</span>
                      </div>

                      <div>
                        <div className="text-[11px] font-bold text-slate-700 mb-1 flex items-center justify-between">
                          <span>لاگ تشخیصی ارتباط سرور:</span>
                          <span className="font-mono text-[10px] text-slate-400">{new Date(diagnosticResult.timestamp).toLocaleTimeString('fa-IR')}</span>
                        </div>
                        <div className="bg-slate-900 text-emerald-400 p-3 rounded-xl font-mono text-[11px] space-y-1 max-h-48 overflow-y-auto dir-ltr text-left border border-slate-800 shadow-inner">
                          {diagnosticResult.logs.map((log, index) => (
                            <div key={index} className="leading-snug">
                              {log}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Helpful Hints Card */}
                <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-5 text-xs text-amber-900 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-amber-950">
                    <Sparkles className="w-4 h-4 text-amber-600" />
                    <span>راهنمای اتصال امن:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-slate-700 text-[11px] leading-relaxed">
                    <li>برای سرویس Gmail حتماً از <strong>App Password</strong> به جای رمز اصلی اکانت استفاده فرمایید.</li>
                    <li>پورت‌های رایج: ۵۸۷ برای STARTTLS و ۴۶۵ برای SSL مستقیم.</li>
                    <li>در صورت استفاده از وب‌هوک، خروجی JSON درخواست حاوی فیلدهای to, subject, html و from خواهد بود.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ONE-TIME TEMPORARY CREDENTIALS MODAL */}
      {issuedCredentials && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-fade-in font-sans" id="issued-credentials-modal">
          <div className="bg-white rounded-2xl border-2 border-indigo-200 max-w-md w-full p-6 shadow-2xl text-right dir-rtl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
                  <Key className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    {issuedCredentials.isReset ? 'رمز عبور موقت صادر گردید' : 'رمز عبور اولیه کاربر صادر گردید'}
                  </h3>
                  <p className="text-[11px] text-slate-500">اطلاعات احراز هویت اولیه جهت تحویل به کاربر</p>
                </div>
              </div>
              <span className="text-[10px] bg-amber-100 text-amber-900 border border-amber-300 font-bold px-2 py-0.5 rounded-full">
                ⚠️ فقط یک‌بار قابل رویت
              </span>
            </div>

            {/* User Info Summary */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 text-xs">
              <div className="flex justify-between items-center border-b border-slate-200/80 pb-1.5">
                <span className="text-slate-500">نام و نام خانوادگی:</span>
                <strong className="text-slate-900 font-sans">{issuedCredentials.fullName}</strong>
              </div>
              <div className="flex justify-between items-center border-b border-slate-200/80 pb-1.5">
                <span className="text-slate-500">نام کاربری ورود (Username):</span>
                <strong className="font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 font-bold">
                  {issuedCredentials.username}
                </strong>
              </div>
              {issuedCredentials.phoneNumber && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">شماره تماس (جهت پیامک OTP):</span>
                  <strong className="font-mono text-slate-800">{issuedCredentials.phoneNumber}</strong>
                </div>
              )}
            </div>

            {/* Temporary Password Highlight Box */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-700 block">
                کلمه عبور موقت اختصاص‌یافته:
              </label>
              <div className="flex items-center gap-2 bg-slate-900 text-white rounded-xl p-3 border border-slate-700 shadow-inner">
                <span className="flex-1 font-mono text-base tracking-wider text-amber-300 select-all text-left dir-ltr font-bold">
                  {issuedCredentials.tempPassword}
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(issuedCredentials.tempPassword, 'رمز عبور موقت در حافظه کپی شد.')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 shadow-xs ${
                    copiedPassword
                      ? 'bg-emerald-600 text-white'
                      : 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black'
                  }`}
                  title="کپی سریع رمز عبور موقت"
                >
                  {copiedPassword ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedPassword ? 'کپی شد!' : 'کپی سریع رمز'}</span>
                </button>
              </div>
            </div>

            {/* Quick Action Options */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => copyToClipboard(issuedCredentials.tempPassword, 'رمز عبور موقت در حافظه کپی شد.')}
                className="py-2 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-indigo-200 shadow-2xs"
                title="کپی سریع رمز"
              >
                <Copy className="w-3.5 h-3.5 text-indigo-600" />
                <span>کپی فقط رمز</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const msg = `همکار گرامی (${issuedCredentials.fullName})،\nاطلاعات ورود به سامانه صنایع سفال طبرستان:\nنام کاربری: ${issuedCredentials.username}\nرمز عبور موقت: ${issuedCredentials.tempPassword}\n\n⚠️ توجه: لطفاً پس از اولین ورود، حتماً نسبت به تغییر کلمه عبور اختصاصی خود اقدام فرمایید.`;
                  copyToClipboard(msg, 'متن کامل پیام ورود در حافظه کپی شد.');
                }}
                className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-slate-200 shadow-2xs"
                title="کپی پیام آماده جهت ارسال در پیامک، ایتا، بله یا تلگرام"
              >
                <Copy className="w-3.5 h-3.5 text-slate-600" />
                <span>کپی پیام کامل به کاربر</span>
              </button>
            </div>

            {/* Critical Security Warning */}
            <div className="bg-amber-50/90 border border-amber-300 rounded-xl p-3 text-[11px] text-amber-900 space-y-1.5 leading-relaxed">
              <p className="font-bold flex items-center gap-1 text-amber-950">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>پیام مهم امنیتی:</span>
              </p>
              <p className="text-[10px] text-amber-800 font-sans">
                این کلمه عبور موقت به دلایل امنیتی <strong>فقط در این پنجره نمایش داده می‌شود</strong> و پس از بستن آن، در هیچ بخش دیگری از سامانه قابل مشاهده نخواهد بود. لطفاً آن را یادداشت کرده یا کپی نمایید و به کاربر تحویل دهید.
              </p>
              <p className="text-[10px] text-amber-800 font-sans">
                کاربر پس از اولین ورود با این رمز موقت، به صورت خودکار توسط سامانه ملزم به تعریف کلمه عبور اختصاصی خواهد شد.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setIssuedCredentials(null)}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-2.5 px-4 rounded-xl text-xs transition-colors cursor-pointer shadow flex items-center justify-center gap-2"
              >
                <span>رمز را کپی و یادداشت نمودم (تأیید و بستن)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
