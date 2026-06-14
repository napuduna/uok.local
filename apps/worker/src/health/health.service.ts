import { Injectable } from "@nestjs/common";
import type { HealthResponse } from "@warehouse/contracts";

@Injectable()
export class HealthService {
  getHealth(): HealthResponse {
    return {
      service: "worker",
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "0.1.0"
    };
  }
}
