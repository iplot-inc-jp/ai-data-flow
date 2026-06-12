import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  API_URL,
  asisMemoApi,
  tobeVisionApi,
  tobeRoadmapApi,
} from './asis-tobe';

/** fetch をモックし、呼び出し引数と返り値を制御する。 */
function mockFetch(body: unknown, ok = true) {
  const fn = vi.fn(async () => ({
    ok,
    json: async () => body,
  })) as unknown as typeof fetch;
  global.fetch = fn;
  return fn as unknown as ReturnType<typeof vi.fn>;
}

/** 直近の fetch 呼び出しから [url, init] を取り出す。 */
function lastCall(fn: ReturnType<typeof vi.fn>): [string, RequestInit] {
  const [url, init] = fn.mock.calls[fn.mock.calls.length - 1] as [
    string,
    RequestInit,
  ];
  return [url, init ?? {}];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('asisMemoApi', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = mockFetch([]);
  });

  it('list GETs the project-scoped collection', async () => {
    fetchMock = mockFetch([{ id: 'a' }]);
    const out = await asisMemoApi.list('p1');
    const [url, init] = lastCall(fetchMock);
    expect(url).toBe(`${API_URL}/api/projects/p1/asis-memos`);
    expect(init.method ?? 'GET').toBe('GET');
    expect(out).toEqual([{ id: 'a' }]);
  });

  it('create POSTs the payload to the collection', async () => {
    fetchMock = mockFetch({ id: 'new' });
    const payload = { topic: '在庫', currentState: '手動', order: 0 };
    const out = await asisMemoApi.create('p1', payload);
    const [url, init] = lastCall(fetchMock);
    expect(url).toBe(`${API_URL}/api/projects/p1/asis-memos`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(payload);
    expect(out).toEqual({ id: 'new' });
  });

  it('update PATCHes the item by id', async () => {
    fetchMock = mockFetch({ id: 'x1' });
    await asisMemoApi.update('x1', { pain: '遅い' });
    const [url, init] = lastCall(fetchMock);
    expect(url).toBe(`${API_URL}/api/asis-memos/x1`);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ pain: '遅い' });
  });

  it('remove DELETEs the item by id', async () => {
    fetchMock = mockFetch(undefined);
    await asisMemoApi.remove('x1');
    const [url, init] = lastCall(fetchMock);
    expect(url).toBe(`${API_URL}/api/asis-memos/x1`);
    expect(init.method).toBe('DELETE');
  });

  it('throws on a non-ok response', async () => {
    mockFetch(null, false);
    await expect(asisMemoApi.list('p1')).rejects.toThrow();
  });
});

describe('tobeVisionApi', () => {
  it('list / create hit the tobe-visions collection', async () => {
    const fetchMock = mockFetch([]);
    await tobeVisionApi.list('p2');
    expect(lastCall(fetchMock)[0]).toBe(
      `${API_URL}/api/projects/p2/tobe-visions`,
    );

    const payload = { area: '受注', vision: '自動化', order: 1 };
    await tobeVisionApi.create('p2', payload);
    const [url, init] = lastCall(fetchMock);
    expect(url).toBe(`${API_URL}/api/projects/p2/tobe-visions`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(payload);
  });

  it('update / remove hit /api/tobe-visions/:id', async () => {
    const fetchMock = mockFetch({ id: 'v1' });
    await tobeVisionApi.update('v1', { countermeasure: 'RPA' });
    let [url, init] = lastCall(fetchMock);
    expect(url).toBe(`${API_URL}/api/tobe-visions/v1`);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ countermeasure: 'RPA' });

    await tobeVisionApi.remove('v1');
    [url, init] = lastCall(fetchMock);
    expect(url).toBe(`${API_URL}/api/tobe-visions/v1`);
    expect(init.method).toBe('DELETE');
  });
});

describe('tobeRoadmapApi', () => {
  it('list / create hit the tobe-roadmaps collection', async () => {
    const fetchMock = mockFetch([]);
    await tobeRoadmapApi.list('p3');
    expect(lastCall(fetchMock)[0]).toBe(
      `${API_URL}/api/projects/p3/tobe-roadmaps`,
    );

    const payload = {
      phase: '3ヶ月',
      measure: 'Quick Win',
      roi: '120',
      cost: '小',
      payback: '3ヶ月',
      scope: '内製',
      order: 0,
    };
    await tobeRoadmapApi.create('p3', payload);
    const [url, init] = lastCall(fetchMock);
    expect(url).toBe(`${API_URL}/api/projects/p3/tobe-roadmaps`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(payload);
  });

  it('update / remove hit /api/tobe-roadmaps/:id', async () => {
    const fetchMock = mockFetch({ id: 'r1' });
    await tobeRoadmapApi.update('r1', { roi: '200' });
    let [url, init] = lastCall(fetchMock);
    expect(url).toBe(`${API_URL}/api/tobe-roadmaps/r1`);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ roi: '200' });

    await tobeRoadmapApi.remove('r1');
    [url, init] = lastCall(fetchMock);
    expect(url).toBe(`${API_URL}/api/tobe-roadmaps/r1`);
    expect(init.method).toBe('DELETE');
  });
});
