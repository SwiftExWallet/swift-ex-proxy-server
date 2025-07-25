import { IsString, IsEmail, IsOptional } from 'class-validator';

export class AlchemyOnRampWebhookDto {
    @IsString()
    appId: string;
    
    @IsString()
    orderNo: string;

    @IsString()
    merchantOrderNo: string;

    @IsString()
    @IsOptional()
    merchantUid: string;

    @IsEmail()
    email: string;

    @IsString()
    crypto: string;

    @IsString()
    cryptoPrice: string;

    @IsString()
    cryptoQuantity: string;

    @IsString()
    fiat: string;

    @IsString()
    amount: string;

    @IsString()
    payType: string;

    @IsString()
    network: string;

    @IsString()
    address: string;

    @IsString()
    @IsOptional()
    payTime: string;

    @IsString()
    @IsOptional()
    txTime: string;

    @IsString()
    @IsOptional()
    txHash: string;

    @IsString()
    status: string;

    @IsString()
    @IsOptional()
    message: string;

    @IsString()
    rampFee: string;

    @IsString()
    @IsOptional()
    timestamp: string;
}
