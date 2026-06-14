import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { parseApiEnvironment } from "@warehouse/config";

import { AppModule } from "./app.module";
import { ApiExceptionFilter } from "./common/api-exception.filter";
import { HttpLoggingInterceptor } from "./common/http-logging.interceptor";
import { JsonLogger } from "./common/json-logger";

async function bootstrap() {
  const environment = parseApiEnvironment(process.env);
  const logger = new JsonLogger();
  const application = await NestFactory.create(AppModule, { logger });

  application.setGlobalPrefix("api/v1");
  application.enableShutdownHooks();
  application.useGlobalFilters(new ApiExceptionFilter());
  application.useGlobalInterceptors(new HttpLoggingInterceptor());

  await application.listen(environment.API_PORT, "0.0.0.0");
}

void bootstrap();
