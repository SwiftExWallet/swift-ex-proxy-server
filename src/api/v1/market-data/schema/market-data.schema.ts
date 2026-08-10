import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

class Roi {
  @Prop()
  times?: number;

  @Prop()
  currency?: string;

  @Prop()
  percentage?: number;
}

@Schema({ timestamps: true })
export class MarketData {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  symbol: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  image?: string;

  @Prop()
  currentPrice?: number;

  @Prop()
  marketCap?: number;

  @Prop()
  marketCapRank?: number;

  @Prop()
  fullyDilutedValuation?: number;

  @Prop()
  totalVolume?: number;

  @Prop()
  high24h?: number;

  @Prop()
  low24h?: number;

  @Prop()
  priceChange24h?: number;

  @Prop()
  priceChangePercentage24h?: number;

  @Prop()
  marketCapChange24h?: number;

  @Prop()
  marketCapChangePercentage_24h?: number;

  @Prop()
  circulatingSupply?: number;

  @Prop()
  totalSupply?: number;

  @Prop()
  maxSupply?: number;

  @Prop()
  ath?: number;

  @Prop()
  athChangePercentage?: number;

  @Prop()
  athDate?: Date;

  @Prop()
  atl?: number;

  @Prop()
  atlChangePercentage?: number;

  @Prop()
  atlDate?: Date;

  @Prop({ type: Roi })
  roi?: Roi;

  @Prop({ required: true })
  lastUpdated: Date;

  @Prop({ default: Date.now })
  savedAt: Date;
}

export const MarketDataSchema = SchemaFactory.createForClass(MarketData);
