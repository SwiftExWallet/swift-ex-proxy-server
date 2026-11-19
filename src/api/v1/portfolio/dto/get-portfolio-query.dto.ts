import { IsIn, IsOptional } from 'class-validator';

export class GetPortfolioQueryDto {
  @IsOptional()
  @IsIn(['true', 'false'])
  hardRefresh?: string;
}
