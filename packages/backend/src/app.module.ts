import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [
    // 1. 加载 .env 文件，isGlobal 表示所有模块都能用，不用每个模块单独导入
    ConfigModule.forRoot({ isGlobal: true }),

    // 数据库连接配置 forRootAsync 是因为需要先注入 ConfigService 来读配置
    TypeOrmModule.forRootAsync({
      // inject ConfigService 来读取 .env 中的变量
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST'),
        port: configService.get('DB_PORT'),
        username: configService.get('DB_USERNAME'),
        password: configService.get('DB_PASSWORD'),
        database: configService.get('DB_DATABASE'),
        autoLoadEntities: true, // 自动加载所有 Entity，不用手动列
        asynchronize: true, // 开发阶段自动同步表结构，生产环境要关掉
      }),
    }),
    AuthModule,
  ],
})
export class AppModule {}
