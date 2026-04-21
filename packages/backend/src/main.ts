import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true, credentials: true }); // 启用 CORS 允许前端跨域请求
  app.setGlobalPrefix('api'); // 全局路由前缀，所有接口以 /api 开头
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // 自动剔除 DTO 中未定义的字段
      transform: true, // 自动类型转换
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
