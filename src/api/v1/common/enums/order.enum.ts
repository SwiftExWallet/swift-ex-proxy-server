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