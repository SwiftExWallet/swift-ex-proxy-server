export class WebhookStellarDto {
  eventType: string;
  data: {
    id: string;
    paging_token: string;
    transaction_successful: boolean;
    source_account: string;
    type: string;
    type_i: number;
    created_at: string;
    transaction_hash: string;
    asset_type: string;
    asset_code: string;
    asset_issuer: string;
    from: string;
    to: string;
    amount: string;
    message: string;
    additionalData: string;
  };
  tag?: string;
  additionalData?: string;

  isTestPayload(): boolean {
    return (
      this.eventType === 'test' &&
      this.data?.asset_type === 'test' &&
      this.data?.amount === 'test'
    );
  }
}
