import { ForbiddenException } from '@nestjs/common';
import { ProjectAccessGuard } from './project-access.guard';
import { ProjectAccessService } from '../../infrastructure/services/project-access.service';

/**
 * 機能(section) import の認可: VIEW 権限ユーザーは POST(=edit) で 403、
 * GET(=view) は許可されることを、実 Guard + 実 satisfies で検証する。
 * FeatureIoController は @UseGuards(ProjectAccessGuard) かつ params.projectId を持つため、
 * このガードの method 別ゲートがそのまま import/export に適用される。
 */
describe('ProjectAccessGuard (feature-section import authz)', () => {
  // satisfies は実装をそのまま使い、resolveProjectAccess だけ VIEW を返す。
  const realService = new ProjectAccessService({} as never);
  const makeService = (level: 'EDIT' | 'VIEW' | null) =>
    ({
      resolveProjectAccess: jest.fn().mockResolvedValue(level),
      satisfies: realService.satisfies.bind(realService),
    }) as unknown as ProjectAccessService;

  const ctxFor = (method: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          user: { id: 'viewer-user' },
          params: { projectId: 'proj-1' },
        }),
      }),
      getClass: () => ({ name: 'FeatureIoController' }),
    }) as never;

  it('VIEW ユーザーの section import (POST) は 403 (ForbiddenException)', async () => {
    const guard = new ProjectAccessGuard(makeService('VIEW'));
    await expect(guard.canActivate(ctxFor('POST'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('VIEW ユーザーの section export (GET) は許可', async () => {
    const guard = new ProjectAccessGuard(makeService('VIEW'));
    await expect(guard.canActivate(ctxFor('GET'))).resolves.toBe(true);
  });

  it('EDIT ユーザーの section import (POST) は許可', async () => {
    const guard = new ProjectAccessGuard(makeService('EDIT'));
    await expect(guard.canActivate(ctxFor('POST'))).resolves.toBe(true);
  });

  it('権限なし(null)は section export (GET) でも 403', async () => {
    const guard = new ProjectAccessGuard(makeService(null));
    await expect(guard.canActivate(ctxFor('GET'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
