import type { TrustLevel } from './types';

export interface OfficialSource {
  id: string;
  name: string;
  url: string;
  trust: TrustLevel;
  kind: 'gov' | 'utility' | 'payment' | 'consumer' | 'travel';
  description: string;
  checkNote: string;
}

// دليل المصادر الرسمية — مصر (V1)
// القاعدة: أي معلومة فيها رسوم أو مواعيد أو غرامات لازم يكون مصدرها هنا
// أو تاخد شارة "تحتاج تحقق".
export const SOURCES: OfficialSource[] = [
  {
    id: 'digital-egypt',
    name: 'بوابة مصر الرقمية',
    url: 'https://digital.gov.eg',
    trust: 'official',
    kind: 'gov',
    description: 'الخدمات الحكومية الإلكترونية: مركبات، أحوال مدنية، تموين، توثيق وغيرها.',
    checkNote: 'سجّل الدخول برقمك القومي للوصول لخدماتك.',
  },
  {
    id: 'public-guide',
    name: 'دليل الخدمات العامة',
    url: 'https://www.egypt.gov.eg',
    trust: 'official',
    kind: 'gov',
    description: 'دليل الخدمات الحكومية مصنفًا حسب مراحل الحياة.',
    checkNote: 'ابحث باسم الخدمة جوّه الدليل.',
  },
  {
    id: 'moi-traffic',
    name: 'خدمات المرور — وزارة الداخلية',
    url: 'https://traffic.moi.gov.eg',
    trust: 'official',
    kind: 'gov',
    description: 'خدمات تراخيص المركبات والقيادة إلكترونيًا.',
    checkNote: 'تجديد رخصة التسيير متاح أونلاين بشروط معلنة.',
  },
  {
    id: 'ppo-traffic',
    name: 'نيابة المرور — المخالفات',
    url: 'https://ppo.gov.eg',
    trust: 'official',
    kind: 'gov',
    description: 'الاستعلام عن مخالفات المرور وطلب شهادة براءة الذمة.',
    checkNote: 'شهادة المخالفات لها مدة صلاحية محدودة.',
  },
  {
    id: 'moi-main',
    name: 'وزارة الداخلية',
    url: 'https://www.moi.gov.eg',
    trust: 'official',
    kind: 'gov',
    description: 'الأحوال المدنية، الجوازات والهجرة، تصاريح العمل.',
    checkNote: 'راجع قطاع الخدمة المطلوبة قبل الذهاب.',
  },
  {
    id: 'cpa',
    name: 'جهاز حماية المستهلك',
    url: 'https://www.cpa.gov.eg',
    trust: 'official',
    kind: 'consumer',
    description: 'الشكاوى وحقوق الإرجاع والاستبدال والضمان.',
    checkNote: 'احتفظ بالفاتورة — هي إثبات حقك.',
  },
  {
    id: 'electricity',
    name: 'الكهرباء — خدمات المشتركين',
    url: 'https://www.moee.gov.eg',
    trust: 'official',
    kind: 'utility',
    description: 'بوابة وزارة الكهرباء وخدمات شركات التوزيع.',
    checkNote: 'يمكن السداد عبر شركتك أو منافذ الدفع.',
  },
  {
    id: 'water',
    name: 'مياه الشرب والصرف الصحي',
    url: 'https://www.hcww.com.eg',
    trust: 'official',
    kind: 'utility',
    description: 'خدمات الشركة القابضة وشركات المياه بالمحافظات.',
    checkNote: 'راجع شركة محافظتك للفواتير والتعاقدات.',
  },
  {
    id: 'egypt-post',
    name: 'البريد المصري',
    url: 'https://www.egyptpost.org',
    trust: 'official',
    kind: 'gov',
    description: 'خدمات بريدية ومالية وشحن.',
    checkNote: 'تتبع الشحنات برقم التتبع.',
  },
  {
    id: 'fawry',
    name: 'فوري',
    url: 'https://www.fawry.com',
    trust: 'trusted',
    kind: 'payment',
    description: 'دفع الفواتير والشحن من آلاف المنافذ.',
    checkNote: 'احتفظ بإيصال الدفع دائمًا.',
  },
  {
    id: 'instapay',
    name: 'انستاباي',
    url: 'https://www.instapay.eg',
    trust: 'trusted',
    kind: 'payment',
    description: 'التحويل والدفع اللحظي من حسابك البنكي.',
    checkNote: 'تأكد من بيانات المستفيد قبل التحويل.',
  },
  {
    id: 'egyptair',
    name: 'مصر للطيران',
    url: 'https://www.egyptair.com',
    trust: 'trusted',
    kind: 'travel',
    description: 'حجز وإدارة رحلات الطيران.',
    checkNote: 'راجع شروط التذكرة قبل الدفع.',
  },
];

export function getSource(id: string): OfficialSource | undefined {
  return SOURCES.find((s) => s.id === id);
}
