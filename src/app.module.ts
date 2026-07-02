import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { I18nService } from './i18n.service';
import { CashdeskService } from './cashdesk.service';
import { BotService } from './bot.service';

@Module({
  providers: [StorageService, I18nService, CashdeskService, BotService],
})
export class AppModule {}
