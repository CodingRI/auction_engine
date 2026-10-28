
import { z } from "zod";

export const createAuctionSchema = z
  .object({
    referenceId: z.string().trim().min(3).max(50),
    name: z.string().trim().min(3).max(120),
    origin: z.string().trim().max(120).optional(),
    destination: z.string().trim().max(120).optional(),

    pickupServiceAt: z.iso.datetime().transform((value) => new Date(value)),
    startAt: z.iso.datetime().transform((value) => new Date(value)),
    initialCloseAt: z.iso.datetime().transform((value) => new Date(value)),
    forcedCloseAt: z.iso.datetime().transform((value) => new Date(value)),

    triggerWindowMinutes: z.number().int().min(1).max(1440),
    extensionMinutes: z.number().int().min(1).max(1440),

    extensionTriggers: z
      .array(
        z.enum([
          "BID_RECEIVED",
          "ANY_RANK_CHANGE",
          "L1_RANK_CHANGE",
        ]),
      )
      .max(3),
  })
  .superRefine((auction, ctx) => {
    if (auction.startAt >= auction.initialCloseAt) {
      ctx.addIssue({
        code: "custom",
        path: ["initialCloseAt"],
        message: "Initial close time must be after start time",
      });
    }

    if (auction.initialCloseAt >= auction.forcedCloseAt) {
      ctx.addIssue({
        code: "custom",
        path: ["forcedCloseAt"],
        message: "Forced close time must be after initial close time",
      });
    }
  });

export type CreateAuctionInput = z.infer<typeof createAuctionSchema>;
