
import { describe, expect, it } from "vitest";
import {
  calculateRankings,
  decideExtension,
  type BidSnapshot,
  type ExtensionDecisionInput,
} from "@/modules/auction.engine";

const now = new Date("2026-10-29T10:55:00.000Z");
const currentCloseAt = new Date("2026-10-29T11:00:00.000Z");
const forcedCloseAt = new Date("2026-10-29T11:30:00.000Z");

const bid = (
  supplierId: string,
  totalCents: number,
  submittedAt = new Date("2026-10-29T10:40:00.000Z"),
): BidSnapshot => ({ supplierId, totalCents, submittedAt });

const baseInput = (
  overrides: Partial<ExtensionDecisionInput> = {},
): ExtensionDecisionInput => ({
  currentCloseAt,
  forcedCloseAt,
  now,
  triggerWindowMinutes: 10,
  extensionMinutes: 5,
  enabledTriggers: ["BID_RECEIVED"],
  existingBids: [
    bid("supplier-a", 5_000_000),
    bid("supplier-b", 4_800_000),
  ],
  candidateBid: bid("supplier-c", 4_600_000, now),
  ...overrides,
});

describe("calculateRankings", () => {
  it("ranks suppliers by their best submitted price", () => {
    const rankings = calculateRankings([
      bid("supplier-a", 5_000_000),
      bid("supplier-b", 4_800_000),
      bid("supplier-a", 4_700_000),
    ]);

    expect(rankings.map((item) => item.supplierId)).toEqual([
      "supplier-a",
      "supplier-b",
    ]);

    expect(rankings.map((item) => item.rank)).toEqual([1, 2]);
  });

  it("uses deterministic ordering for equal prices", () => {
    const rankings = calculateRankings([
      bid("supplier-b", 4_800_000),
      bid("supplier-a", 4_800_000),
    ]);

    expect(rankings[0].supplierId).toBe("supplier-a");
  });
});

describe("decideExtension", () => {
  it("extends when a bid arrives inside the trigger window", () => {
    const result = decideExtension(baseInput());

    expect(result.shouldExtend).toBe(true);
    expect(result.newCloseAt.toISOString()).toBe(
      "2026-10-29T11:05:00.000Z",
    );
    expect(result.reasons).toEqual(["BID_RECEIVED"]);
  });

  it("does not extend outside the trigger window", () => {
    const result = decideExtension(
      baseInput({
        now: new Date("2026-10-29T10:49:59.999Z"),
      }),
    );

    expect(result.shouldExtend).toBe(false);
  });

  it("extends for a rank change when that trigger is enabled", () => {
    const result = decideExtension(
      baseInput({
        enabledTriggers: ["ANY_RANK_CHANGE"],
      }),
    );

    expect(result.shouldExtend).toBe(true);
    expect(result.reasons).toEqual(["ANY_RANK_CHANGE"]);
  });

  it("does not extend for rank changes when the trigger is disabled", () => {
    const result = decideExtension(
      baseInput({
        enabledTriggers: ["L1_RANK_CHANGE"],
        candidateBid: bid("supplier-c", 5_500_000, now),
      }),
    );

    expect(result.shouldExtend).toBe(false);
  });

  it("caps the extension at the forced close time", () => {
    const result = decideExtension(
      baseInput({
        currentCloseAt: new Date("2026-10-29T11:28:00.000Z"),
        forcedCloseAt,
        now: new Date("2026-10-29T11:27:00.000Z"),
        triggerWindowMinutes: 10,
      }),
    );

    expect(result.newCloseAt.toISOString()).toBe(
      forcedCloseAt.toISOString(),
    );
  });

  it("does not extend after the current deadline", () => {
    const result = decideExtension(
      baseInput({
        now: currentCloseAt,
      }),
    );

    expect(result.shouldExtend).toBe(false);
  });

  it("extends only once when multiple triggers match", () => {
    const result = decideExtension(
      baseInput({
        enabledTriggers: [
          "BID_RECEIVED",
          "ANY_RANK_CHANGE",
          "L1_RANK_CHANGE",
        ],
      }),
    );

    expect(result.reasons).toHaveLength(3);
    expect(result.newCloseAt.toISOString()).toBe(
      "2026-10-29T11:05:00.000Z",
    );
  });
});
