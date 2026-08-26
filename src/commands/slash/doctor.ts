// /doctor — 环境预检命令（USER-PROBLEM-ANALYSIS A4/A5）
import { COLORS } from '../../cli/ui/colors';
import { runEnvCheck } from '../../utils/envCheck';
import type { SlashHandler } from './types';

export const doctorHandler: SlashHandler = async (_args, ctx) => {
  ctx.screen.appendScroll(COLORS.primary.bold('\nEnvironment Check\n'));
  ctx.screen.appendScroll(COLORS.muted('─'.repeat(60) + '\n'));

  const results = await runEnvCheck();
  let missing = 0;

  for (const r of results) {
    if (r.found) {
      const name = r.name.padEnd(10);
      ctx.screen.appendScroll(
        `${COLORS.success('  ✓')} ${COLORS.secondary(name)} ${COLORS.muted(r.version || '')}\n`
      );
    } else {
      missing++;
      const name = r.name.padEnd(10);
      ctx.screen.appendScroll(
        `${COLORS.error('  ✗')} ${COLORS.secondary(name)} ${COLORS.muted(r.hint || '')}\n`
      );
    }
  }

  ctx.screen.appendScroll('\n');
  if (missing > 0) {
    ctx.screen.appendScroll(
      COLORS.warning(`  ${missing} 项缺失——agent 在这些工具上会反复试错，建议先安装。\n\n`)
    );
  } else {
    ctx.screen.appendScroll(COLORS.success('  环境健康，全部工具可用。\n\n'));
  }
};
