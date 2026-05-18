export enum OrderType {
  BUY = 'buy',
  SELL = 'sell',
}

export enum OrderStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
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