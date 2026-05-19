export enum OrderType {
  BUY = 'buy',
  SELL = 'sell',
}

export enum SwapOrderStatus {
  PENDING = 'pending',
  PARTIALLY_FILLED = 'partially_filled',
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