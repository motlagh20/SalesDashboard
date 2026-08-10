/**
 * Helper utilities for compacting and hydrating itemsJson.
 * 
 * Compact storage format:
 * [{"id": "prod-1", "q": 100, "p": 12500}, ...]
 * 
 * Backward compatible with full format:
 * [{"productId": "prod-1", "productName": "...", "quantity": 100, "unit": "...", "pricePerUnit": 12500}, ...]
 */

export interface CompactOrderItem {
  id: string;
  q: number;
  p?: number;
}

export interface HydratedOrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  pricePerUnit: number;
  imageUrl?: string;
}

/**
 * Serializes an array of order items into a compact JSON string.
 */
export function serializeItemsJson(items: any[]): string {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return '';
  }

  const compact: CompactOrderItem[] = items.map((item) => {
    const pid = item.productId || item.id || item.prodId || '';
    const qty = Number(item.quantity ?? item.q ?? 0);
    const price = item.pricePerUnit ?? item.p;

    const entry: CompactOrderItem = {
      id: String(pid),
      q: qty
    };

    if (price !== undefined && price !== null && !isNaN(Number(price))) {
      entry.p = Number(price);
    }

    return entry;
  });

  return JSON.stringify(compact);
}

/**
 * Parses and hydrates itemsJson (whether compact or full format) using the products list.
 */
export function parseAndHydrateItemsJson(
  itemsJsonStr?: string | null,
  productsList: any[] = []
): HydratedOrderItem[] {
  if (!itemsJsonStr || typeof itemsJsonStr !== 'string' || !itemsJsonStr.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(itemsJsonStr);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [];
    }

    return parsed.map((item: any) => {
      const pid = String(item.productId || item.id || item.prodId || '');
      const qty = Number(item.quantity ?? item.q ?? 0);

      // Find matching product in catalog
      const prodInCatalog = productsList.find((p) => String(p.id) === pid);

      const productName = item.productName || prodInCatalog?.name || pid || 'محصول';
      const unit = item.unit || prodInCatalog?.unit || 'قالب';
      const pricePerUnit = Number(item.pricePerUnit ?? item.p ?? prodInCatalog?.pricePerUnit ?? 0);
      const imageUrl = item.imageUrl || prodInCatalog?.imageUrl;

      return {
        productId: pid,
        productName,
        quantity: qty,
        unit,
        pricePerUnit,
        imageUrl
      };
    });
  } catch (e) {
    console.error('Error parsing itemsJson:', e);
    return [];
  }
}
