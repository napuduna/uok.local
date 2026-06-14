import { Controller, Get } from "@nestjs/common";
import type { HealthResponse } from "@warehouse/contracts";

@Controller("health")
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return {
      service: "api",
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "0.1.0"
    };
  }
}
