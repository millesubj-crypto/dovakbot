// lottery.js
import cron from 'node-cron';
import { ChannelType } from 'discord.js';
import { db, updateBalance, canBuyLottery, updateLastLottery } from './db.js';

export async function findLotteryChannel(client) {
  for (const guild of client.guilds.cache.values()) {
    const channel = guild.channels.cache.find(
      (c) =>
        c.type === ChannelType.GuildText &&
        (c.name.includes('복권') || c.name.toLowerCase().includes('lottery'))
    );
    if (channel) return channel;
  }
  return null;
}

export async function drawLotteryAndAnnounce(client, manual = false, interaction = null) {
  const today = new Date().toISOString().split('T')[0];
  const tickets = await db.all('SELECT * FROM lottery_tickets WHERE draw_date=?', today);

  if (!tickets.length) {
    const msg = '📭 오늘은 구매한 복권이 없습니다.';
    if (manual && interaction) return interaction.editReply({ content: msg });
    return console.log(msg);
  }

  const available = Array.from({ length: 40 }, (_, i) => i + 1);
  const winning = [];
  for (let i = 0; i < 6; i++) {
    const idx = Math.floor(Math.random() * available.length);
    winning.push(available.splice(idx, 1)[0]);
  }
  winning.sort((a, b) => a - b);

  const results = [];
  for (const ticket of tickets) {
    const nums = ticket.numbers.split(',').map(n => parseInt(n.trim()));
    const matches = nums.filter(n => winning.includes(n)).length;
    const reward = matches === 5 ? 5000 : 0;
    if (reward > 0) {
      await updateBalance(ticket.user_id, reward, `복권 ${matches}개 일치 보상`);

      let displayName = ticket.user_id;
      for (const guild of client.guilds.cache.values()) {
        try {
          const member = await guild.members.fetch(ticket.user_id);
          if (member) {
            displayName = member.displayName ?? member.user.username;
            break;
          }
        } catch {}
      }
      results.push(`${displayName} ➜ ${matches}개 일치 🎉 (${reward.toLocaleString()}원)`);
    }
  }

  const resultText = [
    '🎰 **오늘의 복권 당첨 결과** 🎰',
    `📅 날짜: ${today}`,
    `🏆 당첨번호: **${winning.join(', ')}**`,
    '',
    results.length ? results.join('\n') : '😢 이번 회차에는 당첨자가 없습니다.',
  ].join('\n');

  if (manual && interaction) return interaction.editReply({ content: resultText });

  const channel = await findLotteryChannel(client);
  if (channel) await channel.send(resultText);
  else console.warn('⚠️ 복권 결과 채널 없음 (채널 이름에 "복권" 또는 "lottery" 포함 필요)');
}

// ✅ 복권 구매 — canBuyLottery / updateLastLottery 연결 수정
export async function buyLottery(interaction) {
  const user = interaction.user;
  const input = interaction.options.getString('번호');

  // 1일 1회 제한 (db.js의 last_lottery 컬럼 기반)
  if (!(await canBuyLottery(user.id))) {
    return interaction.editReply({ content: '🎟️ 이미 오늘 복권을 구매했습니다. 내일 다시 시도해주세요.' });
  }

  // 번호 처리
  let nums;
  if (input) {
    nums = input.split(',').map(n => parseInt(n.trim()));
    if (
      nums.length !== 6 ||
      nums.some(n => isNaN(n) || n < 1 || n > 45) ||
      new Set(nums).size !== 6
    ) {
      return interaction.editReply({
        content: '⚠️ 번호는 1~45 사이의 **중복 없는** 숫자 6개를 쉼표로 구분해 입력하세요.\n예: 3,7,12,22,34,45'
      });
    }
  } else {
    const available = Array.from({ length: 45 }, (_, i) => i + 1);
    nums = [];
    for (let i = 0; i < 6; i++) {
      const randIndex = Math.floor(Math.random() * available.length);
      nums.push(available.splice(randIndex, 1)[0]);
    }
    nums.sort((a, b) => a - b);
  }

  const today = new Date().toISOString().split('T')[0];

  await db.run(
    'INSERT INTO lottery_tickets(user_id, numbers, draw_date) VALUES(?, ?, ?)',
    user.id,
    nums.join(','),
    today
  );

  // ✅ 구매 완료 후 last_lottery 업데이트
  await updateLastLottery(user.id);

  return interaction.editReply({ content: `🎟️ 오늘의 무료 복권 구매 완료!\n번호: **${nums.join(', ')}**\n\n📅 당첨 발표: 매일 오후 9시` });
}

export function scheduleDailyLottery(client) {
  cron.schedule(
    '0 21 * * *',
    async () => {
      try { await drawLotteryAndAnnounce(client); }
      catch (err) { console.error('💥 Cron 자동 발표 에러:', err); }
    },
    { timezone: 'Asia/Seoul' }
  );
  console.log('🕘 매일 오후 9시에 자동 복권 발표 스케줄러 등록 완료');
}
