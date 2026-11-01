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
 * Gracefully handles null, undefined, already parsed arrays/objects, or invalid non-JSON strings.
 */
export function parseAndHydrateItemsJson(
  itemsJsonInput?: any,
  productsList: any[] = []
): HydratedOrderItem[] {
  if (!itemsJsonInput) {
    return [];
  }

  let parsed: any = null;

  if (Array.isArray(itemsJsonInput)) {
    parsed = itemsJsonInput;
  } else if (typeof itemsJsonInput === 'object') {
    parsed = [itemsJsonInput];
  } else if (typeof itemsJsonInput === 'string') {
    const trimmed = itemsJsonInput.trim();
    // Valid JSON items string must start with '[' (array) or '{' (single item)
    if (!trimmed || (!trimmed.startsWith('[') && !trimmed.startsWith('{'))) {
      return [];
    }
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return [];
    }
  } else {
    return [];
  }

  if (!Array.isArray(parsed)) {
    if (parsed && typeof parsed === 'object') {
      parsed = [parsed];
    } else {
      return [];
    }
  }

  if (parsed.length === 0) {
    return [];
  }

  const safeProductsList = Array.isArray(productsList) ? productsList : [];

  return parsed
    .filter((item: any) => item && typeof item === 'object')
    .map((item: any) => {
      const pid = String(item.productId || item.id || item.prodId || '');
      const qty = Number(item.quantity ?? item.q ?? 0);

      // Find matching product in catalog
      const prodInCatalog = safeProductsList.find((p) => String(p?.id) === pid);

      const productName = item.productName || prodInCatalog?.name || pid || 'محصول';
      const unit = item.unit || prodInCatalog?.unit || 'قالب';
      const rawPrice = item.pricePerUnit ?? item.p ?? prodInCatalog?.pricePerUnit ?? 0;
      const pricePerUnit = Number(rawPrice);
      const imageUrl = item.imageUrl || prodInCatalog?.imageUrl;

      return {
        productId: pid,
        productName,
        quantity: isNaN(qty) ? 0 : qty,
        unit,
        pricePerUnit: isNaN(pricePerUnit) ? 0 : pricePerUnit,
        imageUrl
      };
    });
}
