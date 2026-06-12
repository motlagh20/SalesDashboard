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

  // Initialize from LocalStorage or Fallback to Preset mock data if empty
  useEffect(() => {
    const savedOrders = localStorage.getItem('tabarestan_clay_orders_v2');
    if (savedOrders) {
      try {
        setOrders(JSON.parse(savedOrders));
      } catch (err) {
        setOrders(PRESET_ORDERS);
      }
    } else {
      setOrders(PRESET_ORDERS);
      localStorage.setItem('tabarestan_clay_orders_v2', JSON.stringify(PRESET_ORDERS));
    }

    const savedProducts = localStorage.getItem('tabarestan_clay_products_v2');
    if (savedProducts) {
      try {
        setProducts(JSON.parse(savedProducts));
      } catch (err) {
        setProducts(PRESET_PRODUCTS);
      }
    } else {
      setProducts(PRESET_PRODUCTS);
      localStorage.setItem('tabarestan_clay_products_v2', JSON.stringify(PRESET_PRODUCTS));
    }

    const savedAgents = localStorage.getItem('tabarestan_clay_agents_v2');
    if (savedAgents) {
      try {
        setAgents(JSON.parse(savedAgents));
      } catch (err) {
        setAgents(PRESET_AGENTS);
      }
    } else {
      setAgents(PRESET_AGENTS);
      localStorage.setItem('tabarestan_clay_agents_v2', JSON.stringify(PRESET_AGENTS));
    }

    const savedShipping = localStorage.getItem('tabarestan_clay_shipping_v2');
    if (savedShipping) {
      try {
        setShippingCompanies(JSON.parse(savedShipping));
      } catch (err) {
        setShippingCompanies(PRESET_SHIPPING_COMPANIES);
      }
    } else {
      setShippingCompanies(PRESET_SHIPPING_COMPANIES);
      localStorage.setItem('tabarestan_clay_shipping_v2', JSON.stringify(PRESET_SHIPPING_COMPANIES));
    }
  }, []);

  // Sync state changes to LocalStorage
  const saveOrders = (updatedOrders: Order[]) => {
    setOrders(updatedOrders);
    localStorage.setItem('tabarestan_clay_orders_v2', JSON.stringify(updatedOrders));
  };

  const saveProducts = (updatedProducts: Product[]) => {
    setProducts(updatedProducts);
    localStorage.setItem('tabarestan_clay_products_v2', JSON.stringify(updatedProducts));
  };

  const saveAgents = (updatedAgents: Agent[]) => {
    setAgents(updatedAgents);
    localStorage.setItem('tabarestan_clay_agents_v2', JSON.stringify(updatedAgents));
  };

  const saveShippingCompanies = (updatedCompanies: ShippingCompany[]) => {
    setShippingCompanies(updatedCompanies);
    localStorage.setItem('tabarestan_clay_shipping_v2', JSON.stringify(updatedCompanies));
  };

  // 1. Create Order (Called by Representative)
  const handleCreateOrder = (orderData: Partial<Order>) => {
    const newOrderNumber = `TCL-1402-0${orders.length + 1}`;
    const newOrder: Order = {
      id: `ord-${Date.now()}`,
      orderNumber: newOrderNumber,
      customerName: orderData.customerName || selectedAgent,
      agentCode: orderData.agentCode || 'AG-0000',
      productId: orderData.productId || 'prod-1',
      productName: orderData.productName || '',
      quantity: orderData.quantity || 1000,
      unit: orderData.unit || 'عدد',
      destinationCity: orderData.destinationCity || 'نامشخص',
      exactAddress: orderData.exactAddress || '',
      phoneNumber: orderData.phoneNumber || '',
      notes: orderData.notes || '',
      createdAt: new Date().toISOString(),
      status: 'PENDING_APPROVAL',
      statusHistory: [
        {
          status: 'PENDING_APPROVAL',
          updatedAt: new Date().toISOString(),
          comment: 'ثبت سفارش از طریق اپلیکیشن نمایندگی',
        },
      ],
    };

    const updated = [newOrder, ...orders];
    saveOrders(updated);
  };

  // 2. Approve Order (Called by Sales Manager)
  const handleApproveOrder = (orderId: string) => {
    const updated = orders.map((order) => {
      if (order.id === orderId) {
        return {
          ...order,
          status: 'APPROVED_BY_SALES' as OrderStatus,
          statusHistory: [
            ...order.statusHistory,
            {
              status: 'APPROVED_BY_SALES' as OrderStatus,
              updatedAt: new Date().toISOString(),
              comment: 'تایید نهایی سفارش توسط دفتر مدیریت فروش فروشگاه طبرستان و ارجاع به کارخانه',
            },
          ],
        };
      }
      return order;
    });
    saveOrders(updated);
  };

  // 3. Reject Order (Called by Sales Manager)
  const handleRejectOrder = (orderId: string, reason: string) => {
    const updated = orders.map((order) => {
      if (order.id === orderId) {
        return {
          ...order,
          status: 'REJECTED' as OrderStatus,
          rejectionReason: reason,
          statusHistory: [
            ...order.statusHistory,
            {
              status: 'REJECTED' as OrderStatus,
              updatedAt: new Date().toISOString(),
              comment: `درخواست لغو شد به دلیل: ${reason}`,
            },
          ],
        };
      }
      return order;
    });
    saveOrders(updated);
  };

  // 3a. Dispatch to Factory (Called by Sales Manager)
  const handleDispatchToFactory = (orderId: string, comment?: string) => {
    const updated = orders.map((order) => {
      if (order.id === orderId) {
        return {
          ...order,
          status: 'SENT_TO_FACTORY' as OrderStatus,
          sentToFactoryAt: new Date().toISOString(),
          statusHistory: [
            ...order.statusHistory,
            {
              status: 'SENT_TO_FACTORY' as OrderStatus,
              updatedAt: new Date().toISOString(),
              comment: comment || 'سفارش تأیید شد، اولویت‌بندی نهایی گردید و جهت تأمین وسیله نقلیه به کارخانه ارسال شد.',
            },
          ],
        };
      }
      return order;
    });
    saveOrders(updated);
  };

  // 3b. Re-arrange priorities of approved orders (Called by Sales Manager)
  const handleUpdateAllOrders = (updatedOrders: Order[]) => {
    saveOrders(updatedOrders);
  };

  // 3c. Product Management (Called by Sales Manager)
  const handleCreateProduct = (newProduct: Product) => {
    const updated = [...products, { ...newProduct, isEnabled: true }];
    saveProducts(updated);
  };

  const handleToggleProductStatus = (productId: string) => {
    const updated = products.map(prod => 
      prod.id === productId ? { ...prod, isEnabled: prod.isEnabled === undefined ? false : !prod.isEnabled } : prod
    );
    saveProducts(updated);
  };

  const handleDeleteProduct = (productId: string) => {
    const updated = products.filter(prod => prod.id !== productId);
    saveProducts(updated);
  };

  // 3d. Agent Management (Called by Sales Manager)
  const handleCreateAgent = (newAgent: Agent) => {
    const updated = [...agents, newAgent];
    saveAgents(updated);
  };

  const handleToggleAgentStatus = (agentId: string) => {
    const updated = agents.map(agent => 
      agent.id === agentId ? { ...agent, isEnabled: !agent.isEnabled } : agent
    );
    saveAgents(updated);
  };

  const handleDeleteAgent = (agentId: string) => {
    const updated = agents.filter(agent => agent.id !== agentId);
    saveAgents(updated);
  };

  // 3f. Shipping Companies Management (Called by Sales Manager)
  const handleCreateShippingCompany = (newCompany: ShippingCompany) => {
    const updated = [...shippingCompanies, newCompany];
    saveShippingCompanies(updated);
  };

  const handleToggleShippingCompanyStatus = (companyId: string) => {
    const updated = shippingCompanies.map(company => 
      company.id === companyId ? { ...company, isEnabled: !company.isEnabled } : company
    );
    saveShippingCompanies(updated);
  };

  const handleDeleteShippingCompany = (companyId: string) => {
    const updated = shippingCompanies.filter(company => company.id !== companyId);
    saveShippingCompanies(updated);
  };

  // 3e. Bulk / Batch action handlers (Called by Sales Manager)
  const handleApproveAllOrders = () => {
    const pendingOrders = orders.filter(o => o.status === 'PENDING_APPROVAL');
    if (pendingOrders.length === 0) {
      showToast('هیچ سفارشی در انتظار تایید وجود ندارد.', 'error');
      return;
    }

    const pendingIds = new Set(pendingOrders.map(o => o.id));

    const updated = orders.map((order) => {
      if (pendingIds.has(order.id)) {
        return {
          ...order,
          status: 'APPROVED_BY_SALES' as OrderStatus,
          statusHistory: [
            ...order.statusHistory,
            {
              status: 'APPROVED_BY_SALES' as OrderStatus,
              updatedAt: new Date().toISOString(),
              comment: 'تایید دسته‌جمعی کل کارتابل سفارشات توسط مدیر فروش و بازرگانی طبرستان',
            },
          ],
        };
      }
      return order;
    });

    saveOrders(updated);
    showToast('تمامی سفارشات معلق با موفقیت تایید و به صف کارخانه افزوده شدند.', 'success');
  };

  const handleDispatchAllToFactory = () => {
    // Get all currently approved orders
    const approvedOrders = orders.filter(o => o.status === 'APPROVED_BY_SALES');
    if (approvedOrders.length === 0) {
      showToast('هیچ سفارش تایید شده‌ای جهت ارسال به کارخانه یافت نشد.', 'error');
      return;
    }

    // Assign sequential timestamps to guarantee the exact screen order is preserved in transport queue
    const now = Date.now();
    const approvedIdsWithTimes = approvedOrders.map((order, idx) => ({
      id: order.id,
      sentToFactoryAt: new Date(now + idx * 1000).toISOString()
    }));

    // Create a map for quick lookup
    const timeMap = new Map(approvedIdsWithTimes.map(item => [item.id, item.sentToFactoryAt]));

    const updated = orders.map((order) => {
      const sentTime = timeMap.get(order.id);
      if (sentTime) {
        return {
          ...order,
          status: 'SENT_TO_FACTORY' as OrderStatus,
          sentToFactoryAt: sentTime,
          statusHistory: [
            ...order.statusHistory,
            {
              status: 'SENT_TO_FACTORY' as OrderStatus,
              updatedAt: new Date().toISOString(),
              comment: 'ارسال دسته‌جمعی به خط کارخانه / اولویت‌بندی پیش‌فرض تأمین وسیله نقلیه در ترابری طبرستان',
            },
          ],
        };
      }
      return order;
    });

    saveOrders(updated);
    showToast('تمامی سفارشات تایید شده به واحد ترابری کارخانه ارسال شدند.', 'success');
  };

  // 4. Assign Logistics Truck (Called by Factory Transport)
  const handleAssignVehicle = (orderId: string, vehicle: VehicleDetails) => {
    const updated = orders.map((order) => {
      if (order.id === orderId) {
        return {
          ...order,
          status: 'VEHICLE_ASSIGNED' as OrderStatus,
          vehicleDetails: vehicle,
          statusHistory: [
            ...order.statusHistory,
            {
              status: 'VEHICLE_ASSIGNED' as OrderStatus,
              updatedAt: new Date().toISOString(),
              comment: `تخصیص وسیله نقلیه ${vehicle.vehicleType} متعلق به باربری ${vehicle.shippingAgency} به رانندگی ${vehicle.driverName}`,
            },
          ],
        };
      }
      return order;
    });
    saveOrders(updated);
  };

  // 5. Complete Loading and Dispatch Truck (Called by Factory Transport)
  const handleDispatchOrder = (orderId: string) => {
    const updated = orders.map((order) => {
      if (order.id === orderId) {
        return {
          ...order,
          status: 'LOADED_AND_DISPATCHED' as OrderStatus,
          statusHistory: [
            ...order.statusHistory,
            {
              status: 'LOADED_AND_DISPATCHED' as OrderStatus,
              updatedAt: new Date().toISOString(),
              comment: 'محصول با موفقیت بارگیری شد و خودرو از درب حراست کارخانه ترخیص و به سمت مقصد حرکت کرد.',
            },
          ],
        };
      }
      return order;
    });
    saveOrders(updated);
  };

  // Reset demo application to original factory state
  const handleResetApp = () => {
    askConfirm(
      'بازنشانی اطلاعات شبیه‌ساز',
      'آیا مطمئن هستید که می‌خواهید تمام تغییرات خود را لغو کرده و دیتابیس را به حالت پیش‌فرض کارخانه بازنشانی کنید؟',
      () => {
        localStorage.removeItem('tabarestan_clay_orders_v2');
        localStorage.removeItem('tabarestan_clay_products_v2');
        localStorage.removeItem('tabarestan_clay_agents_v2');
        window.location.reload();
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

      {/* Role Play Tester Nav - EXTREMELY HELPFUL for showcasing interactive system */}
      <div className="bg-slate-800 text-slate-200 py-3 border-b border-slate-700 shadow-inner" id="role-tester-bar">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <span className="text-[11px] text-slate-400 flex items-center justify-end gap-1.5">
              <span>تست فرآیند خرید دوطرفه با شبیه‌سازی نقش‌ها:</span>
              <Info className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
            </span>

            {/* Quick switches buttons */}
            <div className="flex flex-wrap gap-2 justify-end" id="role-buttons-grid">
              
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

              {/* View 4: Infrastructure Docs */}
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
            <h4 className="font-bold text-slate-800 mb-0.5">
              {activeRole === 'REPRESENTATIVE' && '📱 کانال اپلیکیشن تحت وب نمایندگی‌ها (آیفون / اندروید)'}
              {activeRole === 'SALES_MANAGER' && '👔 کارتابل مدیریت بازرگانی و تایید مالی'}
              {activeRole === 'FACTORY_TRANSPORT' && '🏭 کارتابل واحد فروش و رهگیری ترابری کارخانه'}
              {activeRole === 'INFRASTRUCTURE' && '⚙️ نیازمندی‌های توسعه زیرساخت نرم‌افزاری در فاز تولید'}
            </h4>
            <p className="text-slate-500 leading-relaxed text-justify">
              {activeRole === 'REPRESENTATIVE' && 'سفارشات جدید را در فرم زیر ثبت کنید و فاکتور نهایی را برآورد کنید. با ثبت سفارش، اطلاعات بلافاصله در پنل مدیریت بازرگانی رویت خواهد شد. پیگیری وضعیت فاکتور و کامیون اختصاص داده شده با پلاک، راننده و شماره تلفن در همین بخش قابل رویت است.'}
              {activeRole === 'SALES_MANAGER' && 'سفارشات جدید ثبت شده توسط نمایندگان سراسر کشور با تمام فاکتورها در این کارتابل مدیریت بازرگانی ظاهر می‌شود. واحد بازرگانی می‌تواند با تایید سفارش آن را به خط کارخانه بفرستد یا در صورت عدم کفایت اعتباری با درج علت آن را لغو کند. همچنین قابلیت تعریف نمایندگان، محصولات و شرکت‌های حمل و نقل در این پنل تعبیه شده است.'}
              {activeRole === 'FACTORY_TRANSPORT' && 'زمانی که واحد بازرگانی سفارش را تایید کند، سفارش به ترتیب زمان ورود در صف به واحد فروش کارخانه ارجاع می‌گردد. واحد فروش پلاک خودرو، نوع تریلی و تلفن راننده را مشخص کرده و سفارش‌ها را به صورت تکی یا دسته‌جمعی به باربری منتخب ارسال می‌کند و سپس محصول بارگیری و صادر می‌شود.'}
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
                onAddAgent={handleCreateAgent}
                onToggleAgent={handleToggleAgentStatus}
                onDeleteAgent={handleDeleteAgent}
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
                onAssignVehicle={handleAssignVehicle}
                onDispatchOrder={handleDispatchOrder}
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
