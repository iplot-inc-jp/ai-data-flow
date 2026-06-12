import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import {
  DomainError,
  EntityNotFoundError,
  EntityAlreadyExistsError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
} from '../../domain';

/**
 * ドメインエラー → HTTPステータス/コードの対応表。
 *
 * DomainExceptionFilter（レスポンス変換）と ChangeLogInterceptor
 * （変更履歴に記録する statusCode の推定）で共有する。
 */
export function domainErrorToStatusAndCode(exception: DomainError): {
  status: number;
  code: string;
} {
  if (exception instanceof EntityNotFoundError) {
    return { status: HttpStatus.NOT_FOUND, code: 'NOT_FOUND' };
  }
  if (exception instanceof EntityAlreadyExistsError) {
    return { status: HttpStatus.CONFLICT, code: 'ALREADY_EXISTS' };
  }
  if (exception instanceof ValidationError) {
    return { status: HttpStatus.BAD_REQUEST, code: 'VALIDATION_ERROR' };
  }
  if (exception instanceof UnauthorizedError) {
    return { status: HttpStatus.UNAUTHORIZED, code: 'UNAUTHORIZED' };
  }
  if (exception instanceof ForbiddenError) {
    return { status: HttpStatus.FORBIDDEN, code: 'FORBIDDEN' };
  }
  return { status: HttpStatus.BAD_REQUEST, code: 'DOMAIN_ERROR' };
}

/**
 * ドメインエラーをHTTPレスポンスに変換するフィルター
 */
@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: DomainError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const { status, code } = domainErrorToStatusAndCode(exception);

    this.logger.warn(`Domain error: ${exception.message}`, exception.name);

    response.status(status).json({
      statusCode: status,
      code,
      message: exception.message,
      timestamp: new Date().toISOString(),
    });
  }
}

