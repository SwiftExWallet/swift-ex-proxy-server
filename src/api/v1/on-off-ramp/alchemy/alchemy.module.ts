import { Module } from '@nestjs/common';
import { AlchemyService } from './alchemy.service';
import { UrlSigner } from './util/urlSigner';
import { HttpService } from './http.service';
import { AlchemyController } from './alchemy.controller';
import { UserQueueService } from '../../common/user-queue/user-queue.service';

@Module({
  providers: [AlchemyService, UrlSigner, HttpService, UserQueueService],
  exports: [HttpService],
  controllers: [AlchemyController],
})
export class AlchemyModule {}
