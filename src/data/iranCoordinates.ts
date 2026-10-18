/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface LocationCoordinate {
  name: string;
  province: string;
  lat: number;
  lng: number;
  isProvinceCapital?: boolean;
}

/**
 * Comprehensive geographic coordinates for all 31 provincial centers of Iran
 */
export const IRAN_PROVINCE_CENTERS: Record<string, { lat: number; lng: number; capital: string }> = {
  'تهران': { lat: 35.6892, lng: 51.3890, capital: 'تهران' },
  'مازندران': { lat: 36.5659, lng: 53.0586, capital: 'ساری' },
  'گیلان': { lat: 37.2808, lng: 49.5832, capital: 'رشت' },
  'گلستان': { lat: 36.8456, lng: 54.4393, capital: 'گرگان' },
  'اصفهان': { lat: 32.6546, lng: 51.6680, capital: 'اصفهان' },
  'فارس': { lat: 29.5918, lng: 52.5837, capital: 'شیراز' },
  'خراسان رضوی': { lat: 36.2972, lng: 59.6067, capital: 'مشهد' },
  'خراسان شمالی': { lat: 37.4747, lng: 57.3290, capital: 'بجنورد' },
  'خراسان جنوبی': { lat: 32.8663, lng: 59.2211, capital: 'بیرجند' },
  'آذربایجان شرقی': { lat: 38.0800, lng: 46.2919, capital: 'تبریز' },
  'آذربایجان غربی': { lat: 37.5527, lng: 45.0761, capital: 'ارومیه' },
  'اردبیل': { lat: 38.2498, lng: 48.2933, capital: 'اردبیل' },
  'زنجان': { lat: 36.6736, lng: 48.4787, capital: 'زنجان' },
  'قزوین': { lat: 36.2797, lng: 50.0049, capital: 'قزوین' },
  'البرز': { lat: 35.8400, lng: 50.9391, capital: 'کرج' },
  'قم': { lat: 34.6401, lng: 50.8764, capital: 'قم' },
  'مرکزی': { lat: 34.0954, lng: 49.7013, capital: 'اراک' },
  'سمنان': { lat: 35.5769, lng: 53.3971, capital: 'سمنان' },
  'همدان': { lat: 34.7989, lng: 48.5150, capital: 'همدان' },
  'کرمانشاه': { lat: 34.3142, lng: 47.0650, capital: 'کرمانشاه' },
  'کردستان': { lat: 35.3219, lng: 46.9862, capital: 'سنندج' },
  'ایلام': { lat: 33.6374, lng: 46.4227, capital: 'ایلام' },
  'لرستان': { lat: 33.4878, lng: 48.3558, capital: 'خرم‌آباد' },
  'خوزستان': { lat: 31.3183, lng: 48.6706, capital: 'اهواز' },
  'چهارمحال و بختیاری': { lat: 32.3256, lng: 50.8644, capital: 'شهرکرد' },
  'کهگیلویه و بویراحمد': { lat: 30.6684, lng: 51.5876, capital: 'یاسوج' },
  'بوشهر': { lat: 28.9234, lng: 50.8203, capital: 'بوشهر' },
  'هرمزگان': { lat: 27.1832, lng: 56.2666, capital: 'بندرعباس' },
  'کرمان': { lat: 30.2839, lng: 57.0834, capital: 'کرمان' },
  'یزد': { lat: 31.8974, lng: 54.3569, capital: 'یزد' },
  'سیستان و بلوچستان': { lat: 29.4963, lng: 60.8629, capital: 'زاهدان' }
};

/**
 * Major cities and counties coordinates throughout Iran
 */
