import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { parseWorkerEnvironment } from "@warehouse/config";

import { AppModule } from "./app.module";
import { HttpLoggingInterceptor } from "./common/http-logging.interceptor";
import { JsonLogger } from "./common/json-logger";

async function bootstrap() {
  const environment = parseWorkerEnvironment(process.env);
  const application = await NestFactory.create(AppModule, {
    logger: new JsonLogger()
  });

  application.setGlobalPrefix("internal");
  application.enableShutdownHooks();
  application.useGlobalInterceptors(new HttpLoggingInterceptor());

  await application.listen(environment.WORKER_PORT, "0.0.0.0");
}

void bootstrap();
