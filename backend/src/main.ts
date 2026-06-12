import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app-setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS / ValidationPipe / global prefix 'api' / Swagger
  configureApp(app);

  const port = process.env.PORT || 5021;
  await app.listen(port);
  console.log(`🚀 DataFlow Backend is running on: http://localhost:${port}`);
  console.log(`📚 API Documentation: http://localhost:${port}/api/docs`);
}
bootstrap();
