/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Order, OrderStatus, VehicleDetails, UserRole, Product, Agent, ShippingCompany } from './types';
import { PRESET_ORDERS, PRESET_PRODUCTS, PRESET_AGENTS, PRESET_SHIPPING_COMPANIES } from './data';
import RepresentativeDashboard from './components/RepresentativeDashboard';
import ManagerDashboard from './components/ManagerDashboard';
import FactoryDashboard from './components/FactoryDashboard';
import ShippingCompanyDashboard from './components/ShippingCompanyDashboard';
import InfrastructureInfo from './components/InfrastructureInfo';
import { 
  Building2, 
  Smartphone, 
  ShieldAlert, 
  Truck, 
  Layers, 
  HelpCircle,
  RotateCcw,
  CheckCircle2,
  Info,
  X
} from 'lucide-react';

export default function App() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [shippingCompanies, setShippingCompanies] = useState<ShippingCompany[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('نمایندگی تهران (احمدی)');
  const [activeRole, setActiveRole] = useState<UserRole | 'INFRASTRUCTURE'>('REPRESENTATIVE');

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
    try {
      const [resProd, resAgent, resShip, resOrder] = await Promise.all([
        fetch('/api/products'),
        fetch('/api/agents'),
        fetch('/api/shipping-companies'),
        fetch('/api/orders')
      ]);

      if (resProd.ok) setProducts(await safeParseResponse(resProd, []));
      if (resAgent.ok) setAgents(await safeParseResponse(resAgent, []));
      if (resShip.ok) setShippingCompanies(await safeParseResponse(resShip, []));
      if (resOrder.ok) setOrders(await safeParseResponse(resOrder, []));
    } catch (err) {
      console.error('Error refreshing dashboard data:', err);
    }
  };

  useEffect(() => {
    refreshAllData();
    // Periodic synchronization every 10 seconds to keep multi-role users in sync
    const interval = setInterval(refreshAllData, 10000);
    return () => clearInterval(interval);
  }, []);

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
  const handleApproveAllOrders = async () => {
    try {
      const response = await fetch('/api/orders/bulk-approve', {
        method: 'POST'
      });

      if (response.ok) {
        showToast('تمامی سفارشات معلق با موفقیت تایید سیستم شدند.', 'success');
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
        showToast('تمامی سفارشات تایید شده به واحد ترابری کارخانه ارسال شدند.', 'success');
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

  return (
    <div className="min-h-screen bg-slate-50 text-right dir-rtl font-sans selection:bg-emerald-100 selection:text-emerald-800 pb-16" id="app-root-wrapper">
      
      {/* Top Main Navigation Header */}
      <header className="bg-slate-900 text-white sticky top-0 z-50 shadow-md border-b border-slate-800" id="primary-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 flex-wrap sm:flex-nowrap gap-4">
            
            {/* Header Brand */}
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-600 rounded-lg text-white font-bold" id="app-logo">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-sm sm:text-base font-extrabold tracking-tight">تولیدی صنایع سفال طبرستان</h1>
                <p className="text-[10px] text-slate-400">سامانه ثبت سفارشات و رهگیری</p>
              </div>
            </div>

            {/* Reset Button */}
            <button
              onClick={handleResetApp}
              title="بازنشانی پایگاه داده شبیه‌ساز"
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 hover:text-rose-400 text-slate-400 rounded-lg text-[10px] transition-all flex items-center gap-1 cursor-pointer"
              id="reset-simulation-btn"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>بازنشانی دمو</span>
            </button>
          </div>
        </div>
      </header>

      {/* Role Play Tester Nav  */}
      <div className="bg-slate-800 text-slate-200 py-3 border-b border-slate-700 shadow-inner" id="role-tester-bar">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <span className="text-[11px] text-slate-400 flex items-center justify-end gap-1.5 flex-row-reverse">
              <Info className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              <span>تست فرآیند خرید دوطرفه با شبیه‌سازی نقش‌ها:</span>
            </span>

            {/* Quick switches buttons */}
            <div className="flex flex-wrap gap-2 justify-end animate-fade-in" id="role-buttons-grid">
              
              {/* Role 1: Agent */}
              <button
                onClick={() => setActiveRole('REPRESENTATIVE')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  activeRole === 'REPRESENTATIVE'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-650'
                }`}
                id="role-btn-rep"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>۱. اپلیکیشن نمایندگی فروش</span>
              </button>

              {/* Role 2: Sales Manager */}
              <button
                onClick={() => setActiveRole('SALES_MANAGER')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  activeRole === 'SALES_MANAGER'
                    ? 'bg-amber-500 text-slate-900 shadow-sm'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-650'
                }`}
                id="role-btn-mgr"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>۲. مدیریت بازرگانی</span>
              </button>

              {/* Role 3: Factory Logistics */}
              <button
                onClick={() => setActiveRole('FACTORY_TRANSPORT')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  activeRole === 'FACTORY_TRANSPORT'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-650'
                }`}
                id="role-btn-factory"
              >
                <Truck className="w-3.5 h-3.5" />
                <span>۳. کارتابل واحد فروش</span>
              </button>

              {/* Role 4: Shipping Company */}
              <button
                onClick={() => setActiveRole('SHIPPING_COMPANY')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  activeRole === 'SHIPPING_COMPANY'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-650'
                }`}
                id="role-btn-shipping"
              >
                <Truck className="w-3.5 h-3.5" />
                <span>۴. پنل اختصاصی باربری‌ها</span>
              </button>

              {/* View 5: Infrastructure Docs */}
              <button
                onClick={() => setActiveRole('INFRASTRUCTURE')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  activeRole === 'INFRASTRUCTURE'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-650'
                }`}
                id="role-btn-infra"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>⚙️ زیرساخت فنی مورد نیاز</span>
              </button>

            </div>
          </div>
        </div>
      </div>

      {/* Interactive Explanation Toast for the active role */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        <div className="bg-white border-r-4 border-emerald-500 p-4 rounded-xl shadow-sm text-xs text-slate-600 flex items-start gap-3 justify-end" id="workflow-intro-card">
          <div className="flex-1 text-right">
            <h4 className="font-bold text-slate-800 mb-1 flex items-center justify-end gap-1.5">
              <span>
                {activeRole === 'REPRESENTATIVE' && '📱 کانال اپلیکیشن تحت وب نمایندگی‌ها (آیفون / اندروید)'}
                {activeRole === 'SALES_MANAGER' && '👔 کارتابل مدیریت بازرگانی و تایید مالی'}
                {activeRole === 'FACTORY_TRANSPORT' && '🏭 کارتابل واحد فروش و رهگیری ترابری کارخانه'}
                {activeRole === 'SHIPPING_COMPANY' && '🚚 پنل اختصاصی باربری‌ها و اتوبارهای همکار طبرستان'}
                {activeRole === 'INFRASTRUCTURE' && '⚙️ نیازمندی‌های توسعه زیرساخت نرم‌افزاری در فاز تولید'}
              </span>
              <Info className="w-4 h-4 text-emerald-600" />
            </h4>
            <p className="text-slate-500 leading-relaxed text-justify">
              {activeRole === 'REPRESENTATIVE' && 'سفارشات جدید را در فرم زیر ثبت کنید و فاکتور نهایی را برآورد کنید. با ثبت سفارش، اطلاعات بلافاصله در پنل مدیریت بازرگانی رویت خواهد شد. پیگیری وضعیت فاکتور و کامیون اختصاص داده شده با پلاک، راننده و شماره تلفن در همین بخش قابل رویت است.'}
              {activeRole === 'SALES_MANAGER' && 'سفارشات جدید ثبت شده توسط نمایندگان سراسر کشور با تمام فاکتورها در این کارتابل مدیریت بازرگانی ظاهر می‌شود. واحد بازرگانی می‌تواند با تایید سفارش آن را به خط کارخانه بفرستد یا در صورت عدم کفایت اعتباری با درج علت آن را لغو کند. همچنین قابلیت تعریف نمایندگان، محصولات و شرکت‌های حمل و نقل در این پنل تعبیه شده است.'}
              {activeRole === 'FACTORY_TRANSPORT' && 'سفارشات تایید شده بازرگانی در صف کارخانه قرار می‌گیرند. مدیر فروش کارخانه به جای پر کردن فرم‌های طولانی، به راحتی سفارش را با مشخص کردن باربری و نوع نیاز خودرو به باربری مربوطه ارسال می‌کند تا کمترین درگیری ثبتی را تجربه کند.'}
              {activeRole === 'SHIPPING_COMPANY' && 'باربری‌ها وقتی ارجاع حمل را از واحد فروش کارخانه طبرستان دریافت می‌کنند، درخواست مربوطه به همراه مقدار سفال سقف یا آجر در صف آنها ظاهر می‌شود. آنها با دکمه درج سریع نام راننده و پلاک را با حداقل وقت تلف شده پر کرده و شماره بارنامه صادرشده در برنامه اختصاصی خود را نوشته و سفارش را به نوبت بارگیری تایید می‌کنند.'}
              {activeRole === 'INFRASTRUCTURE' && 'در این لایه فناوری‌ها، زیرساخت پایگاه داده رابطه‌ای، شیوه احراز هویت پیامکی کاربران و نحوه استقرار برنامه جهت دسترسی دائم تمامی گوشی‌های اندروید و آیفون تبیین شده است.'}
            </p>
          </div>
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
              />
            )}

            {activeRole === 'SALES_MANAGER' && (
              <ManagerDashboard
                orders={orders}
                products={products}
                agents={agents}
                shippingCompanies={shippingCompanies}
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
                onToggleShippingCompany={handleToggleShippingCompanyStatus}
                onDeleteShippingCompany={handleDeleteShippingCompany}
                onApproveAllOrders={handleApproveAllOrders}
                onDispatchAllToFactory={handleDispatchAllToFactory}
                showToast={showToast}
                askConfirm={askConfirm}
              />
            )}

            {activeRole === 'FACTORY_TRANSPORT' && (
              <FactoryDashboard
                orders={orders}
                shippingCompanies={shippingCompanies}
                products={products}
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
                onAssignVehicle={handleAssignVehicle}
                showToast={showToast}
                askConfirm={askConfirm}
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
    </div>
  );
}
