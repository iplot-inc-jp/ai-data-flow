import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

// Domain
import {
  USER_REPOSITORY,
  ORGANIZATION_REPOSITORY,
  PROJECT_REPOSITORY,
  ROLE_REPOSITORY,
  TABLE_REPOSITORY,
  COLUMN_REPOSITORY,
  BUSINESS_FLOW_REPOSITORY,
  FLOW_NODE_REPOSITORY,
  CRUD_MAPPING_REPOSITORY,
  PASSWORD_HASH_SERVICE,
  TOKEN_SERVICE,
} from './domain';

// Application
import {
  RegisterUserUseCase,
  LoginUserUseCase,
  GetCurrentUserUseCase,
  CreateOrganizationUseCase,
  GetOrganizationsUseCase,
  CreateProjectUseCase,
  GetProjectsUseCase,
  CreateRoleUseCase,
  GetRolesUseCase,
} from './application';

// Infrastructure
import {
  PrismaModule,
  UserRepositoryImpl,
  OrganizationRepositoryImpl,
  ProjectRepositoryImpl,
  RoleRepositoryImpl,
  PrismaTableRepository,
  PrismaColumnRepository,
  PrismaBusinessFlowRepository,
  PrismaFlowNodeRepository,
  PrismaCrudMappingRepository,
  BcryptPasswordHashService,
  JwtTokenService,
} from './infrastructure';

// Presentation
import {
  AuthController,
  OrganizationController,
  ProjectController,
  ProjectByIdController,
  RoleController,
  TableController,
  BusinessFlowController,
  JwtAuthGuard,
  DomainExceptionFilter,
} from './presentation';
import { HealthController } from './presentation/controllers/health.controller';
import { RequirementController } from './presentation/controllers/requirement.controller';
import { UserSettingsController } from './presentation/controllers/user-settings.controller';
import { ClaudeService } from './infrastructure/services/claude.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'your-secret-key'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN', '7d'),
        },
      }),
      inject: [ConfigService],
    }),
    PrismaModule,
  ],
  controllers: [
    HealthController,
    AuthController,
    OrganizationController,
    ProjectController,
    ProjectByIdController,
    RoleController,
    TableController,
    BusinessFlowController,
    RequirementController,
    UserSettingsController,
  ],
  providers: [
    // ========== Domain Service Implementations ==========
    {
      provide: PASSWORD_HASH_SERVICE,
      useClass: BcryptPasswordHashService,
    },
    {
      provide: TOKEN_SERVICE,
      useClass: JwtTokenService,
    },

    // ========== Repository Implementations ==========
    {
      provide: USER_REPOSITORY,
      useClass: UserRepositoryImpl,
    },
    {
      provide: ORGANIZATION_REPOSITORY,
      useClass: OrganizationRepositoryImpl,
    },
    {
      provide: PROJECT_REPOSITORY,
      useClass: ProjectRepositoryImpl,
    },
    {
      provide: ROLE_REPOSITORY,
      useClass: RoleRepositoryImpl,
    },
    {
      provide: TABLE_REPOSITORY,
      useClass: PrismaTableRepository,
    },
    {
      provide: COLUMN_REPOSITORY,
      useClass: PrismaColumnRepository,
    },
    {
      provide: BUSINESS_FLOW_REPOSITORY,
      useClass: PrismaBusinessFlowRepository,
    },
    {
      provide: FLOW_NODE_REPOSITORY,
      useClass: PrismaFlowNodeRepository,
    },
    {
      provide: CRUD_MAPPING_REPOSITORY,
      useClass: PrismaCrudMappingRepository,
    },

    // ========== Use Cases ==========
    RegisterUserUseCase,
    LoginUserUseCase,
    GetCurrentUserUseCase,
    CreateOrganizationUseCase,
    GetOrganizationsUseCase,
    CreateProjectUseCase,
    GetProjectsUseCase,
    CreateRoleUseCase,
    GetRolesUseCase,

    // ========== Services ==========
    ClaudeService,

    // ========== Global Guards ==========
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },

    // ========== Global Filters ==========
    {
      provide: APP_FILTER,
      useClass: DomainExceptionFilter,
    },
  ],
})
export class AppModule {}
