// /search <query> — 跨存档会话全文搜索（USER-PROBLEM-ANALYSIS E4）
import { COLORS } from '../../cli/ui/colors';
import { searchSessions } from '../../utils/sessionSearch';
import type { SlashHandler } from './types';

export const searchHandler: SlashHandler = async (args, ctx) => {
  const query = args.trim();
  if (!query) {
    ctx.screen.appendScroll(COLORS.warning('\nUsage: /search <query>\n'));
    ctx.screen.appendScroll(COLORS.muted('  跨历史会话搜索，例如: /search OSS 双前缀\n\n'));
    return;
  }

  const hits = searchSessions(ctx.agent.getWorkspacePath(), query);
  ctx.screen.appendScroll(COLORS.primary.bold(`\nSearch: "${query}" (${hits.length} sessions)\n`));
  ctx.screen.appendScroll(COLORS.muted('─'.repeat(60) + '\n'));

  if (hits.length === 0) {
    ctx.screen.appendScroll(COLORS.muted('  无匹配。试试更短的关键词。\n\n'));
    return;
  }

  for (const hit of hits) {
    ctx.screen.appendScroll(`${COLORS.primary(`  [${hit.sessionId.slice(0, 8)}]`)} ${COLORS.secondary(hit.summary || '(no summary)')}\n`);
    for (const m of hit.matches) {
      const role = m.role === 'user' ? 'YOU' : m.role === 'summary' ? 'SUM' : 'AI ';
      ctx.screen.appendScroll(COLORS.muted(`    ${role} | ${m.snippet}\n`));
    }
    ctx.screen.appendScroll('\n');
  }
};
