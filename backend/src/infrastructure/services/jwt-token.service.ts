import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TokenService, TokenPayload } from '../../domain';

/**
 * JWTによるトークンサービス実装
 */
@Injectable()
export class JwtTokenService implements TokenService {
  constructor(private readonly jwtService: JwtService) {}

  generateAccessToken(payload: TokenPayload): string {
    return this.jwtService.sign(payload);
  }

  verifyToken(token: string): TokenPayload | null {
    try {
      return this.jwtService.verify<TokenPayload>(token);
    } catch {
      return null;
    }
  }
}

