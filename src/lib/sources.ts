import type { Lang } from './i18n';
import type { TrustLevel } from './types';

export interface OfficialSource {
  id: string;
  name: string;
  nameEn: string;
  url: string;
  trust: TrustLevel;
  kind: 'gov' | 'utility' | 'payment' | 'consumer' | 'travel';
  description: string;
  descriptionEn: string;
  checkNote: string;
  checkNoteEn: string;
}

// دليل المصادر الرسمية — مصر (V1) / Official sources — Egypt
export const SOURCES: OfficialSource[] = [
  {
    id: 'digital-egypt',
    name: 'بوابة مصر الرقمية',
    nameEn: 'Digital Egypt Portal',
    url: 'https://digital.gov.eg',
    trust: 'official',
    kind: 'gov',
    description: 'الخدمات الحكومية الإلكترونية: مركبات، أحوال مدنية، تموين، توثيق وغيرها.',
    descriptionEn: 'E-government services: vehicles, civil registry, ration, notarization & more.',
    checkNote: 'سجّل الدخول برقمك القومي للوصول لخدماتك.',
    checkNoteEn: 'Log in with your national ID to reach your services.',
  },
  {
    id: 'public-guide',
    name: 'دليل الخدمات العامة',
    nameEn: 'Public Services Guide',
    url: 'https://www.egypt.gov.eg',
    trust: 'official',
    kind: 'gov',
    description: 'دليل الخدمات الحكومية مصنفًا حسب مراحل الحياة.',
    descriptionEn: 'Government services guide organized by life stages.',
    checkNote: 'ابحث باسم الخدمة جوّه الدليل.',
    checkNoteEn: 'Search the guide by service name.',
  },
  {
    id: 'moi-traffic',
    name: 'خدمات المرور — وزارة الداخلية',
    nameEn: 'Traffic Services — MOI',
    url: 'https://traffic.moi.gov.eg',
    trust: 'official',
    kind: 'gov',
    description: 'خدمات تراخيص المركبات والقيادة إلكترونيًا.',
    descriptionEn: 'Online vehicle and driving licensing services.',
    checkNote: 'تجديد رخصة التسيير متاح أونلاين بشروط معلنة.',
    checkNoteEn: 'Vehicle license renewal is available online under announced terms.',
  },
  {
    id: 'ppo-traffic',
    name: 'نيابة المرور — المخالفات',
    nameEn: 'Traffic Prosecution — Fines',
    url: 'https://ppo.gov.eg',
    trust: 'official',
    kind: 'gov',
    description: 'الاستعلام عن مخالفات المرور وطلب شهادة براءة الذمة.',
    descriptionEn: 'Check traffic fines and request a clearance certificate.',
    checkNote: 'شهادة المخالفات لها مدة صلاحية محدودة.',
    checkNoteEn: 'The clearance certificate has a limited validity period.',
  },
  {
    id: 'moi-main',
    name: 'وزارة الداخلية',
    nameEn: 'Ministry of Interior',
    url: 'https://www.moi.gov.eg',
    trust: 'official',
    kind: 'gov',
    description: 'الأحوال المدنية، الجوازات والهجرة، تصاريح العمل.',
    descriptionEn: 'Civil registry, passports & immigration, work permits.',
    checkNote: 'راجع قطاع الخدمة المطلوبة قبل الذهاب.',
    checkNoteEn: 'Check the relevant sector before you go.',
  },
  {
    id: 'cpa',
    name: 'جهاز حماية المستهلك',
    nameEn: 'Consumer Protection Agency',
    url: 'https://www.cpa.gov.eg',
    trust: 'official',
    kind: 'consumer',
    description: 'الشكاوى وحقوق الإرجاع والاستبدال والضمان.',
    descriptionEn: 'Complaints and return/exchange/warranty rights.',
    checkNote: 'احتفظ بالفاتورة — هي إثبات حقك.',
    checkNoteEn: 'Keep the invoice — it is your proof of rights.',
  },
  {
    id: 'electricity',
    name: 'الكهرباء — خدمات المشتركين',
    nameEn: 'Electricity — Customer Services',
    url: 'https://www.moee.gov.eg',
    trust: 'official',
    kind: 'utility',
    description: 'بوابة وزارة الكهرباء وخدمات شركات التوزيع.',
    descriptionEn: 'Electricity ministry portal and distribution companies.',
    checkNote: 'يمكن السداد عبر شركتك أو منافذ الدفع.',
    checkNoteEn: 'Pay via your company or payment outlets.',
  },
  {
    id: 'water',
    name: 'مياه الشرب والصرف الصحي',
    nameEn: 'Water & Wastewater',
    url: 'https://www.hcww.com.eg',
    trust: 'official',
    kind: 'utility',
    description: 'خدمات الشركة القابضة وشركات المياه بالمحافظات.',
    descriptionEn: 'Holding company and governorate water companies.',
    checkNote: 'راجع شركة محافظتك للفواتير والتعاقدات.',
    checkNoteEn: 'Check your governorate company for bills and contracts.',
  },
  {
    id: 'egypt-post',
    name: 'البريد المصري',
    nameEn: 'Egypt Post',
    url: 'https://www.egyptpost.org',
    trust: 'official',
    kind: 'gov',
    description: 'خدمات بريدية ومالية وشحن.',
    descriptionEn: 'Postal, financial and shipping services.',
    checkNote: 'تتبع الشحنات برقم التتبع.',
    checkNoteEn: 'Track shipments with the tracking number.',
  },
  {
    id: 'fawry',
    name: 'فوري',
    nameEn: 'Fawry',
    url: 'https://www.fawry.com',
    trust: 'trusted',
    kind: 'payment',
    description: 'دفع الفواتير والشحن من آلاف المنافذ.',
    descriptionEn: 'Pay bills and top up from thousands of outlets.',
    checkNote: 'احتفظ بإيصال الدفع دائمًا.',
    checkNoteEn: 'Always keep the payment receipt.',
  },
  {
    id: 'instapay',
    name: 'انستاباي',
    nameEn: 'InstaPay',
    url: 'https://www.instapay.eg',
    trust: 'trusted',
    kind: 'payment',
    description: 'التحويل والدفع اللحظي من حسابك البنكي.',
    descriptionEn: 'Instant transfers and payments from your bank account.',
    checkNote: 'تأكد من بيانات المستفيد قبل التحويل.',
    checkNoteEn: 'Verify recipient details before transferring.',
  },
  {
    id: 'egyptair',
    name: 'مصر للطيران',
    nameEn: 'EgyptAir',
    url: 'https://www.egyptair.com',
    trust: 'trusted',
    kind: 'travel',
    description: 'حجز وإدارة رحلات الطيران.',
    descriptionEn: 'Book and manage flights.',
    checkNote: 'راجع شروط التذكرة قبل الدفع.',
    checkNoteEn: 'Review ticket terms before paying.',
  },
];

export function getSource(id: string): OfficialSource | undefined {
  return SOURCES.find((s) => s.id === id);
}

export function srcName(s: OfficialSource, lang: Lang): string {
  return lang === 'ar' ? s.name : s.nameEn;
}
export function srcDesc(s: OfficialSource, lang: Lang): string {
  return lang === 'ar' ? s.description : s.descriptionEn;
}
export function srcCheck(s: OfficialSource, lang: Lang): string {
  return lang === 'ar' ? s.checkNote : s.checkNoteEn;
}
