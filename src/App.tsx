/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Order, OrderStatus, VehicleDetails, UserRole, Product, Agent, ShippingCompany, PermanentDriver, AppUser } from './types';
import { PRESET_ORDERS, PRESET_PRODUCTS, PRESET_AGENTS, PRESET_SHIPPING_COMPANIES } from './data';
import RepresentativeDashboard from './components/RepresentativeDashboard';
import ManagerDashboard from './components/ManagerDashboard';
import FactoryDashboard from './components/FactoryDashboard';
import ShippingCompanyDashboard from './components/ShippingCompanyDashboard';
import SeniorAdminDashboard from './components/SeniorAdminDashboard';
import InfrastructureInfo from './components/InfrastructureInfo';
import LoginGate from './components/LoginGate';
import TabarestanLogo from './components/TabarestanLogo';
import InstallPwaPrompt from './components/InstallPwaPrompt';
import { 
  Smartphone, 
  ShieldAlert, 
  Truck, 
  Layers, 
  HelpCircle,
  RotateCcw,
  CheckCircle2,
  Info,
  X,
  Lock,
  User
} from 'lucide-react';

export default function App() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [shippingCompanies, setShippingCompanies] = useState<ShippingCompany[]>([]);
  const [permanentDrivers, setPermanentDrivers] = useState<PermanentDriver[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('نمایندگی تهران (احمدی)');
  const [activeRole, setActiveRole] = useState<UserRole | 'INFRASTRUCTURE'>('REPRESENTATIVE');
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [isIntroExpanded, setIsIntroExpanded] = useState<boolean>(false);

  // Sandbox shortcut visible state
  const [sandboxEnabled, setSandboxEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('tabarestan_sandbox_enabled');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const handleToggleSandbox = () => {
    setSandboxEnabled(prev => {
      const next = !prev;
      localStorage.setItem('tabarestan_sandbox_enabled', JSON.stringify(next));
      showToast(next ? '🟢 میانبرهای شبیه‌ساز ورود به عنوان تست (Sandbox) فعال شدند.' : '🔴 میانبرهای شبیه‌ساز ورود به عنوان تست (Sandbox) غیرفعال و پنهان شدند.', 'info');
      return next;
    });
  };

  // Change Password Modal States
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isPasswordSubmitting, setIsPasswordSubmitting] = useState(false);

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      showToast('لطفا تمامی فیلدها را پر کنید.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('رمز عبور جدید و تکرار آن همخوانی ندارند.', 'error');
      return;
    }
    if (!currentUser) return;

    setIsPasswordSubmitting(true);
    try {
      const res = await fetch(`/api/users/${currentUser.id}/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      if (res.ok) {
        showToast('🔒 کلمه عبور شما با موفقیت تغییر یافت.', 'success');
        setIsChangePasswordModalOpen(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        const data = await res.json();
        showToast(data.error || 'خطا در تغییر کلمه عبور.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('ارتباط با سرور برقرار نشد.', 'error');
    } finally {
      setIsPasswordSubmitting(false);
    }
  };

  // Edit Profile (Phone & Address) Modal States
  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);
  const [profileTargetCategory, setProfileTargetCategory] = useState<'USER' | 'AGENT' | 'SHIPPING'>('USER');
  const [selectedAgentForProfile, setSelectedAgentForProfile] = useState<string>('');
  const [selectedShippingForProfile, setSelectedShippingForProfile] = useState<string>('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileAddress, setProfileAddress] = useState('');
  const [isProfileSubmitting, setIsProfileSubmitting] = useState(false);

  const handleOpenEditProfile = (targetAgentId?: string | any, targetShippingId?: string) => {
    const cleanAgentId = typeof targetAgentId === 'string' ? targetAgentId : undefined;
    const cleanShippingId = typeof targetShippingId === 'string' ? targetShippingId : undefined;

    if (cleanAgentId) {
      const ag = agents.find(a => a.id === cleanAgentId || a.agentCode === cleanAgentId || a.alias === cleanAgentId);
      if (ag) {
        setProfileTargetCategory('AGENT');
        setSelectedAgentForProfile(ag.id);
        setProfilePhone(ag.phoneNumber || '');
        setProfileAddress(ag.address || '');
        setIsEditProfileModalOpen(true);
        return;
      }
    }

    if (cleanShippingId) {
      const sc = shippingCompanies.find(s => s.id === cleanShippingId || s.code === cleanShippingId);
      if (sc) {
        setProfileTargetCategory('SHIPPING');
        setSelectedShippingForProfile(sc.id);
        setProfilePhone(sc.phoneNumber || '');
        setProfileAddress(sc.address || '');
        setIsEditProfileModalOpen(true);
        return;
      }
    }

    if (activeRole === 'REPRESENTATIVE' && selectedAgent) {
      const ag = agents.find(a => a.alias === selectedAgent || a.agentCode === selectedAgent || a.id === selectedAgent);
      if (ag) {
        setProfileTargetCategory('AGENT');
        setSelectedAgentForProfile(ag.id);
        setProfilePhone(ag.phoneNumber || '');
        setProfileAddress(ag.address || '');
        setIsEditProfileModalOpen(true);
        return;
      }
    }

    if (activeRole === 'SHIPPING_COMPANY') {
      let targetSc = shippingCompanies[0];
      if (currentUser?.shippingCompanyId) {
        const sc = shippingCompanies.find(s => s.id === currentUser.shippingCompanyId);
        if (sc) targetSc = sc;
      }
      if (targetSc) {
        setProfileTargetCategory('SHIPPING');
        setSelectedShippingForProfile(targetSc.id);
        setProfilePhone(targetSc.phoneNumber || '');
        setProfileAddress(targetSc.address || '');
        setIsEditProfileModalOpen(true);
        return;
      }
    }

    if (currentUser) {
      setProfileTargetCategory('USER');
      setProfilePhone(currentUser.phoneNumber || '');
      
      if (currentUser.role === 'REPRESENTATIVE' && currentUser.agentCode) {
        const ag = agents.find(a => a.agentCode === currentUser.agentCode);
        setProfileAddress(ag?.address || '');
      } else if (currentUser.role === 'SHIPPING_COMPANY' && currentUser.shippingCompanyId) {
        const sc = shippingCompanies.find(s => s.id === currentUser.shippingCompanyId);
        setProfileAddress(sc?.address || '');
      } else {
        setProfileAddress('');
      }
    } else {
      if (agents.length > 0) {
        setProfileTargetCategory('AGENT');
        setSelectedAgentForProfile(agents[0].id);
        setProfilePhone(agents[0].phoneNumber || '');
        setProfileAddress(agents[0].address || '');
      } else if (shippingCompanies.length > 0) {
        setProfileTargetCategory('SHIPPING');
        setSelectedShippingForProfile(shippingCompanies[0].id);
        setProfilePhone(shippingCompanies[0].phoneNumber || '');
        setProfileAddress(shippingCompanies[0].address || '');
      } else {
        setProfileTargetCategory('USER');
        setProfilePhone('');
        setProfileAddress('');
      }
    }
    setIsEditProfileModalOpen(true);
  };

  const handleUpdateProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profilePhone.trim()) {
      showToast('لطفا شماره همراه را وارد کنید.', 'error');
      return;
    }

    setIsProfileSubmitting(true);
    try {
      if (profileTargetCategory === 'USER' && currentUser) {
        const res = await fetch(`/api/users/${currentUser.id}/profile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phoneNumber: profilePhone,
            address: profileAddress
          })
        });

        if (res.ok) {
          const data = await res.json();
          showToast('👤 مشخصات شماره همراه و آدرس با موفقیت به‌روزرسانی شد.', 'success');
          setIsEditProfileModalOpen(false);
          if (data.user) {
            const updatedUser = { ...currentUser, phoneNumber: data.user.phoneNumber };
            setCurrentUser(updatedUser);
            localStorage.setItem('tabarestan_user', JSON.stringify(updatedUser));
          }
          refreshAllData();
        } else {
          const errText = await getErrorMessage(res, 'خطا در به‌روزرسانی مشخصات.');
          showToast(errText, 'error');
        }
      } else if (profileTargetCategory === 'AGENT') {
        const ag = agents.find(a => a.id === selectedAgentForProfile);
        if (!ag) {
          showToast('نمایندگی انتخاب‌شده یافت نشد.', 'error');
          return;
        }
        const updatedAgentData = {
          ...ag,
          phoneNumber: profilePhone,
          address: profileAddress
        };
        const success = await handleUpdateAgent(updatedAgentData);
        if (success) {
          showToast(`📍 آدرس و شماره همراه نمایندگی "${ag.alias || ag.fullName}" با موفقیت به‌روزرسانی شد.`, 'success');
          setIsEditProfileModalOpen(false);
          refreshAllData();
        }
      } else if (profileTargetCategory === 'SHIPPING') {
        const sc = shippingCompanies.find(s => s.id === selectedShippingForProfile);
        if (!sc) {
          showToast('شرکت باربری انتخاب‌شده یافت نشد.', 'error');
          return;
        }
        const updatedCompanyData = {
          ...sc,
          phoneNumber: profilePhone,
          address: profileAddress
        };
        const success = await handleUpdateShippingCompany(updatedCompanyData);
        if (success) {
          showToast(`📍 آدرس و شماره همراه شرکت باربری "${sc.name}" با موفقیت به‌روزرسانی شد.`, 'success');
          setIsEditProfileModalOpen(false);
          refreshAllData();
        }
      }
    } catch (err: any) {
      showToast(err.message || 'خطا در ارتباط با سرور.', 'error');
    } finally {
      setIsProfileSubmitting(false);
    }
  };

  // Load user session from localStorage
  useEffect(() => {
    const savedUser = localStorage.getItem('tabarestan_user');
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        setCurrentUser(parsed);
        setActiveRole(parsed.role);
      } catch (e) {
        console.error('Failed parsing tabarestan_user:', e);
      }
    }
  }, []);

  // Track initialized user session agent to prevent polling resets
  const initializedUserAgentRef = React.useRef<string | null>(null);

  // Securely enforce roles and agent selection based on logged in user details ONCE per user session
  useEffect(() => {
    if (currentUser) {
      if (currentUser.role !== 'SALES_MANAGER' && currentUser.role !== 'SYSTEM_ADMIN') {
        setActiveRole(currentUser.role);
      }
      if (currentUser.role === 'REPRESENTATIVE' && currentUser.agentCode) {
        const userKey = `${currentUser.id}_${currentUser.agentCode}`;
        if (initializedUserAgentRef.current !== userKey) {
          const allAgents = agents.length > 0 ? agents : PRESET_AGENTS;
          const ag = allAgents.find(a => a.agentCode === currentUser.agentCode);
          if (ag) {
            setSelectedAgent(ag.alias);
            initializedUserAgentRef.current = userKey;
          }
        }
      }
    } else {
      initializedUserAgentRef.current = null;
    }
  }, [currentUser, agents]);

  // Custom Toast Notification State
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
  };

  // Auto-hide toast after 4 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Custom Confirm Modal State
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const askConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmConfig({ title, message, onConfirm });
  };

  // Robust helper to safely parse JSON from a response, handling non-JSON content gracefully
  const safeParseResponse = async (res: Response, fallbackValue: any = []) => {
    try {
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        console.warn(`[API] Expected JSON for ${res.url} but received Content-Type: ${contentType}`);
        try {
          const bodyText = await res.text();
          console.warn("[API] Response preview:", bodyText.substring(0, 150));
        } catch {}
        return fallbackValue;
      }
      return await res.json();
    } catch (err: any) {
      console.error(`[API] Error custom-parsing JSON for ${res.url}:`, err);
      return fallbackValue;
    }
  };

  // Helper to extract error message from response, handling HTML/text error pages elegantly
  const getErrorMessage = async (res: Response, defaultMessage: string = "خطای ناشناخته در سرور"): Promise<string> => {
    try {
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data = await res.json();
        return data.error || data.message || defaultMessage;
      } else {
        const text = await res.text();
        // Remove HTML tags to extract raw description if any (e.g. Express 500 Stack trace/Status Error)
        const cleanText = text.replace(/<[^>]*>/g, '').trim();
        // Extract the first non-empty lines with a length cap
        const trimmedMessage = cleanText.split('\n').map(l => l.trim()).filter(l => l.length > 0).join(' | ').substring(0, 160);
        return trimmedMessage || `پاسخ وب‌سرور (${res.status} ${res.statusText})`;
      }
    } catch (err: any) {
      return `${defaultMessage} (${err.message || "خطای پردازش"})`;
    }
  };

  // Load data from production Express API instead of localstorage mock
  const refreshAllData = async () => {
    const fetchWithFallback = async (url: string, setter: (data: any) => void) => {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const parsed = await safeParseResponse(res, []);
          setter(parsed);
        } else {
          console.warn(`[API] Fetch failed for ${url} with status: ${res.status}`);
        }
      } catch (err) {
        console.error(`[API] Network error fetching ${url}:`, err);
      }
    };

    await Promise.all([
      fetchWithFallback('/api/products', setProducts),
      fetchWithFallback('/api/agents', setAgents),
      fetchWithFallback('/api/shipping-companies', setShippingCompanies),
      fetchWithFallback('/api/permanent-drivers', setPermanentDrivers),
      fetchWithFallback('/api/orders', setOrders)
    ]);
  };

  useEffect(() => {
    refreshAllData();
    // Periodic synchronization every 10 seconds to keep multi-role users in sync
    const interval = setInterval(refreshAllData, 10000);
    return () => clearInterval(interval);
  }, []);

  // Permanent Drivers Management Handlers
  const handleAddPermanentDriver = async (driverData: Partial<PermanentDriver>): Promise<boolean> => {
    try {
      const response = await fetch('/api/permanent-drivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(driverData)
      });
      if (response.ok) {
        showToast(`🚗 مشخصات راننده «${driverData.driverName}» با موفقیت ثبت گردید.`, 'success');
        refreshAllData();
        return true;
      } else {
        const errorMsg = await getErrorMessage(response, 'خطا در ثبت راننده');
        showToast(`خطا در ثبت راننده: ${errorMsg}`, 'error');
        return false;
      }
    } catch (err) {
      showToast('خطای شبکه در ارتباط با سرور', 'error');
      return false;
    }
  };

  const handleBulkImportPermanentDrivers = async (driversArray: Partial<PermanentDriver>[]): Promise<boolean> => {
    try {
      const response = await fetch('/api/permanent-drivers/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drivers: driversArray })
      });
      if (response.ok) {
        const data = await response.json();
        showToast(`📂 تعداد ${data.count || driversArray.length} راننده با موفقیت از اکسل ایمپورت و ثبت گردیدند.`, 'success');
        refreshAllData();
        return true;
      } else {
        const errorMsg = await getErrorMessage(response, 'خطا در ایمپورت گروهی رانندگان');
        showToast(`خطا در ایمپورت رانندگان: ${errorMsg}`, 'error');
        return false;
      }
    } catch (err) {
      showToast('خطای شبکه در ارتباط با سرور', 'error');
      return false;
    }
  };

  const handleUpdatePermanentDriver = async (driverData: PermanentDriver): Promise<boolean> => {
    try {
      const response = await fetch(`/api/permanent-drivers/${driverData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(driverData)
      });
      if (response.ok) {
        showToast(`✏️ مشخصات راننده «${driverData.driverName}» با موفقیت به‌روزرسانی شد.`, 'success');
        refreshAllData();
        return true;
      } else {
        const errorMsg = await getErrorMessage(response, 'خطا در ویرایش راننده');
        showToast(`خطا در ویرایش راننده: ${errorMsg}`, 'error');
        return false;
      }
    } catch (err) {
      showToast('خطای شبکه در ارتباط با سرور', 'error');
      return false;
    }
  };

  const handleTogglePermanentDriver = async (driverId: string) => {
    try {
      const response = await fetch(`/api/permanent-drivers/${driverId}/toggle`, {
        method: 'PATCH'
      });
      if (response.ok) {
        showToast('وضعیت راننده با موفقیت تغییر کرد.', 'info');
        refreshAllData();
      } else {
        const errorMsg = await getErrorMessage(response, 'خطا در تغییر وضعیت راننده');
        showToast(errorMsg, 'error');
      }
    } catch (err) {
      showToast('خطای شبکه در ارتباط با سرور', 'error');
    }
  };

  const handleDeletePermanentDriver = async (driverId: string) => {
    try {
      const response = await fetch(`/api/permanent-drivers/${driverId}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        showToast('اطلاعات راننده از سیستم حذف گردید.', 'success');
        refreshAllData();
      } else {
        const errorMsg = await getErrorMessage(response, 'خطا در حذف راننده');
        showToast(errorMsg, 'error');
      }
    } catch (err) {
      showToast('خطای شبکه در ارتباط با سرور', 'error');
    }
  };

  // 1. Create Order (Called by Representative)
  const handleCreateOrder = async (orderData: Partial<Order>) => {
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: orderData.customerName || selectedAgent,
          agentCode: orderData.agentCode || 'AG-0000',
          productId: orderData.productId || 'prod-1',
          productName: orderData.productName || '',
          quantity: orderData.quantity || 1000,
          unit: orderData.unit || 'عدد',
          destinationCity: orderData.destinationCity || 'نامشخص',
          exactAddress: orderData.exactAddress || '',
          phoneNumber: orderData.phoneNumber || '',
          buyerName: orderData.buyerName || '',
          notes: orderData.notes || '',
          itemsJson: orderData.itemsJson || null,
          paymentTrackingCode: orderData.paymentTrackingCode || null
        })
      });

      if (response.ok) {
        showToast('سفارش جدید با موفقیت ثبت سیستم شد.', 'success');
        refreshAllData();
      } else {
        const errorMsg = await getErrorMessage(response, 'خطا در ثبت سفارش در سرور');
        showToast(`خطا در ثبت سفارش: ${errorMsg}`, 'error');
      }
    } catch (err) {
      showToast('خطای شبکه در ارتباط با سرور', 'error');
    }
  };

  // 1a. Cancel Order (Called by Representative)
  const handleCancelOrder = async (orderId: string) => {
    try {
      const response = await fetch(`/api/orders/${orderId}/cancel`, {
        method: 'PATCH',
      });
      if (response.ok) {
        showToast('سفارش شما با موفقیت لغو شد.', 'success');
        refreshAllData();
      } else {
        const errorMsg = await getErrorMessage(response, 'خطا در لغو سفارش');
        showToast(`خطا در لغو سفارش: ${errorMsg}`, 'error');
      }
    } catch (err) {
      showToast('خطای شبکه در ارتباط با سرور', 'error');
    }
  };

  // 1b. Update Payment Tracking Code (Called by Representative)
  const handleUpdatePaymentTracking = async (orderId: string, paymentTrackingCode: string) => {
    try {
      const response = await fetch(`/api/orders/${orderId}/payment-tracking`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentTrackingCode })
      });
      if (response.ok) {
        showToast('کد رهگیری پرداخت با موفقیت ثبت شد.', 'success');
        refreshAllData();
      } else {
        const errorMsg = await getErrorMessage(response, 'خطا در ثبت کد رهگیری پرداخت');
        showToast(`خطا در ثبت کد رهگیری: ${errorMsg}`, 'error');
      }
    } catch (err) {
      showToast('خطای شبکه در ارتباط با سرور', 'error');
    }
  };

  // 2. Approve Order (Called by Sales Manager)
  const handleApproveOrder = async (orderId: string) => {
    try {
      const response = await fetch(`/api/orders/${orderId}/approve`, {
        method: 'PATCH'
      });

      if (response.ok) {
        showToast('سفارش مورد تایید قرار گرفت و به صف ارسال باربری کارخانه اضافه شد.', 'success');
        refreshAllData();
      } else {
        const errorMsg = await getErrorMessage(response, 'خطا در تایید سفارش در سرور');
        showToast(`خطا در تایید سفارش: ${errorMsg}`, 'error');
      }
    } catch (err) {
      showToast('خطای شبکه در ارتباط با سرور', 'error');
    }
  };

  // 3. Reject Order (Called by Sales Manager)
  const handleRejectOrder = async (orderId: string, reason: string) => {
    try {
      const response = await fetch(`/api/orders/${orderId}/reject`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });

      if (response.ok) {
        showToast('سفارش لغو شد و تاریخچه با علت لغو به‌روزرسانی گردید.', 'info');
        refreshAllData();
      } else {
        const errorMsg = await getErrorMessage(response, 'خطا در رد سفارش در سرور');
        showToast(`خطا در لغو سفارش: ${errorMsg}`, 'error');
      }
    } catch (err) {
      showToast('خطای شبکه در ارتباط با سرور', 'error');
    }
  };

  // 3a. Dispatch to Factory (Called by Sales Manager)
  const handleDispatchToFactory = async (orderId: string, comment?: string) => {
    try {
      const response = await fetch(`/api/orders/${orderId}/dispatch-factory`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment })
      });

      if (response.ok) {
        showToast('سفارش جهت تأمین وسیله نقلیه به کارخانه ارجاع شد.', 'success');
        refreshAllData();
      } else {
        const errorMsg = await getErrorMessage(response, 'خطا در ثبت ارسال به کارخانه');
        showToast(`خطا در ارجاع به کارخانه: ${errorMsg}`, 'error');
      }
    } catch (err) {
      showToast('خطای شبکه در ارتباط با سرور', 'error');
    }
  };

  // 3b. Re-arrange priorities of approved orders (Called by Sales Manager)
  const handleUpdateAllOrders = async (updatedOrders: Order[]) => {
    try {
      const sorted = updatedOrders.map((o, idx) => ({
        id: o.id,
        priorityIndex: idx
      }));

      const response = await fetch('/api/orders/reorder-priorities', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sortedOrders: sorted })
      });

      if (response.ok) {
        setOrders(updatedOrders);
        showToast('اولویت‌بندی سفارشات با موفقیت به‌روزرسانی شد.', 'success');
      } else {
        showToast('خطا در ذخیره‌سازی اولویت‌بندی در سرور', 'error');
      }
    } catch (err) {
      showToast('خطای شبکه در ارتباط با سرور', 'error');
    }
  };

  // 3c. Product Management (Called by Sales Manager)
  const handleCreateProduct = async (newProduct: Product): Promise<boolean> => {
    try {
      const response = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProduct)
      });

      if (response.ok) {
        showToast(`محصول جدید با موفقیت به سبد تولیدی کارخانه اضافه شد.`, 'success');
        refreshAllData();
        return true;
      } else {
        const errorMsg = await getErrorMessage(response, 'خطا در ثبت محصول در سرور');
        showToast(`خطا در ثبت محصول: ${errorMsg}`, 'error');
        return false;
      }
    } catch (err) {
      showToast('خطای شبکه در ارتباط با سرور', 'error');
      return false;
    }
  };

  const handleToggleProductStatus = async (productId: string) => {
    try {
      const response = await fetch(`/api/products/${productId}/toggle`, {
        method: 'PATCH'
      });

      if (response.ok) {
        refreshAllData();
      } else {
        showToast('خطا در تغییر وضعیت محصول در سرور', 'error');
      }
    } catch (err) {
      showToast('خطای شبکه در ارتباط با سرور', 'error');
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    try {
      const response = await fetch(`/api/products/${productId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        showToast('محصول از لیست کارخانه حذف گردید.', 'info');
        refreshAllData();
      } else {
        showToast('خطا در حذف محصول در سرور', 'error');
      }
    } catch (err) {
      showToast('خطای شبکه در ارتباط با سرور', 'error');
    }
  };

  const handleUpdateProduct = async (productData: Product): Promise<boolean> => {
    try {
      const response = await fetch(`/api/products/${productData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productData)
      });
      if (response.ok) {
        showToast('اطلاعات محصول با موفقیت به‌روزرسانی شد.', 'success');
        refreshAllData();
        return true;
      } else {
        const errorMsg = await getErrorMessage(response, 'خطا در ثبت تغییرات محصول');
        showToast(`خطا در ثبت تغییرات محصول: ${errorMsg}`, 'error');
        return false;
      }
    } catch (err) {
      showToast('خطای شبکه در ارتباط با سرور', 'error');
      return false;
    }
  };

  // 3d. Agent Management (Called by Sales Manager)
  const handleCreateAgent = async (newAgent: Agent): Promise<boolean> => {
    try {
      const response = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAgent)
      });

      if (response.ok) {
        showToast(`نمایندگی رسمی جدید (${newAgent.alias}) با موفقیت عضو شبکه شد.`, 'success');
        refreshAllData();
        return true;
      } else {
        const errorMsg = await getErrorMessage(response, 'خطا در ثبت نمایندگی در سرور');
        showToast(`خطا در ثبت نمایندگی: ${errorMsg}`, 'error');
        return false;
      }
    } catch (err) {
      showToast('خطای شبکه در ارتباط با سرور', 'error');
      return false;
    }
  };

  const handleToggleAgentStatus = async (agentId: string) => {
    try {
      const response = await fetch(`/api/agents/${agentId}/toggle`, {
        method: 'PATCH'
      });

      if (response.ok) {
        refreshAllData();
      } else {
        showToast('خطا در تغییر وضعیت نمایندگی در سرور', 'error');
      }
    } catch (err) {
      showToast('خطای شبکه در ارتباط با سرور', 'error');
    }
  };

  const handleDeleteAgent = async (agentId: string) => {
    try {
      const response = await fetch(`/api/agents/${agentId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        showToast('نمایندگی از سیستم با موفقیت حذف گردید.', 'info');
        refreshAllData();
      } else {
        showToast('خطا در حذف نمایندگی در سرور', 'error');
      }
    } catch (err) {
      showToast('خطای شبکه در ارتباط با سرور', 'error');
    }
  };

  const handleUpdateAgent = async (agentData: Agent): Promise<boolean> => {
    try {
      const response = await fetch(`/api/agents/${agentData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agentData)
      });
      if (response.ok) {
        showToast('اطلاعات نمایندگی با موفقیت به‌روزرسانی شد.', 'success');
        refreshAllData();
        return true;
      } else {
        const errorMsg = await getErrorMessage(response, 'خطا در ثبت تغییرات نمایندگی');
        showToast(`خطا در ثبت تغییرات نمایندگی: ${errorMsg}`, 'error');
        return false;
      }
    } catch (err) {
      showToast('خطای شبکه در ارتباط با سرور', 'error');
      return false;
    }
  };

  // 3f. Shipping Companies Management (Called by Sales Manager)
  const handleCreateShippingCompany = async (newCompany: ShippingCompany): Promise<boolean> => {
    try {
      const response = await fetch('/api/shipping-companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCompany)
      });

      if (response.ok) {
        showToast(`باربری جدید (${newCompany.name}) با موفقیت به پرتال افزوده شد.`, 'success');
        refreshAllData();
        return true;
      } else {
        const errorMsg = await getErrorMessage(response, 'خطا در ثبت باربری در سرور');
        showToast(`خطا در ثبت باربری: ${errorMsg}`, 'error');
        return false;
      }
    } catch (err) {
      showToast('خطای شبکه در ارتباط با سرور', 'error');
      return false;
    }
  };

  const handleUpdateShippingCompany = async (updatedCompany: ShippingCompany): Promise<boolean> => {
    try {
      const response = await fetch(`/api/shipping-companies/${updatedCompany.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedCompany)
      });

      if (response.ok) {
        showToast(`اطلاعات شرکت حمل و نقل (${updatedCompany.name}) با موفقیت بروزرسانی شد.`, 'success');
        refreshAllData();
        return true;
      } else {
        const errorMsg = await getErrorMessage(response, 'خطا در ویرایش شرکت حمل و نقل');
        showToast(`خطا در ویرایش باربری: ${errorMsg}`, 'error');
        return false;
      }
    } catch (err) {
      showToast('خطای شبکه در ارتباط با سرور', 'error');
      return false;
    }
  };

  const handleToggleShippingCompanyStatus = async (companyId: string) => {
    try {
      const response = await fetch(`/api/shipping-companies/${companyId}/toggle`, {
        method: 'PATCH'
      });

      if (response.ok) {
        refreshAllData();
      } else {
        showToast('خطا در تغییر وضعیت باربری در سرور', 'error');
      }
    } catch (err) {
      showToast('خطای شبکه در ارتباط با سرور', 'error');
    }
  };

  const handleDeleteShippingCompany = async (companyId: string) => {
    try {
      const response = await fetch(`/api/shipping-companies/${companyId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        showToast('باربری ترابری از سیستم حذف گردید.', 'info');
        refreshAllData();
      } else {
        showToast('خطا در حذف باربری در سرور', 'error');
      }
    } catch (err) {
      showToast('خطای شبکه در ارتباط با سرور', 'error');
    }
  };

  // 3e. Bulk / Batch action handlers (Called by Sales Manager)
  const handleApproveAllOrders = async (orderIds?: string[]) => {
    try {
      const response = await fetch('/api/orders/bulk-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds })
      });

      if (response.ok) {
        showToast(
          orderIds && orderIds.length > 0
            ? `${orderIds.length} سفارش انتخاب‌شده با موفقیت تایید شدند.`
            : 'تمامی سفارشات معلق با موفقیت تایید سیستم شدند.',
          'success'
        );
        refreshAllData();
      } else {
        const errorMsg = await getErrorMessage(response, 'خطا در تایید دسته‌جمعی سفارشات');
        showToast(errorMsg, 'error');
      }
    } catch (err) {
      showToast('خطای شبکه در ارتباط با سرور', 'error');
    }
  };

  const handleDispatchAllToFactory = async () => {
    try {
      const response = await fetch('/api/orders/bulk-dispatch', {
        method: 'POST'
      });

      if (response.ok) {
        showToast('تمامی سفارشات تایید شده به واحد فروش کارخانه ارسال شدند.', 'success');
        refreshAllData();
      } else {
        const errorMsg = await getErrorMessage(response, 'خطا در ارجاع دسته‌جمعی به کارخانه');
        showToast(errorMsg, 'error');
      }
    } catch (err) {
      showToast('خطای شبکه در ارتباط با سرور', 'error');
    }
  };

  // 4. Assign Logistics Truck (Called by Factory Transport)
  const handleAssignVehicle = async (orderId: string, vehicle: VehicleDetails) => {
    try {
      const response = await fetch(`/api/orders/${orderId}/assign-vehicle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vehicle)
      });

      if (response.ok) {
        showToast(`وسیله نقلیه به رانندگی ${vehicle.driverName} به فاکتور سفارش تخصیص یافت.`, 'success');
        refreshAllData();
      } else {
        const errorMsg = await getErrorMessage(response, 'خطا در تخصیص خودرو در سرور');
        showToast(`خطا در تخصیص خودرو: ${errorMsg}`, 'error');
      }
    } catch (err) {
      showToast('خطای شبکه در ارتباط با سرور', 'error');
    }
  };

  // 4b. Request transport from a shipping company
  const handleRequestTransport = async (orderId: string, shippingCompanyId: string, shippingAgency: string) => {
    try {
      const response = await fetch(`/api/orders/${orderId}/request-transport`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shippingCompanyId, shippingAgency })
      });

      if (response.ok) {
        showToast(`سفارش با موفقیت جهت تامین کامیون به باربری «${shippingAgency}» ارجاع گردید.`, 'success');
        refreshAllData();
      } else {
        const errorMsg = await getErrorMessage(response, 'خطا در ثبت ارجاع باربری');
        showToast(`خطا در ارسال درخواست باربری: ${errorMsg}`, 'error');
      }
    } catch (err) {
      showToast('خطای شبکه در ارتباط با سرور', 'error');
    }
  };

  // 4c. Return order from shipping company back to sales manager
  const handleReturnOrderToSales = async (orderId: string, reason: string) => {
    try {
      const response = await fetch(`/api/orders/${orderId}/return-to-sales`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });

      if (response.ok) {
        showToast('سفارش با موفقیت استرداد گردید و به کارتابل مدیر فروش بازگشت.', 'info');
        refreshAllData();
      } else {
        const errorMsg = await getErrorMessage(response, 'خطا در استرداد سفارش');
        showToast(`خطا در استرداد سفارش: ${errorMsg}`, 'error');
      }
    } catch (err) {
      showToast('خطای شبکه در ارتباط با سرور', 'error');
    }
  };

  // 5. Complete Loading and Dispatch Truck (Called by Factory Transport)
  const handleDispatchOrder = async (orderId: string) => {
    try {
      const response = await fetch(`/api/orders/${orderId}/dispatch`, {
        method: 'PATCH'
      });

      if (response.ok) {
        showToast('کامیون فاکتور با موفقیت بارگیری شده و از درب حراست کارخانه ترخیص شد.', 'success');
        refreshAllData();
      } else {
        const errorMsg = await getErrorMessage(response, 'خطا در ترخیص تریلی در سرور');
        showToast(`خطا در ترخیص تریلی: ${errorMsg}`, 'error');
      }
    } catch (err) {
      showToast('خطای شبکه در ارتباط با سرور', 'error');
    }
  };

  // Reset demo application to original factory state
  const handleResetApp = () => {
    askConfirm(
      'بازنشانی اطلاعات پایگاه داده واقعی',
      'آیا مطمئن هستید که می‌خواهید تمام تراکنش‌های جاری را پاک کرده و جداول MariaDB و کش‌های Redis را به حالت پایدار اولیه کارخانه بازنشانی کنید؟',
      async () => {
        try {
          const response = await fetch('/api/system/reset-demo', {
            method: 'POST'
          });
          if (response.ok) {
            showToast('کل دیتابیس مجدداً بذرپاشی و بازنشانی دمو کامل شد!', 'success');
            refreshAllData();
          } else {
            showToast('خطا در ریست کارخانه اطلاعات در سرور', 'error');
          }
        } catch (err) {
          showToast('خطای اتصال با سرور هنگام ریست اطلاعات', 'error');
        }
      }
    );
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-900 text-right dir-rtl font-sans pb-16">
        <LoginGate 
          onLoginSuccess={(user) => {
            localStorage.setItem('tabarestan_user', JSON.stringify(user));
            setCurrentUser(user);
            setActiveRole(user.role);
          }} 
          showToast={showToast} 
          sandboxEnabled={sandboxEnabled}
          onToggleSandbox={handleToggleSandbox}
        />
        {/* Custom Toast Notification System */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: -50, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[90%] md:w-full bg-white rounded-xl shadow-2xl border p-4 font-sans text-right dir-rtl flex items-start gap-3 ${
                toast.type === 'success' ? 'border-emerald-250 shadow-emerald-100/40' :
                toast.type === 'error' ? 'border-rose-250 shadow-rose-100/40' : 'border-indigo-250 shadow-indigo-100/40'
              }`}
            >
              <div className={`p-2 rounded-lg shrink-0 ${
                toast.type === 'success' ? 'bg-emerald-50 text-emerald-600' :
                toast.type === 'error' ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600'
              }`}>
                {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> :
                 toast.type === 'error' ? <ShieldAlert className="w-5 h-5" /> : <Info className="w-5 h-5" />}
              </div>
              <div className="flex-1 min-w-0 pr-1">
                <p className="text-xs font-bold text-slate-800 leading-normal">{toast.message}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <InstallPwaPrompt />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-right dir-rtl font-sans selection:bg-emerald-100 selection:text-emerald-800 pb-16" id="app-root-wrapper">
      
      {/* Top Main Navigation Header */}
      <header className="bg-slate-900 text-white sticky top-0 z-50 shadow-md border-b border-slate-800" id="primary-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between min-h-16 py-2 sm:py-0 gap-2 sm:gap-4">
            
            {/* Header Brand */}
            <div className="flex items-center justify-between sm:justify-start gap-3">
              <div className="flex items-center gap-2.5">
                <div className="shrink-0 flex items-center justify-center" id="app-logo">
                  <TabarestanLogo className="w-8 h-8 sm:w-9 sm:h-9 text-emerald-500" />
                </div>
                <div>
                  <h1 className="text-xs sm:text-base font-extrabold tracking-tight text-white">تولیدی صنایع سفال طبرستان</h1>
                  <p className="text-[9px] sm:text-[10px] text-slate-400">سامانه ثبت سفارشات و رهگیری</p>
                </div>
              </div>

              {/* Mobile Reset Button */}
              <button
                onClick={handleResetApp}
                title="بازنشانی پایگاه داده شبیه‌ساز"
                className="sm:hidden px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg text-[10px] font-bold flex items-center gap-1 shrink-0 border border-slate-700"
              >
                <RotateCcw className="w-3 h-3" />
                <span>بازنشانی</span>
              </button>
            </div>

            {/* User Session Info / Exit */}
            {currentUser && (
              <div className="flex items-center justify-between sm:justify-start gap-2 text-xs bg-slate-800/90 border border-slate-700/80 rounded-xl py-1 px-2.5 sm:py-1.5 sm:px-3">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-slate-400 text-xs">👋</span>
                  <span className="text-slate-300 flex items-center gap-1 truncate text-[11px] sm:text-xs">
                    <strong className="text-white font-extrabold truncate max-w-[110px] xs:max-w-[160px] sm:max-w-none">{currentUser.fullName}</strong>
                    <span className="text-emerald-400 font-bold text-[10px] sm:text-xs shrink-0">
                      ({
                        currentUser.role === 'SYSTEM_ADMIN' ? 'ادمین ارشد' :
                        currentUser.role === 'SALES_MANAGER' ? 'مدیر بازرگانی' :
                        currentUser.role === 'REPRESENTATIVE' ? 'نماینده فروش' :
                        currentUser.role === 'FACTORY_TRANSPORT' ? 'فروش کارخانه' : 'باربری همکار'
                      })
                    </span>
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleOpenEditProfile()}
                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-2 py-1 sm:px-2.5 rounded-lg transition-all cursor-pointer font-extrabold text-[10px] sm:text-xs flex items-center gap-1 shadow-xs border border-emerald-300"
                    title="ویرایش شماره تلفن همراه و آدرس دفتر/انبار"
                  >
                    <User className="w-3.5 h-3.5 text-slate-950" />
                    <span className="hidden sm:inline">ویرایش آدرس و همراه</span>
                    <span className="sm:hidden">ویرایش</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsChangePasswordModalOpen(true)}
                    className="bg-amber-500/10 hover:bg-amber-500 hover:text-slate-900 border border-amber-500/30 text-amber-400 px-2 py-1 rounded text-[10px] font-bold"
                  >
                    رمز
                  </button>
                  <button
                    onClick={() => {
                      localStorage.removeItem('tabarestan_user');
                      setCurrentUser(null);
                      showToast('🔒 با موفقیت از حساب کاربری خود خارج شدید.', 'info');
                    }}
                    className="bg-rose-500/20 hover:bg-rose-500 hover:text-white text-rose-300 px-2 py-1 rounded text-[10px] font-bold"
                  >
                    خروج
                  </button>
                </div>
              </div>
            )}

            {/* Desktop Reset Button */}
            <button
              onClick={handleResetApp}
              title="بازنشانی پایگاه داده شبیه‌ساز"
              className="hidden sm:flex px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 hover:text-rose-400 text-slate-400 rounded-lg text-[10px] transition-all items-center gap-1 cursor-pointer shrink-0 border border-slate-700"
              id="reset-simulation-btn"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>بازنشانی دمو</span>
            </button>
          </div>
        </div>
      </header>

      {/* Role Play Tester Nav only visible to SALES_MANAGER & SYSTEM_ADMIN for testing/simulation */}
      {(currentUser?.role === 'SALES_MANAGER' || currentUser?.role === 'SYSTEM_ADMIN') && (
        <div className="bg-slate-800 text-slate-200 py-2 sm:py-2.5 border-b border-slate-700 shadow-inner" id="role-tester-bar">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <span className="text-[10px] sm:text-[11px] text-slate-400 flex items-center justify-start sm:justify-end gap-1.5">
                <Info className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                <span>شبیه‌سازی نقش‌های مختلف:</span>
              </span>

              {/* Quick switches buttons - horizontal scrollable on mobile */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 max-w-full no-scrollbar justify-start sm:justify-end shrink-0" id="role-buttons-grid">
                
                {/* Role 1: Agent */}
                <button
                  onClick={() => setActiveRole('REPRESENTATIVE')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer shrink-0 ${
                    activeRole === 'REPRESENTATIVE'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-650'
                  }`}
                  id="role-btn-rep"
                >
                  <Smartphone className="w-3 h-3" />
                  <span>۱. نمایندگی فروش</span>
                </button>

                {/* Role 2: Sales Manager */}
                <button
                  onClick={() => setActiveRole('SALES_MANAGER')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer shrink-0 ${
                    activeRole === 'SALES_MANAGER'
                      ? 'bg-amber-500 text-slate-900 shadow-sm'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-650'
                  }`}
                  id="role-btn-mgr"
                >
                  <CheckCircle2 className="w-3 h-3" />
                  <span>۲. مدیریت بازرگانی</span>
                </button>

                {/* Role 3: Factory Logistics */}
                <button
                  onClick={() => setActiveRole('FACTORY_TRANSPORT')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer shrink-0 ${
                    activeRole === 'FACTORY_TRANSPORT'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-650'
                  }`}
                  id="role-btn-factory"
                >
                  <Truck className="w-3 h-3" />
                  <span>۳. واحد فروش</span>
                </button>

                {/* Role 4: Shipping Company */}
                <button
                  onClick={() => setActiveRole('SHIPPING_COMPANY')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer shrink-0 ${
                    activeRole === 'SHIPPING_COMPANY'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-650'
                  }`}
                  id="role-btn-shipping"
                >
                  <Truck className="w-3 h-3" />
                  <span>۴. پنل باربری‌ها</span>
                </button>

                {/* Role 5: Senior Software Admin */}
                <button
                  onClick={() => setActiveRole('SYSTEM_ADMIN')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer shrink-0 ${
                    activeRole === 'SYSTEM_ADMIN'
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'bg-purple-950/80 text-purple-200 border border-purple-800 hover:bg-purple-900'
                  }`}
                  id="role-btn-sysadmin"
                >
                  <ShieldAlert className="w-3 h-3 text-purple-300" />
                  <span>۵. ادمین ارشد نرم‌افزار</span>
                </button>

                {/* View 6: Infrastructure Docs */}
                <button
                  onClick={() => setActiveRole('INFRASTRUCTURE')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer shrink-0 ${
                    activeRole === 'INFRASTRUCTURE'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-650'
                  }`}
                  id="role-btn-infra"
                >
                  <Layers className="w-3 h-3" />
                  <span>۶. زیرساخت</span>
                </button>

              </div>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Explanation Toast for the active role */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-3 sm:mt-6">
        <div className="bg-white border-r-4 border-emerald-500 p-3 sm:p-4 rounded-xl shadow-xs text-xs text-slate-600" id="workflow-intro-card">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100/80 pb-2 mb-2">
            <button
              type="button"
              onClick={() => setIsIntroExpanded(!isIntroExpanded)}
              className="text-[10px] text-slate-500 hover:text-slate-800 font-bold bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded transition-colors cursor-pointer"
            >
              {isIntroExpanded ? 'بستن راهنما ▲' : 'راهنمای این پنل ▼'}
            </button>
            <h4 className="font-extrabold text-slate-800 flex items-center gap-1.5 text-xs sm:text-sm">
              <span>
                {activeRole === 'REPRESENTATIVE' && '📱 کانال اپلیکیشن تحت وب نمایندگی‌ها (آیفون / اندروید)'}
                {activeRole === 'SALES_MANAGER' && '👔 کارتابل مدیریت بازرگانی و تایید مالی'}
                {activeRole === 'FACTORY_TRANSPORT' && '🏭 کارتابل واحد فروش کارخانه'}
                {activeRole === 'SHIPPING_COMPANY' && '🚚 پنل اختصاصی باربری‌ها و اتوبارهای همکار طبرستان'}
                {activeRole === 'SYSTEM_ADMIN' && '🛡️ کارتابل اختصاصی ادمین ارشد نرم‌افزار (پایش و عیب‌یابی لایو)'}
                {activeRole === 'INFRASTRUCTURE' && '⚙️ نیازمندی‌های توسعه زیرساخت نرم‌افزاری در فاز تولید'}
              </span>
              <Info className="w-4 h-4 text-emerald-600 shrink-0" />
            </h4>
          </div>

          <p className={`text-slate-500 leading-relaxed text-justify transition-all ${isIntroExpanded ? 'block' : 'hidden sm:block text-[11px] sm:text-xs'}`}>
            {activeRole === 'REPRESENTATIVE' && 'سفارشات جدید را در فرم زیر ثبت کنید و فاکتور نهایی را برآورد کنید. با ثبت سفارش، اطلاعات بلافاصله در پنل مدیریت بازرگانی رویت خواهد شد. پیگیری وضعیت فاکتور و کامیون اختصاص داده شده با پلاک، راننده و شماره تلفن در همین بخش قابل رویت است.'}
            {activeRole === 'SALES_MANAGER' && 'سفارشات جدید ثبت شده توسط نمایندگان سراسر کشور با تمام فاکتورها در این کارتابل مدیریت بازرگانی ظاهر می‌شود. واحد بازرگانی می‌تواند با تایید سفارش آن را به خط کارخانه بفرستد یا در صورت عدم کفایت اعتباری با درج علت آن را لغو کند. همچنین قابلیت تعریف نمایندگان، محصولات و شرکت‌های حمل و نقل در این پنل تعبیه شده است.'}
            {activeRole === 'FACTORY_TRANSPORT' && 'سفارشات تایید شده بازرگانی در صف کارخانه قرار می‌گیرند. مدیر فروش کارخانه به جای پر کردن فرم‌های طولانی، به راحتی سفارش را با مشخص کردن باربری و نوع نیاز خودرو به باربری مربوطه ارسال می‌کند تا کمترین درگیری ثبتی را تجربه کند.'}
            {activeRole === 'SHIPPING_COMPANY' && 'باربری‌ها وقتی ارجاع حمل را از واحد فروش کارخانه طبرستان دریافت می‌کنند، درخواست مربوطه به همراه مقدار سفال سقف یا آجر در صف آنها ظاهر می‌شود. آنها با دکمه درج سریع نام راننده و پلاک را با حداقل وقت تلف شده پر کرده و شماره بارنامه صادرشده در برنامه اختصاصی خود را نوشته و سفارش را به نوبت بارگیری تایید می‌کنند.'}
            {activeRole === 'SYSTEM_ADMIN' && 'در این کارتابل لایو، ادمین ارشد نرم‌افزار می‌تواند به صورت آنی تمام فعالیت‌های کاربران، وضعیت دیتابیس، حافظه رم و پردازنده سرور، لاگ‌های لایو شبکه و عیب‌یابی آنی سیستم را پایش و رصد نماید.'}
            {activeRole === 'INFRASTRUCTURE' && 'در این لایه فناوری‌ها، زیرساخت پایگاه داده رابطه‌ای، شیوه احراز هویت پیامکی کاربران و نحوه استقرار برنامه جهت دسترسی دائم تمامی گوشی‌های اندروید و آیفون تبیین شده است.'}
          </p>
        </div>
      </div>

      {/* Main Content Area Container with custom animations on transition */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6" id="primary-main-container">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeRole}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            id="role-render-anchor"
          >
            {activeRole === 'REPRESENTATIVE' && (
              <RepresentativeDashboard
                orders={orders}
                products={products}
                agents={agents}
                onCreateOrder={handleCreateOrder}
                onCancelOrder={handleCancelOrder}
                onUpdatePaymentTracking={handleUpdatePaymentTracking}
                selectedAgent={selectedAgent}
                setSelectedAgent={setSelectedAgent}
                showToast={showToast}
                askConfirm={askConfirm}
                currentUser={currentUser}
                onOpenEditProfile={handleOpenEditProfile}
              />
            )}

            {activeRole === 'SALES_MANAGER' && (
              <ManagerDashboard
                orders={orders}
                products={products}
                agents={agents}
                shippingCompanies={shippingCompanies}
                permanentDrivers={permanentDrivers}
                onApproveOrder={handleApproveOrder}
                onRejectOrder={handleRejectOrder}
                onDispatchToFactory={handleDispatchToFactory}
                onUpdateAllOrders={handleUpdateAllOrders}
                onAddProduct={handleCreateProduct}
                onToggleProduct={handleToggleProductStatus}
                onDeleteProduct={handleDeleteProduct}
                onUpdateProduct={handleUpdateProduct}
                onAddAgent={handleCreateAgent}
                onToggleAgent={handleToggleAgentStatus}
                onDeleteAgent={handleDeleteAgent}
                onUpdateAgent={handleUpdateAgent}
                onAddShippingCompany={handleCreateShippingCompany}
                onUpdateShippingCompany={handleUpdateShippingCompany}
                onToggleShippingCompany={handleToggleShippingCompanyStatus}
                onDeleteShippingCompany={handleDeleteShippingCompany}
                onAddPermanentDriver={handleAddPermanentDriver}
                onBulkImportPermanentDrivers={handleBulkImportPermanentDrivers}
                onUpdatePermanentDriver={handleUpdatePermanentDriver}
                onTogglePermanentDriver={handleTogglePermanentDriver}
                onDeletePermanentDriver={handleDeletePermanentDriver}
                onApproveAllOrders={handleApproveAllOrders}
                onDispatchAllToFactory={handleDispatchAllToFactory}
                showToast={showToast}
                askConfirm={askConfirm}
                sandboxEnabled={sandboxEnabled}
                onToggleSandbox={handleToggleSandbox}
              />
            )}

            {activeRole === 'FACTORY_TRANSPORT' && (
              <FactoryDashboard
                orders={orders}
                shippingCompanies={shippingCompanies}
                products={products}
                permanentDrivers={permanentDrivers}
                onAssignVehicle={handleAssignVehicle}
                onRequestTransport={handleRequestTransport}
                onDispatchOrder={handleDispatchOrder}
                showToast={showToast}
                askConfirm={askConfirm}
              />
            )}

            {activeRole === 'SHIPPING_COMPANY' && (
              <ShippingCompanyDashboard
                orders={orders}
                shippingCompanies={shippingCompanies}
                products={products}
                permanentDrivers={permanentDrivers}
                onAssignVehicle={handleAssignVehicle}
                onReturnOrderToSales={handleReturnOrderToSales}
                showToast={showToast}
                askConfirm={askConfirm}
                currentUser={currentUser}
                onOpenEditProfile={handleOpenEditProfile}
              />
            )}

            {activeRole === 'SYSTEM_ADMIN' && (
              <SeniorAdminDashboard
                showToast={showToast}
                askConfirm={askConfirm}
                currentUser={currentUser}
              />
            )}

            {activeRole === 'INFRASTRUCTURE' && (
              <InfrastructureInfo />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Custom Toast Notification System */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[90%] md:w-full bg-white rounded-xl shadow-2xl border p-4 font-sans text-right dir-rtl flex items-start gap-3 ${
              toast.type === 'success' ? 'border-emerald-250 shadow-emerald-100/40' :
              toast.type === 'error' ? 'border-rose-250 shadow-rose-100/40' : 'border-indigo-250 shadow-indigo-100/40'
            }`}
            id="global-toast"
          >
            <div className={`p-2 rounded-lg shrink-0 ${
              toast.type === 'success' ? 'bg-emerald-50 text-emerald-600' :
              toast.type === 'error' ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600'
            }`}>
              {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> :
               toast.type === 'error' ? <ShieldAlert className="w-5 h-5" /> : <Info className="w-5 h-5" />}
            </div>
            <div className="flex-1 min-w-0 pr-1">
              <p className="text-xs font-bold text-slate-800 leading-normal">{toast.message}</p>
            </div>
            <button
              onClick={() => setToast(null)}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Change Password Modal */}
      <AnimatePresence>
        {isChangePasswordModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm" id="change-password-modal-overlay">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-slate-800 text-white rounded-2xl border border-slate-700 p-6 max-w-sm w-full shadow-2xl text-right dir-rtl space-y-4 font-sans"
              id="change-password-modal-box"
            >
              <div className="flex items-center gap-2 border-b border-slate-700 pb-3 justify-end">
                <h3 className="text-xs sm:text-sm font-black text-amber-500">تغییر کلمه عبور حساب کاربری</h3>
                <Lock className="w-5 h-5 text-amber-500" />
              </div>

              <form onSubmit={handleChangePasswordSubmit} className="space-y-3.5 text-right font-sans">
                <div>
                  <label className="block text-slate-300 text-[10px] mb-1 font-bold">نام و نام خانوادگی:</label>
                  <input
                    type="text"
                    value={currentUser?.fullName || ''}
                    disabled
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-400 font-sans cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 text-[10px] mb-1 font-bold">کلمه عبور فعلی: <span className="text-rose-500">*</span></label>
                  <input
                    type="password"
                    placeholder="******"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    disabled={isPasswordSubmitting}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white text-left font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-300 text-[10px] mb-1 font-bold">کلمه عبور جدید: <span className="text-rose-500">*</span></label>
                  <input
                    type="password"
                    placeholder="******"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={isPasswordSubmitting}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white text-left font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-300 text-[10px] mb-1 font-bold">تکرار کلمه عبور جدید: <span className="text-rose-500">*</span></label>
                  <input
                    type="password"
                    placeholder="******"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={isPasswordSubmitting}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white text-left font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                    required
                  />
                </div>

                <div className="flex gap-2 pt-3 border-t border-slate-700">
                  <button
                    type="submit"
                    disabled={isPasswordSubmitting}
                    className="flex-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black py-2 px-3 rounded text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow"
                  >
                    <span>{isPasswordSubmitting ? 'در حال ثبت...' : 'بروزرسانی کلمه عبور'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsChangePasswordModalOpen(false);
                      setCurrentPassword('');
                      setNewPassword('');
                      setConfirmPassword('');
                    }}
                    disabled={isPasswordSubmitting}
                    className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-3 rounded text-xs transition-colors cursor-pointer"
                  >
                    انصراف
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Profile (Phone & Address) Modal */}
      <AnimatePresence>
        {isEditProfileModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md" id="edit-profile-modal-overlay">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-slate-900 text-white rounded-2xl border border-slate-700 p-6 max-w-lg w-full shadow-2xl text-right dir-rtl space-y-4 font-sans"
              id="edit-profile-modal-box"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <button
                  type="button"
                  onClick={() => setIsEditProfileModalOpen(false)}
                  className="text-slate-400 hover:text-white transition-colors cursor-pointer p-1"
                >
                  <X className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm sm:text-base font-black text-emerald-400">📱📍 ویرایش آدرس و شماره تلفن همراه</h3>
                  <User className="w-5 h-5 text-emerald-400" />
                </div>
              </div>

              {/* Target Entity Selector (ONLY for Sales Managers) */}
              {(currentUser?.role === 'SALES_MANAGER' || activeRole === 'SALES_MANAGER') && (
                <div className="bg-slate-800/90 p-1.5 rounded-xl border border-slate-700 flex items-center gap-1 text-xs">
                  {currentUser && (
                    <button
                      type="button"
                      onClick={() => {
                        setProfileTargetCategory('USER');
                        setProfilePhone(currentUser.phoneNumber || '');
                        if (currentUser.role === 'REPRESENTATIVE' && currentUser.agentCode) {
                          const ag = agents.find(a => a.agentCode === currentUser.agentCode);
                          setProfileAddress(ag?.address || '');
                        } else if (currentUser.role === 'SHIPPING_COMPANY' && currentUser.shippingCompanyId) {
                          const sc = shippingCompanies.find(s => s.id === currentUser.shippingCompanyId);
                          setProfileAddress(sc?.address || '');
                        } else {
                          setProfileAddress('');
                        }
                      }}
                      className={`flex-1 py-1.5 px-2 rounded-lg font-bold transition-all text-center cursor-pointer ${
                        profileTargetCategory === 'USER' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      👤 حساب کاربر فعلی
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setProfileTargetCategory('AGENT');
                      if (agents.length > 0) {
                        const firstAg = agents.find(a => a.id === selectedAgentForProfile) || agents[0];
                        setSelectedAgentForProfile(firstAg.id);
                        setProfilePhone(firstAg.phoneNumber || '');
                        setProfileAddress(firstAg.address || '');
                      }
                    }}
                    className={`flex-1 py-1.5 px-2 rounded-lg font-bold transition-all text-center cursor-pointer ${
                      profileTargetCategory === 'AGENT' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    🏢 نمایندگی فروش
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileTargetCategory('SHIPPING');
                      if (shippingCompanies.length > 0) {
                        const firstSc = shippingCompanies.find(s => s.id === selectedShippingForProfile) || shippingCompanies[0];
                        setSelectedShippingForProfile(firstSc.id);
                        setProfilePhone(firstSc.phoneNumber || '');
                        setProfileAddress(firstSc.address || '');
                      }
                    }}
                    className={`flex-1 py-1.5 px-2 rounded-lg font-bold transition-all text-center cursor-pointer ${
                      profileTargetCategory === 'SHIPPING' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    🚛 شرکت باربری
                  </button>
                </div>
              )}

              {/* Read-only Role Banner for standard users */}
              {currentUser?.role !== 'SALES_MANAGER' && activeRole !== 'SALES_MANAGER' && (
                <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/70 text-[11px] text-slate-300 text-right">
                  <span>نقش حساب کاربری شما: <strong className="text-white">
                    {currentUser?.role === 'REPRESENTATIVE' || profileTargetCategory === 'AGENT' ? '🏢 نمایندگی رسمی فروش' :
                     currentUser?.role === 'SHIPPING_COMPANY' || profileTargetCategory === 'SHIPPING' ? '🚛 شرکت حمل و نقل همکار' :
                     currentUser?.role === 'FACTORY_TRANSPORT' ? '🏭 فروش کارخانه' : '👤 کاربر سیستم'}
                  </strong></span>
                </div>
              )}

              <form onSubmit={handleUpdateProfileSubmit} className="space-y-3.5 text-right font-sans">
                {/* USER MODE DETAILS */}
                {profileTargetCategory === 'USER' && currentUser && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-800/50 p-3 rounded-xl border border-slate-750">
                    <div>
                      <label className="block text-slate-400 text-[10px] mb-1 font-bold">نام و نام خانوادگی:</label>
                      <input
                        type="text"
                        value={currentUser.fullName}
                        disabled
                        className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-300 font-sans cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 text-[10px] mb-1 font-bold">نقش حساب:</label>
                      <input
                        type="text"
                        value={
                          currentUser.role === 'REPRESENTATIVE' ? 'نمایندگی رسمی فروش' :
                          currentUser.role === 'SHIPPING_COMPANY' ? 'شرکت حمل و نقل همکار' :
                          currentUser.role === 'SALES_MANAGER' ? 'مدیریت فروش' :
                          currentUser.role === 'FACTORY_TRANSPORT' ? 'فروش کارخانه' : 'کاربر سیستم'
                        }
                        disabled
                        className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-300 font-sans cursor-not-allowed"
                      />
                    </div>
                  </div>
                )}

                {/* AGENT SELECTOR DROPDOWN (ONLY FOR SALES MANAGERS) */}
                {profileTargetCategory === 'AGENT' && (currentUser?.role === 'SALES_MANAGER' || activeRole === 'SALES_MANAGER') && (
                  <div>
                    <label className="block text-slate-300 text-xs mb-1 font-bold">انتخاب نمایندگی جهت ویرایش آدرس و همراه:</label>
                    <select
                      value={selectedAgentForProfile}
                      onChange={(e) => {
                        const agId = e.target.value;
                        setSelectedAgentForProfile(agId);
                        const ag = agents.find(a => a.id === agId);
                        if (ag) {
                          setProfilePhone(ag.phoneNumber || '');
                          setProfileAddress(ag.address || '');
                        }
                      }}
                      className="w-full bg-slate-800 border border-emerald-500/50 text-white rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans cursor-pointer"
                    >
                      {agents.map((ag) => (
                        <option key={ag.id} value={ag.id}>
                          {ag.alias || ag.fullName} (کد تفصیلی: {ag.agentCode})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* SHIPPING COMPANY SELECTOR DROPDOWN (ONLY FOR SALES MANAGERS) */}
                {profileTargetCategory === 'SHIPPING' && (currentUser?.role === 'SALES_MANAGER' || activeRole === 'SALES_MANAGER') && (
                  <div>
                    <label className="block text-slate-300 text-xs mb-1 font-bold">انتخاب شرکت باربری جهت ویرایش آدرس و همراه:</label>
                    <select
                      value={selectedShippingForProfile}
                      onChange={(e) => {
                        const scId = e.target.value;
                        setSelectedShippingForProfile(scId);
                        const sc = shippingCompanies.find(s => s.id === scId);
                        if (sc) {
                          setProfilePhone(sc.phoneNumber || '');
                          setProfileAddress(sc.address || '');
                        }
                      }}
                      className="w-full bg-slate-800 border border-emerald-500/50 text-white rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans cursor-pointer"
                    >
                      {shippingCompanies.map((sc) => (
                        <option key={sc.id} value={sc.id}>
                          {sc.name} (کد: {sc.code}) - مدیر: {sc.managerName || 'نامشخص'}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-slate-200 text-xs mb-1 font-bold">
                    شماره تلفن همراه جهت هماهنگی و تماس: <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="09121111111"
                    value={profilePhone}
                    onChange={(e) => setProfilePhone(e.target.value)}
                    disabled={isProfileSubmitting}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-emerald-400 text-left font-mono focus:outline-none focus:border-emerald-500"
                    required
                  />
                  <p className="text-[10px] text-slate-400 mt-1">این شماره جهت هماهنگی بارهای سفال طبرستان، تماس رانندگان و صدور حواله استفاده می‌شود.</p>
                </div>

                <div>
                  <label className="block text-slate-200 text-xs mb-1 font-bold">آدرس دقیق دفتر / انبار تخلیه بار / پایانه باربری:</label>
                  <textarea
                    rows={3}
                    placeholder="استان، شهر، خیابان اصلی، پلاک، نشانی کامل انبار یا پایانه باربری..."
                    value={profileAddress}
                    onChange={(e) => setProfileAddress(e.target.value)}
                    disabled={isProfileSubmitting}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white text-right font-sans focus:outline-none focus:border-emerald-500 leading-relaxed"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">آدرس دقیق جهت درج در برگ ترخیص، حواله انبار و بارنامه صادر شده توسط کارخانه ثبت می‌گردد.</p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsEditProfileModalOpen(false)}
                    disabled={isProfileSubmitting}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    انصراف
                  </button>
                  <button
                    type="submit"
                    disabled={isProfileSubmitting}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isProfileSubmitting ? 'در حال ثبت...' : '💾 ثبت و ذخیره تغییرات'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Confirmation Dialog Modal */}
      <AnimatePresence>
        {confirmConfig && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-sm" id="global-confirm-overlay">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 25 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 25 }}
              className="bg-white rounded-2xl border border-slate-200/80 p-6 max-w-md w-full shadow-2xl text-right dir-rtl space-y-4"
              id="global-confirm-modal"
            >
              <div className="flex items-center gap-2.5 text-slate-850">
                <ShieldAlert className="w-5 h-5 text-indigo-600 shrink-0" />
                <h3 className="text-sm font-extrabold text-slate-900">{confirmConfig.title}</h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed text-justify pr-1">{confirmConfig.message}</p>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setConfirmConfig(null)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 py-1.5 px-3.5 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="button"
                  onClick={() => {
                    confirmConfig.onConfirm();
                    setConfirmConfig(null);
                  }}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white py-1.5 px-4.5 rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-sm"
                >
                  تأیید می‌کنم
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PWA Floating Install Prompt */}
      <InstallPwaPrompt />
    </div>
  );
}
