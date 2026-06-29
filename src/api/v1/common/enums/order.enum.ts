export enum OrderType {
  BUY = 'buy',
  SELL = 'sell',
}

export enum SwapOrderStatus {
  CREATED = 'created',
  PENDING = 'pending',
  PARTIALLY_FILLED = 'partially_filled',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  INVALID = 'invalid',
  EXECUTED = "executed",
  REFUNDING = "refunding",
  REFUNDED = "refunded",
  FILLED = "filled",
}

export enum RangoOrderStatus{
  RUNNING = 'running',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  WAITING = 'waiting',
  SUCCESS = 'success',
}

export enum OrderTxType {
  NATIVE_TRANSFER = 'Native Transfer',
  TOKEN_TRANSFER = 'Token Transfer',
  TOKEN_APPROVAL = 'Token Approval',
  SWAP = 'Swap',
  BRIDGE = 'Bridge',
  CONTRACT_CALL = 'Contract Call',
  UNKNOWN = 'Unknown',
}