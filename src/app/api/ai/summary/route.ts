import { NextRequest, NextResponse } from 'next/server';
import { readPortfolio } from '@/lib/store';
import { findOwnerName, findTeamName } from '@/lib/lookups';
import { scoreRICE, scoreWSJF, scoreCustom } from '@/lib/prioritization';

// AI Features (PRD section 15): Epic Summary.
// Requires ANTHROPIC_API_KEY in the environment. Without a key, this
// falls back to a deterministic, template-based summary so the rest of
// the app remains fully demoable offline.

export async function POST(req: NextRequest) {
  const { epicId } = await req.json();
  const { epics, users, teams } = await readPortfolio();
  const epic = epics.find((e) => e.id === epicId);
  if (!epic) return NextResponse.json({ error: 'Epic not found' }, { status: 404 });

  const context = {
    title: epic.title,
    description: epic.description,
    status: epic.status,
    owner: findOwnerName(users, epic.ownerId),
    team: findTeamName(teams, epic.teamId),
    risk: epic.riskLevel,
    rice: scoreRICE(epic),
    wsjf: scoreWSJF(epic),
    custom: scoreCustom(epic),
    targetQuarter: epic.targetQuarter ? `${epic.targetQuarter} ${epic.targetYear ?? ''}` : 'unscheduled',
  };

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      summary: buildFallbackSummary(context),
      source: 'template',
    });
  }

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      // Check https://docs.claude.com for the current recommended model string
      // before deploying — this changes over time.
      model: 'claude-sonnet-5',
      max_tokens: 220,
      messages: [
        {
          role: 'user',
          content:
            `Write a two-sentence executive summary of this product epic for a portfolio review, ` +
            `in plain, confident language a VP would skim in two seconds. Epic data: ${JSON.stringify(context)}`,
        },
      ],
    });

    const text = message.content.find((b) => b.type === 'text');
    return NextResponse.json({
      summary: text && text.type === 'text' ? text.text : buildFallbackSummary(context),
      source: 'claude',
    });
  } catch {
    return NextResponse.json({ summary: buildFallbackSummary(context), source: 'template-fallback' });
  }
}

function buildFallbackSummary(ctx: {
  title: string; status: string; owner: string; team: string; risk: string;
  rice: number | null; wsjf: number | null; custom: number | null; targetQuarter: string;
}) {
  const scoreNote = ctx.custom != null ? `a Product Value Score of ${ctx.custom.toFixed(1)}` : 'an incomplete prioritization score';
  return (
    `${ctx.title} is currently ${ctx.status.toLowerCase().replace('_', ' ')}, owned by ${ctx.owner} on ${ctx.team}, ` +
    `targeting ${ctx.targetQuarter}. It carries ${ctx.risk.toLowerCase()} risk and ${scoreNote}, ` +
    `putting it in the range portfolio leaders should track closely ahead of the next planning review.`
  );
}
