/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Order, Product, OrderStatus, Agent, AppUser } from '../types';
import { PRESET_AGENTS } from '../data';
import { IRAN_PROVINCES, getCitiesForProvince, formatTerritoriesSummary, EXPORT_COUNTRIES, getBordersForCountry } from '../data/iranLocations';
import { toEnglishDigits } from '../utils/numberUtils';
import { serializeItemsJson, parseAndHydrateItemsJson } from '../utils/itemsJsonHelper';
import { reverseGeocode, extractCoordsFromUrl, checkCityInTerritory } from '../utils/reverseGeocode';
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
  ArrowLeft,
  Sparkles,
  AlertCircle,
  AlertTriangle,
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
  Check,
  ShieldCheck,
  Layers,
  Info,
  Paperclip,
  UploadCloud,
  Eye,
  Download,
  Printer,
  Building2,
  Image as ImageIcon
} from 'lucide-react';

import { SendLocationModal } from './SendLocationModal';
import { InteractiveMapPicker } from './InteractiveMapPicker';

export interface InvoiceItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  pricePerUnit: number;
  imageUrl?: string;
}

interface RepresentativeDashboardProps {
  orders: Order[];
  products: Product[];
  agents: Agent[];
  onCreateOrder: (orderData: Partial<Order>) => void;
  onCancelOrder: (orderId: string) => void;
  onEditOrder?: (orderId: string, editData: Partial<Order>) => void;
  onUpdatePaymentTracking: (orderId: string, paymentTrackingCode: string) => void;
  onUpdatePaymentReceipt?: (orderId: string, receiptData: { paymentReceiptUrl?: string; paymentReceiptName?: string; paymentTrackingCode?: string }) => Promise<boolean> | void;
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
  onUpdatePaymentReceipt,
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

