// commandsHandler.js
import { EmbedBuilder } from 'discord.js';
import { updateBalance, getUser } from './db.js';

const COLOR = {
  gold:  0xF1C40F,
  green: 0x57F287,
  red:   0xED4245,
  blue:  0x5865F2,
  gray:  0x2B2D31,
};

export const RACE_PAYOUT_MULTIPLIER = 5;
export const horses = [
  { name: '실버 쉽',      emoji: '🐎' },
  { name: '언내추럴 위크', emoji: '🐎' },
  { name: '루즈 티켓',    emoji: '🐎' },
  { name: '나리타 카나',  emoji: '🐎' },
  { name: '싱글코어 터보', emoji: '🐎' },
  { name: '로쿠도 캡',    emoji: '🐎' },
  { name: '럭키 카구야',  emoji: '🐎' },
];

// ===== 경마 =====
export async function runRace(channel, bettors) {
  const trackLength = 20;
  let positions = new Array(horses.length).fill(0);

  const msg = await channel.send({
    embeds: [new EmbedBuilder()
      .setColor(COLOR.blue)
      .setTitle('🏇 경주 시작!')
      .setDescription('잠시 후 경주가 시작됩니다...')],
  });

  return new Promise((resolve) => {
    let finished = false;

    const interval = setInterval(async () => {
      for (let i = 0; i < horses.length; i++) {
        const step = Math.random() < 0.8 ? (Math.random() < 0.4 ? 2 : 1) : 0;
        positions[i] = Math.min(positions[i] + step, trackLength);
      }

      const track = positions.map((p, i) => {
        const left  = '·'.repeat(trackLength - p);
        const right = '·'.repeat(p);
        const num   = String(i + 1).padStart(2, ' ');
        return `🏁${left}${horses[i].emoji}${right} ${num}.${horses[i].name}`;
      }).join('\n');

      try {
        await msg.edit({
          embeds: [new EmbedBuilder()
            .setColor(COLOR.blue)
            .setTitle('🏇 경주 진행 중...')
            .setDescription(`\`\`\`\n${track}\n\`\`\``)],
        });
      } catch {}

      const winnerIdx = positions.findIndex(p => p >= trackLength);
      if (winnerIdx !== -1) {
        finished = true;
        clearInterval(interval);
        await announceResult(channel, bettors, winnerIdx, false);
        resolve(winnerIdx);
      }
    }, 1500);

    setTimeout(() => {
      if (!finished) {
        clearInterval(interval);
        const maxPos = Math.max(...positions);
        const winnerIdx = positions.indexOf(maxPos);
        announceResult(channel, bettors, winnerIdx, true).catch(() => {});
        resolve(winnerIdx);
      }
    }, 30000);
  });
}

// ===== 경마 결과 발표 =====
async function announceResult(channel, bettors, winnerIdx, isTimeout) {
  const winnerName = `${horses[winnerIdx].emoji} **${horses[winnerIdx].name}** (${winnerIdx + 1}번)`;
  const titleSuffix = isTimeout ? ' — ⏱ 시간초과' : '';

  for (const [uid, b] of bettors.entries()) {
    const isWinner = b.horseIndex === winnerIdx;

    if (isWinner) {
      const prize = b.bet * RACE_PAYOUT_MULTIPLIER;
      await updateBalance(uid, prize, `경마 승리${isTimeout ? '(시간초과)' : ''}`);
      const balance = (await getUser(uid)).balance;
      const net = prize - b.bet; // 베팅액 이미 차감됐으므로 순수익 = 상금 - 베팅액

      await channel.send({
        content: `<@${uid}>`,
        embeds: [new EmbedBuilder()
          .setColor(COLOR.green)
          .setTitle(`🏆 경주 종료${titleSuffix} — 축하합니다!`)
          .addFields(
            { name: '우승 말',  value: winnerName,                        inline: false },
            { name: '수익',     value: `+${net.toLocaleString()}원`,       inline: true },
            { name: '베팅',     value: `${b.bet.toLocaleString()}원`,      inline: true },
            { name: '현재 잔고', value: `${balance.toLocaleString()}원`,   inline: true },
          )],
      });
    } else {
      const balance = (await getUser(uid)).balance;
      await channel.send({
        content: `<@${uid}>`,
        embeds: [new EmbedBuilder()
          .setColor(COLOR.red)
          .setTitle(`🏁 경주 종료${titleSuffix}`)
          .addFields(
            { name: '우승 말',  value: winnerName,                        inline: false },
            { name: '손실',     value: `-${b.bet.toLocaleString()}원`,     inline: true },
            { name: '현재 잔고', value: `${balance.toLocaleString()}원`,   inline: true },
          )
          .setDescription('아쉽게도 낙마했습니다.')],
      });
    }
  }
}
