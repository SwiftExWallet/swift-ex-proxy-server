export interface OneInchUrls {
  fusionSdk: string;
  fusionPlusSdk: string;
  quoter: string;
  fusionPlusQuoter: string;
  relayer: string;
  fusionPlusRelayer: string;
  orders: string;
  fusionPlusOrders: string;
}

type Environment = Record<string, string | undefined>;

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

function configured(env: Environment, name: string): string {
  const value = env[name]?.trim();
  return value ? trimTrailingSlashes(value) : '';
}

export function resolveOneInchUrls(env: Environment): OneInchUrls {
  if (env.ENVIRONMENT === 'dev') {
    const configuredBase = env.INCH_MOCK_BASE_URL?.trim();
    if (!configuredBase) {
      throw new Error('INCH_MOCK_BASE_URL is required when ENVIRONMENT=dev');
    }
    const base = trimTrailingSlashes(configuredBase);
    return {
      fusionSdk: `${base}/fusion`,
      fusionPlusSdk: `${base}/fusion-plus`,
      quoter: `${base}/fusion/quoter/v2.0`,
      fusionPlusQuoter: `${base}/fusion-plus/v1.2`,
      relayer: `${base}/fusion/relayer/v2.0`,
      fusionPlusRelayer: `${base}/fusion-plus/v1.2`,
      orders: `${base}/fusion/orders/v2.0`,
      fusionPlusOrders: `${base}/fusion-plus/v1.2/order/status`,
    };
  }

  return {
    fusionSdk: trimTrailingSlashes(
      env.INCH_FUSION_SDK_URL ?? 'https://api.1inch.com/fusion',
    ),
    fusionPlusSdk: trimTrailingSlashes(
      env.INCH_FUSION_PLUS_SDK_URL ?? 'https://api.1inch.com/fusion-plus',
    ),
    quoter: configured(env, 'QUOTER_BASE'),
    fusionPlusQuoter: configured(env, 'FUSION_PLUS_QUOTER_BASE'),
    relayer: configured(env, 'INCH_RELAYER_BASE'),
    fusionPlusRelayer: configured(env, 'FUSION_PLUS_RELAYER_BASE'),
    orders: configured(env, 'INCH_ORDER_BASE'),
    fusionPlusOrders: configured(env, 'FUSION_PLUS_ORDER_BASE'),
  };
}