export const IRAN_CITIES_COORDINATES: LocationCoordinate[] = [
  // مازندران
  { name: 'ساری', province: 'مازندران', lat: 36.5659, lng: 53.0586, isProvinceCapital: true },
  { name: 'بابل', province: 'مازندران', lat: 36.5513, lng: 52.6789 },
  { name: 'آمل', province: 'مازندران', lat: 36.4676, lng: 52.3507 },
  { name: 'قائم‌شهر', province: 'مازندران', lat: 36.4651, lng: 52.8601 },
  { name: 'بهشهر', province: 'مازندران', lat: 36.6975, lng: 53.5539 },
  { name: 'چالوس', province: 'مازندران', lat: 36.6550, lng: 51.4204 },
  { name: 'تنکابن', province: 'مازندران', lat: 36.8163, lng: 50.8738 },
  { name: 'نوشهر', province: 'مازندران', lat: 36.6496, lng: 51.4962 },
  { name: 'رامسر', province: 'مازندران', lat: 36.9178, lng: 50.6631 },
  { name: 'بابلسر', province: 'مازندران', lat: 36.7020, lng: 52.6580 },
  { name: 'محمودآباد', province: 'مازندران', lat: 36.6319, lng: 52.2629 },
  { name: 'نکا', province: 'مازندران', lat: 36.6508, lng: 53.2990 },
  { name: 'نور', province: 'مازندران', lat: 36.5714, lng: 52.0150 },
  { name: 'جویبار', province: 'مازندران', lat: 36.6411, lng: 52.9122 },
  { name: 'سوادکوه', province: 'مازندران', lat: 36.0827, lng: 52.9344 },
  { name: 'عباس‌آباد', province: 'مازندران', lat: 36.7267, lng: 51.1072 },

  // گیلان
  { name: 'رشت', province: 'گیلان', lat: 37.2808, lng: 49.5832, isProvinceCapital: true },
  { name: 'انزلی', province: 'گیلان', lat: 37.4740, lng: 49.4616 },
  { name: 'بندرانزلی', province: 'گیلان', lat: 37.4740, lng: 49.4616 },
  { name: 'لاهیجان', province: 'گیلان', lat: 37.2072, lng: 50.0034 },
  { name: 'لنگرود', province: 'گیلان', lat: 37.1970, lng: 50.1535 },
  { name: 'تالش', province: 'گیلان', lat: 37.7997, lng: 48.9056 },
  { name: 'تالش (هشتپر)', province: 'گیلان', lat: 37.7997, lng: 48.9056 },
  { name: 'رودسر', province: 'گیلان', lat: 37.1374, lng: 50.2880 },
  { name: 'فومن', province: 'گیلان', lat: 37.2238, lng: 49.3125 },
  { name: 'صومعه‌سرا', province: 'گیلان', lat: 37.3025, lng: 49.3142 },
  { name: 'آستارا', province: 'گیلان', lat: 38.4291, lng: 48.8720 },
  { name: 'رودبار', province: 'گیلان', lat: 36.8122, lng: 49.4267 },
  { name: 'رضوانشهر', province: 'گیلان', lat: 37.5542, lng: 49.1389 },
  { name: 'ماسال', province: 'گیلان', lat: 37.3631, lng: 49.1336 },
  { name: 'شفت', province: 'گیلان', lat: 37.1681, lng: 49.4008 },
  { name: 'سیاهکل', province: 'گیلان', lat: 37.1528, lng: 49.8706 },

  // گلستان
  { name: 'گرگان', province: 'گلستان', lat: 36.8456, lng: 54.4393, isProvinceCapital: true },
  { name: 'گنبدکاووس', province: 'گلستان', lat: 37.2500, lng: 55.1672 },
  { name: 'علی‌آباد کتول', province: 'گلستان', lat: 36.9083, lng: 54.8689 },
  { name: 'بندرترکمن', province: 'گلستان', lat: 36.9014, lng: 54.0706 },
  { name: 'کردکوی', province: 'گلستان', lat: 36.7931, lng: 54.1128 },
  { name: 'مینودشت', province: 'گلستان', lat: 37.2506, lng: 55.3747 },
  { name: 'آزادشهر', province: 'گلستان', lat: 37.0869, lng: 55.1739 },
  { name: 'آق‌قلا', province: 'گلستان', lat: 37.0139, lng: 54.4561 },

  // تهران
  { name: 'تهران', province: 'تهران', lat: 35.6892, lng: 51.3890, isProvinceCapital: true },
  { name: 'لواسان', province: 'تهران', lat: 35.8197, lng: 51.6331 },
  { name: 'شهریار', province: 'تهران', lat: 35.6597, lng: 51.0592 },
  { name: 'پردیس', province: 'تهران', lat: 35.7369, lng: 51.8153 },
  { name: 'دماوند', province: 'تهران', lat: 35.7178, lng: 52.0650 },
  { name: 'ورامین', province: 'تهران', lat: 35.3242, lng: 51.6464 },
  { name: 'اسلامشهر', province: 'تهران', lat: 35.5397, lng: 51.2339 },
  { name: 'ملارد', province: 'تهران', lat: 35.6661, lng: 50.9767 },
  { name: 'قدس', province: 'تهران', lat: 35.7142, lng: 51.1097 },
  { name: 'فیروزکوه', province: 'تهران', lat: 35.7567, lng: 52.7711 },
  { name: 'رودهن', province: 'تهران', lat: 35.7275, lng: 51.9100 },
  { name: 'بومهن', province: 'تهران', lat: 35.7317, lng: 51.8697 },
  { name: 'رباط‌کریم', province: 'تهران', lat: 35.4847, lng: 51.0828 },
  { name: 'پاکدشت', province: 'تهران', lat: 35.5292, lng: 51.6781 },
  { name: 'ری', province: 'تهران', lat: 35.5908, lng: 51.4361 },
  { name: 'قرچک', province: 'تهران', lat: 35.4392, lng: 51.5689 },

  // البرز
  { name: 'کرج', province: 'البرز', lat: 35.8400, lng: 50.9391, isProvinceCapital: true },
  { name: 'فردیس', province: 'البرز', lat: 35.7214, lng: 50.9825 },
  { name: 'نظرآباد', province: 'البرز', lat: 35.9536, lng: 50.6067 },
  { name: 'ساوجبلاغ', province: 'البرز', lat: 35.9619, lng: 50.6806 },
  { name: 'ساوجبلاغ (هشتگرد)', province: 'البرز', lat: 35.9619, lng: 50.6806 },
  { name: 'هشتگرد', province: 'البرز', lat: 35.9619, lng: 50.6806 },
  { name: 'طالقان', province: 'البرز', lat: 36.1772, lng: 50.7647 },
  { name: 'اشتهارد', province: 'البرز', lat: 35.7222, lng: 50.3664 },
  { name: 'چهارباغ', province: 'البرز', lat: 35.8361, lng: 50.8447 },
  { name: 'گرمدره', province: 'البرز', lat: 35.7533, lng: 51.0769 },

  // اصفهان
  { name: 'اصفهان', province: 'اصفهان', lat: 32.6546, lng: 51.6680, isProvinceCapital: true },
  { name: 'کاشان', province: 'اصفهان', lat: 33.9850, lng: 51.4100 },
  { name: 'نجف‌آباد', province: 'اصفهان', lat: 32.6342, lng: 51.3668 },
  { name: 'شاهین‌شهر', province: 'اصفهان', lat: 32.8643, lng: 51.5519 },
  { name: 'خمینی‌شهر', province: 'اصفهان', lat: 32.6997, lng: 51.5233 },
  { name: 'شهرضا', province: 'اصفهان', lat: 31.9961, lng: 51.8677 },
  { name: 'زرین‌شهر', province: 'اصفهان', lat: 32.3897, lng: 51.3764 },
  { name: 'لنجان (زرین‌شهر)', province: 'اصفهان', lat: 32.3897, lng: 51.3764 },
  { name: 'نائین', province: 'اصفهان', lat: 32.8601, lng: 53.0875 },
  { name: 'نطنز', province: 'اصفهان', lat: 33.5127, lng: 51.9167 },
  { name: 'مبارکه', province: 'اصفهان', lat: 32.3482, lng: 51.5044 },
  { name: 'گلپایگان', province: 'اصفهان', lat: 33.4536, lng: 50.2883 },
  { name: 'آران و بیدگل', province: 'اصفهان', lat: 34.0578, lng: 51.4839 },
  { name: 'خوانسار', province: 'اصفهان', lat: 33.2208, lng: 50.3150 },

  // فارس
  { name: 'شیراز', province: 'فارس', lat: 29.5918, lng: 52.5837, isProvinceCapital: true },
  { name: 'مرودشت', province: 'فارس', lat: 29.8742, lng: 52.8025 },
  { name: 'کازرون', province: 'فارس', lat: 29.6195, lng: 51.6542 },
  { name: 'جهرم', province: 'فارس', lat: 28.5000, lng: 53.5600 },
  { name: 'فسا', province: 'فارس', lat: 28.9383, lng: 53.6481 },
  { name: 'داراب', province: 'فارس', lat: 28.7519, lng: 54.5444 },
  { name: 'لارستان (لار)', province: 'فارس', lat: 27.6833, lng: 54.3333 },
  { name: 'لار', province: 'فارس', lat: 27.6833, lng: 54.3333 },
  { name: 'آباده', province: 'فارس', lat: 31.1608, lng: 52.6506 },
  { name: 'اقلید', province: 'فارس', lat: 30.8978, lng: 52.6828 },
  { name: 'فیروزآباد', province: 'فارس', lat: 28.8439, lng: 52.5708 },
  { name: 'لامرد', province: 'فارس', lat: 27.3333, lng: 53.1833 },
  { name: 'ممسنی (نورآباد)', province: 'فارس', lat: 30.1147, lng: 51.5219 },

  // بوشهر
  { name: 'بوشهر', province: 'بوشهر', lat: 28.9234, lng: 50.8203, isProvinceCapital: true },
  { name: 'دشتستان (برازجان)', province: 'بوشهر', lat: 29.2667, lng: 51.2167 },
  { name: 'برازجان', province: 'بوشهر', lat: 29.2667, lng: 51.2167 },
  { name: 'گناوه', province: 'بوشهر', lat: 29.5792, lng: 50.5178 },
  { name: 'کنگان', province: 'بوشهر', lat: 27.8339, lng: 52.0628 },
  { name: 'عسلویه', province: 'بوشهر', lat: 27.4761, lng: 52.6078 },
  { name: 'دیلم', province: 'بوشهر', lat: 30.0542, lng: 50.1589 },
  { name: 'دشتی (خورموج)', province: 'بوشهر', lat: 28.6542, lng: 51.3814 },
  { name: 'جم', province: 'بوشهر', lat: 27.8283, lng: 52.3272 },
  { name: 'دیر', province: 'بوشهر', lat: 27.8397, lng: 51.9378 },

  // هرمزگان
  { name: 'بندرعباس', province: 'هرمزگان', lat: 27.1832, lng: 56.2666, isProvinceCapital: true },
  { name: 'قشم', province: 'هرمزگان', lat: 26.9581, lng: 56.2719 },
  { name: 'کیش', province: 'هرمزگان', lat: 26.5578, lng: 53.9806 },
  { name: 'میناب', province: 'هرمزگان', lat: 27.1467, lng: 57.0801 },
  { name: 'بندرلنگه', province: 'هرمزگان', lat: 26.5579, lng: 54.8807 },
  { name: 'حاجی‌آباد', province: 'هرمزگان', lat: 28.3094, lng: 55.9017 },
  { name: 'رودان', province: 'هرمزگان', lat: 27.4422, lng: 57.1925 },
  { name: 'بندر جاسک', province: 'هرمزگان', lat: 25.6553, lng: 57.7744 },

  // خوزستان
  { name: 'اهواز', province: 'خوزستان', lat: 31.3183, lng: 48.6706, isProvinceCapital: true },
  { name: 'دزفول', province: 'خوزستان', lat: 32.3811, lng: 48.4058 },
  { name: 'آبادان', province: 'خوزستان', lat: 30.3392, lng: 48.3043 },
  { name: 'خرمشهر', province: 'خوزستان', lat: 30.4397, lng: 48.1803 },
  { name: 'ماهشهر', province: 'خوزستان', lat: 30.5589, lng: 49.1981 },
  { name: 'شوشتر', province: 'خوزستان', lat: 32.0456, lng: 48.8567 },
  { name: 'بهبهان', province: 'خوزستان', lat: 30.5958, lng: 50.2417 },
  { name: 'ایذه', province: 'خوزستان', lat: 31.8336, lng: 49.8689 },
  { name: 'اندیمشک', province: 'خوزستان', lat: 32.4600, lng: 48.3500 },
  { name: 'شوش', province: 'خوزستان', lat: 32.1942, lng: 48.2436 },

  // خراسان رضوی
  { name: 'مشهد', province: 'خراسان رضوی', lat: 36.2972, lng: 59.6067, isProvinceCapital: true },
  { name: 'نیشابور', province: 'خراسان رضوی', lat: 36.2133, lng: 58.7958 },
  { name: 'سبزوار', province: 'خراسان رضوی', lat: 36.2125, lng: 57.6781 },
  { name: 'تربت حیدریه', province: 'خراسان رضوی', lat: 35.2744, lng: 59.2197 },
  { name: 'قوچان', province: 'خراسان رضوی', lat: 37.1061, lng: 58.5097 },
  { name: 'کاشمر', province: 'خراسان رضوی', lat: 35.2383, lng: 58.4656 },
  { name: 'سرخس', province: 'خراسان رضوی', lat: 36.5447, lng: 61.1578 },
  { name: 'طرقبه شاندیز', province: 'خراسان رضوی', lat: 36.3117, lng: 59.3733 },

  // آذربایجان شرقی
  { name: 'تبریز', province: 'آذربایجان شرقی', lat: 38.0800, lng: 46.2919, isProvinceCapital: true },
  { name: 'مراغه', province: 'آذربایجان شرقی', lat: 37.3919, lng: 46.2392 },
  { name: 'مرند', province: 'آذربایجان شرقی', lat: 38.4328, lng: 45.7747 },
  { name: 'میانه', province: 'آذربایجان شرقی', lat: 37.4222, lng: 47.7144 },
  { name: 'اهر', province: 'آذربایجان شرقی', lat: 38.4775, lng: 47.0697 },
  { name: 'بناب', province: 'آذربایجان شرقی', lat: 37.3403, lng: 46.0561 },
  { name: 'جلفا', province: 'آذربایجان شرقی', lat: 38.9372, lng: 45.6297 },

  // آذربایجان غربی
  { name: 'ارومیه', province: 'آذربایجان غربی', lat: 37.5527, lng: 45.0761, isProvinceCapital: true },
  { name: 'خوی', province: 'آذربایجان غربی', lat: 38.5522, lng: 44.9525 },
  { name: 'بوکان', province: 'آذربایجان غربی', lat: 36.5208, lng: 46.2089 },
  { name: 'مهاباد', province: 'آذربایجان غربی', lat: 36.7631, lng: 45.7222 },
  { name: 'میاندوآب', province: 'آذربایجان غربی', lat: 36.9631, lng: 46.1042 },
  { name: 'سلماس', province: 'آذربایجان غربی', lat: 38.1972, lng: 44.7653 },
  { name: 'ماکو', province: 'آذربایجان غربی', lat: 39.2953, lng: 44.5122 },

  // کرمان
  { name: 'کرمان', province: 'کرمان', lat: 30.2839, lng: 57.0834, isProvinceCapital: true },
  { name: 'سیرجان', province: 'کرمان', lat: 29.4522, lng: 55.6814 },
  { name: 'رفسنجان', province: 'کرمان', lat: 30.4067, lng: 55.9939 },
  { name: 'جیرفت', province: 'کرمان', lat: 28.6781, lng: 57.7406 },
  { name: 'بم', province: 'کرمان', lat: 29.1060, lng: 58.3570 },

  // یزد
  { name: 'یزد', province: 'یزد', lat: 31.8974, lng: 54.3569, isProvinceCapital: true },
  { name: 'میبد', province: 'یزد', lat: 32.2500, lng: 54.0167 },
  { name: 'اردکان', province: 'یزد', lat: 32.3100, lng: 54.0175 },
  { name: 'مهریز', province: 'یزد', lat: 31.5833, lng: 54.4333 },

  // قم
  { name: 'قم', province: 'قم', lat: 34.6401, lng: 50.8764, isProvinceCapital: true },
  { name: 'جعفریه', province: 'قم', lat: 34.7867, lng: 50.5186 },
  { name: 'سلفچگان', province: 'قم', lat: 34.4556, lng: 50.4639 },

  // مرکزی
  { name: 'اراک', province: 'مرکزی', lat: 34.0954, lng: 49.7013, isProvinceCapital: true },
  { name: 'ساوه', province: 'مرکزی', lat: 35.0211, lng: 50.3567 },
  { name: 'خمین', province: 'مرکزی', lat: 33.6422, lng: 50.0789 },
  { name: 'محلات', province: 'مرکزی', lat: 33.9100, lng: 50.4550 },
  { name: 'دلیجان', province: 'مرکزی', lat: 33.9903, lng: 50.6836 },

  // همدان
  { name: 'همدان', province: 'همدان', lat: 34.7989, lng: 48.5150, isProvinceCapital: true },
  { name: 'ملایر', province: 'همدان', lat: 34.2969, lng: 48.8236 },
  { name: 'نهاوند', province: 'همدان', lat: 34.1886, lng: 48.3769 },
  { name: 'تویسرکان', province: 'همدان', lat: 34.5483, lng: 48.4469 },

  // کرمانشاه
  { name: 'کرمانشاه', province: 'کرمانشاه', lat: 34.3142, lng: 47.0650, isProvinceCapital: true },
  { name: 'اسلام‌آباد غرب', province: 'کرمانشاه', lat: 34.1094, lng: 46.5275 },
  { name: 'کنگاور', province: 'کرمانشاه', lat: 34.5044, lng: 47.9653 },

  // قزوین
  { name: 'قزوین', province: 'قزوین', lat: 36.2797, lng: 50.0049, isProvinceCapital: true },
  { name: 'تاکستان', province: 'قزوین', lat: 36.0694, lng: 49.6958 },
  { name: 'الوند', province: 'قزوین', lat: 36.1892, lng: 50.0642 },

  // سمنان
  { name: 'سمنان', province: 'سمنان', lat: 35.5769, lng: 53.3971, isProvinceCapital: true },
  { name: 'شاهرود', province: 'سمنان', lat: 36.4181, lng: 54.9764 },
  { name: 'دامغان', province: 'سمنان', lat: 36.1683, lng: 54.3486 },
  { name: 'گرمسار', province: 'سمنان', lat: 35.2181, lng: 52.3408 },

  // زنجان
  { name: 'زنجان', province: 'زنجان', lat: 36.6736, lng: 48.4787, isProvinceCapital: true },
  { name: 'ابهر', province: 'زنجان', lat: 36.1467, lng: 49.2181 },
  { name: 'خرمدره', province: 'زنجان', lat: 36.2061, lng: 49.1889 },

  // اردبیل
  { name: 'اردبیل', province: 'اردبیل', lat: 38.2498, lng: 48.2933, isProvinceCapital: true },
  { name: 'مشگین‌شهر', province: 'اردبیل', lat: 38.3989, lng: 47.6822 },
  { name: 'پارس‌آباد', province: 'اردبیل', lat: 39.6483, lng: 47.9175 },

  // لرستان
  { name: 'خرم‌آباد', province: 'لرستان', lat: 33.4878, lng: 48.3558, isProvinceCapital: true },
  { name: 'بروجرد', province: 'لرستان', lat: 33.8972, lng: 48.7514 },
  { name: 'دورود', province: 'لرستان', lat: 33.4939, lng: 49.0750 },
  { name: 'الیگودرز', province: 'لرستان', lat: 33.4006, lng: 49.6947 },

  // کردستان
  { name: 'سنندج', province: 'کردستان', lat: 35.3219, lng: 46.9862, isProvinceCapital: true },
  { name: 'سقز', province: 'کردستان', lat: 36.2428, lng: 46.2736 },
  { name: 'مریوان', province: 'کردستان', lat: 35.5269, lng: 46.1761 },
  { name: 'بانه', province: 'کردستان', lat: 35.9975, lng: 45.8853 },

  // ایلام
  { name: 'ایلام', province: 'ایلام', lat: 33.6374, lng: 46.4227, isProvinceCapital: true },
  { name: 'دهلران', province: 'ایلام', lat: 32.6942, lng: 47.2678 },
  { name: 'مهران', province: 'ایلام', lat: 33.1222, lng: 46.1644 },

  // چهارمحال و بختیاری
  { name: 'شهرکرد', province: 'چهارمحال و بختیاری', lat: 32.3256, lng: 50.8644, isProvinceCapital: true },
  { name: 'بروجن', province: 'چهارمحال و بختیاری', lat: 31.9681, lng: 51.2906 },
  { name: 'لردگان', province: 'چهارمحال و بختیاری', lat: 31.5103, lng: 50.8286 },
  { name: 'فارسان', province: 'چهارمحال و بختیاری', lat: 32.2569, lng: 50.5636 },

  // کهگیلویه و بویراحمد
  { name: 'یاسوج', province: 'کهگیلویه و بویراحمد', lat: 30.6684, lng: 51.5876, isProvinceCapital: true },
  { name: 'گچساران (دوگنبدان)', province: 'کهگیلویه و بویراحمد', lat: 30.3586, lng: 50.7981 },
  { name: 'دوگنبدان', province: 'کهگیلویه و بویراحمد', lat: 30.3586, lng: 50.7981 },
  { name: 'دهدشت', province: 'کهگیلویه و بویراحمد', lat: 30.7936, lng: 50.5647 },

  // سیستان و بلوچستان
  { name: 'زاهدان', province: 'سیستان و بلوچستان', lat: 29.4963, lng: 60.8629, isProvinceCapital: true },
  { name: 'زابل', province: 'سیستان و بلوچستان', lat: 31.0294, lng: 61.5008 },
  { name: 'چابهار', province: 'سیستان و بلوچستان', lat: 25.2919, lng: 60.6431 },
  { name: 'ایرانشهر', province: 'سیستان و بلوچستان', lat: 27.2025, lng: 60.6847 },

  // خراسان شمالی
  { name: 'بجنورد', province: 'خراسان شمالی', lat: 37.4747, lng: 57.3290, isProvinceCapital: true },
  { name: 'شیروان', province: 'خراسان شمالی', lat: 37.3967, lng: 57.9294 },
  { name: 'اسفراین', province: 'خراسان شمالی', lat: 37.0764, lng: 57.5100 },

  // خراسان جنوبی
  { name: 'بیرجند', province: 'خراسان جنوبی', lat: 32.8663, lng: 59.2211, isProvinceCapital: true },
  { name: 'قائن', province: 'خراسان جنوبی', lat: 33.7275, lng: 59.1844 },
  { name: 'فردوس', province: 'خراسان جنوبی', lat: 34.0186, lng: 58.1722 },
  { name: 'طبس', province: 'خراسان جنوبی', lat: 33.5958, lng: 56.9244 }
];

