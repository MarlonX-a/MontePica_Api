import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ApiExceptionFilter } from './common/filters/api-exception.filter.js';
import { type Express } from 'express';

export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  const trustedProxies = config.get<string[]>('TRUST_PROXY', []);
  if (trustedProxies.length) {
    const express: Express = app.getHttpAdapter().getInstance();
    express.set('trust proxy', trustedProxies);
  }
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: config.get<string[]>('CORS_ORIGINS', []),
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  if (
    !config.get<boolean>(
      'SWAGGER_ENABLED',
      config.get('NODE_ENV') !== 'production',
    )
  )
    return;

  const swaggerConfig = new DocumentBuilder()
    .setTitle('MontePica API')
    .setDescription('API del sistema de gestión operativa de MontePica.')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        description:
          'JWT de cliente registrado o token opaco guest_ de invitado.',
      },
      'client-token',
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);
}
