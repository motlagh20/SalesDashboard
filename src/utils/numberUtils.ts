// Helper to convert Persian/Arabic digits to English digits and normalize decimal points
export function toEnglishDigits(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return '';
  const str = String(input);
  return str
    .replace(/[۰٠]/g, '0')
    .replace(/[۱١]/g, '1')
    .replace(/[۲٢]/g, '2')
    .replace(/[۳٣]/g, '3')
    .replace(/[۴٤]/g, '4')
    .replace(/[۵٥]/g, '5')
    .replace(/[۶٦]/g, '6')
    .replace(/[۷٧]/g, '7')
    .replace(/[۸٨]/g, '8')
    .replace(/[۹٩]/g, '9')
    .replace(/[٫،]/g, '.');
}

export function parsePersianFloat(input: string | number | null | undefined): number {
  if (input === null || input === undefined) return NaN;
  const cleaned = toEnglishDigits(input).trim();
  return parseFloat(cleaned);
}
