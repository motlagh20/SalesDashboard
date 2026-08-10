import { IRAN_PROVINCES } from '../data/iranLocations';
import { TerritoryAssignment } from '../types';

/**
 * Strips 'ایران', 'Iran', 'جمهوری اسلامی ایران', and 'Islamic Republic of Iran' from address strings
 */
export function cleanCountryFromAddress(address: string): string {
  if (!address) return '';
  let cleaned = address;

  // Replace country terms (Persian & English)
  cleaned = cleaned.replace(/(?:،|,)?\s*(?:جمهوری اسلامی ایران|Islamic Republic of Iran|ایران|Iran)\s*(?:،|,)?/gi, (match, offset, str) => {
    if (offset > 0 && offset + match.length < str.length) {
      return '، ';
    }
    return '';
  });

  // Clean leading/trailing commas, dashes, spaces
  cleaned = cleaned
    .replace(/[،,]\s*[،,]+/g, '، ')
    .replace(/^[\s،,.-]+|[\s،,.-]+$/g, '')
    .trim();

  return cleaned;
}

export interface ReverseGeocodeResult {
  addressText: string;
  city?: string;
  province?: string;
  country?: string;
  rawAddress?: any;
}

/**
 * Utility to fetch reverse geocoded Persian text address from coordinates (lat, lng)
 * using OpenStreetMap Nominatim API with fallback.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);

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
        const rawAddr = data.address || {};
        const country = rawAddr.country || '';

        let rawProvince = rawAddr.state || rawAddr.province || rawAddr.region || '';
        rawProvince = rawProvince.replace(/^استان\s+/, '').trim();

        let rawCity = rawAddr.city || rawAddr.town || rawAddr.village || rawAddr.county || rawAddr.suburb || rawAddr.district || '';
        rawCity = rawCity.replace(/^شهرستان\s+/, '').replace(/^شهر\s+/, '').replace(/^بخش\s+/, '').trim();

        // If rawProvince is empty, try to resolve from IRAN_PROVINCES by city
        if (!rawProvince && rawCity) {
          const foundProv = IRAN_PROVINCES.find(p => p.cities.some(c => c.includes(rawCity) || rawCity.includes(c)));
          if (foundProv) {
            rawProvince = foundProv.name;
          }
        }

        const cleanedAddr = cleanCountryFromAddress(data.display_name);

        return {
          addressText: cleanedAddr,
          city: rawCity,
          province: rawProvince,
          country,
          rawAddress: rawAddr
        };
      }
    }
  } catch (err) {
    console.warn('Reverse geocoding error or timeout:', err);
  }

  return {
    addressText: `موقعیت مکانی روی نقشه (عرض: ${lat}، طول: ${lng})`
  };
}

export interface TerritoryCheckResult {
  isAllowed: boolean;
  matchedProvince?: string;
  matchedCity?: string;
  message?: string;
}

/**
 * Checks if a city/province falls within a representative's assigned territory limits
 */
export function checkCityInTerritory(
  cityName: string,
  provinceName: string | undefined,
  agentTerritories?: TerritoryAssignment[]
): TerritoryCheckResult {
  // If no assigned territories (or empty array), representative has full access ("سراسر کشور")
  if (!agentTerritories || agentTerritories.length === 0) {
    return { isAllowed: true, matchedProvince: provinceName, matchedCity: cityName };
  }

  const cleanProv = (provinceName || '').replace(/^استان\s+/, '').trim();
  const cleanCity = (cityName || '').replace(/^شهرستان\s+/, '').replace(/^شهر\s+/, '').trim();

  // Find matching territory rule by province
  let matchedRule = agentTerritories.find(t => {
    const tProv = t.province.trim();
    return tProv === cleanProv || (cleanProv && (tProv.includes(cleanProv) || cleanProv.includes(tProv)));
  });

  // If province didn't match directly, check if cleanCity exists in any IRAN_PROVINCES and match that province
  let resolvedProvinceName = cleanProv;
  if (!matchedRule && cleanCity) {
    const foundProv = IRAN_PROVINCES.find(p => p.cities.some(c => c.includes(cleanCity) || cleanCity.includes(c)));
    if (foundProv) {
      resolvedProvinceName = foundProv.name;
      matchedRule = agentTerritories.find(t => t.province.trim() === foundProv.name.trim());
    }
  }

  if (!matchedRule) {
    return {
      isAllowed: false,
      matchedProvince: resolvedProvinceName,
      matchedCity: cleanCity,
      message: `شهر/موقعیت "${cleanCity || cityName}" ${resolvedProvinceName ? `(استان ${resolvedProvinceName})` : ''} خارج از محدوده مجاز نمایندگی شما است.`
    };
  }

  // Check city within matched province rule
  if (matchedRule.allCities) {
    return { isAllowed: true, matchedProvince: matchedRule.province, matchedCity: cleanCity };
  }

  if (matchedRule.cities && matchedRule.cities.length > 0) {
    const isCityAllowed = matchedRule.cities.some(c => c.includes(cleanCity) || cleanCity.includes(c) || c === cleanCity);
    if (!isCityAllowed) {
      return {
        isAllowed: false,
        matchedProvince: matchedRule.province,
        matchedCity: cleanCity,
        message: `شهر "${cleanCity || cityName}" در لیست شهرهای مجاز استان ${matchedRule.province} برای نمایندگی شما قرار ندارد.`
      };
    }
  }

  return { isAllowed: true, matchedProvince: matchedRule.province, matchedCity: cleanCity };
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

