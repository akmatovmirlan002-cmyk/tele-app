import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  // HTTP сервер керек эмес — application context жетиштүү (бот polling менен иштейт)
  await NestFactory.createApplicationContext(AppModule);
}
bootstrap();
