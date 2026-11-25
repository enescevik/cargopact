export type Dim = { pallets: number; kg: number; m3: number };
export type Facility = {
  id: string; code: string; name: string; city: string; district: string | null; address: string;
  kind?: string;
  latitude?: number | null; longitude?: number | null; contactPhone?: string | null;
  openingHours?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", [string, string][]>> | null;
  intakeWindow: { from: string; to: string } | null; pickupWindow: { from: string; to: string } | null;
};
export type Price = {
  unitPriceMinor: number; totalPriceMinor: number; currency: "TRY";
  breakdown: {
    basePriceMinor: number; utilization: number; demandMultiplier: number; hoursToCutoff: number;
    timeMultiplier: number; timeDecayApplied: boolean; clampedTo: "floor" | "ceiling" | null; explanation: string[];
  };
};
export type TripCard = {
  id: string; reference: string; carrier: { id: string; name: string };
  origin: Facility; destination: Facility; vehicleType: { code: string; name: string; palletPositions: number };
  departureAt: string; arrivalEta: string; bookingCutoffAt: string; intakeCutoffAt: string;
  sellable: Dim; remaining: Dim; price: Price; carbon?: Carbon;
};
export type Capacity = {
  totalPositions: number; internalPallets: number; internalKg: number; maxGrossKg: number;
  sellable: Dim; held: Dim; confirmed: Dim; loaded: { pallets: number; kg: number }; remaining: Dim;
  plannedPallets: number; heldPallets: number; actualPallets: number; plannedGrossKg: number;
};
export type TripCarbon = {
  distanceKm: number; vehicleFactorKgPerKm: number; tripKg: number; externalPallets: number; allocatedExternalKg: number;
  declaredSavedKg: number; reservationsWithScenario: number; reservationsTotal: number; method: string; isDemoFactors: true;
};
export type CarbonSummary = {
  allocatedKg: number; declaredSavedKg: number; perPalletAllocatedKg: number; reservationsWithScenario: number; reservationsTotal: number; method: string; isDemoFactors: true;
};
export type CarrierTrip = TripCard & {
  carbon?: TripCarbon;
  status: string; vehicle: { id: string; plate: string }; capacity: Capacity; pendingCount: number;
};
export type LedgerEntry = { type: string; amountMinor: number; at: string; reason: string };
export type Recipient = { name: string; phone?: string };
export type Pickup = { recipients: Recipient[]; hint: string | null; locked: boolean; code?: string | null };
export type Measurement = {
  declared: { pallets: number; kg: number }; measured: { pallets: number; kg: number; heightMm: number | null };
  diff: { pallets: number; kg: number }; outcome: "ok" | "review" | "partial" | "rejected"; note: string | null; at: string;
};
export type AlternativeScenario = "dedicated" | "groupage";
export type Carbon = {
  distanceKm: number; vehicleClass: "kamyonet" | "kamyon" | "tir"; vehicleFactorKgPerKm: number; allocatedKg: number;
  alternativeScenario: AlternativeScenario | null; alternativeKg: number | null; savedKg: number | null;
  method: string; isDemoFactors: true; note: string;
};
export type CustomerCarbonSummary = { allocatedKg: number; declaredSavedKg: number; reservations: number; method: string; isDemoFactors: true };
export type ContractPreview = { contractCode: string; version: string; isDraft: boolean; title: string; renderedMarkdown: string; renderedHash: string };
export type ContractAcceptance = { signerName: string; acceptedAt: string; version: string; renderedHash: string };
export type ContractView = { renderedMarkdown: string; acceptance: ContractAcceptance };
export type Reservation = {
  carbon?: Carbon;
  contract?: ContractAcceptance | null;
  id: string; reference: string; orderNumber: string | null; status: string; statusLabel: string;
  trip: TripCard; customer: { id: string; name: string };
  pallets: number; grossKg: number; volumeM3: number; productClass: { code: string; name: string };
  unitPriceMinor: number; totalPriceMinor: number; paymentPlan: "full" | "deposit"; depositPercent: number;
  payment: {
    status: string; paidMinor: number; refundedMinor: number; retainedMinor: number; dueMinor: number;
    entries: LedgerEntry[];
  };
  holdExpiresAt: string | null; decisionReason: string | null; createdAt: string;
  events: { type: string; label: string; at: string; note: string | null }[];
  palletCodes: string[];
  /** Depo ölçümü (beyandan ayrı saklanır). */
  measurement?: Measurement | null;
  /** Teslim yetkisi: düz `code` yalnız müşteri yanıtında gelir. */
  pickup?: Pickup;
};
export type Reason = { code: string; message: string };
export type CarrierReservation = Reservation & {
  priorityRank: number; verifiedNoShows: number;
  customerHistory: { historicalReservationCount: number; verifiedNoShows: number };
  eligibility: { eligible: boolean; reasons: Reason[] };
};
export type Quote = {
  eligible: boolean; reasons: Reason[]; price: Price; bookingCutoffAt: string; intakeCutoffAt: string;
  quoteExpiresAt: string; carbon?: Carbon;
  paymentPlans: { code: "full" | "deposit"; label: string; depositPercent?: number; dueNowMinor: number; remainingMinor?: number }[];
  cancellationPolicy: { label: string; refundPercent: number }[];
};
export type Me = {
  userId: string; email: string; displayName: string;
  active: { tenantId: string; tenantType: string; role: string; tenantStatus: string };
};
export type Dashboard = {
  trip: CarrierTrip; grossRevenueMinor: number; variableCostMinor: number; contributionMinor: number;
  costPerPalletMinor: number;
  carbon?: CarbonSummary;
  customers: { name: string; pallets: number; kg: number; totalMinor: number; status: string; statusLabel: string }[];
  timeline: { at: string; label: string }[];
};
