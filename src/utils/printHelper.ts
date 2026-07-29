/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Order, Product, Agent } from '../types';

/**
 * Generates an elegant, consolidated single-page printable list of orders
 * representing registered requests dispatched to the factory.
 * Optimized for narrow-margin printing and physical filing, incorporating
 * Agent Code/Name, itemized product details with separate rows/badges, and customer contact numbers.
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
      ? `
        <div style="font-size: 11px; font-weight: bold; color: #1e3a8a; line-height: 1.3;">${agent.fullName}</div>
        <div style="font-size: 10px; color: #475569; margin-top: 2.5px; font-weight: normal; font-family: 'Tahoma', sans-serif;">کد نمایندگی: ${agent.agentCode}</div>
      `
      : `
        <div style="font-size: 11px; font-weight: bold; color: #1e3a8a; line-height: 1.3;">${order.customerName || 'نامشخص'}</div>
        <div style="font-size: 10px; color: #475569; margin-top: 2.5px; font-weight: normal; font-family: 'Tahoma', sans-serif;">کد نمایندگی: ${order.agentCode || 'نامشخص'}</div>
      `;

    // 2. Resolve Product details (showing items separately "به تفکیک")
    let productDetailsText = '';
    if (order.itemsJson) {
      try {
        const parsedItems = JSON.parse(order.itemsJson);
        if (Array.isArray(parsedItems)) {
          productDetailsText = parsedItems.map((item, idx) => {
            const qty = item.quantity || 0;
            totalQuantitySum += qty;
            return `
              <div style="padding: 4px 0; border-bottom: ${idx < parsedItems.length - 1 ? '1px dashed #e2e8f0' : 'none'}; display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                <span style="font-weight: bold; color: #1e3a8a;">${item.productName || 'کالا'}</span>
                <span style="background-color: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-weight: bold; color: #0f172a; font-family: 'Tahoma', sans-serif;">
                  ${qty.toLocaleString('fa-IR')} ${item.unit || order.unit || 'عدد'}
                </span>
              </div>
            `;
          }).join('');
        }
      } catch (e) {
        // Fallback below
      }
    }

    if (!productDetailsText) {
      const qty = order.quantity || 0;
      totalQuantitySum += qty;
      productDetailsText = `
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
          <span style="font-weight: bold; color: #1e3a8a;">${order.productName || 'محصول'}</span>
          <span style="background-color: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-weight: bold; color: #0f172a; font-family: 'Tahoma', sans-serif;">
            ${qty.toLocaleString('fa-IR')} ${order.unit || 'عدد'}
          </span>
        </div>
      `;
    }

    // 3. Exact Address with the buyer's name & phone number
    const buyerSuffix = order.buyerName 
      ? `<div style="margin-bottom: 4.5px; font-size: 11px;"><span style="color: #475569;">خریدار:</span> <strong style="color: #16a34a;">${order.buyerName}</strong></div>` 
      : '';
    const phoneSuffix = order.phoneNumber 
      ? ` • <span style="color: #475569; font-weight: bold;">تلفن خریدار:</span> <span style="font-family: 'Tahoma', sans-serif; font-weight: bold; color: #0369a1;">${order.phoneNumber}</span>` 
      : '';
    const addressLabel = `${buyerSuffix}<strong style="color: #0f172a;">${order.destinationCity}</strong> - ${order.exactAddress || 'آدرس ثبت نشده'}${phoneSuffix}`;

    tableRowsHtml += `
      <tr style="border-bottom: 1px solid #cbd5e1; text-align: right; vertical-align: middle;">
        <td style="padding: 10px; font-weight: bold; text-align: center; border-left: 1px solid #e2e8f0; font-family: 'Tahoma', sans-serif;">${(index + 1).toLocaleString('fa-IR')}</td>
        <td style="padding: 10px; border-left: 1px solid #e2e8f0; font-family: monospace; font-size: 10px; color: #475569; text-align: center;">${order.orderNumber}</td>
        <td style="padding: 10px; border-left: 1px solid #e2e8f0; vertical-align: middle;">${agentLabel}</td>
        <td style="padding: 10px; border-left: 1px solid #e2e8f0; line-height: 1.5; font-size: 11px;">
          ${productDetailsText}
        </td>
        <td style="padding: 10px; font-size: 11px; max-width: 280px; white-space: normal; word-break: break-all;">${addressLabel}</td>
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
            padding: 5mm !important;
            width: auto !important;
            max-width: none !important;
          }
        }
        @page {
          size: A4 portrait;
          margin: 5mm; /* Narrow Margin Setting */
        }
        body {
          font-family: 'Tahoma', 'Segoe UI', Arial, sans-serif;
          background-color: #f1f5f9;
          margin: 0;
          padding: 10px;
          direction: rtl;
        }
        td, th {
          font-size: 11px;
        }
      </style>
    </head>
    <body>
      <div class="print-sheet" style="font-family: 'Tahoma', 'Segoe UI', Arial; font-size: 11px; line-height: 1.5; color: #334155; max-width: 850px; margin: 0 auto; background-color: white; border: 1px solid #cbd5e1; border-radius: 8px; padding: 20px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
        
        <!-- Document Header Banner -->
        <table style="width: 100%; border-bottom: 2px solid #1e3a8a; padding-bottom: 12px; margin-bottom: 12px;">
          <tr>
            <!-- RIGHT CELL: Company Logo and branding -->
            <td style="width: 35%; text-align: right; vertical-align: middle;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <!-- Real Corporate Logo -->
                <div style="width: 48px; height: 48px; display: inline-flex; align-items: center; justify-content: center; shrink-0; overflow: hidden;">
                  <img src="${window.location.origin}/logo.png" alt="سفال طبرستان" style="max-width: 100%; max-height: 100%; object-fit: contain; display: block;" />
                </div>
                <div>
                  <div style="font-size: 13px; font-weight: bold; color: #1e3a8a; font-family: 'Tahoma', sans-serif;">سفال طبرستان</div>
                  <div style="font-size: 9px; color: #475569; font-weight: normal; margin-top: 1px;">تولیدی صنایع سفال طبرستان</div>
                </div>
              </div>
            </td>

            <!-- CENTER CELL: Document Title -->
            <td style="width: 35%; text-align: center; vertical-align: middle;">
              <h2 style="margin: 0; font-size: 14px; color: #1e3a8a; font-weight: bold;">تولیدی صنایع سفال طبرستان</h2>
              <h3 style="margin: 3px 0 0 0; font-size: 11px; color: #0f172a; font-weight: bold;">خلاصه درخواست‌های ثبت‌‌شده و ارسالی به کارخانه</h3>
            </td>

            <!-- LEFT CELL: Document Metadata, Date & Process Status -->
            <td style="width: 30%; text-align: left; vertical-align: middle;">
              <div style="font-size: 10px; color: #475569; line-height: 1.7; text-align: left;">
                <strong>تاریخ:</strong> ${printDate}<br/>
                <strong>ساعت:</strong> ${printTime}<br/>
                <strong>وضعیت:</strong> <span style="color: #10b981; font-weight: bold;">ارسال شده</span>
              </div>
            </td>
          </tr>
        </table>

        <!-- Statistics Indicators Bar (with physical reference label deleted) -->
        <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; background-color: #f8fafc; display: flex; justify-content: space-between; align-items: center; font-size: 11px;">
          <div>
            <strong>تعداد کل سفارش‌ها:</strong> <span style="font-family: 'Tahoma', sans-serif; font-weight: bold; color: #1e3a8a;">${totalUniqueOrders.toLocaleString('fa-IR')} مورد</span>
          </div>
          <div>
            <strong>مجموع کلی اقلام درخواستی:</strong> <span style="font-family: 'Tahoma', sans-serif; font-weight: bold; color: #1e3a8a;">${totalQuantitySum.toLocaleString('fa-IR')} واحد</span>
          </div>
        </div>

        <!-- Main Consolidated Table (Terminology changed to "سفارش") -->
        <table style="width: 100%; border-collapse: collapse; margin-top: 5px; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden;">
          <thead>
            <tr style="background-color: #1e3a8a; color: white; height: 35px; text-align: right;">
              <th style="width: 5%; text-align: center; border-left: 1px solid rgba(255,255,255,0.2);">ردیف</th>
              <th style="width: 13%; text-align: center; border-left: 1px solid rgba(255,255,255,0.2);">شماره سفارش</th>
              <th style="width: 18%; padding-right: 10px; border-left: 1px solid rgba(255,255,255,0.2);">نماینده مسئول و کد</th>
              <th style="width: 31%; padding-right: 10px; border-left: 1px solid rgba(255,255,255,0.2);">جزئیات محصول و مقدار</th>
              <th style="width: 33%; padding-right: 10px;">آدرس دقیق مقصد (تخلیه کالا)</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>

        <!-- Signature Block for Audits and Archives -->
        <table style="width: 100%; margin-top: 40px; border-top: 1px solid #cbd5e1; padding-top: 20px; text-align: center; font-size: 11px;">
          <tr>
            <td style="width: 50%;">
              <strong>مدیر بازرگانی/مدیرعامل (صادرکننده‌)</strong><br/>
              <span style="font-size: 9px; color: #16a34a; font-weight: bold;">( تایید سیستمی متمرکز )</span><br/><br/><br/>
              <span style="color: #475569; font-weight: bold;">تولیدی صنایع سفال طبرستان</span>
            </td>
            <td style="width: 50%;">
              <strong>مدیرکارخانه</strong><br/>
              <span style="font-size: 9px; color: #475569;">( جهت تطبیق و خروج کالا )</span><br/><br/><br/>
              <span style="color: #cbd5e1;">...................................</span>
            </td>
          </tr>
        </table>

        <!-- Security Bar and Identifier Tag with new brand representation -->
        <div style="font-size: 9px; color: #94a3b8; text-align: center; margin-top: 35px; border-top: 1px dashed #e2e8f0; padding-top: 8px;">
          لیست مکانیزه سیستمی برای سوابق فیزیکی • تولیدی صنایع سفال طبرستان • کد کنترل ایمنی: <span style="font-family: monospace;">TBR-BATCH-${(orders.map(o => o.id.slice(0, 2)).join('')).toUpperCase() || 'SYS'}</span>
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
