// commandsHandler.js
import { getUser, updateBalance } from './db.js';

// ===== 경마 관련 =====
export const RACE_PAYOUT_MULTIPLIER = 5;
export const horses = [
  { name: '실버 쉽', emoji: '🐎' },
  { name: '언내추럴 위크', emoji: '🐎' },
  { name: '루즈 티켓', emoji: '🐎' },
  { name: '나리타 카나', emoji: '🐎' },
  { name: '싱글코어 터보', emoji: '🐎' },
  { name: '로쿠도 캡', emoji: '🐎' },
  { name: '럭키 카구야', emoji: '🐎' },
];

// ===== 경마 게임 함수 (애니메이션 포함) =====
export async function runRace(channel, bettors) {
  let positions = new Array(horses.length).fill(0);
  const trackLength = 30;
  const msg = await channel.send('🏁 경주 시작! 잠시만 기다려주세요...');

  return new Promise((resolve) => {
    let finished = false;
    const interval = setInterval(async () => {
      for (let i = 0; i < horses.length; i++) {
        positions[i] += Math.random() < 0.6 ? 0 : Math.floor(Math.random() * 3);
        if (positions[i] >= trackLength) positions[i] = trackLength;
      }

      const raceMsg = positions
        .map((p, i) => `|${'·'.repeat(p)}${horses[i].emoji} ${horses[i].name}${'·'.repeat(trackLength - p)}🏁`)
        .join('\n');

      try { await msg.edit(`🏇 경주 중...\n\n${raceMsg}`); } catch {}

      const winners = positions.map((p, i) => (p >= trackLength ? i : null)).filter(x => x !== null);
      if (winners.length > 0) {
        finished = true;
        clearInterval(interval);
        const winnerIdx = winners[0];

        for (const [uid, b] of bettors.entries()) {
          if (b.horseIndex === winnerIdx) {
            // ✅ 베팅금액은 index.js에서 미리 차감했으므로, 승리시 베팅액 × 배율 지급
            await updateBalance(uid, b.bet * RACE_PAYOUT_MULTIPLIER, '경마 승리');
          }
        }

        await channel.send(`🏆 경주 종료! 우승 말: ${horses[winnerIdx].emoji} **${horses[winnerIdx].name}** (${winnerIdx + 1}번)`);
        resolve(winnerIdx);
      }
    }, 1000);

    setTimeout(() => {
      if (!finished) {
        clearInterval(interval);
        try { msg.reply('⏱ 경주가 시간초과로 종료되었습니다.'); } catch {}
        resolve(null);
      }
    }, 40000);
  });
}