  // Dashboard Tabs State ('CREATE' for new order wizard, 'TRACKING' for list)
  const [activeTab, setActiveTab] = useState<'CREATE' | 'TRACKING'>('TRACKING');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);

  // Multi-step Form Wizard State (1: Items, 2: Location/Destination, 3: Buyer & Submit)
  const [formStep, setFormStep] = useState<number>(1);

  // Form State
  const initialDefaultProduct = products.find(p => p.isEnabled !== false) || products[0];
  const [productId, setProductId] = useState<string>(initialDefaultProduct?.id || '');
  const [quantity, setQuantity] = useState<number>(initialDefaultProduct?.defaultQuantity || 330);

  // Auto-sync active productId when products array changes or if current productId is invalid
  useEffect(() => {
    if (products && products.length > 0) {
      if (!productId || !products.some(p => p.id === productId)) {
        const firstValid = products.find(p => p.isEnabled !== false) || products[0];
        if (firstValid) {
          setProductId(firstValid.id);
        }
      }
    }
  }, [products, productId]);
  const [destinationCity, setDestinationCity] = useState('تهران - تهران');
  const [exactAddress, setExactAddress] = useState('');
  const [deliveryLocationUrl, setDeliveryLocationUrl] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [paymentTrackingCode, setPaymentTrackingCode] = useState('');
  const [paymentReceiptUrl, setPaymentReceiptUrl] = useState('');
  const [paymentReceiptName, setPaymentReceiptName] = useState('');
  const [notes, setNotes] = useState('');
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [isProductDetailsOpen, setIsProductDetailsOpen] = useState(false);
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  
  const modalScrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll modal to top and auto-focus first input when step changes or modal opens
  useEffect(() => {
    if (isCreateModalOpen) {
      if (modalScrollRef.current) {
        modalScrollRef.current.scrollTop = 0;
      }
      const focusTimer = setTimeout(() => {
        if (modalScrollRef.current) {
          modalScrollRef.current.scrollTop = 0;
        }
        if (formStep === 1) {
          const el = document.getElementById('modal-form-product-select') || document.getElementById('modal-form-quantity-input');
          el?.focus({ preventScroll: false });
        } else if (formStep === 2) {
          const el = document.getElementById('modal-step2-country-select') || document.getElementById('modal-step2-province-select') || document.getElementById('modal-step2-address-textarea');
          el?.focus({ preventScroll: false });
        } else if (formStep === 3) {
          const el = document.getElementById('modal-step3-buyer-input');
          el?.focus({ preventScroll: false });
        }
      }, 100);
      return () => clearTimeout(focusTimer);
    }
  }, [formStep, isCreateModalOpen]);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [selectedLocationOrder, setSelectedLocationOrder] = useState<Order | null>(null);
  const [isFormMapPickerOpen, setIsFormMapPickerOpen] = useState(false);

  // Standalone Payment Receipt Modal State
  const [standaloneReceiptOrder, setStandaloneReceiptOrder] = useState<Order | null>(null);
  const [standaloneReceiptUrl, setStandaloneReceiptUrl] = useState('');
  const [standaloneReceiptName, setStandaloneReceiptName] = useState('');
  const [standaloneTrackingCode, setStandaloneTrackingCode] = useState('');
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
  const [viewReceiptModalUrl, setViewReceiptModalUrl] = useState<{ url: string; name: string } | null>(null);
  const [selectedOrderDetails, setSelectedOrderDetails] = useState<Order | null>(null);

  // Accordion Collapsed/Expanded state for orders
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});

  const toggleOrderExpand = (orderId: string) => {
    setExpandedOrders(prev => ({
      ...prev,
      [orderId]: !prev[orderId]
    }));
  };

  const expandAllOrders = (ordersList: Order[]) => {
    const nextState: Record<string, boolean> = {};
    ordersList.forEach(o => { nextState[o.id] = true; });
    setExpandedOrders(nextState);
  };

  const collapseAllOrders = () => {
    setExpandedOrders({});
  };

  // Helper for clean date display
  const formatDisplayDate = (dateStr?: string) => {
    if (!dateStr) return 'امروز';
    if (dateStr.includes('T')) {
      return dateStr.split('T')[0];
    }
    return dateStr;
  };

  // Proforma Invoice Modal State
  const [proformaModalData, setProformaModalData] = useState<{
    isDraft: boolean;
    orderNumber: string;
    date: string;
    agentName: string;
    agentCode: string;
    buyerName: string;
    phoneNumber: string;
    destinationCity: string;
    exactAddress: string;
    deliveryLocationUrl?: string;
    items: InvoiceItem[];
    totalAmount: number;
    paymentTrackingCode?: string;
    paymentReceiptUrl?: string;
    paymentReceiptName?: string;
    notes?: string;
    isExportOrder?: boolean;
    destinationCountry?: string;
  } | null>(null);

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
  const [editPaymentReceiptUrl, setEditPaymentReceiptUrl] = useState('');
  const [editPaymentReceiptName, setEditPaymentReceiptName] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editIsExportOrder, setEditIsExportOrder] = useState(false);
  const [editDestinationCountry, setEditDestinationCountry] = useState('');
  const [editItems, setEditItems] = useState<InvoiceItem[]>([]);

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

  // Filter allowed cities when province changes
  const currentTerritoryRule = agentTerritories.find(t => t.province === selectedProvince);
  const rawProvinceCities = getCitiesForProvince(selectedProvince);
  const allowedCities = (currentTerritoryRule && !currentTerritoryRule.allCities && currentTerritoryRule.cities && currentTerritoryRule.cities.length > 0)
    ? rawProvinceCities.filter(c => currentTerritoryRule.cities!.includes(c))
    : rawProvinceCities;

  // Sync destinationCity when selections change
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
  const [trackingFilter, setTrackingFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'DISPATCHED' | 'REJECTED'>('ALL');

  // Filter orders for the selected agent
  const agentOrders = orders.filter(o => o.customerName === selectedAgent);

  // Dynamic quantity preset shortcuts calculated from representative's historical orders
  const dynamicQuantityPresets = React.useMemo(() => {
    const counts: Record<number, number> = {};
    agentOrders.forEach(ord => {
      if (ord.quantity && ord.quantity > 0) {
        counts[ord.quantity] = (counts[ord.quantity] || 0) + 1;
      }
      if (ord.itemsJson) {
        try {
          const items = JSON.parse(ord.itemsJson);
          items.forEach((it: any) => {
            const q = Number(it.q || it.quantity);
            if (q > 0) counts[q] = (counts[q] || 0) + 1;
          });
        } catch {}
      }
    });

    const sortedByFreq = Object.entries(counts)
      .map(([qStr, count]) => ({ q: Number(qStr), count }))
      .sort((a, b) => b.count - a.count);

    const freqQuantities = sortedByFreq.map(item => item.q);
    
    // Fill up with standard defaults if fewer than 4 presets exist
    const standardDefaults = [330, 500, 1000, 1500, 100];
    for (const def of standardDefaults) {
      if (!freqQuantities.includes(def) && freqQuantities.length < 5) {
        freqQuantities.push(def);
      }
    }

    return freqQuantities.slice(0, 5).sort((a, b) => a - b);
  }, [agentOrders]);

  const handleFileRead = (file: File, onSuccess: (url: string, name: string) => void) => {
    if (file.size > 5 * 1024 * 1024) {
      showToast('حجم فایل فیش واریزی نباید بیشتر از ۵ مگابایت باشد.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      onSuccess(reader.result as string, file.name);
    };
    reader.readAsDataURL(file);
  };

  const filteredAgentOrders = agentOrders.filter(order => {
    // Filter by status tab if set
    if (trackingFilter === 'PENDING' && order.status !== 'PENDING_APPROVAL') return false;
    if (trackingFilter === 'APPROVED' && order.status !== 'APPROVED_BY_SALES' && order.status !== 'SENT_TO_FACTORY' && order.status !== 'VEHICLE_ASSIGNED') return false;
    if (trackingFilter === 'DISPATCHED' && order.status !== 'LOADED_AND_DISPATCHED') return false;
    if (trackingFilter === 'REJECTED' && order.status !== 'REJECTED') return false;

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

  // Track the agent alias for which default inputs have been initialized
  const initializedAgentRef = React.useRef<string | null>(null);

  // Autofill representative territory when selectedAgent changes
  useEffect(() => {
    if (!selectedAgent) return;

    if (initializedAgentRef.current !== selectedAgent) {
      initializedAgentRef.current = selectedAgent;
      const allAgents = agents.length > 0 ? agents : PRESET_AGENTS;
      const agentObj = allAgents.find(a => a.alias === selectedAgent);
      if (agentObj) {
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
          setSelectedProvince('تهران');
          setSelectedCity('تهران');
        }
      }
    }
  }, [selectedAgent, agents]);

  // Handle adding current selected product to multi-product invoice list
  const handleAddProductToInvoice = () => {
    if (!quantity || quantity <= 0) {
      showToast('لطفاً مقدار معتبری وارد کنید.', 'error');
      return;
    }
    const currentProdId = productId || selectedProduct.id;
    const prodObj = products.find(p => p.id === currentProdId) || selectedProduct;
    if (!prodObj || !prodObj.id) return;

    const existingIdx = invoiceItems.findIndex(item => item.productId === prodObj.id);
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
    showToast('محصول با موفقیت به سبد اقلام فاکتور اضافه شد.', 'success');
  };

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
    setEditPaymentReceiptUrl(pendingData?.paymentReceiptUrl ?? ord.paymentReceiptUrl ?? '');
    setEditPaymentReceiptName(pendingData?.paymentReceiptName ?? ord.paymentReceiptName ?? '');
    setEditVehicleType(pendingData?.vehicleType ?? ord.vehicleDetails?.vehicleType ?? ord.vehicleType ?? 'تریلی');
    setEditIsExportOrder(pendingData?.isExportOrder !== undefined ? !!pendingData.isExportOrder : !!ord.isExportOrder);
    setEditDestinationCountry(pendingData?.destinationCountry ?? ord.destinationCountry ?? '');

    let itemsList: InvoiceItem[] = [];
    const rawItemsJson = pendingData?.itemsJson || ord.itemsJson;
    if (rawItemsJson) {
      const hydrated = parseAndHydrateItemsJson(rawItemsJson, products);
      if (hydrated.length > 0) {
        itemsList = hydrated.map((it, idx) => ({
          id: `edit-item-${idx}-${Date.now()}`,
          productId: it.productId || 'prod-1',
          productName: it.productName || 'محصول',
          quantity: it.quantity || 1,
          unit: it.unit || 'عدد',
          pricePerUnit: it.pricePerUnit || 0
        }));
      }
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
      paymentReceiptUrl: editPaymentReceiptUrl.trim(),
      paymentReceiptName: editPaymentReceiptName.trim(),
      vehicleType: editVehicleType,
      isExportOrder: editIsExportOrder,
      destinationCountry: editIsExportOrder ? editDestinationCountry : '',
      productId: firstItem.productId,
      productName: editItems.length > 1 
        ? editItems.map(i => `${i.productName} (${i.quantity} ${i.unit})`).join(' + ')
        : firstItem.productName,
      quantity: totalQuantity,
      unit: firstItem.unit,
      itemsJson: serializeItemsJson(editItems)
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
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        const generatedUrl = `https://maps.google.com/?q=${lat},${lng}`;
        setDeliveryLocationUrl(generatedUrl);
        
        showToast('در حال تبدیل لوکیشن GPS به آدرس متنی...', 'info');
        const geoResult = await reverseGeocode(lat, lng);
        if (geoResult.addressText) {
          setExactAddress(geoResult.addressText);
          showToast('موقعیت GPS و آدرس متنی آن (بدون نام کشور) ثبت گردید.', 'success');
        } else {
          showToast('موقعیت GPS کنونی شما با موفقیت ثبت گردید.', 'success');
        }

        if (geoResult.city || geoResult.province) {
          const tCheck = checkCityInTerritory(geoResult.city || '', geoResult.province, agentTerritories);
          if (!tCheck.isAllowed) {
            showToast(`⚠️ هشدار محدوده: ${tCheck.message}`, 'error');
          } else if (tCheck.matchedProvince && tCheck.matchedCity) {
            if (allowedProvinces.some(p => p.name === tCheck.matchedProvince)) {
              setSelectedProvince(tCheck.matchedProvince);
              if (allowedCities.includes(tCheck.matchedCity)) {
                setSelectedCity(tCheck.matchedCity);
              }
            }
          }
        }
      },
      () => {
        showToast('خطا در دسترسی به GPS. لطفاً دسترسی موقعیت مکانی را تأیید کنید.', 'error');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleConvertUrlToAddress = async (url: string, targetSetter: (addr: string) => void) => {
    const coords = extractCoordsFromUrl(url);
    if (!coords) {
      showToast('مختصات معتبری در لینک لوکیشن یافت نشد.', 'error');
      return;
    }
    showToast('در حال دریافت آدرس متنی از روی لوکیشن...', 'info');
    const geoResult = await reverseGeocode(coords.lat, coords.lng);
    if (geoResult.addressText) {
      targetSetter(geoResult.addressText);
      showToast('آدرس متنی با موفقیت در فیلد آدرس جایگذاری شد.', 'success');
    } else {
      showToast('امکان دریافت آدرس متنی برای این نقطه وجود نداشت.', 'error');
    }

    if (geoResult.city || geoResult.province) {
      const tCheck = checkCityInTerritory(geoResult.city || '', geoResult.province, agentTerritories);
      if (!tCheck.isAllowed) {
        showToast(`⚠️ هشدار محدوده: ${tCheck.message}`, 'error');
      }
    }
  };

  // Step 1 Validation before moving to Step 2
  const handleGoToStep2 = () => {
    const activeProdId = productId || selectedProduct.id;
    const finalItemsCount = invoiceItems.length > 0 ? invoiceItems.length : (activeProdId && quantity > 0 ? 1 : 0);
    if (finalItemsCount === 0) {
      showToast('لطفاً حداقل یک محصول و تعداد معتبر انتخاب نمایید.', 'error');
      return;
    }
    setFormStep(2);
  };

  // Step 2 Validation before moving to Step 3
  const handleGoToStep3 = () => {
    if (!exactAddress.trim()) {
      showToast('لطفاً آدرس دقیق تخلیه بار را وارد نمایید.', 'error');
      return;
    }

    if (!isExportOrder && agentTerritories.length > 0) {
      const tCheck = checkCityInTerritory(selectedCity, selectedProvince, agentTerritories);
      if (!tCheck.isAllowed) {
        showToast(`⛔ خطا در محدوده نمایندگی: ${tCheck.message}`, 'error');
        return;
      }
    }
    setFormStep(3);
  };

  // Open Proforma Invoice Preview Modal
  const handleOpenProformaPreview = () => {
    if (!currentAgentObj.isEnabled) {
      showToast('این نمایندگی در حال حاضر غیرفعال است و امکان ثبت سفارش روی آن وجود ندارد.', 'error');
      return;
    }

    const activeProdId = productId || selectedProduct.id;
    const finalItems = invoiceItems.length > 0 
      ? invoiceItems 
      : [{
          id: 'item-def',
          productId: activeProdId,
          productName: selectedProduct.name,
          quantity,
          unit: selectedProduct.unit,
          pricePerUnit: selectedProduct.pricePerUnit
        }];

    if (finalItems.length === 1 && !finalItems[0].productId) {
      showToast('لطفاً حداقل یک محصول به فاکتور سفارش خود اضافه کنید.', 'error');
      return;
    }

    if (!exactAddress.trim()) {
      showToast('لطفاً آدرس دقیق تخلیه را وارد نمایید.', 'error');
      return;
    }

    if (!isExportOrder && agentTerritories.length > 0) {
      const tCheck = checkCityInTerritory(selectedCity, selectedProvince, agentTerritories);
      if (!tCheck.isAllowed) {
        showToast(`⛔ خطا در ثبت سفارش: ${tCheck.message}`, 'error');
        return;
      }
    }

    const totalAmount = finalItems.reduce((acc, item) => acc + (item.quantity * item.pricePerUnit), 0);

    setProformaModalData({
      isDraft: true,
      orderNumber: `PRE-${Math.floor(100000 + Math.random() * 900000)}`,
      date: new Date().toLocaleDateString('fa-IR'),
      agentName: currentAgentObj.alias,
      agentCode: currentAgentObj.agentCode,
      buyerName: buyerName.trim() || currentAgentObj.alias,
      phoneNumber: phoneNumber.trim() || 'ثبت نشده',
      destinationCity,
      exactAddress,
      deliveryLocationUrl: deliveryLocationUrl.trim() || undefined,
      items: finalItems,
      totalAmount,
      paymentTrackingCode: paymentTrackingCode.trim() || undefined,
      paymentReceiptUrl: paymentReceiptUrl.trim() || undefined,
      paymentReceiptName: paymentReceiptName.trim() || undefined,
      notes: notes.trim() || undefined,
      isExportOrder: isExportAllowed ? isExportOrder : false,
      destinationCountry: (isExportAllowed && isExportOrder) ? selectedCountry : undefined
    });
  };

  // Final Submit Handler triggers Proforma Preview first
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleOpenProformaPreview();
  };

  // Execute Final Order Submission after Proforma Confirmation
  const executeFinalSubmission = () => {
    const activeProdId = productId || selectedProduct.id;
    const finalItems = invoiceItems.length > 0 
      ? invoiceItems 
      : [{
          id: 'item-def',
          productId: activeProdId,
          productName: selectedProduct.name,
          quantity,
          unit: selectedProduct.unit,
          pricePerUnit: selectedProduct.pricePerUnit
        }];

    setIsSubmitting(true);
    setProformaModalData(null);

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
        itemsJson: serializeItemsJson(finalItems),
        paymentTrackingCode: paymentTrackingCode.trim() || undefined,
        paymentReceiptUrl: paymentReceiptUrl.trim() || undefined,
        paymentReceiptName: paymentReceiptName.trim() || undefined,
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
      setPaymentReceiptUrl('');
      setPaymentReceiptName('');
      setIsExportOrder(false);
      setFormStep(1);
      setIsCreateModalOpen(false);
      setActiveTab('TRACKING');

      setSuccessMessage('سفارش شما با موفقیت ثبت شد و به پنل مدیریت فروش ارسال گردید.');
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
      
      {/* Simulation Dropdown Bar (Only for Sales Manager in Sandbox Mode) */}
      {sandboxEnabled && currentUser?.role === 'SALES_MANAGER' && (
        <div className="bg-emerald-50/90 p-2 sm:p-2.5 rounded-2xl border border-emerald-200 text-xs font-bold text-emerald-900 flex flex-wrap items-center justify-between gap-2 shadow-2xs" id="agent-selector-box">
          <span className="text-[11px] sm:text-xs text-emerald-800 font-extrabold shrink-0">📲 شبیه‌ساز ورود به عنوان نمایندگی فروش:</span>
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="bg-white border border-emerald-300 rounded-xl py-1 px-3 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans cursor-pointer font-extrabold shadow-2xs"
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

      {/* 2. Main Dashboard Action Buttons / Tabs */}
      <div className="bg-slate-200/70 p-1.5 rounded-2xl border border-slate-300/70 shadow-xs flex items-center justify-between gap-2" id="rep-tabs-container">
        <button
          type="button"
          onClick={() => {
            setFormStep(1);
            setIsCreateModalOpen(true);
          }}
          className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
            isCreateModalOpen
              ? 'bg-emerald-600 text-white shadow-md border border-emerald-600 font-black'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-600 font-black shadow-sm'
          }`}
          id="rep-tab-create"
        >
          <PlusCircle className="w-5 h-5 text-white" />
          <span>ثبت سفارش</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('TRACKING')}
          className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'TRACKING' && !isCreateModalOpen
              ? 'bg-white text-emerald-800 shadow-md border border-slate-200 font-black'
              : 'bg-white/80 text-slate-700 hover:text-slate-900 hover:bg-white border border-slate-200/80'
          }`}
          id="rep-tab-tracking"
        >
          <ShoppingBag className="w-4.5 h-4.5 text-emerald-600" />
          <span>پیگیری</span>
          <span className={`text-xs py-0.5 px-2.5 rounded-full font-mono font-bold transition-all ${
            activeTab === 'TRACKING' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
          }`}>
            {agentOrders.length}
          </span>
        </button>
      </div>

      {/* 3. Order KPI Stats Overview Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" id="rep-kpi-summary">
        <div 
          onClick={() => {
            setIsCreateModalOpen(false);
            setActiveTab('TRACKING');
            setTrackingFilter('PENDING');
            setTimeout(() => {
              document.getElementById('rep-column-list')?.scrollIntoView({ behavior: 'smooth' });
            }, 50);
          }}
          className={`p-3 rounded-2xl cursor-pointer transition-all flex items-center justify-between border ${
            activeTab === 'TRACKING' && trackingFilter === 'PENDING'
              ? 'bg-amber-100/90 border-amber-400 ring-2 ring-amber-400/50 shadow-md scale-[1.02]'
              : 'bg-amber-50/80 hover:bg-amber-100/80 border-amber-200'
          }`}
          title="مشاهده سفارشات در انتظار بررسی"
        >
          <div>
            <span className="text-[11px] font-bold text-amber-800 block">در انتظار بررسی</span>
            <span className="text-xl font-black font-mono text-amber-900">
              {agentOrders.filter(o => o.status === 'PENDING_APPROVAL').length}
            </span>
          </div>
          <Clock className="w-7 h-7 text-amber-500 opacity-80" />
        </div>

        <div 
          onClick={() => {
            setIsCreateModalOpen(false);
            setActiveTab('TRACKING');
            setTrackingFilter('APPROVED');
            setTimeout(() => {
              document.getElementById('rep-column-list')?.scrollIntoView({ behavior: 'smooth' });
            }, 50);
          }}
          className={`p-3 rounded-2xl cursor-pointer transition-all flex items-center justify-between border ${
            activeTab === 'TRACKING' && trackingFilter === 'APPROVED'
              ? 'bg-indigo-100/90 border-indigo-400 ring-2 ring-indigo-400/50 shadow-md scale-[1.02]'
              : 'bg-indigo-50/80 hover:bg-indigo-100/80 border-indigo-200'
          }`}
          title="مشاهده سفارشات تایید شده و در صف کارخانه"
        >
          <div>
            <span className="text-[11px] font-bold text-indigo-800 block">تایید شده / صف کارخانه</span>
            <span className="text-xl font-black font-mono text-indigo-900">
              {agentOrders.filter(o => o.status === 'APPROVED_BY_SALES' || o.status === 'SENT_TO_FACTORY' || o.status === 'VEHICLE_ASSIGNED').length}
            </span>
          </div>
          <CheckCircle className="w-7 h-7 text-indigo-500 opacity-80" />
        </div>

        <div 
          onClick={() => {
            setIsCreateModalOpen(false);
            setActiveTab('TRACKING');
            setTrackingFilter('DISPATCHED');
            setTimeout(() => {
              document.getElementById('rep-column-list')?.scrollIntoView({ behavior: 'smooth' });
            }, 50);
          }}
          className={`p-3 rounded-2xl cursor-pointer transition-all flex items-center justify-between border ${
            activeTab === 'TRACKING' && trackingFilter === 'DISPATCHED'
              ? 'bg-emerald-100/90 border-emerald-400 ring-2 ring-emerald-400/50 shadow-md scale-[1.02]'
              : 'bg-emerald-50/80 hover:bg-emerald-100/80 border-emerald-200'
          }`}
          title="مشاهده سفارشات بارگیری و حمل شده"
        >
          <div>
            <span className="text-[11px] font-bold text-emerald-800 block">بارگیری و حمل شده</span>
            <span className="text-xl font-black font-mono text-emerald-900">
              {agentOrders.filter(o => o.status === 'LOADED_AND_DISPATCHED').length}
            </span>
          </div>
          <Truck className="w-7 h-7 text-emerald-500 opacity-80" />
        </div>

        <div 
          onClick={() => {
            setIsCreateModalOpen(false);
            setActiveTab('TRACKING');
            setTrackingFilter('ALL');
            setTimeout(() => {
              document.getElementById('rep-column-list')?.scrollIntoView({ behavior: 'smooth' });
            }, 50);
          }}
          className={`p-3 rounded-2xl cursor-pointer transition-all flex items-center justify-between border ${
            activeTab === 'TRACKING' && trackingFilter === 'ALL'
              ? 'bg-slate-200/90 border-slate-400 ring-2 ring-slate-400/50 shadow-md scale-[1.02]'
              : 'bg-slate-100 hover:bg-slate-200/80 border-slate-200'
          }`}
          title="مشاهده کل سفارشات ثبت شده"
        >
          <div>
            <span className="text-[11px] font-bold text-slate-700 block">کل سفارشات ثبت شده</span>
            <span className="text-xl font-black font-mono text-slate-900">
              {agentOrders.length}
            </span>
          </div>
          <ShoppingBag className="w-7 h-7 text-slate-400 opacity-80" />
        </div>
      </div>

      {/* Floating Action Button for Mobile Quick Order */}
      <div className="fixed bottom-5 left-5 z-40 sm:hidden">
        <button
          type="button"
          onClick={() => {
            setFormStep(1);
            setIsCreateModalOpen(true);
          }}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-4 py-3 rounded-full shadow-2xl border-2 border-white flex items-center gap-2 text-xs active:scale-95 transition-all cursor-pointer"
        >
          <PlusCircle className="w-5 h-5" />
          <span>ثبت سفارش</span>
        </button>
      </div>

      {/* FULL-SCREEN / MOBILE-OPTIMIZED ORDER WIZARD MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 animate-fadeIn" id="order-wizard-modal">
          <div className="bg-white w-full sm:max-w-2xl h-[100dvh] sm:h-auto sm:max-h-[92vh] sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dir-rtl text-right font-sans">
            
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-3.5 sm:p-4 flex items-center justify-between border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <PlusCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
                    <span>ثبت سفارش جدید</span>
                    <span className="text-[10px] bg-emerald-600/60 text-emerald-100 px-2 py-0.5 rounded-full font-mono">۳ گام سریع</span>
                  </h3>
                  <p className="text-[11px] text-slate-300 font-mono">نمایندگی: {currentAgentObj?.alias} ({currentAgentObj?.agentCode})</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                title="بستن"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Stepper Progress Bar Header */}
            <div className="bg-slate-50 border-b border-slate-200 p-2.5 sm:p-3 shrink-0">
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => setFormStep(1)}
                  className={`py-2 px-2 rounded-xl border text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                    formStep === 1
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs font-black'
                      : formStep > 1
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-white text-slate-400 border-slate-200'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">۱. انتخاب کالا</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const activeProdId = productId || selectedProduct.id;
                    if (invoiceItems.length > 0 || (activeProdId && quantity > 0)) {
                      setFormStep(2);
                    } else {
                      showToast('ابتدا کالا را در گام ۱ انتخاب کنید.', 'info');
                    }
                  }}
                  className={`py-2 px-2 rounded-xl border text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                    formStep === 2
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs font-black'
                      : formStep > 2
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-white text-slate-400 border-slate-200'
                  }`}
                >
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">۲. مقصد و نقشه</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (exactAddress.trim()) {
                      setFormStep(3);
                    } else {
                      showToast('ابتدا آدرس را در گام ۲ وارد کنید.', 'info');
                    }
                  }}
                  className={`py-2 px-2 rounded-xl border text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                    formStep === 3
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs font-black'
                      : 'bg-white text-slate-400 border-slate-200'
                  }`}
                >
                  <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">۳. خریدار و ثبت</span>
                </button>
              </div>
            </div>

            {/* Modal Body - Scrollable content area */}
            <div ref={modalScrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 font-sans">
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* STEP 1: PRODUCT SELECTION & QUANTITY */}
                {formStep === 1 && (
                  <div className="space-y-4 animate-fadeIn">
                    <div className="bg-emerald-50/60 p-3 rounded-xl border border-emerald-100 flex items-center justify-between">
                      <span className="text-xs font-extrabold text-emerald-950 flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-emerald-600" />
                        <span>مرحله ۱: انتخاب نوع سفال و متراژ سفارش</span>
                      </span>
                      <span className="text-[10px] text-emerald-700 bg-white px-2 py-0.5 rounded-md border border-emerald-200 font-bold">
                        گام ۱ از ۳
                      </span>
                    </div>

                    {/* Current Invoice Items List - Prominently at the top */}
                    {invoiceItems.length > 0 && (
                      <div className="bg-emerald-50/60 p-3 rounded-2xl border-2 border-emerald-500/80 space-y-2 shadow-xs animate-fadeIn">
                        <div className="flex items-center justify-between text-xs font-black border-b border-emerald-200/80 pb-2">
                          <span className="flex items-center gap-1.5 text-emerald-950 font-black">
                            <ShoppingBag className="w-4 h-4 text-emerald-700 shrink-0" />
                            <span>اقلام افزوده شده به فاکتور ({invoiceItems.length} کالا):</span>
                          </span>
                          <span className="text-[11px] font-mono text-emerald-900 bg-emerald-100/90 px-2.5 py-0.5 rounded-md border border-emerald-300 font-black">
                            مجموع: {invoiceItems.reduce((sum, item) => sum + item.quantity * item.pricePerUnit, 0).toLocaleString()} تومان
                          </span>
                        </div>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                          {invoiceItems.map((item, index) => (
                            <div key={item.id} className="flex justify-between items-center text-xs bg-white border border-emerald-200 px-3 py-2 rounded-xl gap-2 shadow-2xs">
                              <strong className="text-slate-900 font-black truncate text-xs">{item.productName}</strong>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-emerald-800 font-mono font-black text-xs bg-emerald-100/80 px-2 py-0.5 rounded-md border border-emerald-300">
                                  {item.quantity.toLocaleString()} {item.unit}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setInvoiceItems(invoiceItems.filter((_, i) => i !== index))}
                                  className="text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 p-1 rounded-lg border border-rose-200 transition-all cursor-pointer"
                                  title="حذف کالا"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Product Select Dropdown (Custom, clean, bug-free selection) */}
                    <div>
                      <label className="block text-xs font-black text-slate-800 mb-1.5 flex items-center justify-between">
                        <span>انتخاب نوع کالا:</span>
                        <span className="text-[10px] text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md font-bold">
                          {products.filter(p => p.isEnabled !== false).length} محصول فعال
                        </span>
                      </label>
                      <div className="relative">
                        <button
                          type="button"
                          id="modal-form-product-select"
                          onClick={() => setIsProductDropdownOpen(!isProductDropdownOpen)}
                          className="w-full bg-white border-2 border-emerald-600 hover:border-emerald-700 rounded-xl py-2.5 px-3.5 text-xs sm:text-sm text-slate-900 font-black shadow-xs transition-all flex items-center justify-between gap-2 text-right cursor-pointer"
                        >
                          <span className="truncate">{selectedProduct.name}</span>
                          <ChevronDown className={`w-4 h-4 text-emerald-700 shrink-0 transition-transform ${isProductDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isProductDropdownOpen && (
                          <>
                            {/* Backdrop to close dropdown on click outside */}
                            <div 
                              className="fixed inset-0 z-20" 
                              onClick={() => setIsProductDropdownOpen(false)} 
                            />
                            
                            <div className="absolute z-30 top-full mt-1.5 w-full bg-white border-2 border-emerald-600 rounded-2xl shadow-xl overflow-hidden py-1 max-h-60 overflow-y-auto divide-y divide-slate-100 animate-fadeIn">
                              {products.filter(p => p.isEnabled !== false).map((prod) => {
                                const isSelected = (productId || selectedProduct.id) === prod.id;
                                return (
                                  <button
                                    key={prod.id}
                                    type="button"
                                    onClick={() => {
                                      setProductId(prod.id);
                                      setIsProductDropdownOpen(false);
                                    }}
                                    className={`w-full text-right px-3.5 py-3 text-xs sm:text-sm font-black transition-all flex items-center justify-between gap-2 cursor-pointer ${
                                      isSelected
                                        ? 'bg-emerald-50 text-emerald-950 font-black border-r-4 border-r-emerald-600'
                                        : 'text-slate-800 hover:bg-slate-50 hover:text-emerald-900'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 truncate">
                                      {isSelected && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
                                      <span className="truncate">{prod.name}</span>
                                    </div>
                                    <span className="text-[11px] font-mono font-black text-emerald-800 shrink-0 bg-emerald-100/90 border border-emerald-200 px-2 py-0.5 rounded-md">
                                      {prod.pricePerUnit.toLocaleString()} تومان
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>

                      {/* Separate Price Badge & Description Toggle directly under the select dropdown */}
                      <div className="flex items-center justify-between bg-emerald-50/80 border border-emerald-200/90 rounded-xl px-3 py-1.5 mt-1.5 text-xs">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-slate-600 font-bold text-[11px] shrink-0">قیمت واحد:</span>
                          <span className="text-emerald-900 font-black font-mono text-xs sm:text-sm bg-white px-2 py-0.5 rounded-md border border-emerald-300 shadow-2xs truncate">
                            {selectedProduct.pricePerUnit.toLocaleString()} تومان / {selectedProduct.unit}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => setIsProductDetailsOpen(!isProductDetailsOpen)}
                          className="text-[11px] text-emerald-800 font-extrabold hover:text-emerald-950 flex items-center gap-1 cursor-pointer bg-emerald-100/90 hover:bg-emerald-200 border border-emerald-300 px-2 py-1 rounded-lg transition-all shrink-0 active:scale-95 mr-1"
                          title="نمایش یا مخفی‌سازی جزئیات کالا"
                        >
                          <Info className="w-3.5 h-3.5 text-emerald-700" />
                          <span>{isProductDetailsOpen ? 'بستن' : 'توضیحات'}</span>
                          {isProductDetailsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                      {/* Collapsible Product Details Accordion */}
                      {isProductDetailsOpen && (
                        <div className="bg-slate-50 p-3 mt-1.5 rounded-xl border border-slate-200 flex items-start gap-3 animate-fadeIn text-xs">
                          {selectedProduct.imageUrl ? (
                            <img 
                              src={selectedProduct.imageUrl} 
                              alt={selectedProduct.name} 
                              className="w-14 h-14 object-cover rounded-lg border border-slate-200 shrink-0 shadow-xs"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-14 h-14 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0 text-amber-700 font-bold text-xs shadow-xs">
                              سفال
                            </div>
                          )}
                          <div className="flex-1 space-y-1 min-w-0">
                            <p className="font-extrabold text-slate-900 text-xs">{selectedProduct.name}</p>
                            <p className="text-slate-600 text-[11px]">🧱 {selectedProduct.description || 'تولید شده بر اساس استانداردهای ملی'}</p>
                            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 pt-0.5">
                              {selectedProduct.weight && <span>⚖️ وزن: <strong>{selectedProduct.weight}</strong></span>}
                              {selectedProduct.dimensions && <span>📐 ابعاد: <strong>{selectedProduct.dimensions}</strong></span>}
                              {selectedProduct.coverageInfo && <span>📊 متراژ: <strong>{selectedProduct.coverageInfo}</strong></span>}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Quantity Input & Add Button in a Single Inline Row for Instant Mobile Access */}
                    <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                        <span>مقدار سفارش ({selectedProduct.unit}):</span>
                        <span className="text-[10px] text-slate-500">حداکثر تریلی: ۳۳۰</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="relative flex-1 min-w-[100px]">
                          <input
                            type="number"
                            min="1"
                            step="any"
                            placeholder="330"
                            value={quantity || ''}
                            onChange={(e) => setQuantity(Number(e.target.value))}
                            className="w-full bg-emerald-50/30 hover:bg-emerald-50/50 border-2 border-slate-300/90 rounded-xl py-2 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 font-mono font-black text-center shadow-2xs transition-all"
                            id="modal-form-quantity-input"
                          />
                        </div>

                        <span className="text-xs font-bold text-slate-700 shrink-0 bg-slate-100 px-2.5 py-2 rounded-xl border-2 border-slate-300/90">
                          {selectedProduct.unit}
                        </span>

                        <button
                          type="button"
                          onClick={handleAddProductToInvoice}
                          className="shrink-0 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black py-2 px-3 sm:px-4 rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                          id="modal-form-add-to-invoice-btn"
                        >
                          <PlusCircle className="w-4 h-4 text-white" />
                          <span>افزودن به فاکتور</span>
                        </button>
                      </div>

                      {/* Mold Conversion Preview */}
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
                              <div className="bg-emerald-50 text-emerald-950 px-2.5 py-1.5 rounded-lg border border-emerald-200 text-[11px] flex justify-between items-center">
                                <span className="text-slate-600 font-bold">معادل تعداد قالب تولیدی:</span>
                                <span className="font-mono font-bold text-emerald-700">
                                  {(quantity * ratio).toLocaleString()} {pUnit}
                                </span>
                              </div>
                            );
                          }
                        }
                        return null;
                      })()}
                    </div>

                    {/* Cost Estimation */}
                    <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl flex items-center justify-between text-xs">
                      <span className="text-slate-700 font-bold">جمع کل برآوردی کالا:</span>
                      <span className="text-emerald-800 font-black font-mono text-sm">
                        {(invoiceItems.length > 0
                          ? invoiceItems.reduce((sum, item) => sum + item.quantity * item.pricePerUnit, 0)
                          : estimatedPrice
                        ).toLocaleString()} تومان
                      </span>
                    </div>
                  </div>
                )}

                {/* STEP 2: DESTINATION, TERRITORY & MAP LOCATION */}
                {formStep === 2 && (
                  <div className="space-y-4 animate-fadeIn">
                    <div className="bg-emerald-50/60 p-3 rounded-xl border border-emerald-100 flex items-center justify-between">
                      <span className="text-xs font-extrabold text-emerald-950 flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-emerald-600" />
                        <span>مرحله ۲: تعیین استان/شهر مقصد و نقشه تخلیه</span>
                      </span>
                      <span className="text-[10px] text-emerald-700 bg-white px-2 py-0.5 rounded-md border border-emerald-200 font-bold">
                        گام ۲ از ۳
                      </span>
                    </div>

                    {/* Territory Scope Info Box */}
                    <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-xs space-y-1">
                      <div className="flex items-center gap-1.5 text-sky-950 font-bold">
                        <ShieldCheck className="w-4 h-4 text-sky-600" />
                        <span>محدوده مجاز ثبت سفارش نمایندگی شما:</span>
                      </div>
                      <p className="text-sky-800 font-bold mr-5">
                        {formatTerritoriesSummary(agentTerritories)}
                      </p>
                    </div>

                    {/* Export Agent Toggle */}
                    {isExportAllowed && (
                      <div className="bg-sky-50/80 border border-sky-200 rounded-xl p-3">
                        <label htmlFor="exportOrderCheckboxModal" className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            id="exportOrderCheckboxModal"
                            checked={isExportOrder}
                            onChange={(e) => setIsExportOrder(e.target.checked)}
                            className="w-4 h-4 text-sky-600 rounded border-sky-300 focus:ring-sky-500 cursor-pointer accent-sky-600"
                          />
                          <Globe className="w-4 h-4 text-sky-600" />
                          <span className="text-xs font-bold text-sky-950">ثبت سفارش صادراتی (خارج از کشور)</span>
                        </label>
                      </div>
                    )}

                    {/* Export vs Domestic Selection */}
                    {isExportAllowed && isExportOrder ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-sky-50/80 p-3 rounded-xl border border-sky-200">
                        <div>
                          <label className="block text-xs font-bold text-sky-900 mb-1">کشور مقصد:</label>
                          <select
                            id="modal-step2-country-select"
                            value={selectedCountry}
                            onChange={(e) => {
                              setSelectedCountry(e.target.value);
                              const borders = getBordersForCountry(e.target.value);
                              setSelectedBorder(borders[0] || '');
                            }}
                            className="w-full bg-white border-2 border-sky-300 rounded-xl py-2 px-3 text-xs text-slate-900 font-bold focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-500/20 shadow-2xs cursor-pointer"
                          >
                            {EXPORT_COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-sky-900 mb-1">مرز خروجی/گمرک:</label>
                          <select
                            value={selectedBorder}
                            onChange={(e) => setSelectedBorder(e.target.value)}
                            className="w-full bg-white border-2 border-sky-300 rounded-xl py-2 px-3 text-xs text-slate-900 font-bold focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-500/20 shadow-2xs cursor-pointer"
                          >
                            {allowedBorders.map(b => <option key={b} value={b}>{b}</option>)}
                          </select>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-slate-800 mb-1">استان مقصد:</label>
                          <select
                            id="modal-step2-province-select"
                            value={selectedProvince}
                            onChange={(e) => {
                              setSelectedProvince(e.target.value);
                              const cities = getCitiesForProvince(e.target.value);
                              setSelectedCity(cities[0] || e.target.value);
                            }}
                            className="w-full bg-emerald-50/30 hover:bg-emerald-50/50 border-2 border-slate-300/90 rounded-xl py-2 px-3 text-xs text-slate-900 font-black cursor-pointer focus:outline-none focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 shadow-2xs transition-all"
                          >
                            {allowedProvinces.map(p => (
                              <option key={p.name} value={p.name}>{p.name}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-800 mb-1">شهر مقصد:</label>
                          <select
                            value={selectedCity}
                            onChange={(e) => setSelectedCity(e.target.value)}
                            className="w-full bg-emerald-50/30 hover:bg-emerald-50/50 border-2 border-slate-300/90 rounded-xl py-2 px-3 text-xs text-slate-900 font-black cursor-pointer focus:outline-none focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 shadow-2xs transition-all"
                          >
                            {allowedCities.map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    {/* Map & GPS Selection Box */}
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <Map className="w-4 h-4 text-emerald-600" />
                          <span>تعیین موقعیت روی نقشه و GPS:</span>
                        </span>
                        {deliveryLocationUrl ? (
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                            ✓ لوکیشن ثبت شد
                          </span>
                        ) : (
                          <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">
                            اختیاری ولی توصیه شده
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setIsFormMapPickerOpen(true)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-3 rounded-xl text-xs transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs"
                        >
                          <MapPin className="w-4 h-4" />
                          <span>🗺️ انتخاب تعاملی روی نقشه</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleGetCurrentLocation}
                          className="bg-sky-600 hover:bg-sky-700 text-white font-bold py-2.5 px-3 rounded-xl text-xs transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs"
                        >
                          <Navigation className="w-4 h-4" />
                          <span>📌 دریافت سریع GPS کنونی</span>
                        </button>
                      </div>

                      {deliveryLocationUrl && (
                        <div className="text-[11px] text-slate-600 bg-white p-2 rounded-lg border border-slate-200 flex items-center justify-between gap-2 truncate">
                          <span className="truncate dir-ltr font-mono text-[10px] text-sky-700">{deliveryLocationUrl}</span>
                          <button
                            type="button"
                            onClick={() => setDeliveryLocationUrl('')}
                            className="text-rose-500 hover:text-rose-700 font-bold text-[10px] shrink-0"
                          >
                            حذف
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Exact Address Textarea */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-bold text-slate-800">
                          آدرس دقیق متنی جهت تخلیه بار: <span className="text-rose-500">*</span>
                        </label>
                        {deliveryLocationUrl && (
                          <button
                            type="button"
                            onClick={() => handleConvertUrlToAddress(deliveryLocationUrl, setExactAddress)}
                            className="text-[10px] bg-sky-50 text-sky-800 border border-sky-300 px-2 py-0.5 rounded-md font-bold hover:bg-sky-100 transition-all cursor-pointer"
                          >
                            📍 استخراج آدرس از لوکیشن
                          </button>
                        )}
                      </div>
                      <textarea
                        id="modal-step2-address-textarea"
                        required
                        rows={2}
                        placeholder="مثال: کیلومتر ۵ جاده بابل، انبار مرکزی مصالح..."
                        value={exactAddress}
                        onChange={(e) => setExactAddress(e.target.value)}
                        className="w-full bg-emerald-50/30 border-2 border-slate-300/90 rounded-xl py-2 px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 font-sans shadow-2xs font-bold transition-all"
                      />
                    </div>
                  </div>
                )}

                {/* STEP 3: BUYER DETAILS, PAYMENT & FINAL REVIEW */}
                {formStep === 3 && (
                  <div className="space-y-4 animate-fadeIn">
                    <div className="bg-emerald-50/60 p-3 rounded-xl border border-emerald-100 flex items-center justify-between">
                      <span className="text-xs font-extrabold text-emerald-950 flex items-center gap-1.5">
                        <User className="w-4 h-4 text-emerald-600" />
                        <span>مرحله ۳: اطلاعات خریدار و پیش‌نمایش ثبت سفارش</span>
                      </span>
                      <span className="text-[10px] text-emerald-700 bg-white px-2 py-0.5 rounded-md border border-emerald-200 font-bold">
                        گام ۳ از ۳
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-800 mb-1">
                          مشخصات خریدار / خریدار پروژه:
                        </label>
                        <input
                          id="modal-step3-buyer-input"
                          type="text"
                          placeholder="مثال: جناب آقای مهندس احمدی"
                          value={buyerName}
                          onChange={(e) => setBuyerName(e.target.value)}
                          className="w-full bg-emerald-50/30 border-2 border-slate-300/90 rounded-xl py-2 px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 font-sans shadow-2xs font-bold transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-800 mb-1">
                          شماره تماس همراه تحویل‌گیرنده:
                        </label>
                        <input
                          type="tel"
                          placeholder="0912..."
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          className="w-full bg-emerald-50/30 border-2 border-slate-300/90 rounded-xl py-2 px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 font-mono text-left dir-ltr shadow-2xs font-bold transition-all"
                        />
                      </div>
                    </div>

                    <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <Paperclip className="w-4 h-4 text-emerald-600" />
                          <span>اطلاعات و الصاق فیش واریزی / چک (اختیاری):</span>
                        </label>
                        {paymentReceiptUrl && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                            ✓ فیش الصاق شد
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">شماره / کد رهگیری فیش یا چک:</label>
                          <input
                            type="text"
                            placeholder="مثال: ۱۲۳۴۵۶۷۸۹"
                            value={paymentTrackingCode}
                            onChange={(e) => setPaymentTrackingCode(e.target.value)}
                            className="w-full bg-emerald-50/30 border-2 border-slate-300/90 rounded-xl py-2 px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 font-mono shadow-2xs font-bold transition-all"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">تصویر یا PDF فیش واریزی:</label>
                          {paymentReceiptUrl ? (
                            <div className="flex items-center justify-between bg-emerald-50 border border-emerald-300 rounded-xl p-2 text-xs">
                              <div className="flex items-center gap-2 truncate pr-1">
                                {paymentReceiptUrl.startsWith('data:image') ? (
                                  <img src={paymentReceiptUrl} alt="فیش" className="w-7 h-7 object-cover rounded-lg border border-emerald-400 shrink-0" />
                                ) : (
                                  <FileText className="w-5 h-5 text-emerald-700 shrink-0" />
                                )}
                                <span className="font-bold text-emerald-950 truncate text-[11px]">{paymentReceiptName || 'فیش_واریزی.jpg'}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setPaymentReceiptUrl('');
                                  setPaymentReceiptName('');
                                }}
                                className="text-rose-600 hover:text-rose-800 text-[10px] font-bold px-2 py-1 bg-white rounded-lg border border-rose-200 cursor-pointer shrink-0"
                              >
                                حذف
                              </button>
                            </div>
                          ) : (
                            <label className="flex items-center justify-center gap-2 bg-white hover:bg-slate-100 text-slate-700 font-bold py-2 px-3 rounded-xl border border-dashed border-slate-300 text-xs transition-colors cursor-pointer shadow-2xs">
                              <UploadCloud className="w-4 h-4 text-emerald-600" />
                              <span>انتخاب تصویر یا PDF فیش</span>
                              <input
                                type="file"
                                accept="image/*,application/pdf"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleFileRead(file, (url, name) => {
                                    setPaymentReceiptUrl(url);
                                    setPaymentReceiptName(name);
                                    showToast('تصویر فیش واریزی با موفقیت بارگذاری شد.', 'success');
                                  });
                                }}
                                className="hidden"
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-800 mb-1">توضیحات و ملاحظات ویژه بارگیری:</label>
                      <textarea
                        rows={2}
                        placeholder="نکات خاص در مورد تایم بارگیری یا هماهنگی خروجی..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="w-full bg-emerald-50/30 border-2 border-slate-300/90 rounded-xl py-2 px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 font-sans shadow-2xs font-bold transition-all"
                      />
                    </div>

                    {/* Pre-flight Order Summary Card */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3 text-xs">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                        <span className="font-extrabold text-slate-900 flex items-center gap-1.5">
                          <CheckCircle className="w-4 h-4 text-emerald-600" />
                          <span>پیش‌نمایش نهایی مشخصات سفارش</span>
                        </span>
                        <button
                          type="button"
                          onClick={handleOpenProformaPreview}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-3 py-1.5 rounded-xl text-[11px] transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                          title="مشاهده پیش‌فاکتور رسمی قبل از ارسال"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>مشاهده پیش‌فاکتور خرید</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-slate-700 pt-1">
                        <div>
                          <span className="text-slate-400 text-[10px] block">محصول و مقدار:</span>
                          <strong className="text-slate-900">
                            {invoiceItems.length > 0
                              ? `${invoiceItems.length} محصول در فاکتور`
                              : `${selectedProduct.name} (${quantity} ${selectedProduct.unit})`
                            }
                          </strong>
                        </div>

                        <div>
                          <span className="text-slate-400 text-[10px] block">مقصد ارسال:</span>
                          <strong className="text-slate-900">{destinationCity}</strong>
                        </div>

                        <div className="col-span-2">
                          <span className="text-slate-400 text-[10px] block">آدرس تخلیه:</span>
                          <span className="text-slate-800 font-bold">{exactAddress || 'ثبت نشده'}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-emerald-800 font-bold">
                        <span>مبلغ برآوردی:</span>
                        <span className="font-mono text-sm font-black">
                          {(invoiceItems.length > 0
                            ? invoiceItems.reduce((sum, item) => sum + item.quantity * item.pricePerUnit, 0)
                            : estimatedPrice
                          ).toLocaleString()} تومان
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </form>
            </div>

            {/* Modal Bottom Fixed Actions Bar */}
            <div className="bg-slate-100/90 border-t border-slate-200/80 p-3.5 sm:p-4 flex items-center justify-between gap-3 shrink-0">
              {formStep > 1 ? (
                <button
                  type="button"
                  onClick={() => setFormStep(formStep - 1)}
                  className="bg-white hover:bg-slate-200 text-slate-800 font-extrabold py-2.5 px-4 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer border border-slate-300 shadow-2xs active:scale-95"
                >
                  <ArrowRight className="w-4 h-4 text-slate-600" />
                  <span>مرحله قبل</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="bg-slate-200/80 hover:bg-slate-300 text-slate-700 font-bold py-2.5 px-4 rounded-xl text-xs transition-all cursor-pointer border border-slate-300/60"
                >
                  انصراف
                </button>
              )}

              <div className="flex items-center gap-1.5">
                {[1, 2, 3].map(st => (
                  <div
                    key={st}
                    className={`h-2 rounded-full transition-all ${
                      formStep === st ? 'bg-emerald-600 w-6 shadow-xs' : 'bg-slate-300 w-2'
                    }`}
                  />
                ))}
              </div>

              {formStep === 1 && (
                <button
                  type="button"
                  onClick={handleGoToStep2}
                  className="bg-linear-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-black py-3 px-5 sm:px-6 rounded-xl text-xs sm:text-sm transition-all cursor-pointer flex items-center gap-2 shadow-md shadow-emerald-600/25 active:scale-95"
                >
                  <span>گام بعدی: مقصد</span>
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}

              {formStep === 2 && (
                <button
                  type="button"
                  onClick={handleGoToStep3}
                  className="bg-linear-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-black py-3 px-5 sm:px-6 rounded-xl text-xs sm:text-sm transition-all cursor-pointer flex items-center gap-2 shadow-md shadow-emerald-600/25 active:scale-95"
                >
                  <span>گام بعدی: خریدار</span>
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}

              {formStep === 3 && (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="bg-linear-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 disabled:from-slate-400 disabled:to-slate-500 text-white font-black py-3 px-5 sm:px-7 rounded-xl text-xs sm:text-sm transition-all cursor-pointer flex items-center gap-2 shadow-lg shadow-emerald-600/30 active:scale-95"
                >
                  {isSubmitting ? (
                    <span>در حال ثبت...</span>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>ثبت و ارسال نهایی سفارش</span>
                    </>
                  )}
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      {/* SUCCESS ALERT BANNER ON TRACKING TAB */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs flex items-center justify-between gap-2 shadow-sm animate-fadeIn" id="success-alert-global">
          <div className="flex items-center gap-2 font-bold">
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage('')}
            className="text-emerald-700 hover:text-emerald-900 font-bold text-[11px] p-1"
          >
            بستن ✕
          </button>
        </div>
      )}

      {/* TAB 2: ORDER HISTORY & TRACKING LIST */}
      {activeTab === 'TRACKING' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6" id="rep-column-list">
          
          {/* Search and Collapse Controls Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-5">
            <div className="text-xs font-black text-slate-800 flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-emerald-600" />
              <span>لیست و وضعیت سفارشات ثبت شده</span>
            </div>

            {/* Search & Collapse All Controls */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0 text-xs font-bold text-slate-700">
                <button
                  type="button"
                  onClick={() => expandAllOrders(filteredAgentOrders)}
                  className="px-2.5 py-1 rounded-lg hover:bg-white transition-all cursor-pointer flex items-center gap-1 text-[11px]"
                  title="باز کردن همه کارت‌ها"
                >
                  <ChevronDown className="w-3.5 h-3.5 text-slate-600" />
                  <span>باز کردن همه</span>
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={collapseAllOrders}
                  className="px-2.5 py-1 rounded-lg hover:bg-white transition-all cursor-pointer flex items-center gap-1 text-[11px]"
                  title="بستن همه کارت‌ها"
                >
                  <ChevronUp className="w-3.5 h-3.5 text-slate-600" />
                  <span>بستن همه</span>
                </button>
              </div>

              <div className="relative w-full sm:w-60">
                <input
                  type="text"
                  placeholder="جستجو در کد، خریدار، شهر..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-emerald-50/30 border-2 border-slate-300/90 rounded-xl py-2 pr-9 pl-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 font-bold shadow-2xs transition-all"
                />
                <Search className="w-4 h-4 text-emerald-600 absolute right-3 top-2.5" />
              </div>
            </div>
          </div>

          {/* Orders Cards List (Collapsible Accordion) */}
          {filteredAgentOrders.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-3">
              <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto" />
              <p className="text-xs text-slate-500 font-bold">هیچ سفارشی با این فیلتر یافت نشد.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAgentOrders.map((order) => {
                const statusInfo = getStatusLabelAndColor(order.status);
                const hydratedItems = parseAndHydrateItemsJson(order.itemsJson, products);
                const isExpanded = !!expandedOrders[order.id];
                
                return (
                  <div 
                    key={order.id} 
                    className={`bg-white rounded-2xl border transition-all duration-200 overflow-hidden ${
                      isExpanded 
                        ? 'border-slate-300 shadow-xs ring-1 ring-slate-200' 
                        : 'border-slate-200 hover:border-slate-300 shadow-2xs hover:shadow-xs'
                    }`}
                  >
                    {/* Collapsible Header Bar */}
                    <div 
                      onClick={() => toggleOrderExpand(order.id)}
                      className="p-3.5 sm:p-4 bg-slate-50/60 hover:bg-slate-100/80 cursor-pointer transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 select-none"
                    >
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <button
                          type="button"
                          className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:text-slate-900 shadow-2xs shrink-0"
                          title={isExpanded ? 'بستن' : 'باز کردن'}
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>

                        <span className="font-mono font-bold text-slate-900 text-xs sm:text-sm bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
                          #{order.orderNumber || order.id.slice(-6)}
                        </span>

                        <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${statusInfo.badge}`}>
                          {statusInfo.text}
                        </span>

                        <span className="text-[11px] text-slate-500 font-mono hidden xs:inline-block">📅 {formatDisplayDate(order.createdAt)}</span>

                        {/* Summary Bar when collapsed or expanded */}
                        <div className="text-xs text-slate-700 font-medium flex items-center gap-1.5 bg-white/80 px-2.5 py-1 rounded-lg border border-slate-200/80">
                          <span className="font-bold text-slate-900">{order.buyerName || 'خریدار'}</span>
                          <span className="text-slate-400">•</span>
                          <span className="text-slate-600">{order.destinationCity}</span>
                          <span className="text-slate-400 hidden md:inline">•</span>
                          <span className="text-slate-500 hidden md:inline truncate max-w-xs">{order.productName}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-xs shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setSelectedOrderDetails(order)}
                          className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                          title="مشاهده جزئیات کامل و اقلام سفارش"
                        >
                          <Info className="w-3.5 h-3.5 text-emerald-600" />
                          <span>جزئیات کامل</span>
                        </button>

                        {onEditOrder && order.status !== 'LOADED_AND_DISPATCHED' && order.status !== 'REJECTED' && (
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(order)}
                            className="bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                            title="ویرایش و اصلاح اطلاعات این سفارش"
                          >
                            <Edit className="w-3.5 h-3.5 text-amber-700" />
                            <span>ویرایش</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expandable Body */}
                    {isExpanded && (
                      <div className="p-4 border-t border-slate-200 space-y-3 bg-white animate-fadeIn">
                        {/* Order Details Body */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                          <div>
                            <span className="text-slate-400 text-[10px] block">عنوان محصول اصلی:</span>
                            <strong className="text-slate-900">{order.productName}</strong>
                          </div>

                          <div>
                            <span className="text-slate-400 text-[10px] block">خریدار / مقصد:</span>
                            <strong className="text-slate-900">{order.buyerName || 'خریدار'} • {order.destinationCity}</strong>
                          </div>

                          <div>
                            <span className="text-slate-400 text-[10px] block">آدرس دقیق تخلیه:</span>
                            <span className="text-slate-700 line-clamp-2">{order.exactAddress}</span>
                          </div>
                        </div>

                        {/* Inline Breakdown of Order Items */}
                        {hydratedItems.length > 0 ? (
                          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 text-xs space-y-1.5">
                            <span className="text-[11px] font-black text-slate-800 flex items-center gap-1">
                              <Layers className="w-3.5 h-3.5 text-emerald-600" />
                              <span>اقلام انتخاب‌شده سفارش ({hydratedItems.length} کالا):</span>
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              {hydratedItems.map((it, idx) => (
                                <div key={idx} className="bg-white p-2 rounded-lg border border-slate-200 flex items-center justify-between text-xs shadow-2xs">
                                  <span className="font-extrabold text-slate-900 truncate">{it.productName}</span>
                                  <span className="font-mono font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 shrink-0">
                                    {it.quantity.toLocaleString()} {it.unit}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="bg-slate-50 p-2 rounded-xl border border-slate-200/80 text-xs flex items-center justify-between">
                            <span className="text-slate-500 font-bold">مقدار سفارش:</span>
                            <span className="font-mono font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              {order.quantity.toLocaleString()} {order.unit}
                            </span>
                          </div>
                        )}

                        {/* Payment Receipt & Tracking Code Row */}
                        <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500 font-bold text-[11px]">💳 کد رهگیری / فیش:</span>
                            {order.paymentTrackingCode ? (
                              <span className="font-mono font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                                {order.paymentTrackingCode}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">ثبت نشده</span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {order.paymentReceiptUrl ? (
                              <div className="flex items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px]">
                                  <Paperclip className="w-3 h-3 text-emerald-600" />
                                  فیش پیوست شده
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setViewReceiptModalUrl({ url: order.paymentReceiptUrl!, name: order.paymentReceiptName || 'فیش_واریزی.jpg' })}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>مشاهده</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setStandaloneReceiptOrder(order);
                                    setStandaloneReceiptUrl(order.paymentReceiptUrl || '');
                                    setStandaloneReceiptName(order.paymentReceiptName || '');
                                    setStandaloneTrackingCode(order.paymentTrackingCode || '');
                                  }}
                                  className="bg-slate-200 hover:bg-slate-300 text-slate-700 text-[11px] font-bold px-2 py-1 rounded-lg transition-colors cursor-pointer"
                                >
                                  ویرایش
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setStandaloneReceiptOrder(order);
                                  setStandaloneReceiptUrl('');
                                  setStandaloneReceiptName('');
                                  setStandaloneTrackingCode(order.paymentTrackingCode || '');
                                }}
                                className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-[11px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                              >
                                <Paperclip className="w-3.5 h-3.5 text-emerald-600" />
                                <span> الصاق فیش واریزی</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Visual Order Progress Stepper */}
                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-150 flex items-center justify-between text-[11px] font-bold text-slate-600">
                          <div className={`flex items-center gap-1 ${order.status === 'PENDING_APPROVAL' ? 'text-amber-700 font-extrabold' : 'text-emerald-700'}`}>
                            <span>ثبت اولیه 🟢</span>
                          </div>
                          <span className="text-slate-300">←</span>
                          <div className={`flex items-center gap-1 ${order.status === 'APPROVED_BY_SALES' || order.status === 'SENT_TO_FACTORY' ? 'text-indigo-700 font-extrabold' : ''}`}>
                            <span>تایید و صف تولید 🟡</span>
                          </div>
                          <span className="text-slate-300">←</span>
                          <div className={`flex items-center gap-1 ${order.status === 'LOADED_AND_DISPATCHED' ? 'text-emerald-700 font-extrabold' : ''}`}>
                            <span>حمل و ارسال 🚛</span>
                          </div>
                        </div>

                        {/* Vehicle details if assigned */}
                        {order.vehicleDetails && (
                          <div className="bg-sky-50/70 p-3 rounded-xl border border-sky-200 text-xs space-y-2">
                            <div className="flex items-center justify-between font-bold text-sky-950">
                              <span className="flex items-center gap-1.5">
                                <Truck className="w-4 h-4 text-sky-600" />
                                <span>مشخصات کامیون تخصیص یافته:</span>
                              </span>
                              <span className="text-[11px] text-sky-800">
                                راننده: <strong>{order.vehicleDetails.driverName}</strong> ({order.vehicleDetails.driverPhone})
                              </span>
                            </div>

                            {/* Location send button */}
                            <div className="flex items-center justify-between pt-1">
                              <span className="text-[11px] text-slate-600">
                                {order.deliveryLocationUrl ? '📍 لوکیشن نقشه ثبت شده است' : 'لوکیشن هنوز ارسال نشده'}
                              </span>
                              <button
                                type="button"
                                onClick={() => setSelectedLocationOrder(order)}
                                className="bg-sky-700 hover:bg-sky-800 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                              >
                                <Send className="w-3.5 h-3.5" />
                                <span>ارسال لوکیشن به راننده</span>
                              </button>
                            </div>
                          </div>
                        )}
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

      {/* Form Interactive Map Picker Modal */}
      <InteractiveMapPicker
        isOpen={isFormMapPickerOpen}
        onClose={() => setIsFormMapPickerOpen(false)}
        cityHint={destinationCity}
        agentTerritories={agentTerritories}
        onConfirmLocation={(url, lat, lng, addressText) => {
          setDeliveryLocationUrl(url);
          if (addressText) {
            setExactAddress(addressText);
            showToast('موقعیت مکانی روی نقشه و آدرس متنی آن با موفقیت ثبت شد.', 'success');
          } else {
            showToast('موقعیت مکانی روی نقشه ثبت شد.', 'success');
          }
        }}
      />

      {/* Edit Order Modal */}
      {editingOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-150 pb-3">
              <h3 className="font-extrabold text-slate-900 text-sm">
                ویرایش سفارش #{editingOrder.orderNumber || editingOrder.id.slice(-6)}
              </h3>
              <button
                type="button"
                onClick={() => setEditingOrder(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-800 font-bold mb-1">نام خریدار:</label>
                <input
                  type="text"
                  value={editBuyerName}
                  onChange={e => setEditBuyerName(e.target.value)}
                  className="w-full bg-emerald-50/30 border-2 border-slate-300/90 rounded-xl py-2 px-3 text-xs text-slate-900 font-bold focus:outline-none focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 shadow-2xs transition-all"
                />
              </div>

              <div>
                <label className="block text-slate-800 font-bold mb-1">تلفن خریدار:</label>
                <input
                  type="text"
                  value={editPhoneNumber}
                  onChange={e => setEditPhoneNumber(e.target.value)}
                  className="w-full bg-emerald-50/30 border-2 border-slate-300/90 rounded-xl py-2 px-3 text-xs text-slate-900 font-mono dir-ltr text-left font-bold focus:outline-none focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 shadow-2xs transition-all"
                />
              </div>

              <div>
                <label className="block text-slate-800 font-bold mb-1">آدرس دقیق تخلیه بار:</label>
                <textarea
                  rows={2}
                  value={editExactAddress}
                  onChange={e => setEditExactAddress(e.target.value)}
                  className="w-full bg-emerald-50/30 border-2 border-slate-300/90 rounded-xl py-2 px-3 text-xs text-slate-900 font-sans font-bold focus:outline-none focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 shadow-2xs transition-all"
                />
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                <label className="block text-slate-800 font-bold mb-1 flex items-center justify-between">
                  <span>کد رهگیری واریز / چک:</span>
                  {editPaymentReceiptUrl && <span className="text-[10px] text-emerald-700 font-bold">✓ فیش الصاق شده</span>}
                </label>
                <input
                  type="text"
                  value={editPaymentTrackingCode}
                  onChange={e => setEditPaymentTrackingCode(e.target.value)}
                  className="w-full bg-emerald-50/30 border-2 border-slate-300/90 rounded-xl py-2 px-3 font-mono text-xs text-slate-900 font-bold focus:outline-none focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 shadow-2xs transition-all"
                />

                <div className="pt-1">
                  <label className="block text-slate-700 font-bold mb-1">تصویر یا PDF فیش واریزی:</label>
                  {editPaymentReceiptUrl ? (
                    <div className="flex items-center justify-between bg-emerald-50 border border-emerald-300 rounded-xl p-2 text-xs">
                      <div className="flex items-center gap-2 truncate">
                        {editPaymentReceiptUrl.startsWith('data:image') ? (
                          <img src={editPaymentReceiptUrl} alt="فیش" className="w-8 h-8 object-cover rounded-lg border border-emerald-400 shrink-0" />
                        ) : (
                          <FileText className="w-5 h-5 text-emerald-700 shrink-0" />
                        )}
                        <span className="font-bold text-emerald-950 truncate text-[11px]">{editPaymentReceiptName || 'فیش_واریزی.jpg'}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setEditPaymentReceiptUrl('');
                          setEditPaymentReceiptName('');
                        }}
                        className="text-rose-600 hover:text-rose-800 text-[10px] font-bold px-2 py-1 bg-white rounded-lg border border-rose-200 cursor-pointer shrink-0"
                      >
                        حذف
                      </button>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center gap-2 bg-white hover:bg-slate-100 text-slate-700 font-bold py-2 px-3 rounded-xl border border-dashed border-slate-300 text-xs transition-colors cursor-pointer shadow-2xs">
                      <UploadCloud className="w-4 h-4 text-emerald-600" />
                      <span>انتخاب یا تغییر فایل فیش واریزی</span>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileRead(file, (url, name) => {
                            setEditPaymentReceiptUrl(url);
                            setEditPaymentReceiptName(name);
                            showToast('تصویر فیش واریزی جدید انتخاب شد.', 'success');
                          });
                        }}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-150">
              <button
                type="button"
                onClick={() => setEditingOrder(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded-xl text-xs font-bold text-slate-700"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleSaveOrderEdit}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-xl text-xs font-bold text-white shadow-sm"
              >
                ذخیره تغییرات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Standalone Payment Receipt Upload Modal */}
      {standaloneReceiptOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-150 pb-3">
              <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-emerald-600" />
                <span>الصاق یا ویرایش فیش واریزی (#{standaloneReceiptOrder.orderNumber || standaloneReceiptOrder.id.slice(-6)})</span>
              </h3>
              <button
                type="button"
                onClick={() => setStandaloneReceiptOrder(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-800 font-bold mb-1">کد رهگیری / شماره واریز / چک:</label>
                <input
                  type="text"
                  value={standaloneTrackingCode}
                  onChange={e => setStandaloneTrackingCode(e.target.value)}
                  placeholder="شماره فیش یا چک..."
                  className="w-full bg-emerald-50/30 border-2 border-slate-300/90 rounded-xl py-2 px-3 text-xs text-slate-900 font-mono font-bold focus:outline-none focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 shadow-2xs transition-all"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">تصویر یا PDF فیش واریزی:</label>
                {standaloneReceiptUrl ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between bg-emerald-50 border border-emerald-300 rounded-xl p-2.5 text-xs">
                      <div className="flex items-center gap-2 truncate">
                        {standaloneReceiptUrl.startsWith('data:image') ? (
                          <img src={standaloneReceiptUrl} alt="فیش" className="w-10 h-10 object-cover rounded-lg border border-emerald-400 shrink-0" />
                        ) : (
                          <FileText className="w-6 h-6 text-emerald-700 shrink-0" />
                        )}
                        <span className="font-bold text-emerald-950 truncate text-xs">{standaloneReceiptName || 'فیش_واریزی.jpg'}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setViewReceiptModalUrl({ url: standaloneReceiptUrl, name: standaloneReceiptName || 'فیش_واریزی.jpg' })}
                          className="text-emerald-700 hover:text-emerald-900 text-[11px] font-bold px-2 py-1 bg-white rounded-lg border border-emerald-200 cursor-pointer"
                        >
                          مشاهده
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setStandaloneReceiptUrl('');
                            setStandaloneReceiptName('');
                          }}
                          className="text-rose-600 hover:text-rose-800 text-[11px] font-bold px-2 py-1 bg-white rounded-lg border border-rose-200 cursor-pointer"
                        >
                          حذف
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold py-6 px-4 rounded-xl border-2 border-dashed border-slate-300 text-xs transition-colors cursor-pointer shadow-2xs">
                    <UploadCloud className="w-8 h-8 text-emerald-600 animate-bounce" />
                    <span className="text-slate-800 font-extrabold">برای آپلود تصویر فیش واریزی اینجا کلیک کنید</span>
                    <span className="text-[10px] text-slate-400">فرمت‌های مجاز: JPG, PNG, PDF (حداکثر ۵ مگابایت)</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileRead(file, (url, name) => {
                          setStandaloneReceiptUrl(url);
                          setStandaloneReceiptName(name);
                          showToast('تصویر فیش واریزی انتخاب گردید.', 'success');
                        });
                      }}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-150">
              <button
                type="button"
                onClick={() => setStandaloneReceiptOrder(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded-xl text-xs font-bold text-slate-700 cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!standaloneReceiptOrder) return;
                  setIsUploadingReceipt(true);
                  try {
                    if (onUpdatePaymentReceipt) {
                      await onUpdatePaymentReceipt(standaloneReceiptOrder.id, {
                        paymentReceiptUrl: standaloneReceiptUrl,
                        paymentReceiptName: standaloneReceiptName,
                        paymentTrackingCode: standaloneTrackingCode
                      });
                    } else if (onEditOrder) {
                      onEditOrder(standaloneReceiptOrder.id, {
                        paymentReceiptUrl: standaloneReceiptUrl,
                        paymentReceiptName: standaloneReceiptName,
                        paymentTrackingCode: standaloneTrackingCode
                      });
                    } else {
                      onUpdatePaymentTracking(standaloneReceiptOrder.id, standaloneTrackingCode);
                    }
                    showToast('فیش واریزی با موفقیت ثبت گردید.', 'success');
                    setStandaloneReceiptOrder(null);
                  } catch (e) {
                    showToast('خطا در ذخیره‌سازی فیش واریزی.', 'error');
                  } finally {
                    setIsUploadingReceipt(false);
                  }
                }}
                disabled={isUploadingReceipt}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
              >
                {isUploadingReceipt ? <span>در حال ذخیره...</span> : <span>ذخیره فیش واریزی</span>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Preview View Receipt Modal */}
      {viewReceiptModalUrl && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-150 pb-2">
              <h4 className="font-extrabold text-slate-900 text-xs flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-emerald-600" />
                <span>تصویر فیش واریزی ({viewReceiptModalUrl.name})</span>
              </h4>
              <button
                type="button"
                onClick={() => setViewReceiptModalUrl(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-[75vh] overflow-auto flex items-center justify-center bg-slate-900 rounded-xl p-2">
              {viewReceiptModalUrl.url.startsWith('data:image') || viewReceiptModalUrl.url.startsWith('http') ? (
                <img src={viewReceiptModalUrl.url} alt="فیش واریزی" className="max-w-full max-h-[70vh] object-contain rounded-lg" />
              ) : (
                <div className="text-center py-10 space-y-3 text-white">
                  <FileText className="w-12 h-12 text-slate-400 mx-auto" />
                  <p className="text-xs font-bold">فایل پیوست شده تصویر مستقیم نیست.</p>
                  <a
                    href={viewReceiptModalUrl.url}
                    download={viewReceiptModalUrl.name}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold"
                  >
                    <Download className="w-4 h-4" />
                    <span>دانلود یا مشاهده فایل</span>
                  </a>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-150 text-xs">
              <a
                href={viewReceiptModalUrl.url}
                download={viewReceiptModalUrl.name}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-all"
              >
                <Download className="w-4 h-4 text-slate-600" />
                <span>دانلود اصل تصویر</span>
              </a>
              <button
                type="button"
                onClick={() => setViewReceiptModalUrl(null)}
                className="px-4 py-1.5 bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Concise Order Items Preview Modal */}
      {proformaModalData && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn dir-rtl text-right">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-xl w-full p-4 sm:p-5 space-y-4 max-h-[90vh] overflow-y-auto font-sans">
            
            {/* Modal Header */}
            <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black text-lg shadow-xs shrink-0">
                  <CheckCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base text-slate-900">پیش‌نمایش و تأیید اقلام سفارش</h3>
                  <p className="text-[11px] text-slate-500">لطفاً اقلام انتخابی و مشخصات را قبل از ثبت نهایی بررسی کنید</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setProformaModalData(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Order Info */}
            <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs">
              <div>
                <span className="text-slate-400 text-[10px] block">خریدار / نمایندگی:</span>
                <strong className="text-slate-900">{proformaModalData.buyerName}</strong>
                <span className="text-[10px] text-slate-500 block font-mono">{proformaModalData.phoneNumber}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block">مقصد تخلیه:</span>
                <strong className="text-slate-900">{proformaModalData.destinationCity}</strong>
                <span className="text-[10px] text-slate-600 block truncate">{proformaModalData.exactAddress}</span>
              </div>
            </div>

            {/* Items Table */}
            <div className="space-y-1.5">
              <h4 className="font-black text-xs text-slate-800 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-emerald-600" />
                <span>لیست محصولات انتخابی ({proformaModalData.items.length} کالا):</span>
              </h4>
              <div className="overflow-hidden border border-slate-200 rounded-xl text-xs">
                <table className="w-full text-right">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-2">نام محصول</th>
                      <th className="p-2 text-center">مقدار</th>
                      <th className="p-2 text-left">فی (تومان)</th>
                      <th className="p-2 text-left">جمع کل (تومان)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {proformaModalData.items.map((item: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="p-2 font-black text-slate-900">{item.productName}</td>
                        <td className="p-2 text-center font-mono font-bold text-emerald-700">{item.quantity.toLocaleString()} {item.unit}</td>
                        <td className="p-2 text-left font-mono">{item.pricePerUnit ? item.pricePerUnit.toLocaleString() : 'استعلام'}</td>
                        <td className="p-2 text-left font-mono font-bold text-slate-900">
                          {item.pricePerUnit ? (item.quantity * item.pricePerUnit).toLocaleString() : 'استعلام'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Total Amount Card */}
            <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-2xl flex items-center justify-between text-xs">
              <span className="font-extrabold text-emerald-950">جمع کل سفارش:</span>
              <span className="font-mono text-base font-black text-emerald-800">
                {proformaModalData.totalAmount.toLocaleString()} تومان
              </span>
            </div>

            {proformaModalData.notes && (
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs text-slate-700">
                <span className="font-bold text-slate-900 block mb-0.5">توضیحات:</span>
                <p className="text-[11px] text-slate-600">{proformaModalData.notes}</p>
              </div>
            )}

            {/* Actions Bar */}
            <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setProformaModalData(null)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-xl text-xs transition-all cursor-pointer border border-slate-300"
              >
                {proformaModalData.isDraft ? '✏️ اصلاح مشخصات' : 'بستن'}
              </button>

              {proformaModalData.isDraft && (
                <button
                  type="button"
                  onClick={executeFinalSubmission}
                  disabled={isSubmitting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-emerald-600/20 active:scale-95"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>{isSubmitting ? 'در حال ارسال...' : 'تأیید نهایی و ارسال سفارش'}</span>
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Order Details Modal */}
      {selectedOrderDetails && (() => {
        const statusInfo = getStatusLabelAndColor(selectedOrderDetails.status);
        const hydratedItems = parseAndHydrateItemsJson(selectedOrderDetails.itemsJson, products);
        const orderItems = hydratedItems.length > 0 ? hydratedItems : [{
          id: 'def-1',
          productId: selectedOrderDetails.productId,
          productName: selectedOrderDetails.productName,
          quantity: selectedOrderDetails.quantity,
          unit: selectedOrderDetails.unit,
          pricePerUnit: 0
        }];
        const totalSum = orderItems.reduce((acc, it) => acc + (it.quantity * it.pricePerUnit), 0);

        return (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn dir-rtl text-right">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-xl w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto">
              
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-sky-50 text-sky-700 rounded-xl border border-sky-200">
                    <Info className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-sm sm:text-base flex items-center gap-2">
                      <span>جزئیات سفارش #{selectedOrderDetails.orderNumber || selectedOrderDetails.id.slice(-6)}</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 font-mono">تاریخ ثبت: {selectedOrderDetails.createdAt || 'امروز'}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedOrderDetails(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Status Badge */}
              <div className="flex items-center justify-between bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs">
                <span className="text-slate-600 font-bold">وضعیت کنونی سفارش:</span>
                <span className={`font-black px-3 py-1 rounded-full border ${statusInfo.badge}`}>
                  {statusInfo.text}
                </span>
              </div>

              {/* Buyer & Agent Details */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2 text-xs">
                <span className="font-extrabold text-slate-900 block border-b border-slate-200 pb-1.5">👤 اطلاعات خریدار و نمایندگی:</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700">
                  <div>خریدار پروژه: <strong className="text-slate-900">{selectedOrderDetails.buyerName || selectedOrderDetails.customerName}</strong></div>
                  <div>شماره تماس: <strong className="text-slate-900 font-mono">{selectedOrderDetails.phoneNumber || 'ثبت نشده'}</strong></div>
                  <div>نمایندگی: <strong className="text-slate-900">{selectedOrderDetails.customerName} ({selectedOrderDetails.agentCode || currentAgentObj.agentCode})</strong></div>
                  {selectedOrderDetails.isExportOrder && (
                    <div className="text-amber-800 font-bold">🌍 سفارش صادراتی: {selectedOrderDetails.destinationCountry || 'خارج از کشور'}</div>
                  )}
                </div>
              </div>

              {/* Destination & Location Details */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2 text-xs">
                <span className="font-extrabold text-slate-900 block border-b border-slate-200 pb-1.5">📍 مشخصات تخلیه و بارگیری:</span>
                <div className="space-y-1.5 text-slate-700">
                  <div>شهر مقصد: <strong className="text-slate-900">{selectedOrderDetails.destinationCity}</strong></div>
                  <div>آدرس دقیق تخلیه: <strong className="text-slate-900">{selectedOrderDetails.exactAddress}</strong></div>
                  {selectedOrderDetails.deliveryLocationUrl && (
                    <div className="pt-1">
                      <a 
                        href={selectedOrderDetails.deliveryLocationUrl} 
                        target="_blank" 
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-emerald-700 hover:text-emerald-900 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-xl text-[11px] font-bold"
                      >
                        <MapPin className="w-3.5 h-3.5" />
                        <span>مشاهده موقعیت مکانی تخلیه روی نقشه GPS</span>
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Ordered Items Table */}
              <div className="space-y-2">
                <span className="font-extrabold text-slate-900 text-xs block">🧱 اقلام خریده شده ({orderItems.length} کالا):</span>
                <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                  <table className="w-full text-right">
                    <thead className="bg-slate-100 text-slate-700 font-bold">
                      <tr>
                        <th className="p-2">نام کالا</th>
                        <th className="p-2 text-center">مقدار</th>
                        <th className="p-2 text-left">فی واحد (تومان)</th>
                        <th className="p-2 text-left">جمع کل (تومان)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {orderItems.map((item, idx) => (
                        <tr key={idx}>
                          <td className="p-2 font-black text-slate-900">{item.productName}</td>
                          <td className="p-2 text-center font-mono font-bold text-emerald-700">{item.quantity.toLocaleString()} {item.unit}</td>
                          <td className="p-2 text-left font-mono">{item.pricePerUnit ? item.pricePerUnit.toLocaleString() : 'استعلام'}</td>
                          <td className="p-2 text-left font-mono font-bold text-slate-900">
                            {item.pricePerUnit ? (item.quantity * item.pricePerUnit).toLocaleString() : 'استعلام'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {totalSum > 0 && (
                  <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl text-xs flex justify-between items-center font-black text-emerald-900">
                    <span>مبلغ کل اقلام:</span>
                    <span className="font-mono text-sm">{totalSum.toLocaleString()} تومان</span>
                  </div>
                )}
              </div>

              {/* Payment Info */}
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 font-bold">کد رهگیری واریزی:</span>
                  <strong className="font-mono text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                    {selectedOrderDetails.paymentTrackingCode || 'ثبت نشده'}
                  </strong>
                </div>
                {selectedOrderDetails.paymentReceiptUrl && (
                  <div className="flex justify-between items-center pt-1 border-t border-slate-200">
                    <span className="text-slate-600 font-bold">تصویر فیش واریزی:</span>
                    <button
                      type="button"
                      onClick={() => setViewReceiptModalUrl({ url: selectedOrderDetails.paymentReceiptUrl!, name: selectedOrderDetails.paymentReceiptName || 'فیش_واریزی.jpg' })}
                      className="text-emerald-700 hover:text-emerald-900 font-extrabold underline flex items-center gap-1 cursor-pointer"
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                      <span>مشاهده تصویر فیش</span>
                    </button>
                  </div>
                )}
              </div>

              {selectedOrderDetails.notes && (
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs text-slate-700">
                  <span className="font-bold text-slate-900 block mb-0.5">توضیحات و ملاحظات:</span>
                  <p className="text-[11px] text-slate-600">{selectedOrderDetails.notes}</p>
                </div>
              )}

              {/* Footer Actions */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
                {onEditOrder && selectedOrderDetails.status !== 'LOADED_AND_DISPATCHED' && selectedOrderDetails.status !== 'REJECTED' ? (
                  <button
                    type="button"
                    onClick={() => {
                      const ord = selectedOrderDetails;
                      setSelectedOrderDetails(null);
                      handleOpenEditModal(ord);
                    }}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-extrabold px-4 py-2 rounded-xl text-xs transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
                  >
                    <Edit className="w-4 h-4 text-white" />
                    <span>ویرایش اطلاعات این سفارش</span>
                  </button>
                ) : <div />}

                <button
                  type="button"
                  onClick={() => setSelectedOrderDetails(null)}
                  className="bg-slate-800 hover:bg-slate-900 text-white font-bold px-5 py-2 rounded-xl text-xs transition-all cursor-pointer shadow-xs"
                >
                  بستن
                </button>
              </div>

            </div>
          </div>
        );
      })()}

    </div>
  );
}
