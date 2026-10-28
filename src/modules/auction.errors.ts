
export class AuctionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "AuctionError";
  }
}

export class AuctionNotFoundError extends AuctionError {
  constructor() {
    super("Auction not found", "AUCTION_NOT_FOUND", 404);
  }
}

export class AuctionNotOpenError extends AuctionError {
  constructor(message = "Auction is not accepting bids") {
    super(message, "AUCTION_NOT_OPEN", 409);
  }
}

export class InvalidBidError extends AuctionError {
  constructor(message: string) {
    super(message, "INVALID_BID", 400);
  }
}
