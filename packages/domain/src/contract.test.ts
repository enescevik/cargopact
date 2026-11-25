import { describe, expect, it } from "vitest";
import { CONTRACT_TEMPLATE_V1 } from "./contract-template";
import { renderContract, type ContractValues } from "./contract";

const v: ContractValues = {
  customerName: "Marmara Ambar", carrierName: "Dinçer Lojistik", tripReference: "TR-1", originName: "Gebze TM", destinationName: "Ankara DM",
  departureAt: new Date("2026-11-26T15:00:00Z"), bookingCutoffAt: new Date("2026-11-26T12:00:00Z"), intakeCutoffAt: new Date("2026-11-26T14:00:00Z"),
  pickupWindow: "08:00–18:00", pallets: 3, grossKg: 1500, volumeM3: 3.6, productClass: "Genel kuru yük", unitPriceMinor: 150000, totalPriceMinor: 450000,
  paymentPlan: "deposit", depositPercent: 30,
};
describe("renderContract", () => {
  it("tüm yer tutucular doldurulur; imza alanları önizlemede —", () => {
    const t = renderContract(v);
    expect(t).not.toMatch(/\{\{/);
    expect(t).toContain("Marmara Ambar");
    expect(t).toContain("18:00 (İstanbul)".slice(0, 0) + "(İstanbul)");
    expect(t).toContain("**—**");
    expect(t).toContain("%30 kapora");
  });
  it("deterministik ve imza dolunca değişir", () => {
    expect(renderContract(v)).toBe(renderContract({ ...v }));
    expect(renderContract({ ...v, signerName: "Ayşe Y.", acceptedAt: new Date(), contractHash: "abc" })).toContain("Ayşe Y.");
  });
  it("şablon sürümü yer tutucuları içerir", () => expect(CONTRACT_TEMPLATE_V1).toContain("{{signerName}}"));
});
