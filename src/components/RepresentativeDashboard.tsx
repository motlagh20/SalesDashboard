/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Order, Product, OrderStatus, Agent, AppUser } from '../types';
import { PRESET_AGENTS } from '../data';
import { IRAN_PROVINCES, getCitiesForProvince, formatTerritoriesSummary, EXPORT_COUNTRIES, getBordersForCountry } from '../data/iranLocations';
import { toEnglishDigits } from '../utils/numberUtils';
import { 
  PlusCircle, 
  Clock, 
  CheckCircle, 
  Truck, 
  MapPin, 
  Navigation, 
  Phone, 
  ShoppingBag, 
  FileText, 
  ArrowRight,
  Sparkles,
  AlertCircle,
  Trash2,
  Coins,
  Globe,
  User,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  Send,
  Map,
  Search,
  X,
  Edit,
  Check
} from 'lucide-react';

import { SendLocationModal } from './SendLocationModal';
import { InteractiveMapPicker } from './InteractiveMapPicker';

interface RepresentativeDashboardProps {
  orders: Order[];
  products: Product[];
  agents: Agent[];
  onCreateOrder: (orderData: Partial<Order>) => void;
  onCancelOrder: (orderId: string) => void;
  onEditOrder?: (orderId: string, editData: Partial<Order>) => void;
  onUpdatePaymentTracking: (orderId: string, paymentTrackingCode: string) => void;
  onSaveLocation?: (orderId: string, deliveryLocationUrl: string) => Promise<void>;
  selectedAgent: string;
  setSelectedAgent: (agent: string) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  askConfirm: (title: string, message: string, onConfirm: () => void) => void;
  currentUser?: AppUser | null;
  onOpenEditProfile?: (targetAgentId?: string, targetShippingId?: string) => void;
  sandboxEnabled?: boolean;
}

