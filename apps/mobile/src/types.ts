export type Dim = { pallets: number; kg: number; m3: number };
export type Facility = { id: string; code: string; name: string; city: string; district: string | null; address: string };
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
  sellable: Dim; remaining: Dim; price: Price;
};
export type Capacity = {
  totalPositions: number; internalPallets: number; internalKg: number; maxGrossKg: number;
  sellable: Dim; held: Dim; confirmed: Dim; loaded: { pallets: number; kg: number }; remaining: Dim;
  plannedPallets: number; heldPallets: number; actualPallets: number; plannedGrossKg: number;
};
export type LedgerEntry = { type: string; amountMinor: number; at: string; reason: string };
export type Reservation = {
  id: string; reference: string; orderNumber: string | null; status: string; statusLabel: string;
  trip: TripCard; customer: { id: string; name: string };
  pallets: number; grossKg: number; volumeM3: number; productClass: { code: string; name: string };
  unitPriceMinor: number; totalPriceMinor: number; paymentPlan: "full" | "deposit"; depositPercent: number;
  payment: { status: string; paidMinor: number; refundedMinor: number; retainedMinor: number; dueMinor: number; entries: LedgerEntry[] };
  holdExpiresAt: string | null; decisionReason: string | null; createdAt: string;
  events: { type: string; label: string; at: string; note: string | null }[];
  palletCodes: string[];
};
export type CarrierReservation = Reservation & {
  priorityRank: number; verifiedNoShows: number;
  customerHistory: { historicalReservationCount: number; verifiedNoShows: number };
  eligibility: { eligible: boolean; reasons: { code: string; message: string }[] };
};
export type CarrierTrip = TripCard & {
  status: string; vehicle: { id: string; plate: string }; capacity: Capacity; pendingCount: number;
};
export type Quote = {
  eligible: boolean; reasons: { code: string; message: string }[]; price: Price;
  bookingCutoffAt: string; intakeCutoffAt: string; quoteExpiresAt: string;
  paymentPlans: { code: "full" | "deposit"; label: string; dueNowMinor: number; depositPercent?: number; remainingMinor?: number }[];
  cancellationPolicy: { label: string; refundPercent: number }[];
};
export type Me = {
  userId: string; email: string; displayName: string;
  active: { tenantId: string; tenantType: string; role: string; tenantStatus: string };
};
export type Tracking = {
  orderNumber: string; status: string; statusLabel: string; updatedAt: string; nextStep: string;
  steps: { status: string; label: string; done: boolean; at: string | null }[];
  origin: Facility; destination: Facility; intakeCutoffAt: string; pickupWindow: { from: string; to: string } | null;
  palletCodes: string[];
};
