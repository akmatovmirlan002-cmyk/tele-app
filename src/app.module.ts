import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { I18nService } from './i18n.service';
import { BotService } from './bot.service';

@Module({
  providers: [StorageService, I18nService, BotService],
})
export class AppModule {}
