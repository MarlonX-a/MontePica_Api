import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthAccessGuard } from './auth-access.guard.js';
import { AuthService } from './auth.service.js';
import { type AuthenticatedRequestContext } from './auth.types.js';
import { CurrentUserContext } from './current-user.decorator.js';
import { AuthTokensDto } from './dto/auth-tokens.dto.js';
import { AuthUserDto } from './dto/auth-user.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import {
  PasswordRecoveryService,
  RECOVERY_LIMITS,
} from './password-recovery.service.js';

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly recovery: PasswordRecoveryService,
  ) {}

  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Solicita un código de recuperación por correo.',
    description: `Máximo ${RECOVERY_LIMITS.ip} solicitudes por IP y ${RECOVERY_LIMITS.email} por correo cada hora. La respuesta es uniforme al superar el límite.`,
  })
  @ApiResponse({ status: 202, description: 'Solicitud recibida.' })
  @ApiResponse({ status: 400, description: 'Correo con formato inválido.' })
  @ApiResponse({
    status: 503,
    description: 'Recuperación por correo deshabilitada.',
  })
  forgotPassword(@Ip() ip: string, @Body() dto: ForgotPasswordDto) {
    return this.recovery.request(dto.email, ip);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Cambia la contraseña con un código de un solo uso y revoca las sesiones.',
  })
  @ApiResponse({ status: 204, description: 'Contraseña actualizada.' })
  @ApiResponse({ status: 400, description: 'Datos o código inválidos.' })
  @ApiResponse({
    status: 429,
    description: `Máximo ${RECOVERY_LIMITS.reset} intentos por IP cada hora.`,
  })
  @ApiResponse({
    status: 503,
    description: 'Recuperación por correo deshabilitada.',
  })
  resetPassword(@Ip() ip: string, @Body() dto: ResetPasswordDto) {
    return this.recovery.reset(dto.token, dto.newPassword, ip);
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Registra un cliente e inicia su sesión.' })
  @ApiCreatedResponse({ type: AuthTokensDto })
  @ApiResponse({ status: 400, description: 'Datos inválidos.' })
  @ApiResponse({
    status: 409,
    description: 'Ya existe una cuenta con ese correo.',
  })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Inicia sesión con correo y contraseña.' })
  @ApiOkResponse({ type: AuthTokensDto })
  @ApiUnauthorizedResponse({ description: 'Correo o contraseña incorrectos.' })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Rota el refresh token y emite nuevos tokens.' })
  @ApiOkResponse({ type: AuthTokensDto })
  @ApiUnauthorizedResponse({ description: 'Refresh token inválido o vencido.' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoca la sesión asociada al refresh token.' })
  @ApiResponse({
    status: 204,
    description: 'Sesión revocada o token desconocido.',
  })
  async logout(@Body() dto: RefreshTokenDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(AuthAccessGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Devuelve la identidad asociada al token de acceso.',
  })
  @ApiOkResponse({ type: AuthUserDto })
  @ApiUnauthorizedResponse({
    description: 'JWT o sesión inválida, vencida o revocada.',
  })
  getMe(@CurrentUserContext() current: AuthenticatedRequestContext) {
    return this.auth.getMe(current.userId);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthAccessGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Cambia la contraseña y revoca todas las sesiones.',
  })
  @ApiResponse({
    status: 204,
    description: 'Contraseña cambiada; inicia sesión de nuevo.',
  })
  changePassword(
    @CurrentUserContext() current: AuthenticatedRequestContext,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.auth.changePassword(
      current.userId,
      dto.currentPassword,
      dto.newPassword,
    );
  }
}
