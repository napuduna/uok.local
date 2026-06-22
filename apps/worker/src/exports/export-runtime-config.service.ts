import { Injectable } from "@nestjs/common";

import { parseWorkerEnvironment } from "@warehouse/config";

@Injectable()
export class ExportRuntimeConfigService {
  readonly artifactDirectory: string;
  readonly thaiFontPath: string;
  readonly redisUrl: string;

  constructor() {
    const environment = parseWorkerEnvironment(process.env);
    this.artifactDirectory = environment.EXPORT_ARTIFACT_DIR;
    this.thaiFontPath = environment.EXPORT_THAI_FONT_PATH;
    this.redisUrl = environment.REDIS_URL;
  }
}
