import { KnowledgeDocumentExtractService } from './knowledge-document-extract.service';

function makePrisma(aiEnabled: boolean) {
  return {
    knowledgeDocument: {
      findUnique: jest.fn(async () => ({
        id: 'doc1',
        projectId: 'p1',
        sourceType: 'ATTACHMENT',
        sourceRef: 'a1',
        mimeType: 'application/pdf',
      })),
    },
    projectKnowledgeSettings: {
      findUnique: jest.fn(async () => ({ aiExtractionEnabled: aiEnabled })),
    },
  } as any;
}
const claude = () => ({ extractKnowledge: jest.fn() }) as any;
const companyKey = () => ({ resolveForProject: jest.fn(async () => 'sk-test') }) as any;

describe('KnowledgeDocumentExtractService', () => {
  it('does nothing and returns zeros when aiExtractionEnabled is false', async () => {
    const prisma = makePrisma(false);
    const cl = claude();
    const svc = new KnowledgeDocumentExtractService(
      prisma,
      cl,
      companyKey(),
      undefined as any,
      undefined as any,
    );
    const out = await svc.extract('doc1', 'u1');
    expect(cl.extractKnowledge).not.toHaveBeenCalled();
    expect(out).toEqual({
      created: { nodes: 0, mentions: 0 },
      skipped: 'AI_DISABLED',
    });
  });
});
