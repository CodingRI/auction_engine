
export type ExtensionTrigger =
  | "BID_RECEIVED"
  | "ANY_RANK_CHANGE"
  | "L1_RANK_CHANGE";

export type AuctionStatus =
  | "SCHEDULED"
  | "ACTIVE"
  | "CLOSED"
  | "FORCE_CLOSED";

export interface AuctionStatusInput {
  status: AuctionStatus | string;
  startAt: Date | string;
  currentCloseAt: Date | string;
  forcedCloseAt: Date | string;
}

/**
 * Derives the operational status of an auction given current time and deadlines.
 * Respects explicit database terminations (CLOSED, FORCE_CLOSED) while ensuring
 * auctions whose deadlines have passed never appear actively open.
 */
export function deriveEffectiveAuctionStatus(
  auction: AuctionStatusInput,
  now: Date = new Date(),
): AuctionStatus {
  if (auction.status === "FORCE_CLOSED") {
    return "FORCE_CLOSED";
  }
  if (auction.status === "CLOSED") {
    return "CLOSED";
  }

  const nowMs = now.getTime();
  const startMs = new Date(auction.startAt).getTime();
  const currentCloseMs = new Date(auction.currentCloseAt).getTime();
  const forcedCloseMs = new Date(auction.forcedCloseAt).getTime();

  if (nowMs >= forcedCloseMs) {
    return "FORCE_CLOSED";
  }

  if (nowMs >= currentCloseMs) {
    return "CLOSED";
  }

  if (nowMs < startMs) {
    return "SCHEDULED";
  }

  return "ACTIVE";
}

export interface BidSnapshot {
  supplierId: string;
  totalCents: number;
  submittedAt: Date;
}

export interface ExtensionDecisionInput {
  currentCloseAt: Date;
  forcedCloseAt: Date;
  now: Date;
  triggerWindowMinutes: number;
  extensionMinutes: number;
  enabledTriggers: ExtensionTrigger[];
  existingBids: BidSnapshot[];
  candidateBid: BidSnapshot;
}

export interface ExtensionDecision {
  shouldExtend: boolean;
  previousCloseAt: Date;
  newCloseAt: Date;
  reasons: ExtensionTrigger[];
}

interface RankedSupplier {
  supplierId: string;
  totalCents: number;
  submittedAt: Date;
  rank: number;
}

/**
 * Each supplier is ranked using their lowest submitted total.
 * Ties are resolved deterministically.
 */
export function calculateRankings(
  bids: BidSnapshot[],
): RankedSupplier[] {
  const bestBySupplier = new Map<string, BidSnapshot>();

  for (const bid of bids) {
    const current = bestBySupplier.get(bid.supplierId);

    if (
      !current ||
      bid.totalCents < current.totalCents ||
      (bid.totalCents === current.totalCents &&
        bid.submittedAt.getTime() < current.submittedAt.getTime())
    ) {
      bestBySupplier.set(bid.supplierId, bid);
    }
  }

  return [...bestBySupplier.values()]
    .sort(
      (a, b) =>
        a.totalCents - b.totalCents ||
        a.submittedAt.getTime() - b.submittedAt.getTime() ||
        a.supplierId.localeCompare(b.supplierId),
    )
    .map((bid, index) => ({ ...bid, rank: index + 1 }));
}

export function decideExtension(
  input: ExtensionDecisionInput,
): ExtensionDecision {
  const {
    currentCloseAt,
    forcedCloseAt,
    now,
    triggerWindowMinutes,
    extensionMinutes,
    enabledTriggers,
    existingBids,
    candidateBid,
  } = input;

  const noExtension = (): ExtensionDecision => ({
    shouldExtend: false,
    previousCloseAt: currentCloseAt,
    newCloseAt: currentCloseAt,
    reasons: [],
  });

  if (
    !Number.isInteger(triggerWindowMinutes) ||
    triggerWindowMinutes <= 0 ||
    !Number.isInteger(extensionMinutes) ||
    extensionMinutes <= 0
  ) {
    throw new Error("Extension settings must be positive integers");
  }

  if (
    currentCloseAt.getTime() >= forcedCloseAt.getTime() ||
    now.getTime() >= currentCloseAt.getTime() ||
    now.getTime() >= forcedCloseAt.getTime()
  ) {
    return noExtension();
  }

  const windowStart =
    currentCloseAt.getTime() - triggerWindowMinutes * 60_000;

  if (now.getTime() < windowStart) {
    return noExtension();
  }

  const reasons: ExtensionTrigger[] = [];

  if (enabledTriggers.includes("BID_RECEIVED")) {
    reasons.push("BID_RECEIVED");
  }

  const before = calculateRankings(existingBids);
  const after = calculateRankings([...existingBids, candidateBid]);

  const beforeRanks = new Map(
    before.map((item) => [item.supplierId, item.rank]),
  );

  const anyRankChanged = after.some(
    (item) => beforeRanks.get(item.supplierId) !== item.rank,
  );

  if (
    enabledTriggers.includes("ANY_RANK_CHANGE") &&
    anyRankChanged
  ) {
    reasons.push("ANY_RANK_CHANGE");
  }

  const previousL1 = before[0]?.supplierId;
  const nextL1 = after[0]?.supplierId;
  const l1Changed = previousL1 !== nextL1;

  if (
    enabledTriggers.includes("L1_RANK_CHANGE") &&
    l1Changed
  ) {
    reasons.push("L1_RANK_CHANGE");
  }

  if (reasons.length === 0) {
    return noExtension();
  }

  const proposedCloseAt = new Date(
    currentCloseAt.getTime() + extensionMinutes * 60_000,
  );

  const newCloseAt = new Date(
    Math.min(
      proposedCloseAt.getTime(),
      forcedCloseAt.getTime(),
    ),
  );

  return {
    shouldExtend: true,
    previousCloseAt: currentCloseAt,
    newCloseAt,
    reasons,
  };
}
