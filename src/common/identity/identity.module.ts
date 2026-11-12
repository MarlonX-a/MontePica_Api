import { Module } from '@nestjs/common';
import { AuthorizationService } from './authorization.service.js';
import { IdentityService } from './identity.service.js';
import { PermissionLookupService } from './permission-lookup.service.js';

@Module({
  imports: [],
  controllers: [],
  providers: [AuthorizationService, IdentityService, PermissionLookupService],
  exports: [AuthorizationService, IdentityService, PermissionLookupService],
})
export class IdentityModule {}