export default function RepresentativeDashboard({
  orders,
  products,
  agents,
  onCreateOrder,
  onCancelOrder,
  onEditOrder,
  onUpdatePaymentTracking,
  onSaveLocation,
  selectedAgent,
  setSelectedAgent,
  showToast,
  askConfirm,
  currentUser,
  onOpenEditProfile,
  sandboxEnabled = true,
}: RepresentativeDashboardProps) {
  const currentAgentObj = agents.find(a => a.alias === selectedAgent || a.agentCode === selectedAgent || a.id === selectedAgent || a.fullName === selectedAgent) || agents[0] || PRESET_AGENTS.find(a => a.alias === selectedAgent) || PRESET_AGENTS[0] || {
    id: 'unknown',
    fullName: 'نامشخص',
    alias: selectedAgent,
    agentCode: 'AG-0000',
    phoneNumber: '',
    address: '',
    area: '',
    isEnabled: true
  };

  // Form State
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState(330);
  const [destinationCity, setDestinationCity] = useState('تهران - تهران');
  const [exactAddress, setExactAddress] = useState('');
  const [deliveryLocationUrl, setDeliveryLocationUrl] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [selectedLocationOrder, setSelectedLocationOrder] = useState<Order | null>(null);
  const [isFormMapPickerOpen, setIsFormMapPickerOpen] = useState(false);

  // Edit Order Modal States
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [isEditMapPickerOpen, setIsEditMapPickerOpen] = useState(false);
  const [editBuyerName, setEditBuyerName] = useState('');
  const [editPhoneNumber, setEditPhoneNumber] = useState('');
  const [editDestinationCity, setEditDestinationCity] = useState('');
  const [editExactAddress, setEditExactAddress] = useState('');
  const [editDeliveryLocationUrl, setEditDeliveryLocationUrl] = useState('');
  const [editVehicleType, setEditVehicleType] = useState('تریلی');
  const [editPaymentTrackingCode, setEditPaymentTrackingCode] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editIsExportOrder, setEditIsExportOrder] = useState(false);
  const [editDestinationCountry, setEditDestinationCountry] = useState('');
  const [editItems, setEditItems] = useState<InvoiceItem[]>([]);

  const handleOpenEditModal = (ord: Order) => {
    if (ord.status === 'LOADED_AND_DISPATCHED' || ord.status === 'REJECTED') {
      showToast('امکان ویرایش سفارش‌های ترخیص شده یا لغو شده وجود ندارد.', 'error');
      return;
    }
    setEditingOrder(ord);

    let pendingData: any = null;
    if (ord.hasPendingEdit && ord.pendingEditData) {
      try {
        pendingData = JSON.parse(ord.pendingEditData);
      } catch (e) {}
    }

    setEditBuyerName(pendingData?.buyerName ?? ord.buyerName ?? '');
    setEditPhoneNumber(pendingData?.phoneNumber ?? ord.phoneNumber ?? '');
    setEditDestinationCity(pendingData?.destinationCity ?? ord.destinationCity ?? '');
    setEditExactAddress(pendingData?.exactAddress ?? ord.exactAddress ?? '');
    setEditDeliveryLocationUrl(pendingData?.deliveryLocationUrl ?? ord.deliveryLocationUrl ?? '');
    setEditNotes(pendingData?.notes ?? ord.notes ?? '');
    setEditPaymentTrackingCode(pendingData?.paymentTrackingCode ?? ord.paymentTrackingCode ?? '');
    setEditVehicleType(pendingData?.vehicleType ?? ord.vehicleDetails?.vehicleType ?? ord.vehicleType ?? 'تریلی');
    setEditIsExportOrder(pendingData?.isExportOrder !== undefined ? !!pendingData.isExportOrder : !!ord.isExportOrder);
    setEditDestinationCountry(pendingData?.destinationCountry ?? ord.destinationCountry ?? '');

    let itemsList: InvoiceItem[] = [];
    const rawItemsJson = pendingData?.itemsJson || ord.itemsJson;
    if (rawItemsJson) {
      try {
        const parsed = JSON.parse(rawItemsJson);
        if (Array.isArray(parsed) && parsed.length > 0) {
          itemsList = parsed.map((it: any, idx: number) => ({
            id: `edit-item-${idx}-${Date.now()}`,
            productId: it.productId || 'prod-1',
            productName: it.productName || 'محصول',
            quantity: Number(it.quantity) || 1,
            unit: it.unit || 'عدد',
            pricePerUnit: it.pricePerUnit || 0
          }));
        }
      } catch (e) {}
    }
    if (itemsList.length === 0) {
      itemsList = [{
        id: `edit-item-single-${Date.now()}`,
        productId: pendingData?.productId || ord.productId,
        productName: pendingData?.productName || ord.productName,
        quantity: Number(pendingData?.quantity || ord.quantity) || 1,
        unit: pendingData?.unit || ord.unit,
        pricePerUnit: 0
      }];
    }
    setEditItems(itemsList);
  };

  const handleSaveOrderEdit = () => {
    if (!editingOrder) return;
    if (editingOrder.status === 'LOADED_AND_DISPATCHED' || editingOrder.status === 'REJECTED') {
      showToast('امکان ویرایش این سفارش به علت ترخیص/خروج وجود ندارد.', 'error');
      return;
    }
    if (!onEditOrder) {
      showToast('سرویس ثبت ویرایش سفارش در دسترس نیست.', 'error');
      return;
    }

    const totalQuantity = editItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    const firstItem = editItems[0] || {
      productId: editingOrder.productId,
      productName: editingOrder.productName,
      quantity: editingOrder.quantity,
      unit: editingOrder.unit
    };

    const payload: Partial<Order> = {
      buyerName: editBuyerName.trim(),
      phoneNumber: editPhoneNumber.trim(),
      destinationCity: editDestinationCity.trim(),
      exactAddress: editExactAddress.trim(),
      deliveryLocationUrl: editDeliveryLocationUrl.trim(),
      notes: editNotes.trim(),
      paymentTrackingCode: editPaymentTrackingCode.trim(),
      vehicleType: editVehicleType,
      isExportOrder: editIsExportOrder,
      destinationCountry: editIsExportOrder ? editDestinationCountry : '',
      productId: firstItem.productId,
      productName: editItems.length > 1 
        ? editItems.map(i => `${i.productName} (${i.quantity} ${i.unit})`).join(' + ')
        : firstItem.productName,
      quantity: totalQuantity,
      unit: firstItem.unit,
      itemsJson: JSON.stringify(editItems)
    };

    onEditOrder(editingOrder.id, payload);
    setEditingOrder(null);
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      showToast('مرورگر شما از قابلیت دریافت موقعیت GPS پشتیبانی نمی‌کند.', 'error');
      return;
    }
    showToast('در حال دریافت موقعیت مکانی GPS...', 'info');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        const generatedUrl = `https://maps.google.com/?q=${lat},${lng}`;
        setDeliveryLocationUrl(generatedUrl);
        showToast('موقعیت GPS کنونی شما با موفقیت ثبت گردید.', 'success');
      },
      () => {
        showToast('خطا در دسترسی به GPS. لطفاً دسترسی موقعیت مکانی را تأیید کنید.', 'error');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // Territory-based location filtering
  const agentTerritories = currentAgentObj.territories || [];
  const isExportAllowed = !!currentAgentObj.isExportAgent;

  // Export Order States
  const [isExportOrder, setIsExportOrder] = useState<boolean>(false);
  const [selectedCountry, setSelectedCountry] = useState<string>('عراق');
  const [selectedBorder, setSelectedBorder] = useState<string>('مرز مهران (واسط)');
  const allowedBorders = getBordersForCountry(selectedCountry);
  
  // Calculate allowed provinces for this representative
  const allowedProvinces = agentTerritories.length > 0 
    ? IRAN_PROVINCES.filter(p => agentTerritories.some(t => t.province === p.name))
    : IRAN_PROVINCES;

  const [selectedProvince, setSelectedProvince] = useState<string>('تهران');
  const [selectedCity, setSelectedCity] = useState<string>('تهران');

  // Calculate allowed cities for the selected province
  const currentTerritoryRule = agentTerritories.find(t => t.province === selectedProvince);
  let allowedCities: string[] = [];
  if (agentTerritories.length === 0) {
    allowedCities = getCitiesForProvince(selectedProvince);
  } else if (currentTerritoryRule) {
    if (currentTerritoryRule.allCities) {
      allowedCities = getCitiesForProvince(selectedProvince);
    } else {
      allowedCities = currentTerritoryRule.cities && currentTerritoryRule.cities.length > 0 
        ? currentTerritoryRule.cities 
        : getCitiesForProvince(selectedProvince);
    }
  } else {
    allowedCities = getCitiesForProvince(selectedProvince);
  }
  
  // Tab State: 'CREATE' for order form, 'TRACKING' for tracking existing orders
  const [activeTab, setActiveTab] = useState<'CREATE' | 'TRACKING'>('CREATE');

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

  // Multi-item invoice builder states
  interface InvoiceItem {
    id: string;
    productId: string;
    productName: string;
    quantity: number;
    unit: string;
    pricePerUnit: number;
    imageUrl?: string;
  }
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [paymentTrackingCode, setPaymentTrackingCode] = useState('');

  const handleAddProductToInvoice = () => {
    if (!productId) {
      showToast('لطفاً ابتدا محصول را انتخاب کنید.', 'error');
      return;
    }
    if (quantity <= 0) {
      showToast('مقدار معتبری وارد کنید.', 'error');
      return;
    }
    const prodObj = products.find(p => p.id === productId);
    if (!prodObj) return;

    const existingIdx = invoiceItems.findIndex(item => item.productId === productId);
    if (existingIdx !== -1) {
      const updated = [...invoiceItems];
      updated[existingIdx].quantity += quantity;
      setInvoiceItems(updated);
    } else {
      setInvoiceItems([...invoiceItems, {
        id: `item-${Date.now()}`,
        productId: prodObj.id,
        productName: prodObj.name,
        quantity: quantity,
        unit: prodObj.unit,
        pricePerUnit: prodObj.pricePerUnit,
        imageUrl: prodObj.imageUrl
      }]);
    }
    showToast('محصول به لیست فاکتور افزوده شد.', 'success');
  };

  // Fallback default productId when products populate
  useEffect(() => {
    const activeProducts = products.filter(p => p.isEnabled !== false);
    if (activeProducts.length > 0 && (!productId || !activeProducts.some(p => p.id === productId))) {
      setProductId(activeProducts[0].id);
    }
  }, [products, productId]);

  // Track the agent alias for which default inputs have been initialized
  const initializedAgentRef = React.useRef<string | null>(null);

  // Autofill representative phone, territory and address when selectedAgent changes
  useEffect(() => {
    if (!selectedAgent) return;

    if (initializedAgentRef.current !== selectedAgent) {
      initializedAgentRef.current = selectedAgent;
      const allAgents = agents.length > 0 ? agents : PRESET_AGENTS;
      const agentObj = allAgents.find(a => a.alias === selectedAgent);
      if (agentObj) {
        // Keep customer address and phone clean so representative can enter buyer details easily
        setExactAddress('');
        setPhoneNumber('');
        
        const tList = agentObj.territories || [];
        if (tList.length > 0) {
          const firstT = tList[0];
          setSelectedProvince(firstT.province);
          if (firstT.allCities) {
            const cList = getCitiesForProvince(firstT.province);
            setSelectedCity(cList[0] || firstT.province);
          } else {
            const cList = firstT.cities && firstT.cities.length > 0 ? firstT.cities : getCitiesForProvince(firstT.province);
            setSelectedCity(cList[0] || firstT.province);
          }
        } else {
          // Fallback based on area string or default
          const area = agentObj.area || '';
          if (area.includes('بوشهر')) { setSelectedProvince('بوشهر'); setSelectedCity('بوشهر'); }
          else if (area.includes('هرمزگان')) { setSelectedProvince('هرمزگان'); setSelectedCity('بندرعباس'); }
          else if (area.includes('تهران')) { setSelectedProvince('تهران'); setSelectedCity('تهران'); }
          else if (area.includes('اصفهان')) { setSelectedProvince('اصفهان'); setSelectedCity('اصفهان'); }
          else if (area.includes('گیلان')) { setSelectedProvince('گیلان'); setSelectedCity('رشت'); }
          else if (area.includes('مازندران')) { setSelectedProvince('مازندران'); setSelectedCity('ساری'); }
          else if (area.includes('فارس')) { setSelectedProvince('فارس'); setSelectedCity('شیراز'); }
          else { setSelectedProvince('تهران'); setSelectedCity('تهران'); }
        }
      }
    }
  }, [selectedAgent, agents]);

  // Auto-sync borders when selectedCountry changes
  useEffect(() => {
    const borders = getBordersForCountry(selectedCountry);
    if (borders.length > 0) {
      setSelectedBorder(borders[0]);
    }
  }, [selectedCountry]);

  // Keep destinationCity in sync based on domestic vs export
  useEffect(() => {
    if (isExportAllowed && isExportOrder) {
      setDestinationCity(`صادرات به ${selectedCountry} (${selectedBorder})`);
    } else {
      if (selectedProvince && selectedCity) {
        setDestinationCity(`${selectedProvince} - ${selectedCity}`);
      } else if (selectedProvince) {
        setDestinationCity(selectedProvince);
      }
    }
  }, [isExportAllowed, isExportOrder, selectedCountry, selectedBorder, selectedProvince, selectedCity]);

  // Selected product details
  const selectedProduct = (products.find(p => p.id === productId) || products.find(p => p.isEnabled !== false) || products[0] || {
    id: '',
    name: 'محصول نامشخص',
    pricePerUnit: 0,
    unit: 'واحد',
    description: '',
    weight: '',
    dimensions: '',
    coverageInfo: '',
    primaryUnit: 'قالب',
    secondaryUnit: 'مترمربع',
    conversionRatio: 14,
    defaultQuantity: 330
  }) as Product;

  // Auto-sync quantity input when selected product changes
  useEffect(() => {
    if (selectedProduct) {
      const defQty = selectedProduct.defaultQuantity !== undefined && selectedProduct.defaultQuantity !== null 
        ? selectedProduct.defaultQuantity 
        : 330;
      setQuantity(defQty);
    }
  }, [productId, selectedProduct?.defaultQuantity]);

  const estimatedPrice = quantity * selectedProduct.pricePerUnit;

  const [searchQuery, setSearchQuery] = useState('');

  // Filter orders for the selected agent and query search
  const agentOrders = orders.filter(o => o.customerName === selectedAgent);

  const filteredAgentOrders = agentOrders.filter(order => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const orderNum = (order.orderNumber || '').toLowerCase();
    const orderId = (order.id || '').toLowerCase();
    const customer = (order.customerName || '').toLowerCase();
    const buyer = (order.buyerName || '').toLowerCase();
    const product = (order.productName || '').toLowerCase();
    const city = (order.destinationCity || '').toLowerCase();
    const financialDoc = (order.financialDocId || '').toLowerCase();
    const paymentTrack = (order.paymentTrackingCode || '').toLowerCase();
    const driver = (order.vehicleDetails?.driverName || '').toLowerCase();
    const billNo = (order.vehicleDetails?.billOfLadingNumber || '').toLowerCase();

    return (
      orderNum.includes(q) ||
      orderId.includes(q) ||
      customer.includes(q) ||
      buyer.includes(q) ||
      product.includes(q) ||
      city.includes(q) ||
      financialDoc.includes(q) ||
      paymentTrack.includes(q) ||
      driver.includes(q) ||
      billNo.includes(q)
    );
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAgentObj.isEnabled) {
      showToast('این نمایندگی در حال حاضر غیرفعال است و امکان ثبت سفارش روی آن وجود ندارد.', 'error');
      return;
    }

    const finalItems = invoiceItems.length > 0 
      ? invoiceItems 
      : [{
          id: 'item-def',
          productId,
          productName: selectedProduct.name,
          quantity,
          unit: selectedProduct.unit,
          pricePerUnit: selectedProduct.pricePerUnit
        }];

    if (finalItems.length === 1 && !finalItems[0].productId) {
      showToast('لطفاً حداقل یک محصول به فاکتور سفارش خود اضافه کنید.', 'error');
      return;
    }

    if (!exactAddress) {
      showToast('لطفاً آدرس دقیق تخلیه را وارد نمایید.', 'error');
      return;
    }

    setIsSubmitting(true);

    // Simulate server post delay
    setTimeout(() => {
      const rootProductId = finalItems[0].productId;
      const rootProductName = finalItems.length === 1 
        ? finalItems[0].productName 
        : `${finalItems[0].productName} (و ${finalItems.length - 1} محصول دیگر)`;
      const rootQuantity = finalItems.reduce((acc, item) => acc + item.quantity, 0);
      const rootUnit = finalItems[0].unit;

      onCreateOrder({
        customerName: currentAgentObj.alias,
        agentCode: currentAgentObj.agentCode,
        productId: rootProductId,
        productName: rootProductName,
        quantity: rootQuantity,
        unit: rootUnit,
        destinationCity,
        exactAddress,
        phoneNumber,
        buyerName,
        notes,
        itemsJson: JSON.stringify(finalItems),
        paymentTrackingCode: paymentTrackingCode.trim() || undefined,
        isExportOrder: isExportAllowed ? isExportOrder : false,
        destinationCountry: (isExportAllowed && isExportOrder) ? selectedCountry : undefined,
        deliveryLocationUrl: deliveryLocationUrl.trim() || undefined
      });

      // Reset form fields
      setQuantity(selectedProduct.defaultQuantity || 330);
      setExactAddress('');
      setDeliveryLocationUrl('');
      setPhoneNumber('');
      setNotes('');
      setInvoiceItems([]);
      setBuyerName('');
      setPaymentTrackingCode('');
      setIsExportOrder(false);
      setSuccessMessage('سفارش چندمحصولی شما با موفقیت ثبت شد و به پنل مدیریت فروش ارسال گردید.');
      setIsSubmitting(false);

      setTimeout(() => {
        setSuccessMessage('');
      }, 5000);
    }, 600);
  };

  const getStatusLabelAndColor = (status: OrderStatus) => {
    switch (status) {
      case 'PENDING_APPROVAL':
        return { text: 'در انتظار تایید مدیریت', badge: 'bg-amber-100 text-amber-800 border-amber-200' };
      case 'APPROVED_BY_SALES':
        return { text: 'تایید فروش / در صف اولویت‌بندی', badge: 'bg-indigo-100 text-indigo-800 border-indigo-200' };
      case 'SENT_TO_FACTORY':
        return { text: 'ارسال شده / تأمین کامیون', badge: 'bg-blue-100 text-blue-800 border-blue-200' };
      case 'VEHICLE_ASSIGNED':
        return { text: 'تخصیص وسیله نقلیه (ترابری)', badge: 'bg-amber-100 text-amber-800 border-amber-200' };
      case 'LOADED_AND_DISPATCHED':
        return { text: 'بارگیری شده و در حرکت به مقصد', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
      case 'REJECTED':
        return { text: 'عدم تایید / رد شده', badge: 'bg-rose-100 text-rose-800 border-rose-200' };
      default:
        return { text: 'نامشخص', badge: 'bg-slate-100 text-slate-800 border-slate-200' };
    }
  };

  return (
    <div className="space-y-6 text-right dir-rtl font-sans" id="rep-dashboard">
      
      {/* Top Header: Agent Switcher Simulator (for SALES_MANAGER) or Agency Details Card */}
      <div className="p-3 sm:p-4 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3" id="agent-info-card-header">
        {sandboxEnabled && currentUser?.role === 'SALES_MANAGER' && (
          <div className="bg-emerald-50/70 rounded-xl border border-emerald-100 p-2.5 sm:p-3 mb-2" id="agent-selector-box">
            <label className="block text-xs font-bold text-emerald-800 mb-1 font-sans">📲 شبیه‌ساز ورود به عنوان نمایندگی فروش (مدیر بازرگانی):</label>
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              className="w-full bg-white border border-emerald-200 rounded-xl py-1.5 px-2.5 sm:py-2 sm:px-3 text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-sans cursor-pointer shadow-xs"
              id="agent-dropdown"
            >
              {agents.map((agent) => (
                <option key={agent.id} value={agent.alias} disabled={!agent.isEnabled}>
                  {agent.alias} (کد: {agent.agentCode}) {!agent.isEnabled ? '🛑 (غیرفعال)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center justify-between sm:justify-start gap-2">
            <span className="text-[11px] sm:text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 py-1 px-2.5 sm:py-1.5 sm:px-3 rounded-full font-sans font-bold flex items-center gap-1.5 shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              📲 پنل نمایندگی
            </span>
            {onOpenEditProfile && (
              <button
                type="button"
                onClick={() => onOpenEditProfile(currentAgentObj.id)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500 px-2.5 py-1 sm:px-3.5 sm:py-1.5 rounded-xl text-[11px] sm:text-xs font-black transition-all flex items-center gap-1 cursor-pointer shadow-xs shrink-0"
                title="ویرایش شماره همراه و آدرس دقیق دفتر/انبار نمایندگی"
              >
                <User className="w-3.5 h-3.5 text-emerald-100" />
                <span>✏️ ویرایش آدرس و همراه</span>
              </button>
            )}
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1.5 justify-start sm:justify-end flex-wrap">
              <span className="text-sm sm:text-base font-extrabold text-slate-900">{currentAgentObj?.alias || currentAgentObj?.fullName || 'نامشخص'}</span>
              <span className="text-[11px] sm:text-xs text-slate-500">
                (کد: <strong className="font-mono text-slate-800 font-bold">{currentAgentObj?.agentCode || 'کد خطا'}</strong> • {currentAgentObj?.area || 'سراسر کشور'})
              </span>
            </div>
            <div className="text-[11px] sm:text-xs text-slate-600 mt-1 flex flex-col sm:flex-row items-start sm:items-center justify-start sm:justify-end gap-1 sm:gap-3 bg-slate-50 p-2 rounded-xl border border-slate-150">
              <span className="truncate max-w-full">📞 همراه: <strong className="font-mono text-slate-800 dir-ltr inline-block">{currentAgentObj?.phoneNumber || currentUser?.phoneNumber || 'ثبت‌نشده'}</strong></span>
              <span className="text-slate-300 hidden sm:inline">|</span>
              <span className="truncate max-w-full">📍 آدرس: <strong className="text-slate-800">{currentAgentObj?.address || 'ثبت‌نشده'}</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Tab Navigation Buttons */}
      <div className="bg-slate-200/70 p-1.5 rounded-2xl border border-slate-300/70 shadow-xs flex items-center justify-between gap-2" id="rep-tabs-container">
        <button
          type="button"
          onClick={() => setActiveTab('CREATE')}
          className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'CREATE'
              ? 'bg-white text-emerald-700 shadow-md border border-slate-200 font-black'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-300/50'
          }`}
          id="rep-tab-create"
        >
          <PlusCircle className="w-4 h-4 text-emerald-600" />
          <span>ثبت سفارش جدید</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('TRACKING')}
          className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'TRACKING'
              ? 'bg-white text-emerald-700 shadow-md border border-slate-200 font-black'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-300/50'
          }`}
          id="rep-tab-tracking"
        >
          <ShoppingBag className="w-4 h-4 text-emerald-600" />
          <span>رهگیری و پیگیری سفارشات</span>
          <span className={`text-[11px] py-0.5 px-2.5 rounded-full font-mono font-bold transition-all ${
            activeTab === 'TRACKING' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-300/80 text-slate-700'
          }`}>
            {agentOrders.length}
          </span>
        </button>
      </div>

      {/* TAB 1: FORM TO REGISTER ORDERS */}
      {activeTab === 'CREATE' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 max-w-3xl mx-auto" id="rep-column-form">
          <div id="order-form-container">
            <div className="flex items-center gap-2.5 mb-5 justify-between border-b border-slate-100 pb-4">
              <span className="text-xs text-slate-400">مشخصات کالا و مقصد تخلیه را وارد کنید</span>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-800">فرم ثبت سفارش جدید سفال</h3>
                <PlusCircle className="w-5 h-5 text-emerald-600" />
              </div>
            </div>

            {successMessage && (
              <div className="mb-5 p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex flex-wrap items-center justify-between gap-2 shadow-sm" id="success-alert">
                <button
                  type="button"
                  onClick={() => setActiveTab('TRACKING')}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-3 rounded-lg text-[11px] transition-colors cursor-pointer"
                >
                  مشاهده در لیست سفارشات ←
                </button>
                <div className="flex items-center gap-2">
                  <span>{successMessage}</span>
                  <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Product Select */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">انتخاب محصول سفالی طبرستان:</label>
                <select
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-sans cursor-pointer"
                  id="form-product-select"
                >
                  {products.filter(p => p.isEnabled !== false).map((prod) => (
                    <option key={prod.id} value={prod.id}>
                      {prod.name} ({prod.pricePerUnit.toLocaleString()} تومان / {prod.unit})
                    </option>
                  ))}
                  {products.filter(p => p.isEnabled === false).length > 0 && (
                    <optgroup label="محصولات غیرفعال شده (غیر قابل سفارش)">
                      {products.filter(p => p.isEnabled === false).map((prod) => (
                        <option key={prod.id} value={prod.id} disabled>
                          {prod.name} (عرضه‌ موقتاً متوقف شده)
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <div className="mt-2 text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-150 flex items-start gap-2.5">
                  {selectedProduct.imageUrl ? (
                    <img 
                      src={selectedProduct.imageUrl} 
                      alt={selectedProduct.name} 
                      className="w-10 h-10 object-cover rounded border border-slate-200 shrink-0 shadow-xs"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded bg-amber-50 border border-amber-200/60 flex items-center justify-center shrink-0 text-amber-700 font-bold text-[9px] shadow-xs">
                      سفال
                    </div>
                  )}
                  <div className="flex-1 space-y-0.5 min-w-0">
                    <p>🧱 <strong>توضیحات:</strong> {selectedProduct.description}</p>
                    {selectedProduct.weight && <p>⚖️ <strong>وزن واحد:</strong> {selectedProduct.weight}</p>}
                    {selectedProduct.dimensions && <p>📐 <strong>ابعاد محصول:</strong> {selectedProduct.dimensions}</p>}
                    {selectedProduct.coverageInfo && <p>📊 <strong>تعداد در متراژ:</strong> {selectedProduct.coverageInfo}</p>}
                  </div>
                </div>
              </div>

              {/* Quantity and dynamic stats */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">واحد شمارش:</label>
                  <div className="w-full bg-slate-100 text-slate-600 border border-slate-200 rounded-lg py-2 px-3 text-xs font-mono font-bold text-center">
                    {selectedProduct.unit}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">مقدار سفارش:</label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    placeholder="330"
                    value={quantity || ''}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-center font-mono font-bold"
                    id="form-quantity-input"
                  />
                </div>
              </div>

              {/* Dynamic Conversion to Molds / Production Unit */}
              {(() => {
                const pUnit = selectedProduct.primaryUnit || 'قالب';
                if (selectedProduct.unit !== pUnit) {
                  let ratio = selectedProduct.conversionRatio;
                  if (!ratio && selectedProduct.coverageInfo) {
                    const cleanCov = toEnglishDigits(selectedProduct.coverageInfo);
                    const parsedNum = cleanCov.match(/\d+(?:\.\d+)?/);
                    if (parsedNum) ratio = parseFloat(parsedNum[0]);
                  }
                  if (ratio) {
                    return (
                      <div className="bg-emerald-50/70 text-emerald-950 px-3 py-2 rounded-lg border border-emerald-100 text-[11px] flex justify-between items-center">
                        <span className="text-slate-600 font-bold">تعداد نهایی محصول برای بخش‌های تولید کارخانه:</span>
                        <span className="font-mono font-bold text-emerald-700">
                          {(quantity * ratio).toLocaleString()} {pUnit}
                        </span>
                      </div>
                    );
                  }
                }
                return null;
              })()}

              <button
                type="button"
                onClick={handleAddProductToInvoice}
                className="w-full bg-slate-150 hover:bg-slate-200 border border-slate-300 text-slate-700 font-bold py-2.5 px-4 rounded-xl text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <PlusCircle className="w-4 h-4 text-emerald-600" />
                <span>افزودن این محصول به لیست اقلام فاکتور</span>
              </button>

              {/* List of current built invoice items */}
              {invoiceItems.length > 0 && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                  <span className="text-[10px] text-slate-500 font-bold block">اقلام فاکتور ثبت شده در سفارش جاری:</span>
                  <div className="space-y-1.5">
                    {invoiceItems.map((item, index) => (
                      <div key={item.id} className="flex justify-between items-center text-[10px] bg-white border border-slate-100 px-3 py-1.5 rounded shadow-sm gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {item.imageUrl && (
                            <img src={item.imageUrl} alt={item.productName} className="w-6 h-6 object-cover rounded border border-slate-200 shrink-0" referrerPolicy="no-referrer" />
                          )}
                          <strong className="text-slate-800 truncate">{item.productName}</strong>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-slate-600 font-mono">
                            {item.quantity.toLocaleString()} {item.unit} × {item.pricePerUnit.toLocaleString()} تومان
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setInvoiceItems(invoiceItems.filter((_, i) => i !== index));
                            }}
                            className="text-rose-500 hover:text-rose-700 font-bold cursor-pointer p-0.5"
                            title="حذف این الگو"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between items-center text-[11px] font-bold text-emerald-800 bg-emerald-50/50 p-2 rounded">
                    <span>جمع کل پیش‌فاکتور چندمحصولی:</span>
                    <span className="font-mono text-emerald-700">{invoiceItems.reduce((sum, item) => sum + item.quantity * item.pricePerUnit, 0).toLocaleString()} تومان</span>
                  </div>
                </div>
              )}

              {/* Simulated Live Cost Calculation */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-150 flex justify-between items-center text-xs">
                <span className="text-slate-600 font-bold">مجموع تقریبی پیش‌فاکتور خرید:</span>
                <span className="text-emerald-700 font-black font-mono text-sm">
                  {invoiceItems.length > 0
                    ? invoiceItems.reduce((sum, item) => sum + item.quantity * item.pricePerUnit, 0).toLocaleString()
                    : estimatedPrice.toLocaleString()
                  } تومان
                </span>
              </div>

              {/* Destination lookup / Inputs */}
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">مشخصات خریدار (نام/نام خانوادگی یا نام شرکت): <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: جناب آقای حسینی / شرکت پارس بتن..."
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-sans"
                    id="form-buyer-name-input"
                  />
                </div>

                {/* Export Agent Checkbox Toggle Option (Only for designated Export Representatives) */}
                {isExportAllowed && (
                  <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 shadow-xs">
                    <label htmlFor="exportOrderCheckbox" className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        id="exportOrderCheckbox"
                        checked={isExportOrder}
                        onChange={(e) => setIsExportOrder(e.target.checked)}
                        className="w-4.5 h-4.5 text-sky-600 rounded border-sky-300 focus:ring-sky-500 cursor-pointer accent-sky-600"
                      />
                      <div className="flex items-center gap-1.5 text-xs font-bold text-sky-950">
                        <Globe className="w-4 h-4 text-sky-600" />
                        <span>ثبت سفارش صادراتی (ارسال به خارج از کشور)</span>
                      </div>
                      <span className="bg-sky-100 text-sky-800 text-[10px] px-2 py-0.5 rounded-full font-bold mr-auto">
                        مجاز به صادرات
                      </span>
                    </label>
                    <p className="text-[10px] text-sky-700 mt-1 mr-7 leading-relaxed">
                      با فعال‌سازی این تیک، لیست کشورهای مقصد صادراتی و گمرک‌های خروجی جایگزین استان‌ها و شهرهای داخلی خواهد شد.
                    </p>
                  </div>
                )}

                {/* Conditional Destination Selector: Export vs Domestic */}
                {isExportAllowed && isExportOrder ? (
                  <div className="bg-sky-50/80 border border-sky-200/90 rounded-xl p-3 space-y-2.5 animate-fadeIn">
                    <div className="flex items-center justify-between text-sky-950 text-xs font-bold">
                      <span className="flex items-center gap-1.5">
                        <Globe className="w-4 h-4 text-sky-600" />
                        <span>انتخاب کشور مقصد و مرز خروجی صادراتی</span>
                      </span>
                      <span className="text-[10px] bg-sky-100 text-sky-800 px-2 py-0.5 rounded-full font-bold">
                        صادرات بین‌المللی
                      </span>
                    </div>

                    <p className="text-[11px] text-sky-800 leading-snug">
                      🌍 <strong>کشور مقصد و گمرک خروجی:</strong>{' '}
                      <span className="text-[10px] text-slate-600">سفارشات صادراتی از طریق گمرکات رسمی خروجی ترانزیت و تحویل نهایی خواهند شد.</span>
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">کشور مقصد صادراتی:</label>
                        <select
                          value={selectedCountry}
                          onChange={(e) => setSelectedCountry(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg py-2 px-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 font-sans cursor-pointer"
                          id="form-country-select"
                        >
                          {EXPORT_COUNTRIES.map(c => (
                            <option key={c.name} value={c.name}>{c.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">مرز رسمی / گمرک خروجی:</label>
                        <select
                          value={selectedBorder}
                          onChange={(e) => setSelectedBorder(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg py-2 px-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 font-sans cursor-pointer"
                          id="form-border-select"
                        >
                          {allowedBorders.map(borderName => (
                            <option key={borderName} value={borderName}>{borderName}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-3 space-y-2.5">
                    <div className="flex items-center justify-between text-emerald-950 text-xs font-bold">
                      <span className="flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-emerald-600" />
                        <span>انتخاب استان و شهر مقصد (محدوده مجاز نمایندگی)</span>
                      </span>
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                        {agentTerritories.length > 0 ? 'محدوده اختصاصی' : 'سراسر کشور'}
                      </span>
                    </div>

                    <p className="text-[11px] text-emerald-800 leading-snug">
                      📍 <strong>محدوده مجاز فعالیت نمایندگی شما:</strong>{' '}
                      <span className="font-bold underline">{formatTerritoriesSummary(agentTerritories)}</span>
                      <br />
                      <span className="text-[10px] text-slate-500">طبق قوانین شرکت، سفارشات خرید شما صرفاً جهت تخلیه در شهرهای محدوده نمایندگی قابل ثبت می‌باشند.</span>
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">استان مقصد بارگیری / تخلیه:</label>
                        <select
                          value={selectedProvince}
                          onChange={(e) => setSelectedProvince(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg py-2 px-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-sans cursor-pointer"
                          id="form-province-select"
                        >
                          {allowedProvinces.map(p => (
                            <option key={p.name} value={p.name}>{p.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">شهر مقصد تخلیه بار:</label>
                        <select
                          value={selectedCity}
                          onChange={(e) => setSelectedCity(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg py-2 px-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-sans cursor-pointer"
                          id="form-city-select"
                        >
                          {allowedCities.map(cityName => (
                            <option key={cityName} value={cityName}>{cityName}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">آدرس دقیق کارگاهی جهت تخلیه بار:</label>
                  <textarea
                    rows={2}
                    required
                    placeholder="مثال: تهران، خیابان آزادی، خیابان حبیب‌اللهی، پلاک ۴۵، انبار مرکزی پروژه خریدار..."
                    value={exactAddress}
                    onChange={(e) => setExactAddress(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder-slate-400 font-sans"
                    id="form-address-textarea"
                  />
                </div>

                {/* Delivery Location GPS/Map Input (Optional) */}
                <div className="bg-sky-50/70 border border-sky-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <label className="block text-xs font-bold text-sky-950 flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-sky-600" />
                      <span>لینک لوکیشن یا مختصات نقشه تخلیه بار</span>
                      <span className="text-[10px] text-slate-500 font-normal">(اختیاری)</span>
                    </label>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setIsFormMapPickerOpen(true)}
                        className="text-[10px] bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-1 rounded-md flex items-center gap-1 font-extrabold transition-all shadow-xs"
                      >
                        <Map className="w-3 h-3 text-rose-100" />
                        <span>🗺️ انتخاب روی نقشه تعاملی</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleGetCurrentLocation}
                        className="text-[10px] bg-white hover:bg-sky-100 text-sky-800 border border-sky-300 px-2 py-1 rounded-md flex items-center gap-1 font-bold transition-all shadow-xs"
                      >
                        <Navigation className="w-3 h-3 text-sky-600" />
                        <span>📌 GPS کنونی</span>
                      </button>
                    </div>
                  </div>

                  <input
                    type="text"
                    placeholder="مثال: https://maps.google.com/?q=35.6997,51.3380 یا لینک نشان/بلد..."
                    value={deliveryLocationUrl}
                    onChange={(e) => setDeliveryLocationUrl(e.target.value)}
                    className="w-full bg-white border border-sky-200 rounded-lg py-1.5 px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 font-sans text-left dir-ltr placeholder-slate-400"
                    id="form-location-input"
                  />
                  <p className="text-[10px] text-sky-800 flex items-center justify-between">
                    <span>💡 این لینک جهت مسیریابی آسان به راننده حامل بار ارسال خواهد شد.</span>
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">تلفن خریدار:</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: ۰۹۱۲۳۴۵۶۷۸۹"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-sans text-right placeholder-slate-400"
                    id="form-phone-input"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">کد رهگیری فیش واریز بانکی پیش‌پرداخت (اختیاری):</label>
                  <input
                    type="text"
                    placeholder="مثال: ۹۰۸۷۱۲۳۴۸۷۱"
                    value={paymentTrackingCode}
                    onChange={(e) => setPaymentTrackingCode(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-center tracking-widest"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">ملاحظات و توضیحات ترابری (اختیاری):</label>
                  <input
                    type="text"
                    placeholder="مثال: هماهنگی قبل از ارسال، تحویل فقط عصرها، جاده خاکی است..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder-slate-400 font-sans"
                    id="form-notes-input"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-xl text-xs transition-colors duration-200 cursor-pointer flex items-center justify-center gap-2 disabled:bg-slate-400"
                id="form-submit-btn"
              >
                {isSubmitting ? 'در حال برقراری ارتباط با سرور...' : 'تایید نهایی و ثبت حواله سفارش'}
                <PlusCircle className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 2: LIVE TRACKING AND LIST OF ORDERS */}
      {activeTab === 'TRACKING' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6" id="agent-orders-card">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 mb-5 gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs bg-slate-100 text-slate-700 border border-slate-200 py-1 px-2.5 rounded-full font-mono font-bold">
                {searchQuery ? `نمایش ${filteredAgentOrders.length} از ${agentOrders.length} سفارش` : `${agentOrders.length} سفارش`}
              </span>
              {filteredAgentOrders.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => expandAllOrders(filteredAgentOrders)}
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
                </>
              )}
              <button
                type="button"
                onClick={() => setActiveTab('CREATE')}
                className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 py-1 px-3 rounded-full text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>+ ثبت سفارش جدید</span>
              </button>
            </div>
            <div className="flex items-center gap-2 justify-end">
              <h3 className="text-lg font-bold text-slate-800">پیگیری سفـارشات جاری نمایندگی</h3>
              <ShoppingBag className="w-5 h-5 text-emerald-600" />
            </div>
          </div>

          {/* Search Box */}
          {agentOrders.length > 0 && (
            <div className="mb-5 relative">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="جستجوی سریع سفارش (بر اساس کد رهگیری، شماره فاکتور، نام خریدار، محصول، شهر مقصد...)"
                  className="w-full bg-slate-50 border border-slate-300 focus:border-emerald-500 rounded-xl py-2.5 pr-10 pl-9 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all font-sans"
                />
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full"
                    title="پاک کردن جستجو"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}

          {agentOrders.length === 0 ? (
            <div className="text-center py-16 bg-slate-50 rounded-2xl border border-dashed border-slate-200" id="empty-agent-orders">
              <Sparkles className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-700 text-sm font-bold">هیچ سفارشی برای این نمایندگی ثبت نشده است.</p>
              <p className="text-slate-400 text-xs mt-1 mb-4">می‌توانید با کلیک روی دکمه زیر اولین سفارش خود را ثبت کنید.</p>
              <button
                type="button"
                onClick={() => setActiveTab('CREATE')}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-5 rounded-xl text-xs transition-colors cursor-pointer inline-flex items-center gap-2"
              >
                <PlusCircle className="w-4 h-4" />
                <span>ثبت اولین سفارش جدید</span>
              </button>
            </div>
          ) : filteredAgentOrders.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-2xl border border-slate-200">
              <Search className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-700 text-sm font-bold">هیچ سفارشی مطابق عبارت «{searchQuery}» پیدا نشد.</p>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-3 text-xs text-emerald-600 font-bold hover:underline cursor-pointer"
              >
                پاکسازی عبارت جستجو
              </button>
            </div>
          ) : (
            <div className="space-y-3" id="agent-orders-sequence">
              {filteredAgentOrders.map((order) => {
                const statusDetails = getStatusLabelAndColor(order.status);
                const isExpanded = !!expandedOrderIds[order.id];

                // Product summary string
                let productSummaryText = `${order.productName} (${order.quantity.toLocaleString()} ${order.unit})`;
                if (order.itemsJson) {
                  try {
                    const parsed = JSON.parse(order.itemsJson);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                      productSummaryText = parsed.map((item: any) => `${item.productName}: ${item.quantity?.toLocaleString()} ${item.unit || order.unit}`).join(' | ');
                    }
                  } catch (e) {}
                }

                if (order.hasPendingEdit && order.pendingEditData) {
                  try {
                    const pData = JSON.parse(order.pendingEditData);
                    let pQty = pData.quantity;
                    if (!pQty && pData.itemsJson) {
                      const pItems = JSON.parse(pData.itemsJson);
                      pQty = pItems.reduce((s: number, i: any) => s + (Number(i.quantity) || 0), 0);
                    }
                    if (pQty && pQty !== order.quantity) {
                      productSummaryText += ` ⬅️ [مقدار اصلاحی جدید: ${pQty.toLocaleString()} ${order.unit}]`;
                    }
                  } catch (e) {}
                }

                return (
                  <div 
                    key={order.id} 
                    className={`border rounded-2xl transition-all bg-white shadow-2xs overflow-hidden ${
                      isExpanded ? 'border-slate-300 ring-2 ring-emerald-100/80 p-4 md:p-5 space-y-4' : 'border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/50 p-3 md:p-3.5'
                    }`}
                    id={`order-card-${order.id}`}
                  >
                    {/* Compact Header Summary Row (Always visible & clickable) */}
                    <div 
                      onClick={() => toggleExpandOrder(order.id)}
                      className="flex flex-wrap items-center justify-between gap-2.5 cursor-pointer select-none text-right"
                    >
                      {/* Right Group: Order #, Customer/Buyer, Destination */}
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
                        <span className="text-[11px] text-slate-500 font-bold bg-slate-100/80 px-2 py-0.5 rounded-md flex items-center gap-0.5">
                          📍 {order.destinationCity}
                        </span>
                      </div>

                      {/* Middle Group: Main Product Summary */}
                      <div className="hidden lg:flex items-center text-[11px] text-slate-600 font-medium truncate max-w-[280px]">
                        <span className="truncate">📦 {productSummaryText}</span>
                      </div>

                      {/* Left Group: Status Badge, Export Badge, Expand Button */}
                      <div className="flex items-center gap-2 shrink-0">
                        {order.isExportOrder && (
                          <span className="text-[10px] bg-sky-100 text-sky-900 font-bold border border-sky-200/80 py-0.5 px-2 rounded-full hidden md:inline-flex items-center gap-1">
                            <Globe className="w-3 h-3 text-sky-600" />
                            صادرات ({order.destinationCountry || 'خارجی'})
                          </span>
                        )}

                        {order.hasPendingEdit && (
                          <span className="text-[10px] bg-amber-100 text-amber-900 border border-amber-300 py-0.5 px-2 rounded-full font-bold flex items-center gap-1 animate-pulse">
                            ⚠️ اصلاحیه در انتظار تایید
                          </span>
                        )}

                        <span className={`text-[10px] font-bold border py-0.5 px-2.5 rounded-full ${statusDetails.badge}`}>
                          {statusDetails.text}
                        </span>

                        {order.status !== 'REJECTED' && order.status !== 'LOADED_AND_DISPATCHED' ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditModal(order);
                            }}
                            className="bg-amber-50 hover:bg-amber-100 text-amber-900 text-[11px] font-bold px-2 py-1 rounded-lg border border-amber-200/80 flex items-center gap-1 transition-all cursor-pointer"
                            title="ویرایش مشخصات این سفارش قبل از صدور ترخیص"
                          >
                            <Edit className="w-3.5 h-3.5 text-amber-700" />
                            <span>ویرایش</span>
                          </button>
                        ) : order.status === 'LOADED_AND_DISPATCHED' ? (
                          <span className="text-[10px] bg-slate-100 text-slate-500 font-medium py-0.5 px-2 rounded-lg border border-slate-200" title="امکان ویرایش پس از ترخیص وجود ندارد">
                            🔒 ترخیص‌شده
                          </span>
                        ) : null}

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
                        
                        {/* Banner if order has pending edit */}
                        {order.hasPendingEdit && (() => {
                          let pendingInfo: any = null;
                          try {
                            pendingInfo = JSON.parse(order.pendingEditData || '{}');
                          } catch (e) {}

                          let requestedQty = pendingInfo?.quantity;
                          if (!requestedQty && pendingInfo?.itemsJson) {
                            try {
                              const items = JSON.parse(pendingInfo.itemsJson);
                              requestedQty = items.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 0), 0);
                            } catch (e) {}
                          }

                          return (
                            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-950 text-xs flex items-start gap-2.5">
                              <span className="text-base mt-0.5">⚠️</span>
                              <div className="space-y-1">
                                <span className="font-bold block text-slate-900">اصلاحیه جدید جهت تایید مدیر بازرگانی ارسال شده است:</span>
                                {requestedQty && requestedQty !== order.quantity ? (
                                  <p className="text-amber-900 font-bold text-[11.5px]">
                                    مقدار قبلی: <span className="line-through text-slate-500 font-mono">{order.quantity?.toLocaleString()}</span> ⬅️ مقدار جدید اصلاحی درخواستی: <span className="text-emerald-800 font-mono text-xs bg-emerald-100 px-1.5 py-0.5 rounded font-black">{requestedQty?.toLocaleString()}</span> {order.unit}
                                  </p>
                                ) : null}
                                <p className="text-[11px] text-amber-800 leading-relaxed">
                                  تغییرات فوق در کارتابل مدیر بازرگانی قرار دارد و به محض تایید ایشان، فاکتور نهایی ویرایش خواهد شد. نوبت و اولویت صف سفارش کاملاً محفوظ است.
                                </p>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Header line inside expanded view with cancel button */}
                        <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-[11px] font-bold border py-1 px-2.5 rounded-full ${statusDetails.badge}`}>
                              {statusDetails.text}
                            </span>
                            {order.isExportOrder && (
                              <span className="text-[10px] bg-sky-100 text-sky-900 font-bold border border-sky-200/80 py-1 px-2.5 rounded-full flex items-center gap-1">
                                <Globe className="w-3 h-3 text-sky-600" />
                                سفارش صادراتی ({order.destinationCountry || 'خارجی'})
                              </span>
                            )}
                            {order.status !== 'REJECTED' && order.status !== 'LOADED_AND_DISPATCHED' && (
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(order)}
                                className="bg-amber-50 hover:bg-amber-100 text-amber-800 text-[10px] py-1 px-2.5 rounded font-bold transition-all border border-amber-200/80 flex items-center gap-1 cursor-pointer"
                              >
                                <Edit className="w-3 h-3 text-amber-700" />
                                <span>ویرایش مشخصات سفارش</span>
                              </button>
                            )}
                            {['PENDING_APPROVAL', 'APPROVED_BY_SALES'].includes(order.status) && (
                              <button
                                type="button"
                                onClick={() => {
                                  askConfirm(
                                    'کنسل کردن سفارش خرید',
                                    'آیا مایل هستید درخواست این سفارش را لغو و مسدود نمایید؟',
                                    () => {
                                      onCancelOrder(order.id);
                                    }
                                  );
                                }}
                                className="bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px] py-1 px-2.5 rounded font-bold transition-all border border-rose-100 cursor-pointer"
                              >
                                کنسل کردن سفارش
                              </button>
                            )}
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-mono font-bold text-slate-800">شماره سفارش: {order.orderNumber}</span>
                            <span className="text-[10px] text-slate-400 mr-2 font-mono">({new Date(order.createdAt).toLocaleDateString('fa-IR')})</span>
                          </div>
                        </div>

                        {/* Order details summary */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs" id={`details-grid-${order.id}`}>
                          {order.itemsJson ? (
                            <div className="md:col-span-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-right space-y-1">
                              <span className="text-slate-400 font-bold block text-[9.5px] border-b border-slate-200 pb-1 mb-1">اقلام سبد خرید فاکتور چندمحصولی:</span>
                              {(() => {
                                try {
                                  const parsed = JSON.parse(order.itemsJson);
                                  if (Array.isArray(parsed)) {
                                    return parsed.map((item: any, i: number) => (
                                      <div key={i} className="flex justify-between text-[11px] text-slate-700">
                                        <strong className="text-slate-800">{item.productName}</strong>
                                        <span className="font-mono">{item.quantity.toLocaleString()} {item.unit} × {item.pricePerUnit.toLocaleString()} تومان</span>
                                      </div>
                                    ));
                                  }
                                } catch(e) {}
                                return <strong className="text-slate-800">{order.productName}</strong>;
                              })()}
                            </div>
                          ) : (
                            <div>
                              <span className="text-slate-400 block mb-0.5">محصول سفارش داده شده:</span>
                              <strong className="text-slate-800 block text-[11px]">{order.productName}</strong>
                            </div>
                          )}

                          {!order.itemsJson && (
                            <div>
                              <span className="text-slate-400 block mb-0.5">مقدار حواله خرید:</span>
                              <strong className="text-slate-800 block font-mono text-[11px]">
                                {order.quantity.toLocaleString()} {order.unit}
                                {(() => {
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
                                          <span className="text-[10px] text-emerald-600 block font-sans font-normal mt-0.5">
                                            ({(order.quantity * ratio).toLocaleString()} {pUnit} تولید)
                                          </span>
                                        );
                                      }
                                    }
                                  }
                                  return null;
                                })()}
                              </strong>
                            </div>
                          )}

                          <div>
                            <span className="text-slate-400 block mb-0.5">شهرستان مقصد:</span>
                            <strong className="text-slate-800 block text-[11px]">{order.destinationCity}</strong>
                          </div>

                          {order.buyerName && (
                            <div>
                              <span className="text-slate-400 block mb-0.5">مشخصات خریدار:</span>
                              <strong className="text-emerald-800 block text-[11px]">{order.buyerName}</strong>
                            </div>
                          )}
                        </div>

                        {/* Payment Tracking Code Integration */}
                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 flex items-center justify-between text-xs flex-wrap gap-2 text-right">
                          <div className="flex items-center gap-1">
                            <Coins className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-slate-500 text-[10px]">کد رهگیری واریز پیش‌پرداخت مالی:</span>
                          </div>
                          {order.paymentTrackingCode ? (
                            <span className="font-mono bg-emerald-100 text-emerald-900 px-2.5 py-0.5 rounded font-bold block">{order.paymentTrackingCode}</span>
                          ) : (
                            order.status !== 'REJECTED' ? (
                              <div className="flex gap-1.5 items-center">
                                <input
                                  type="text"
                                  id={`tracking-${order.id}`}
                                  placeholder="کد فیش واریز..."
                                  className="bg-white border border-slate-200 rounded px-2 py-1 text-[10px] font-mono text-center focus:outline-none focus:ring-1 focus:ring-emerald-500 w-32 font-bold"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const inp = document.getElementById(`tracking-${order.id}`) as HTMLInputElement;
                                    if (inp && inp.value.trim()) {
                                      onUpdatePaymentTracking(order.id, inp.value.trim());
                                      showToast('کد واریزی با موفقیت به حواله اضافه شد.', 'success');
                                    } else {
                                      showToast('لطفا کد معتبر وارد فرمایید.', 'error');
                                    }
                                  }}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-[9.5px] px-2.5 py-1.5 rounded transition-colors cursor-pointer font-bold"
                                >
                                  ثبت فیش
                                </button>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[10px]">بدون اطلاعات واریزی</span>
                            )
                          )}
                        </div>


                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/50" id={`stepper-${order.id}`}>
                          <h4 className="text-xs font-bold text-slate-600 mb-4 flex items-center justify-end gap-1.5">
                            <span>مراحل طی شده کارتابل مأموریت</span>
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                          </h4>

                          {/* Stepper visuals */}
                          <div className="relative flex items-center justify-between px-2 pt-1 pb-2">
                            {/* Connecting background bar */}
                            <div className="absolute left-[8%] right-[8%] top-[20px] h-1 bg-slate-200 -z-0" />
                            
                            {/* Dynamic Progress indicator overlay */}
                            <div 
                              className="absolute left-[8%] top-[20px] h-1 bg-emerald-500 transition-all duration-500 -z-0" 
                              style={{
                                right: 
                                  order.status === 'PENDING_APPROVAL' ? '92%' :
                                  order.status === 'APPROVED_BY_SALES' ? '64%' :
                                  order.status === 'VEHICLE_ASSIGNED' ? '36%' : 
                                  order.status === 'LOADED_AND_DISPATCHED' ? '8%' : 
                                  '92%' // Rejected or pending
                              }}
                            />

                            {/* Step 1: PENDING_APPROVAL */}
                            <div className="flex flex-col items-center relative z-10 text-center w-1/4">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                                order.status !== 'REJECTED' ? 'bg-emerald-50 border-emerald-500 text-emerald-600' : 'bg-slate-100 border-slate-300 text-slate-400'
                              }`}>
                                <FileText className="w-4 h-4" />
                              </div>
                              <span className="text-[10px] font-bold text-slate-700 mt-2">ثبت اولیه</span>
                            </div>

                            {/* Step 2: APPROVED_BY_SALES */}
                            <div className="flex flex-col items-center relative z-10 text-center w-1/4">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                                ['APPROVED_BY_SALES', 'VEHICLE_ASSIGNED', 'LOADED_AND_DISPATCHED'].includes(order.status)
                                  ? 'bg-emerald-50 border-emerald-500 text-emerald-600'
                                  : 'bg-white border-slate-200 text-slate-400'
                              }`}>
                                <CheckCircle className="w-4 h-4" />
                              </div>
                              <span className="text-[10px] font-bold text-slate-600 mt-2">تایید فروش</span>
                            </div>

                            {/* Step 3: VEHICLE_ASSIGNED */}
                            <div className="flex flex-col items-center relative z-10 text-center w-1/4">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                                ['VEHICLE_ASSIGNED', 'LOADED_AND_DISPATCHED'].includes(order.status)
                                  ? 'bg-emerald-50 border-emerald-500 text-emerald-600'
                                  : 'bg-white border-slate-200 text-slate-400'
                              }`}>
                                <Truck className="w-4 h-4" />
                              </div>
                              <span className="text-[10px] font-bold text-slate-600 mt-2">تخصیص ماشین</span>
                            </div>

                            {/* Step 4: LOADED_AND_DISPATCHED */}
                            <div className="flex flex-col items-center relative z-10 text-center w-1/4">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                                order.status === 'LOADED_AND_DISPATCHED'
                                  ? 'bg-emerald-600 border-emerald-600 text-white'
                                  : 'bg-white border-slate-200 text-slate-400'
                              }`}>
                                <Navigation className="w-4 h-4" />
                              </div>
                              <span className="text-[10px] font-bold text-slate-600 mt-2">بارگیری و حرکت</span>
                            </div>
                          </div>

                          {/* Display warning if rejected */}
                          {order.status === 'REJECTED' && (
                            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-center justify-end gap-2" id={`reject-msg-${order.id}`}>
                              <span>علت رد سفارش: {order.rejectionReason || 'عدم هماهنگی مالی سقف اعتبار نمایندگی.'}</span>
                              <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            </div>
                          )}

                          {/* Vehicle assignment information block */}
                          {order.vehicleDetails && (
                            <div 
                              className="mt-4 p-4 bg-white border border-emerald-100 rounded-xl shadow-sm text-right flex flex-col justify-between gap-3 text-xs"
                              id={`vehicle-card-${order.id}`}
                            >
                              <div className="border-b border-dashed border-slate-100 pb-2.5 flex items-center justify-between">
                                <span className="bg-emerald-500 text-white text-[10px] py-0.5 px-2 rounded-full font-bold">ماشین بارگیری شد</span>
                                <span className="font-bold text-slate-700 flex items-center gap-1">
                                  <span>مشخصات کامیون ارسالی کارخانه</span>
                                  <Truck className="w-3.5 h-3.5 text-emerald-600" />
                                </span>
                              </div>

                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-slate-600">
                                <div>
                                  <span className="text-slate-400 text-[10px] block">نوع وسیله نقلیه:</span>
                                  <span className="font-bold text-slate-800">{order.vehicleDetails.vehicleType}</span>
                                </div>
                                <div>
                                  <span className="text-slate-400 text-[10px] block">باربری همکار:</span>
                                  <span className="font-bold text-slate-800">{order.vehicleDetails.shippingAgency}</span>
                                </div>
                                <div>
                                  <span className="text-slate-400 text-[10px] block">نام راننده:</span>
                                  <span className="font-bold text-slate-800">{order.vehicleDetails.driverName}</span>
                                </div>
                                <div>
                                  <span className="text-slate-400 text-[10px] block">تلفن راننده:</span>
                                  <a href={`tel:${order.vehicleDetails.driverPhone}`} className="text-emerald-600 font-mono font-bold hover:underline block">{order.vehicleDetails.driverPhone}</a>
                                </div>
                              </div>

                              {/* License Plate Graphic Display */}
                              <div className="mt-2.5 flex items-center sm:justify-start justify-end gap-3 flex-wrap">
                                <div className="border-2 border-slate-800 rounded flex overflow-hidden font-bold h-9 items-center bg-white" id={`plate-${order.id}`}>
                                  <div className="bg-blue-800 text-white text-[10px] px-2.5 h-full flex flex-col items-center justify-center">
                                    <span className="text-[8px] leading-3 uppercase">I.R.</span>
                                    <span className="text-[7px] leading-3">IRAN</span>
                                  </div>
                                  <div className="px-3.5 text-sm tracking-widest text-slate-900 font-mono flex gap-1 h-full items-center">
                                    {(order.vehicleDetails.licensePlate || '').split(' ').map((term, index) => (
                                      <span key={index}>{term}</span>
                                    ))}
                                  </div>
                                </div>
                                <div className="text-right text-[11px] text-slate-500">
                                  🚚 پلاک راننده اختصاصی (همگام برخط) • تاریخ مقرر بارگیری: <strong>{order.vehicleDetails.estimatedArrival || new Date().toLocaleDateString('fa-IR')}</strong>
                                </div>
                              </div>

                              {/* Location Send Button for Driver */}
                              <div className="mt-3 flex items-center justify-between bg-sky-50/80 p-2.5 rounded-xl border border-sky-200">
                                <div className="flex items-center gap-2 text-xs text-sky-950">
                                  <MapPin className="w-4 h-4 text-sky-600 shrink-0" />
                                  <div>
                                    <span className="font-bold">موقعیت نقشه تخلیه بار: </span>
                                    <span className="text-[11px] text-slate-600">
                                      {order.deliveryLocationUrl ? 'ثبت شده روی نقشه' : 'لینک مستقیم هنوز ثبت نشده'}
                                    </span>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => setSelectedLocationOrder(order)}
                                  className="bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                                >
                                  <Send className="w-3.5 h-3.5" />
                                  <span>📲 ارسال لوکیشن به راننده</span>
                                </button>
                              </div>
                            </div>
                          )}
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

      {/* Location Modal */}
      {selectedLocationOrder && (
        <SendLocationModal
          isOpen={!!selectedLocationOrder}
          onClose={() => setSelectedLocationOrder(null)}
          order={selectedLocationOrder}
          onSaveLocation={onSaveLocation}
          onShowToast={showToast}
        />
      )}

      {/* Form Map Picker Modal */}
      <InteractiveMapPicker
        isOpen={isFormMapPickerOpen}
        onClose={() => setIsFormMapPickerOpen(false)}
        cityHint={destinationCity}
        onConfirmLocation={(url) => {
          setDeliveryLocationUrl(url);
          showToast('موقعیت مکانی جدید روی نقشه انتخاب شد.', 'success');
        }}
      />

      {/* Edit Order Modal */}
      {editingOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-5 space-y-4 shadow-2xl border border-slate-200 animate-scale-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Edit className="w-5 h-5 text-amber-600" />
                <h3 className="font-bold text-slate-800 text-base">
                  ویرایش مشخصات سفارش شماره #{editingOrder.orderNumber}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingOrder(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-950 text-xs leading-relaxed space-y-1">
              <span className="font-bold block">📌 راهنمای ویرایش سفارش:</span>
              <p>ویرایش سفارش در هر مرحله‌ای قابل انجام است و هیچ‌گونه تاثیری در نوبت، اولویت صف بارگیری یا شماره سفارش ندارد.</p>
              <p className="text-amber-800 font-semibold">تغییرات شما پس از ثبت، به کارتابل مدیر بازرگانی ارسال شده و پس از تایید ایشان اعمال خواهد شد.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">نام خریدار / تحویل گیرنده:</label>
                <input
                  type="text"
                  value={editBuyerName}
                  onChange={e => setEditBuyerName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">شماره تماس تحویل گیرنده:</label>
                <input
                  type="text"
                  value={editPhoneNumber}
                  onChange={e => setEditPhoneNumber(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 focus:outline-none focus:border-amber-500 font-mono dir-ltr text-right"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">شهر مقصد:</label>
                <input
                  type="text"
                  value={editDestinationCity}
                  onChange={e => setEditDestinationCity(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">نوع ناوگان باربری درخواستی:</label>
                <select
                  value={editVehicleType}
                  onChange={e => setEditVehicleType(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 focus:outline-none focus:border-amber-500 font-bold"
                >
                  <option value="تریلی">تریلی کفی / کانتینر</option>
                  <option value="کامیون جفت">کامیون جفت (۱۰ چرخ)</option>
                  <option value="کامیون تک">کامیون تک (۶ چرخ)</option>
                  <option value="خاور">خاور / نیسان / مسقف</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-slate-700 font-bold mb-1">آدرس دقیق تخلیه بار:</label>
                <textarea
                  value={editExactAddress}
                  onChange={e => setEditExactAddress(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-700 font-bold">لینک یا مختصات دقیق روی نقشه:</label>
                  <button
                    type="button"
                    onClick={() => setIsEditMapPickerOpen(true)}
                    className="text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 text-[11px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>انتخاب روی نقشه</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={editDeliveryLocationUrl}
                  onChange={e => setEditDeliveryLocationUrl(e.target.value)}
                  placeholder="https://maps.google.com/..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 focus:outline-none focus:border-amber-500 font-mono text-left dir-ltr"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-slate-700 font-bold mb-1">شماره فیش / کد پیگیری پرداخت:</label>
                <input
                  type="text"
                  value={editPaymentTrackingCode}
                  onChange={e => setEditPaymentTrackingCode(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div className="md:col-span-2 space-y-2 border-t border-slate-100 pt-3 mt-1">
                <span className="font-bold text-slate-800 block">اقلام و مقادیر سفارش:</span>
                {editItems.map((item, index) => (
                  <div key={item.id} className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                    <select
                      value={item.productId}
                      onChange={e => {
                        const prod = products.find(p => p.id === e.target.value);
                        const next = [...editItems];
                        next[index].productId = e.target.value;
                        if (prod) {
                          next[index].productName = prod.name;
                          next[index].unit = prod.unit;
                        }
                        setEditItems(next);
                      }}
                      className="bg-white border border-slate-300 rounded-lg p-1.5 text-xs font-bold flex-1"
                    >
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name} {p.code ? `(${p.code})` : ''}</option>
                      ))}
                    </select>

                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={e => {
                          const next = [...editItems];
                          next[index].quantity = Math.max(1, parseInt(e.target.value) || 1);
                          setEditItems(next);
                        }}
                        className="w-20 bg-white border border-slate-300 rounded-lg p-1.5 text-xs text-center font-bold"
                      />
                      <span className="text-[11px] text-slate-500">{item.unit}</span>
                    </div>

                    {editItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setEditItems(editItems.filter((_, idx) => idx !== index))}
                        className="text-rose-600 hover:text-rose-800 p-1 text-sm font-bold cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => {
                    const firstProd = products[0];
                    setEditItems([...editItems, {
                      id: `edit-item-${Date.now()}`,
                      productId: firstProd?.id || 'prod-1',
                      productName: firstProd?.name || 'محصول',
                      quantity: 10,
                      unit: firstProd?.unit || 'عدد',
                      pricePerUnit: 0
                    }]);
                  }}
                  className="text-sky-700 bg-sky-50 hover:bg-sky-100 text-[11px] font-bold px-3 py-1.5 rounded-lg border border-sky-200 cursor-pointer"
                >
                  + افزودن قلم جدید به سفارش
                </button>
              </div>

              <div className="md:col-span-2">
                <label className="block text-slate-700 font-bold mb-1">یادداشت / توضیحات تکمیلی:</label>
                <textarea
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingOrder(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleSaveOrderEdit}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5 shadow-md shadow-amber-600/20"
              >
                <Check className="w-4 h-4" />
                <span>ثبت اصلاحیه و ارسال برای مدیر بازرگانی</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Map Picker Modal */}
      <InteractiveMapPicker
        isOpen={isEditMapPickerOpen}
        onClose={() => setIsEditMapPickerOpen(false)}
        cityHint={editDestinationCity}
        onConfirmLocation={(url) => {
          setEditDeliveryLocationUrl(url);
          showToast('موقعیت مکانی اصلاحیه روی نقشه ثبت شد.', 'success');
        }}
      />
    </div>
  );
}
