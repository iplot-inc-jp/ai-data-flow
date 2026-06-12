import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS
  const allowedOrigins: string[] = [
    'http://localhost:3000',
    'http://localhost:3003',
    'http://localhost:3007',
    'https://dataflow-frontend-05c3.onrender.com',
  ];
  if (process.env.FRONTEND_URL) {
    allowedOrigins.push(process.env.FRONTEND_URL);
  }
  
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // API prefix
  app.setGlobalPrefix('api');

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('ai-data-flow API')
    .setDescription(
      [
        'IPLoT方法論パイプラインAPI: 現状把握/ASIS → 課題(イシューツリー) → TOBE → GAP → 要件/CRUD → 動作確認。',
        '',
        '**認証は2方式**:',
        '1. JWT — `Authorization: Bearer <token>`（Webアプリ）',
        '2. APIキー — `x-api-key: sk_...`（公開API・MCP）。`POST /api-keys` で発行。',
        '',
        '右上の「Authorize」からどちらかを設定してください。',
      ].join('\n'),
    )
    .setVersion('0.2.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'api-key')
    .build();
  const document = SwaggerModule.createDocument(app, config);

  // 認証必須エンドポイントは JWT / APIキー の両方を許可として明示（@Public は対象外）
  for (const pathItem of Object.values(document.paths) as Array<Record<string, any>>) {
    for (const op of Object.values(pathItem)) {
      if (op && typeof op === 'object' && Array.isArray(op.security) && op.security.length) {
        op.security = [{ bearer: [] }, { 'api-key': [] }];
      }
    }
  }

  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = process.env.PORT || 5021;
  await app.listen(port);
  console.log(`🚀 DataFlow Backend is running on: http://localhost:${port}`);
  console.log(`📚 API Documentation: http://localhost:${port}/api/docs`);
}
bootstrap();

