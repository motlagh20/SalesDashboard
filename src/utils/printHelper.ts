/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Order, Product, Agent } from '../types';

/**
 * Generates an elegant, consolidated single-page printable list of orders
 * representing registered requests dispatched to the factory.
 * Optimized for physical filing, incorporatingAgent Code/Name, Product details, Total Quantities, and Destination Addresses.
 */
export function printOrders(orders: Order[], products: Product[], agents: Agent[]) {
  if (!orders || orders.length === 0) return;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) return;

  const printDate = new Date().toLocaleDateString('fa-IR');
  const printTime = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });

  // Compute aggregate indicators
  let totalUniqueOrders = orders.length;
  let totalQuantitySum = 0;
  let tableRowsHtml = '';

  orders.forEach((order, index) => {
    // 1. Resolve Agent Code and Name
    const agent = agents.find(a => a.agentCode === order.agentCode || a.fullName === order.customerName);
    const agentLabel = agent 
      ? `${agent.alias} (کد: ${agent.agentCode})` 
      : `${order.customerName} (کد: ${order.agentCode || 'نامشخص'})`;

    // 2. Resolve Product details (with support for multiple items of the order)
    let productDetailsText = '';
    if (order.itemsJson) {
      try {
        const parsedItems = JSON.parse(order.itemsJson);
        if (Array.isArray(parsedItems)) {
          productDetailsText = parsedItems.map(item => {
            const qty = item.quantity || 0;
            totalQuantitySum += qty;
            return `${item.productName || 'کالا'} • ${qty.toLocaleString('fa-IR')} ${item.unit || order.unit || 'عدد'}`;
          }).join('<br/>');
        }
      } catch (e) {
        // Fallback below
      }
    }

    if (!productDetailsText) {
      const qty = order.quantity || 0;
      totalQuantitySum += qty;
      productDetailsText = `${order.productName || 'محصول'} • ${qty.toLocaleString('fa-IR')} ${order.unit || 'عدد'}`;
    }

    // 3. Exact Address formatting
    const addressLabel = `<strong style="color: #0f172a;">${order.destinationCity}</strong> - ${order.exactAddress || 'آدرس ثبت نشده'}`;

    tableRowsHtml += `
      <tr style="border-bottom: 1px solid #cbd5e1; text-align: right; vertical-align: top;">
        <td style="padding: 10px; font-weight: bold; text-align: center; border-left: 1px solid #e2e8f0; font-family: 'Tahoma', sans-serif;">${(index + 1).toLocaleString('fa-IR')}</td>
        <td style="padding: 10px; border-left: 1px solid #e2e8f0; font-family: monospace; font-size: 10px; color: #475569; text-align: center;">${order.orderNumber}</td>
        <td style="padding: 10px; border-left: 1px solid #e2e8f0; font-weight: bold; color: #1e3a8a;">${agentLabel}</td>
        <td style="padding: 10px; border-left: 1px solid #e2e8f0; line-height: 1.5; font-size: 11px;">
          ${productDetailsText}
        </td>
        <td style="padding: 10px; font-size: 11px; max-width: 250px; white-space: normal; word-break: break-all;">${addressLabel}</td>
      </tr>
    `;
  });

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="fa" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>لیست تجمیعی سفارش‌های ارسالی به کارخانه</title>
      <style>
        @media print {
          body {
            background-color: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            margin: 0;
            padding: 0;
          }
          .print-sheet {
            border: none !important;
            box-shadow: none !important;
            margin: 0 !important;
            padding: 8mm 10mm !important;
            width: auto !important;
            max-width: none !important;
          }
        }
        @page {
          size: A4 portrait;
          margin: 10mm 8mm 10mm 8mm;
        }
        body {
          font-family: 'Tahoma', 'Segoe UI', Arial, sans-serif;
          background-color: #f1f5f9;
          margin: 0;
          padding: 20px;
          direction: rtl;
        }
        td, th {
          font-size: 11px;
        }
      </style>
    </head>
    <body>
      <div class="print-sheet" style="font-family: 'Tahoma', 'Segoe UI', Arial; font-size: 12px; line-height: 1.6; color: #334155; max-width: 850px; margin: 0 auto; background-color: white; border: 1px solid #cbd5e1; border-radius: 8px; padding: 25px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
        
        <!-- Document Header Banner -->
        <table style="width: 100%; border-bottom: 2px solid #1e3a8a; padding-bottom: 12px; margin-bottom: 15px;">
          <tr>
            <td style="width: 30%; text-align: right; vertical-align: middle;">
              <div style="font-size: 10px; color: #475569; line-height: 1.7;">
                <strong>نوع سند:</strong> لیست تجمیعی سفارشات ارسالی<br/>
                <strong>واحد صادرکننده:</strong> مدیریت بازرگانی طبرستان<br/>
                <strong>دستگاه چاپی:</strong> وب-سامانه متمرکز برخط
              </div>
            </td>
            <td style="width: 40%; text-align: center; vertical-align: middle;">
              <h2 style="margin: 0; font-size: 15px; color: #1e3a8a; font-weight: bold;">صنایع سفال بام و آجر طبرستان</h2>
              <h3 style="margin: 4px 0 0 0; font-size: 12px; color: #0f172a; font-weight: bold;">خلاصه درخواست‌های ثبت‌شده و ارسالی به کارخانه</h3>
            </td>
            <td style="width: 30%; text-align: left; vertical-align: middle;">
              <div style="font-size: 10px; color: #475569; line-height: 1.7;">
                <strong>تاریخ گزارش:</strong> ${printDate}<br/>
                <strong>ساعت چاپ:</strong> ${printTime}<br/>
                <strong>وضعیت فرآیند:</strong> <span style="color: #10b981; font-weight: bold;">ارسال شده به خط تولید</span>
              </div>
            </td>
          </tr>
        </table>

        <!-- Statistics Indicators Bar -->
        <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 15px; margin-bottom: 15px; background-color: #f8fafc; display: flex; justify-content: space-between; align-items: center; font-size: 11px;">
          <div>
            <strong>تعداد کل حواله‌ها:</strong> <span style="font-family: 'Tahoma', sans-serif; font-weight: bold; color: #1e3a8a;">${totalUniqueOrders.toLocaleString('fa-IR')} مورد</span>
          </div>
          <div>
            <strong>مجموع کلی اقلام درخواستی:</strong> <span style="font-family: 'Tahoma', sans-serif; font-weight: bold; color: #1e3a8a;">${totalQuantitySum.toLocaleString('fa-IR')} واحد</span>
          </div>
          <div style="color: #e11d48; font-weight: bold; font-size: 10px;">
            ⚠️ مرجع فیزیکی پرونده‌های ثبتی دفتر بازرگانی
          </div>
        </div>

        <!-- Main Consolidated Table -->
        <table style="width: 100%; border-collapse: collapse; margin-top: 5px; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden;">
          <thead>
            <tr style="background-color: #1e3a8a; color: white; height: 35px; text-align: right;">
              <th style="width: 6%; text-align: center; border-left: 1px solid rgba(255,255,255,0.2);">ردیف</th>
              <th style="width: 14%; text-align: center; border-left: 1px solid rgba(255,255,255,0.2);">شماره حواله</th>
              <th style="width: 25%; padding-right: 10px; border-left: 1px solid rgba(255,255,255,0.2);">کد و نام نمایندگی</th>
              <th style="width: 25%; padding-right: 10px; border-left: 1px solid rgba(255,255,255,0.2);">جزئیات محصول و مقدار</th>
              <th style="width: 30%; padding-right: 10px;">آدرس دقیق مقصد (تخلیه کالا)</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>

        <!-- Signature Block for Audits and Archives -->
        <table style="width: 100%; margin-top: 45px; border-top: 1px solid #cbd5e1; padding-top: 25px; text-align: center; font-size: 11px;">
          <tr>
            <td style="width: 33.3%;">
              <strong>مسئول واحد بازرگانی (صادرکننده‌)</strong><br/>
              <span style="font-size: 9px; color: #16a34a; font-weight: bold;">( تایید سیستمی متمرکز )</span><br/><br/><br/>
              <span style="color: #94a3b8;">طبرستان - تایید شد</span>
            </td>
            <td style="width: 33.4%;">
              <strong>سرپرست تولید و انبار کارخانه</strong><br/>
              <span style="font-size: 9px; color: #475569;">( جهت تطبیق و خروج کالا )</span><br/><br/><br/>
              <span style="color: #cbd5e1;">...................................</span>
            </td>
            <td style="width: 33.3%;">
              <strong>مسئول هماهنگی باربری اختصاصی</strong><br/>
              <span style="font-size: 9px; color: #475569;">( نوبت‌دهی و اعزام خودرو )</span><br/><br/><br/>
              <span style="color: #cbd5e1;">...................................</span>
            </td>
          </tr>
        </table>

        <!-- Security Bar and Identifier Tag -->
        <div style="font-size: 9px; color: #94a3b8; text-align: center; margin-top: 40px; border-top: 1px dashed #e2e8f0; padding-top: 8px;">
          لیست مکانیزه سیستمی برای سوابق فیزیکی • صنایع سفال و آجر طبرستان • کد کنترل ایمنی: <span style="font-family: monospace;">TBR-BATCH-${(orders.map(o => o.id.slice(0, 2)).join('')).toUpperCase() || 'SYS'}</span>
        </div>

      </div>
    </body>
    </html>
  `;

  doc.write(htmlContent);
  doc.close();

  // Trigger print dialog
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.error("Single-sheet print operation failed within iframe:", e);
    }
    
    // Smooth cleanup
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 2000);
  }, 400);
}
