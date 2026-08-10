/**
 * Utility to fetch reverse geocoded Persian text address from coordinates (lat, lng)
 * using OpenStreetMap Nominatim API with fallback.
 */

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=fa`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept-Language': 'fa,fa-IR;q=0.9,en;q=0.8'
      }
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && data.display_name) {
        // Return cleaned up Persian address
        return data.display_name;
      }
    }
  } catch (err) {
    console.warn('Reverse geocoding error or timeout:', err);
  }

  return `موقعیت مکانی روی نقشه (عرض: ${lat}، طول: ${lng})`;
}

/**
 * Extracts coordinates from a Google Maps or map URL if available
 */
export function extractCoordsFromUrl(url: string): { lat: number; lng: number } | null {
  if (!url) return null;
  // Match ?q=35.123,51.456 or @35.123,51.456
  const match = url.match(/(?:q=|@)(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (match) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    if (!isNaN(lat) && !isNaN(lng)) {
      return { lat, lng };
    }
  }
  return null;
}
