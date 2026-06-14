import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const DEMO_MARKER = '[demo-seed]';
async function main() {
  const proj = await prisma.project.findFirst({
    where: { description: { contains: DEMO_MARKER } },
    orderBy: { createdAt: 'desc' },
  });
  if (!proj) { console.log(JSON.stringify({ projectId: null })); return; }
  const pid = proj.id;
  const counts: Record<string, number> = {};
  counts['project(marker)'] = await prisma.project.count({ where: { description: { contains: DEMO_MARKER } } });
  counts['subProject'] = await prisma.subProject.count({ where: { projectId: pid } });
  counts['dataObject'] = await prisma.dataObject.count({ where: { projectId: pid } });
  counts['dataObjectRelation'] = await prisma.dataObjectRelation.count({ where: { projectId: pid } });
  counts['dataObjectAnnotation'] = await prisma.dataObjectAnnotation.count({ where: { projectId: pid } });
  counts['dfdDiagram'] = await prisma.dfdDiagram.count({ where: { projectId: pid } });
  counts['dfdNode'] = await prisma.dfdNode.count({ where: { diagram: { projectId: pid } } });
  counts['dfdFlow'] = await prisma.dfdFlow.count({ where: { diagram: { projectId: pid } } });
  counts['dfdAnnotation'] = await prisma.dfdAnnotation.count({ where: { diagram: { projectId: pid } } });
  counts['kpi'] = await prisma.kpi.count({ where: { projectId: pid } });
  counts['adoptionStatus'] = await prisma.adoptionStatus.count({ where: { projectId: pid } });
  counts['risk'] = await prisma.risk.count({ where: { projectId: pid } });
  counts['gapItem'] = await prisma.gapItem.count({ where: { ledger: { projectId: pid } } });
  counts['flowDefinition'] = await prisma.flowDefinition.count({ where: { projectId: pid } });
  counts['flowNode'] = await prisma.flowNode.count({ where: { definition: { projectId: pid } } });
  counts['issueNode'] = await prisma.issueNode.count({ where: { tree: { projectId: pid } } });
  counts['task'] = await prisma.task.count({ where: { projectId: pid } });
  counts['stakeholder'] = await prisma.stakeholder.count({ where: { projectId: pid } });
  counts['system'] = await prisma.system.count({ where: { projectId: pid } });
  counts['meeting'] = await prisma.meeting.count({ where: { projectId: pid } });
  counts['cruoaCol'] = await prisma.cruoaCol.count();
  console.log(JSON.stringify({ projectId: pid, name: proj.name, counts }, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
