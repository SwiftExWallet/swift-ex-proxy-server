import { IsString, IsEmail, IsEnum } from 'class-validator';

export enum AlchemyOffRampStatus {
    CREATED = '1',
    DEPOSIT_COMPLETED = '2',
    PAYMENT_STARTED = '3',
    PAYMENT_SUCCESS = '4',
    PAYMENT_FAILED = '5',
    REFUND_SUCCESS = '6',
    TIMEOUT = '7',
}

export class AlchemyOffRampWebhookDto {
    @IsString()
    appId: string;

    @IsString()
    orderNo: string;

    @IsString()
    merchantOrderNo: string;

    @IsEmail()
    email: string;

    @IsEnum(AlchemyOffRampStatus)
    status: AlchemyOffRampStatus;
}