/**
 * Normalizes a province or city string for clean comparison
 */
export function normalizeLocationName(name?: string | null): string {
  if (!name) return '';
  return name
    .trim()
    .replace(/^(?:کل\s+)?استان\s+/, '')
    .replace(/^شهرستان\s+/, '')
    .replace(/^شهر\s+/, '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .trim();
}

/**
 * Resolves the best-matching latitude, longitude and zoom level for any city or province hint
 */
export function resolveLocationCoordinates(
  cityHint?: string,
  provinceHint?: string,
  destinationSummary?: string
): { lat: number; lng: number; zoom: number; matchedName: string; isCity: boolean } {
  const normCity = normalizeLocationName(cityHint);
  const normProv = normalizeLocationName(provinceHint);

  // 1. Try finding by exact city name match (ignoring parentheses/prefixes)
  if (normCity) {
    // Check specific city in province if province is known
    if (normProv) {
      const matchInProv = IRAN_CITIES_COORDINATES.find(c => {
        const cNorm = normalizeLocationName(c.name);
        const pNorm = normalizeLocationName(c.province);
        return (pNorm === normProv || pNorm.includes(normProv) || normProv.includes(pNorm)) &&
               (cNorm === normCity || c.name.includes(normCity) || normCity.includes(cNorm));
      });
      if (matchInProv) {
        return {
          lat: matchInProv.lat,
          lng: matchInProv.lng,
          zoom: 13,
          matchedName: `${matchInProv.province} - ${matchInProv.name}`,
          isCity: true
        };
      }
    }

    // Check across all cities
    const directCityMatch = IRAN_CITIES_COORDINATES.find(c => {
      const cNorm = normalizeLocationName(c.name);
      return cNorm === normCity || c.name.includes(normCity) || normCity.includes(cNorm);
    });
    if (directCityMatch) {
      return {
        lat: directCityMatch.lat,
        lng: directCityMatch.lng,
        zoom: 13,
        matchedName: `${directCityMatch.province} - ${directCityMatch.name}`,
        isCity: true
      };
    }
  }

  // 2. Check province center if city was not matched
  if (normProv) {
    const provEntry = Object.entries(IRAN_PROVINCE_CENTERS).find(([pName]) => {
      const pNorm = normalizeLocationName(pName);
      return pNorm === normProv || pNorm.includes(normProv) || normProv.includes(pNorm);
    });
    if (provEntry) {
      return {
        lat: provEntry[1].lat,
        lng: provEntry[1].lng,
        zoom: 12,
        matchedName: `مرکز استان ${provEntry[0]} (${provEntry[1].capital})`,
        isCity: false
      };
    }
  }

  // 3. Fallback: Parse destinationSummary (e.g. "مازندران - بابل" or "گیلان - لاهیجان")
  if (destinationSummary) {
    const tokens = destinationSummary.split(/[-–/،,؛;]/).map(t => normalizeLocationName(t)).filter(Boolean);
    for (const token of tokens) {
      const foundCity = IRAN_CITIES_COORDINATES.find(c => {
        const cNorm = normalizeLocationName(c.name);
        return cNorm === token || c.name.includes(token) || token.includes(cNorm);
      });
      if (foundCity) {
        return {
          lat: foundCity.lat,
          lng: foundCity.lng,
          zoom: 13,
          matchedName: `${foundCity.province} - ${foundCity.name}`,
          isCity: true
        };
      }

      const provEntry = Object.entries(IRAN_PROVINCE_CENTERS).find(([pName]) => {
        const pNorm = normalizeLocationName(pName);
        return pNorm === token || pNorm.includes(token) || token.includes(pNorm);
      });
      if (provEntry) {
        return {
          lat: provEntry[1].lat,
          lng: provEntry[1].lng,
          zoom: 12,
          matchedName: `مرکز استان ${provEntry[0]} (${provEntry[1].capital})`,
          isCity: false
        };
      }
    }
  }

  // Default fallback: Tehran center
  return {
    lat: 35.6892,
    lng: 51.3890,
    zoom: 12,
    matchedName: 'تهران',
    isCity: true
  };
}
