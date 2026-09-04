import ExcelJS from 'exceljs';
import { NextResponse } from 'next/server';
import { EPIC_STATUSES } from '@/lib/types';

const COLUMNS = [
  { header: 'Title', key: 'title', width: 40 },
  { header: 'Description', key: 'description', width: 50 },
  { header: 'Product Area', key: 'productArea', width: 18 },
  { header: 'Status', key: 'status', width: 14 },
  { header: 'Owner', key: 'owner', width: 20 },
  { header: 'Team', key: 'team', width: 20 },
  { header: 'Target Quarter', key: 'targetQuarter', width: 14 },
  { header: 'Target Year', key: 'targetYear', width: 12 },
  { header: 'Risk Level', key: 'riskLevel', width: 12 },
  { header: 'Story Points', key: 'storyPoints', width: 12 },
  { header: 'Tags (comma separated)', key: 'tags', width: 24 },
  { header: 'Reach', key: 'reach', width: 10 },
  { header: 'Impact', key: 'impact', width: 10 },
  { header: 'Confidence (0-1)', key: 'confidence', width: 14 },
  { header: 'Effort', key: 'effort', width: 10 },
  { header: 'Business Value (1-10)', key: 'businessValue', width: 16 },
  { header: 'Time Criticality (1-10)', key: 'timeCriticality', width: 16 },
  { header: 'Risk Reduction (1-10)', key: 'riskReduction', width: 16 },
  { header: 'Job Size', key: 'jobSize', width: 10 },
  { header: 'Revenue Impact (1-5)', key: 'revenueImpact', width: 16 },
  { header: 'Customer Impact (1-5)', key: 'customerImpact', width: 16 },
  { header: 'Strategic Alignment (1-5)', key: 'strategicAlignment', width: 18 },
  { header: 'Competitive Pressure (1-5)', key: 'competitivePressure', width: 18 },
  { header: 'Risk Score (1-5)', key: 'riskScore', width: 14 },
  { header: 'Engineering Complexity (1-5)', key: 'engineeringComplexity', width: 20 },
];

export async function GET() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Epics');
  sheet.columns = COLUMNS;
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2942' } };

  sheet.addRow({
    title: 'Example: Multi-region database failover',
    description: 'Optional — a sentence or two on what this epic covers.',
    productArea: 'Platform',
    status: 'PLANNED',
    owner: 'Jane Smith',
    team: 'Platform Core',
    targetQuarter: 'Q3',
    targetYear: 2026,
    riskLevel: 'MEDIUM',
    storyPoints: 21,
    tags: 'reliability, infra',
    reach: 5000,
    impact: 2,
    confidence: 0.8,
    effort: 4,
    businessValue: 7,
    timeCriticality: 6,
    riskReduction: 5,
    jobSize: 8,
    revenueImpact: 3,
    customerImpact: 4,
    strategicAlignment: 4,
    competitivePressure: 2,
    riskScore: 3,
    engineeringComplexity: 3,
  });

  const notesSheet = workbook.addWorksheet('Instructions');
  notesSheet.columns = [{ width: 90 }];
  notesSheet.addRows([
    ['Only Title and Product Area are required — everything else is optional.'],
    [''],
    [`Status must be one of: ${EPIC_STATUSES.join(', ')} (defaults to IDEA if left blank or unrecognized).`],
    ['Risk Level must be one of: LOW, MEDIUM, HIGH, CRITICAL (defaults to MEDIUM).'],
    [''],
    ['Owner and Team are matched by name — if a name doesn\'t already exist in EpicFlow, a new record is created automatically.'],
    [''],
    ['The scoring fields (Reach/Impact/Confidence/Effort for RICE, Business Value/Time Criticality/Risk Reduction/Job Size for WSJF, and the six Custom Score fields) are all optional. Leave them blank and fill them in later from the Epic detail page — scores just won\'t compute until all fields for that model are present.'],
  ]);

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="epicflow-import-template.xlsx"',
    },
  });
}
