import type { LoggerService } from "@nestjs/common";

type LogLevel = "debug" | "error" | "info" | "warn";

export class JsonLogger implements LoggerService {
  log(message: unknown, context?: string): void {
    this.write("info", message, context);
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.write("error", message, context, trace);
  }

  warn(message: unknown, context?: string): void {
    this.write("warn", message, context);
  }

  debug(message: unknown, context?: string): void {
    this.write("debug", message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write("debug", message, context);
  }

  private write(
    level: LogLevel,
    message: unknown,
    context?: string,
    trace?: string
  ): void {
    const destination = level === "error" ? process.stderr : process.stdout;
    destination.write(
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        context: context ?? "application",
        message:
          typeof message === "string" ? message : JSON.stringify(message),
        ...(trace ? { trace } : {})
      })}\n`
    );
  }
}
