/** L1 seed verisi: kurgusal firmalar, tesisler, araçlar. Gerçek kayıt veya adres içermez. */

export const carriers = [
  { key: "dincer", name: "Dinçer Lojistik", prefix: "DNC", plateCity: "41" },
  { key: "siva", name: "Siva Taşımacılık", prefix: "SVA", plateCity: "59" },
] as const;

export const customers = [
  { key: "marmara", name: "Marmara Ambar", status: "active" },
  { key: "anadolu", name: "Anadolu Parsiyel", status: "active" },
  { key: "baskent", name: "Başkent Nakliye", status: "active" }, // L4'te doğrulanmış gelmeme geçmişi
  { key: "ege", name: "Ege Depo Hizmetleri", status: "active" },
  { key: "karadeniz", name: "Karadeniz Parsiyel", status: "active" },
  { key: "guney", name: "Güney Lojistik Pazarlama", status: "pending" }, // onaysız firma senaryosu
] as const;

const weekday: [string, string][] = [["07:00", "21:00"]];
export const standardHours = { mon: weekday, tue: weekday, wed: weekday, thu: weekday, fri: weekday, sat: [["08:00", "16:00"]] as [string, string][] };

export interface FacilitySeed {
  carrier: "dincer" | "siva"; code: string; name: string; kind: "transfer_center" | "distribution_center";
  city: string; district: string | null; address: string; lat: number; lng: number; slots: number; contact: string; phone: string;
}

export const facilities: FacilitySeed[] = [
  { carrier: "dincer", code: "DNC-GEB-TM", name: "Dinçer Gebze Transfer Merkezi", kind: "transfer_center", city: "Kocaeli", district: "Gebze", address: "Örnek OSB, 1. Cadde No:10, Gebze/Kocaeli", lat: 40.802, lng: 29.430, slots: 60, contact: "Gebze Vardiya Amiri", phone: "+902620000101" },
  { carrier: "dincer", code: "DNC-KMP-TM", name: "Dinçer Kemalpaşa Transfer Merkezi", kind: "transfer_center", city: "İzmir", district: "Kemalpaşa", address: "Örnek Lojistik Bölgesi, 4. Sokak No:7, Kemalpaşa/İzmir", lat: 38.426, lng: 27.417, slots: 50, contact: "Kemalpaşa Vardiya Amiri", phone: "+902320000102" },
  { carrier: "dincer", code: "DNC-ANK-DM", name: "Dinçer Ankara Dağıtım Merkezi", kind: "distribution_center", city: "Ankara", district: null, address: "Örnek Sanayi Sitesi, 12. Cadde No:3, Sincan/Ankara", lat: 39.966, lng: 32.580, slots: 50, contact: "Ankara Depo Sorumlusu", phone: "+903120000103" },
  { carrier: "dincer", code: "DNC-BRS-DM", name: "Dinçer Bursa Dağıtım Merkezi", kind: "distribution_center", city: "Bursa", district: null, address: "Örnek OSB, 2. Bulvar No:21, Nilüfer/Bursa", lat: 40.214, lng: 28.960, slots: 40, contact: "Bursa Depo Sorumlusu", phone: "+902240000104" },
  { carrier: "dincer", code: "DNC-KNY-DM", name: "Dinçer Konya Dağıtım Merkezi", kind: "distribution_center", city: "Konya", district: null, address: "Örnek Sanayi Bölgesi, 5. Sokak No:14, Selçuklu/Konya", lat: 37.950, lng: 32.500, slots: 40, contact: "Konya Depo Sorumlusu", phone: "+903320000105" },
  { carrier: "dincer", code: "DNC-ADN-DM", name: "Dinçer Adana Dağıtım Merkezi", kind: "distribution_center", city: "Adana", district: null, address: "Örnek Lojistik Köyü, 3. Cadde No:9, Seyhan/Adana", lat: 37.000, lng: 35.320, slots: 40, contact: "Adana Depo Sorumlusu", phone: "+903220000106" },
  { carrier: "siva", code: "SVA-CRK-TM", name: "Siva Çerkezköy Transfer Merkezi", kind: "transfer_center", city: "Tekirdağ", district: "Çerkezköy", address: "Örnek OSB, 8. Cadde No:5, Çerkezköy/Tekirdağ", lat: 41.285, lng: 28.000, slots: 60, contact: "Çerkezköy Vardiya Amiri", phone: "+902820000201" },
  { carrier: "siva", code: "SVA-MRS-TM", name: "Siva Mersin Transfer Merkezi", kind: "transfer_center", city: "Mersin", district: "Tarsus", address: "Örnek Serbest Bölge Yolu No:18, Tarsus/Mersin", lat: 36.918, lng: 34.895, slots: 50, contact: "Mersin Vardiya Amiri", phone: "+903240000202" },
  { carrier: "siva", code: "SVA-ANK-DM", name: "Siva Ankara Dağıtım Merkezi", kind: "distribution_center", city: "Ankara", district: null, address: "Örnek Lojistik Merkezi, 1. Sokak No:2, Gölbaşı/Ankara", lat: 39.790, lng: 32.810, slots: 50, contact: "Ankara Depo Sorumlusu", phone: "+903120000203" },
  { carrier: "siva", code: "SVA-IZM-DM", name: "Siva İzmir Dağıtım Merkezi", kind: "distribution_center", city: "İzmir", district: null, address: "Örnek AOSB, 10. Cadde No:30, Çiğli/İzmir", lat: 38.500, lng: 27.050, slots: 40, contact: "İzmir Depo Sorumlusu", phone: "+902320000204" },
  { carrier: "siva", code: "SVA-GZT-DM", name: "Siva Gaziantep Dağıtım Merkezi", kind: "distribution_center", city: "Gaziantep", district: null, address: "Örnek OSB, 4. Bölge No:11, Şehitkamil/Gaziantep", lat: 37.080, lng: 37.360, slots: 40, contact: "Gaziantep Depo Sorumlusu", phone: "+903420000205" },
  { carrier: "siva", code: "SVA-SMS-DM", name: "Siva Samsun Dağıtım Merkezi", kind: "distribution_center", city: "Samsun", district: null, address: "Örnek Lojistik Alanı, 2. Cadde No:6, Canik/Samsun", lat: 41.270, lng: 36.360, slots: 40, contact: "Samsun Depo Sorumlusu", phone: "+903620000206" },
];

