/** Demo müşteri firmalarının yetkili alıcı listeleri (kurgusal kişiler; telefonlar 555 kurgusal blok). */
export interface SeedRecipient { name: string; phone: string }

const FIXED: Record<string, SeedRecipient[]> = {
  "Marmara Ambar": [{ name: "Ayşe Kaya", phone: "+90 555 101 11 01" }, { name: "Murat Demir", phone: "+90 555 101 11 02" }],
  "Anadolu Parsiyel": [{ name: "Elif Şahin", phone: "+90 555 102 22 01" }, { name: "Hakan Yıldız", phone: "+90 555 102 22 02" }],
  "Başkent Nakliye": [{ name: "Serkan Aydın", phone: "+90 555 103 33 01" }, { name: "Zeynep Arslan", phone: "+90 555 103 33 02" }],
  "Ege Depo Hizmetleri": [{ name: "Deniz Çelik", phone: "+90 555 104 44 01" }, { name: "Emre Koç", phone: "+90 555 104 44 02" }],
  "Karadeniz Parsiyel": [{ name: "Gökhan Kurt", phone: "+90 555 105 55 01" }, { name: "Fatma Öztürk", phone: "+90 555 105 55 02" }],
  "Güney Lojistik Pazarlama": [{ name: "Burak Aslan", phone: "+90 555 106 66 01" }, { name: "Selin Yılmaz", phone: "+90 555 106 66 02" }],
};

const FIRST = ["Ahmet", "Mehmet", "Can", "Ece", "Merve", "Oğuz", "Seda", "Tolga", "Derya", "Kerem", "Nazlı", "Barış", "Gizem", "Ufuk", "Pınar", "Cem"];
const LAST = ["Yılmaz", "Kaya", "Demir", "Şahin", "Çelik", "Yıldız", "Aydın", "Öztürk", "Arslan", "Doğan", "Koç", "Kılıç", "Aslan", "Polat", "Erdoğan", "Güneş"];

function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

/** Firma adına göre deterministik 2 kişilik yetkili listesi (aynı firma her seed'de aynı kişileri alır). */
export function rosterFor(customerName: string): SeedRecipient[] {
  if (FIXED[customerName]) return FIXED[customerName];
  const h = hash(customerName);
  const block = 200 + (h % 700);
  return [0, 1].map((i) => ({
    name: `${FIRST[(h >>> (i * 4)) % FIRST.length]} ${LAST[(h >>> (i * 4 + 8)) % LAST.length]}`,
    phone: `+90 555 ${block} ${String(10 + i).padStart(2, "0")} 0${i + 1}`,
  }));
}
