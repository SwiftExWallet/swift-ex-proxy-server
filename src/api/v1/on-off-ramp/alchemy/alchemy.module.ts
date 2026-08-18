import { Module } from '@nestjs/common';
import { AlchemyService } from './alchemy.service';
import { UrlSigner } from './util/urlSigner';
import { HttpService } from './http.service';

@Module({
  providers: [AlchemyService, UrlSigner, HttpService],
  exports: [AlchemyService, HttpService],
})
export class AlchemyModule {}