/** Taşıyıcı başına araçlar (vehicle_types.code platform kataloğundan). */
export const vehiclesPerCarrier: { n: number; type: "TIR-136" | "KAMYON-10T" | "KAMYONET"; status: "active" | "maintenance"; driver: string }[] = [
  { n: 101, type: "TIR-136", status: "active", driver: "Ahmet Yılmaz" },
  { n: 102, type: "TIR-136", status: "active", driver: "Mehmet Kaya" },
  { n: 103, type: "TIR-136", status: "maintenance", driver: "Ali Demir" },
  { n: 201, type: "KAMYON-10T", status: "active", driver: "Hasan Çelik" },
  { n: 301, type: "KAMYONET", status: "active", driver: "Mustafa Şahin" },
];

/** Taşıyıcının kabul ettiği ürün sınıfları (design §5.3). */
export const carrierClassAcceptance: Record<"dincer" | "siva", Record<string, boolean>> = {
  dincer: { GENEL: true, "GIDA-AMBALAJLI": true, KIRILGAN: false, TEHLIKELI: false },
  siva: { GENEL: true, "GIDA-AMBALAJLI": true, KIRILGAN: true, TEHLIKELI: false },
};

/** Test kullanıcıları. Alan adı example.test (RFC 2606, gerçek posta almaz). */
export type SeedUser = { email: string; name: string; tenant: string; role: string };
export const users: SeedUser[] = [
  { email: "platform.admin@cargopact.example.test", name: "Platform Yöneticisi", tenant: "platform", role: "platform_admin" },
  { email: "jury@cargopact.example.test", name: "Jüri İzleyici", tenant: "platform", role: "admin_viewer" },
  ...carriers.flatMap((c) => [
    { email: `admin@${c.key}.example.test`, name: `${c.name} Yöneticisi`, tenant: c.key, role: "carrier_admin" },
    { email: `planner@${c.key}.example.test`, name: `${c.name} Planlamacı`, tenant: c.key, role: "carrier_planner" },
    { email: `depo@${c.key}.example.test`, name: `${c.name} Depo`, tenant: c.key, role: "carrier_warehouse" },
  ]),
  ...customers.map((c) => ({ email: `user@${c.key}.example.test`, name: `${c.name} Kullanıcısı`, tenant: c.key, role: "customer_user" })),
  // Sunum/demo hesapları: web ve mobil için ayrı müşteri ve transfer merkezi yöneticisi
  { email: "web.musteri@cargopact.example.test", name: "Marmara Ambar (Web)", tenant: "marmara", role: "customer_user" },
  { email: "web.yonetici@cargopact.example.test", name: "Dinçer Gebze TM Yöneticisi (Web)", tenant: "dincer", role: "carrier_admin" },
  { email: "mobil.musteri@cargopact.example.test", name: "Anadolu Parsiyel (Mobil)", tenant: "anadolu", role: "customer_user" },
  { email: "mobil.yonetici@cargopact.example.test", name: "Dinçer Gebze TM Yöneticisi (Mobil)", tenant: "dincer", role: "carrier_admin" },
];
