// commandsHandler.js
import { EmbedBuilder } from 'discord.js';
import { updateBalance } from './db.js';

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
// 레이아웃: 🏁[결승쪽 여백][🐎][출발쪽 여백]  번호.이름
// 오른쪽 → 왼쪽 이동. 두 여백 합 = trackLength (고정) → 모든 줄 길이 동일
export async function runRace(channel, bettors) {
  const trackLength = 20;
  let positions = new Array(horses.length).fill(0);

  const startEmbed = new EmbedBuilder()
    .setColor(COLOR.blue)
    .setTitle('🏇 경주 시작!')
    .setDescription('잠시 후 경주가 시작됩니다...')
    .addFields(horses.map((h, i) => ({
      name: `${i + 1}번 — ${h.name}`,
      value: '출발 대기 중',
      inline: true,
    })));

  const msg = await channel.send({ embeds: [startEmbed] });

  return new Promise((resolve) => {
    let finished = false;

    const interval = setInterval(async () => {
      for (let i = 0; i < horses.length; i++) {
        const step = Math.random() < 0.8 ? (Math.random() < 0.4 ? 2 : 1) : 0;
        positions[i] = Math.min(positions[i] + step, trackLength);
      }

      // 코드블록 트랙 렌더링 (모노스페이스 폰트로 정렬)
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

        for (const [uid, b] of bettors.entries()) {
          if (b.horseIndex === winnerIdx) {
            await updateBalance(uid, b.bet * RACE_PAYOUT_MULTIPLIER, '경마 승리');

            // 베팅자에게 결과 알림 (채널 공개 메시지)
            const net = b.bet * (RACE_PAYOUT_MULTIPLIER - 1);
            await channel.send({
              embeds: [new EmbedBuilder()
                .setColor(COLOR.green)
                .setTitle('🏆 경주 종료 — 축하합니다!')
                .addFields(
                  { name: '우승 말', value: `${horses[winnerIdx].emoji} **${horses[winnerIdx].name}** (${winnerIdx + 1}번)`, inline: false },
                  { name: '수익', value: `+${net.toLocaleString()}원`, inline: true },
                  { name: '베팅', value: `${b.bet.toLocaleString()}원`, inline: true },
                )],
            });
          } else {
            // 낙마자 결과
            await channel.send({
              embeds: [new EmbedBuilder()
                .setColor(COLOR.gold)
                .setTitle('🏆 경주 종료')
                .addFields(
                  { name: '우승 말', value: `${horses[winnerIdx].emoji} **${horses[winnerIdx].name}** (${winnerIdx + 1}번)`, inline: false },
                )
                .setDescription('아쉽게도 낙마했습니다.')],
            });
          }
        }
        resolve(winnerIdx);
      }
    }, 1500);

    // 최대 30초 타임아웃 → 선두 말 강제 우승
    setTimeout(() => {
      if (!finished) {
        clearInterval(interval);
        const maxPos = Math.max(...positions);
        const winnerIdx = positions.indexOf(maxPos);
        for (const [uid, b] of bettors.entries()) {
          if (b.horseIndex === winnerIdx)
            updateBalance(uid, b.bet * RACE_PAYOUT_MULTIPLIER, '경마 승리(시간초과)');
        }
        channel.send({
          embeds: [new EmbedBuilder()
            .setColor(COLOR.gray)
            .setTitle('⏱ 시간초과 — 강제 종료')
            .setDescription(`선두 말 ${horses[winnerIdx].emoji} **${horses[winnerIdx].name}** (${winnerIdx + 1}번) 우승 처리`)],
        }).catch(() => {});
        resolve(winnerIdx);
      }
    }, 30000);
  });
}
