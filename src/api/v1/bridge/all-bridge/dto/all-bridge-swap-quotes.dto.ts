import { IsNotEmpty, IsString } from "class-validator";

export class AllbridgeQuotesDto {
    @IsNotEmpty()
    @IsString()
    amount: string;

    @IsNotEmpty()
    @IsString()
    chainType: string;
}