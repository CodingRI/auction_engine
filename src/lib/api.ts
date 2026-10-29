/**
 * Strongly typed client API client for British Auction RFQ dashboard.
 */

export type AuctionStatus = "SCHEDULED" | "ACTIVE" | "CLOSED" | "FORCE_CLOSED";
export type ExtensionTriggerType =
  | "BID_RECEIVED"
  | "ANY_RANK_CHANGE"
  | "L1_RANK_CHANGE";

export type AuctionEventType =
  | "BID_SUBMITTED"
  | "AUCTION_EXTENDED"
  | "AUCTION_CLOSED"
  | "AUCTION_FORCE_CLOSED";

export interface AuctionSummary {
  id: string;
  referenceId: string;
  name: string;
  origin: string | null;
  destination: string | null;
  pickupServiceAt?: string;
  startAt: string;
  initialCloseAt: string;
  currentCloseAt: string;
  forcedCloseAt: string;
  status: AuctionStatus;
  lowestBid: string | null;
}

export interface SupplierInfo {
  id: string;
  code: string;
  name: string;
  isActive?: boolean;
}

export interface BidDetail {
  id: string;
  supplier: SupplierInfo;
  freightCharge: string;
  originCharge: string;
  destinationCharge: string;
  totalAmount: string;
  transitTimeHours: number;
  validUntil: string;
  submittedAt: string;
  rank: number | null;
}

export interface AuctionEventDetail {
  id: string;
  auctionId: string;
  bidId: string | null;
  type: AuctionEventType;
  reason: string | null;
  previousCloseAt: string | null;
  newCloseAt: string | null;
  createdAt: string;
}

export interface AuctionDetail {
  id: string;
  referenceId: string;
  name: string;
  origin: string | null;
  destination: string | null;
  pickupServiceAt: string;
  startAt: string;
  initialCloseAt: string;
  currentCloseAt: string;
  forcedCloseAt: string;
  triggerWindowMinutes: number;
  extensionMinutes: number;
  extensionTriggers: ExtensionTriggerType[];
  status: AuctionStatus;
  bids: BidDetail[];
  events: AuctionEventDetail[];
}

export interface CreateAuctionPayload {
  referenceId: string;
  name: string;
  origin?: string;
  destination?: string;
  pickupServiceAt: string;
  startAt: string;
  initialCloseAt: string;
  forcedCloseAt: string;
  triggerWindowMinutes: number;
  extensionMinutes: number;
  extensionTriggers: ExtensionTriggerType[];
}

export interface SubmitBidPayload {
  supplierId: string;
  freightCharge: number;
  originCharge: number;
  destinationCharge: number;
  transitTimeHours: number;
  validUntil: string;
}

export interface SubmitBidResult {
  bid: {
    id: string;
    totalAmount: string;
    submittedAt: string;
  };
  auction: {
    id: string;
    referenceId: string;
    status: AuctionStatus;
    currentCloseAt: string;
    forcedCloseAt: string;
  };
  rankings: Array<{
    supplierId: string;
    rank: number;
    totalCents: number;
  }>;
  extension: {
    extended: boolean;
    reasons: ExtensionTriggerType[];
    previousCloseAt: string;
    newCloseAt: string;
  };
}

export class ApiError extends Error {
  status: number;
  details?: Record<string, unknown> | null;
  constructor(message: string, status: number, details?: Record<string, unknown> | null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    const errorMsg = data?.error || `Request failed with status ${res.status}`;
    throw new ApiError(errorMsg, res.status, data?.details);
  }

  return data as T;
}

export const api = {
  getAuctions: () => request<{ data: AuctionSummary[] }>("/api/auctions"),
  
  getAuction: (id: string) =>
    request<{ data: AuctionDetail }>(`/api/auctions/${encodeURIComponent(id)}`),

  createAuction: (payload: CreateAuctionPayload) =>
    request<{ data: { id: string; referenceId: string; status: AuctionStatus } }>(
      "/api/auctions",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  submitBid: (auctionId: string, payload: SubmitBidPayload) =>
    request<{ data: SubmitBidResult }>(
      `/api/auctions/${encodeURIComponent(auctionId)}/bids`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  getSuppliers: () => request<{ data: SupplierInfo[] }>("/api/suppliers"),

  getAuthSession: () => request<{ authenticated: boolean }>("/api/auth/me"),

  login: (credentials: { email: string; password: string }) =>
    request<{ authenticated: boolean }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    }),

  logout: () =>
    request<{ authenticated: boolean }>("/api/auth/logout", {
      method: "POST",
    }),
};

