import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { UserAdministrationService } from "./user-administration.service";
import { UsersController } from "./users.controller";

@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [UserAdministrationService]
})
export class UsersModule {}
