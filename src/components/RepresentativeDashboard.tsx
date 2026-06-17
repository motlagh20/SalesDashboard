/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Order, Product, OrderStatus, Agent, AppUser } from '../types';
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
  Coins
} from 'lucide-react';

interface RepresentativeDashboardProps {
  orders: Order[];
  products: Product[];
  agents: Agent[];
  onCreateOrder: (orderData: Partial<Order>) => void;
  onCancelOrder: (orderId: string) => void;
  onUpdatePaymentTracking: (orderId: string, paymentTrackingCode: string) => void;
  selectedAgent: string;
  setSelectedAgent: (agent: string) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  askConfirm: (title: string, message: string, onConfirm: () => void) => void;
  currentUser?: AppUser | null;
}

export default function RepresentativeDashboard({
  orders,
  products,
  agents,
  onCreateOrder,
  onCancelOrder,
  onUpdatePaymentTracking,
  selectedAgent,
  setSelectedAgent,
  showToast,
  askConfirm,
  currentUser,
}: RepresentativeDashboardProps) {
  const currentAgentObj = agents.find(a => a.alias === selectedAgent) || agents[0] || {
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
  const [quantity, setQuantity] = useState(5000);
  const [destinationCity, setDestinationCity] = useState('تهران - شهریار');
  const [exactAddress, setExactAddress] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  
  // Multi-item invoice builder states
  interface InvoiceItem {
    id: string;
    productId: string;
    productName: string;
    quantity: number;
    unit: string;
    pricePerUnit: number;
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
        pricePerUnit: prodObj.pricePerUnit
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

  // Autofill representative phone and address when switched to speed up sandbox demo!
  useEffect(() => {
    if (currentAgentObj) {
      setExactAddress(currentAgentObj.address || '');
      setPhoneNumber(currentAgentObj.phoneNumber || '');
      setDestinationCity(currentAgentObj.area.includes('تهران') ? 'تهران - شهریار' : 
                         currentAgentObj.area.includes('اصفهان') ? 'اصفهان - شهرک صنعتی' : 
                         currentAgentObj.area.includes('رشت') ? 'گیلان - رشت' : 'فارس - شیراز');
    }
  }, [selectedAgent, currentAgentObj]);

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
    conversionRatio: 14
  }) as Product;
  const estimatedPrice = quantity * selectedProduct.pricePerUnit;

  // Filter orders for the selected agent
  const agentOrders = orders.filter(o => o.customerName === selectedAgent);

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
        paymentTrackingCode: paymentTrackingCode.trim() || undefined
      });

      // Reset form (except address/phone for easy usage)
      setNotes('');
      setInvoiceItems([]);
      setBuyerName('');
      setPaymentTrackingCode('');
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
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 text-right dir-rtl font-sans" id="rep-dashboard">
      
      {/* Right Column: Form to register orders (Takes 5 cols on desktop) */}
      <div className="lg:col-span-5 order-2 lg:order-1" id="rep-column-form">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sticky top-6" id="order-form-container">
          
          {/* Agent Switcher Simulator (Only editable by SALES_MANAGER, locked to actual agency for logged in REPRESENTATIVEs) */}
          {currentUser?.role === 'SALES_MANAGER' ? (
            <div className="mb-6 p-4 bg-emerald-50/50 rounded-xl border border-emerald-100 animate-fade-in" id="agent-selector-box">
              <label className="block text-xs font-bold text-emerald-800 mb-2 font-sans">📲 شبیه‌ساز ورود به عنوان نمایندگی فروش (مدیر بازرگانی):</label>
              <select
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
                className="w-full bg-white border border-emerald-200 rounded-lg py-2 px-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-sans cursor-pointer"
                id="agent-dropdown"
              >
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.alias} disabled={!agent.isEnabled}>
                    {agent.alias} (کد: {agent.agentCode}) {!agent.isEnabled ? '🛑 (غیرفعال شده)' : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200" id="agent-locked-info-box">
              <div className="flex items-center gap-2 justify-end mb-1">
                <span className="text-xs font-extrabold text-slate-700">{currentAgentObj?.fullName || 'نامشخص'}</span>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-700 py-0.5 px-2 rounded-full font-sans font-bold">📲 نمایندگی امن فعال</span>
              </div>
              <p className="text-[10px] text-slate-500 font-sans">
                کد نمایندگی: <strong className="font-mono text-slate-705">{currentAgentObj?.agentCode || 'کد خطا'}</strong> • منطقه جغرافیایی: {currentAgentObj?.area || 'سراسر کشور'}
              </p>
            </div>
          )}

          <div className="flex items-center gap-2.5 mb-5 justify-end">
            <h3 className="text-lg font-bold text-slate-800">فرم ثبت سفارش جدید سفال</h3>
            <PlusCircle className="w-5 h-5 text-emerald-600" />
          </div>

          {successMessage && (
            <div className="mb-5 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center justify-end gap-2" id="success-alert">
              <span>{successMessage}</span>
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
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
              <div className="mt-2 text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded border border-slate-100 space-y-1">
                <p>🧱 <strong>توضیحات:</strong> {selectedProduct.description}</p>
                {selectedProduct.weight && <p>⚖️ <strong>وزن واحد:</strong> {selectedProduct.weight}</p>}
                {selectedProduct.dimensions && <p>📐 <strong>ابعاد محصول:</strong> {selectedProduct.dimensions}</p>}
                {selectedProduct.coverageInfo && <p>📊 <strong>تعداد در متراژ:</strong> {selectedProduct.coverageInfo}</p>}
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
                <label className="block text-xs font-bold text-slate-700 mb-1.5">مقدار مورد نیاز:</label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={quantity}
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
                  const parsedNum = selectedProduct.coverageInfo.match(/\d+/);
                  if (parsedNum) ratio = parseInt(parsedNum[0], 10);
                }
                if (ratio) {
                  return (
                    <div className="bg-emerald-50/70 text-emerald-950 px-3 py-2 rounded-lg border border-emerald-100 text-[11px] flex justify-between items-center">
                      <span className="font-mono font-bold text-emerald-700">
                        {(quantity * ratio).toLocaleString()} {pUnit}
                      </span>
                      <span className="text-slate-600">تعداد نهایی محصول برای بخش‌های تولید کارخانه:</span>
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
                    <div key={item.id} className="flex justify-between items-center text-[10px] bg-white border border-slate-100 px-3 py-2 rounded shadow-sm">
                      <button
                        type="button"
                        onClick={() => {
                          setInvoiceItems(invoiceItems.filter((_, i) => i !== index));
                        }}
                        className="text-rose-500 hover:text-rose-700 font-bold cursor-pointer"
                        title="حذف این الگو"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-slate-600 font-mono">
                        {item.quantity.toLocaleString()} {item.unit} × {item.pricePerUnit.toLocaleString()} تومان
                      </span>
                      <strong className="text-slate-800">{item.productName}</strong>
                    </div>
                  ))}
                </div>
                <div className="text-left text-[11px] font-bold text-emerald-800 bg-emerald-50/50 p-1.5 rounded">
                  جمع کل پیش‌فاکتور چندمحصولی: {invoiceItems.reduce((sum, item) => sum + item.quantity * item.pricePerUnit, 0).toLocaleString()} تومان
                </div>
              </div>
            )}

            {/* Simulated Live Cost Calculation */}
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-150 flex justify-between items-center text-xs">
              <span className="text-emerald-700 font-bold font-mono">
                {invoiceItems.length > 0
                  ? invoiceItems.reduce((sum, item) => sum + item.quantity * item.pricePerUnit, 0).toLocaleString()
                  : estimatedPrice.toLocaleString()
                } تومان
              </span>
              <span className="text-slate-500">مجموع تقریبی پیش‌فاکتور خرید:</span>
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

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">استان / شهر مقصد تخلیه:</label>
                <select
                  value={destinationCity}
                  onChange={(e) => setDestinationCity(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-sans"
                  id="form-city-select"
                >
                  <option value="تهران - شهریار">تهران - شهریار</option>
                  <option value="اصفهان - شهرک صنعتی">اصفهان - شهرک صنعتی جی</option>
                  <option value="گیلان - رشت">گیلان - رشت</option>
                  <option value="مازندران - ساری">مازندران - ساری</option>
                  <option value="مازندران - بابل">مازندران - بابل</option>
                  <option value="گلستان - گرگان">گلستان - گرگان</option>
                  <option value="فارس - شیراز">فارس - شیراز</option>
                  <option value="خراسان رضوی - مشهد">خراسان رضوی - مشهد</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">آدرس دقیق کارگاهی جهت تخلیه بار:</label>
                <textarea
                  rows={2}
                  required
                  placeholder="مثال: جنب پروژه فاز ۳، نبش خیابان گلستان، انبار تخلیه سفال..."
                  value={exactAddress}
                  onChange={(e) => setExactAddress(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder-slate-400 font-sans"
                  id="form-address-textarea"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">تلفن خریدار:</label>
                <input
                  type="text"
                  required
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-left"
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

      {/* Left Column: Live tracking and list of orders (Takes 7 cols on desktop) */}
      <div className="lg:col-span-7 order-1 lg:order-2 flex flex-col gap-6" id="rep-column-list">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6" id="agent-orders-card">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 mb-5 gap-3">
            <span className="text-xs bg-slate-100 text-slate-600 border border-slate-200 py-1 px-2.5 rounded-full font-mono font-bold self-start">
              تعداد سفارشات: {agentOrders.length} مورد
            </span>
            <div className="flex items-center gap-2 justify-end">
              <h3 className="text-lg font-bold text-slate-800">پیگیری سفـارشات جاری نمایندگی</h3>
              <ShoppingBag className="w-5 h-5 text-emerald-600" />
            </div>
          </div>

          {agentOrders.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200" id="empty-agent-orders">
              <Sparkles className="w-10 h-10 text-slate-400 mx-auto mb-3" />
              <p className="text-slate-600 text-xs font-bold">هیچ سفارشی برای این نمایندگی ثبت نشده است.</p>
              <p className="text-slate-400 text-[11px] mt-1">با پر کردن فرم سمت راست می‌توانید اولین سفارش را ثبت کنید.</p>
            </div>
          ) : (
            <div className="space-y-6" id="agent-orders-sequence">
              {agentOrders.map((order) => {
                const statusDetails = getStatusLabelAndColor(order.status);
                return (
                  <div 
                    key={order.id} 
                    className="border border-slate-200/80 rounded-xl p-5 hover:border-slate-300 transition-all bg-white"
                    id={`order-card-${order.id}`}
                  >
                    {/* Header line of the item */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 mb-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[11px] font-bold border py-1 px-2.5 rounded-full ${statusDetails.badge}`}>
                          {statusDetails.text}
                        </span>
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
                        <span className="text-xs font-mono font-bold text-slate-800">{order.orderNumber}</span>
                        <span className="text-[10px] text-slate-400 mr-2 font-mono">({new Date(order.createdAt).toLocaleDateString('fa-IR')})</span>
                      </div>
                    </div>

                    {/* Order details summary */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs mb-4" id={`details-grid-${order.id}`}>
                      {order.itemsJson ? (
                        <div className="md:col-span-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-right space-y-1">
                          <span className="text-slate-400 font-bold block text-[9.5px] border-b border-slate-200 pb-1 mb-1">اقلام سبد خرید فاکتور چندمحصولی:</span>
                          {(() => {
                            try {
                              const parsed = JSON.parse(order.itemsJson);
                              if (Array.isArray(parsed)) {
                                return parsed.map((item: any, i: number) => (
                                  <div key={i} className="flex justify-between text-[11px] text-slate-700">
                                    <span>{item.quantity.toLocaleString()} {item.unit} × {item.pricePerUnit.toLocaleString()} تومان</span>
                                    <strong className="text-slate-800">{item.productName}</strong>
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
                                    const parsedNum = prod.coverageInfo.match(/\d+/);
                                    if (parsedNum) ratio = parseInt(parsedNum[0], 10);
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
                    <div className="mt-3 bg-slate-50 p-2.5 rounded-lg border border-slate-100 flex items-center justify-between text-xs flex-wrap gap-2 text-right">
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


                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/50 mt-4" id={`stepper-${order.id}`}>
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
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
