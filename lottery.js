import cron from 'node-cron';
import { ChannelType, EmbedBuilder } from 'discord.js';
import { COLOR } from './colors.js';
import { db, updateBalance, canBuyLottery, updateLastLottery } from './db.js';

export async function findLotteryChannel(client) {
  for (const guild of client.guilds.cache.values()) {
    const ch = guild.channels.cache.find(
      c => c.type === ChannelType.GuildText &&
           (c.name.includes('복권') || c.name.toLowerCase().includes('lottery'))
    );
    if (ch) return ch;
  }
  return null;
}

export async function drawLotteryAndAnnounce(client, manual = false, interaction = null) {
  const today = new Date().toISOString().split('T')[0];
  const tickets = await db.all('SELECT * FROM lottery_tickets WHERE draw_date=?', today);

  if (!tickets.length) {
    const embed = new EmbedBuilder().setColor(COLOR.gray).setTitle('🎰 복권 당첨 결과').setDescription('📭 오늘은 구매된 복권이 없습니다.');
    if (manual && interaction) return interaction.editReply({ embeds: [embed] });
    return;
  }

  const pool = Array.from({ length: 40 }, (_, i) => i + 1);
  const winning = [];
  for (let i = 0; i < 6; i++) winning.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  winning.sort((a, b) => a - b);

  const winners = [];
  for (const ticket of tickets) {
    const nums = ticket.numbers.split(',').map(n => parseInt(n.trim()));
    const matches = nums.filter(n => winning.includes(n)).length;
    if (matches === 5) {
      await updateBalance(ticket.user_id, 5000, `복권 ${matches}개 일치 보상`);
      let displayName = `<@${ticket.user_id}>`;
      for (const guild of client.guilds.cache.values()) {
        try {
          const member = await guild.members.fetch(ticket.user_id);
          if (member) { displayName = member.displayName ?? member.user.username; break; }
        } catch {}
      }
      winners.push({ name: displayName, matches });
    }
  }

  const embed = new EmbedBuilder()
    .setColor(winners.length > 0 ? COLOR.gold : COLOR.gray)
    .setTitle('🎰 오늘의 복권 당첨 결과')
    .addFields(
      { name: '📅 날짜',    value: today, inline: true },
      { name: '🏆 당첨번호', value: winning.map(n => `**${n}**`).join('  '), inline: false },
      winners.length > 0
        ? { name: '🎉 당첨자', value: winners.map(w => `${w.name}  —  ${w.matches}개 일치  +5,000원`).join('\n') }
        : { name: '결과', value: '😢 이번 회차 당첨자가 없습니다.' }
    );

  if (manual && interaction) return interaction.editReply({ embeds: [embed] });
  const ch = await findLotteryChannel(client);
  if (ch) await ch.send({ embeds: [embed] });
  else console.warn('⚠️ 복권 채널 없음 (채널명에 "복권" 또는 "lottery" 포함 필요)');
}

export async function buyLottery(interaction) {
  const user = interaction.user;
  const input = interaction.options.getString('번호');

  if (!(await canBuyLottery(user.id))) {
    return interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLOR.gray).setDescription('🎟️ 이미 오늘 복권을 구매했습니다.\n내일 다시 시도해주세요.')] });
  }

  let nums;
  if (input) {
    nums = input.split(',').map(n => parseInt(n.trim()));
    if (nums.length !== 6 || nums.some(n => isNaN(n) || n < 1 || n > 45) || new Set(nums).size !== 6) {
      return interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLOR.red).setDescription('⚠️ 번호는 1~45 사이의 **중복 없는** 숫자 6개를 쉼표로 구분해 입력하세요.\n예: `3,7,12,22,34,45`')] });
    }
  } else {
    const pool = Array.from({ length: 45 }, (_, i) => i + 1);
    nums = [];
    for (let i = 0; i < 6; i++) nums.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    nums.sort((a, b) => a - b);
  }

  const today = new Date().toISOString().split('T')[0];
  await db.run('INSERT INTO lottery_tickets(user_id, numbers, draw_date) VALUES(?, ?, ?)', user.id, nums.join(','), today);
  await updateLastLottery(user.id);

  return interaction.editReply({
    embeds: [new EmbedBuilder()
      .setColor(COLOR.blue)
      .setTitle('🎟️ 복권 구매 완료')
      .addFields(
        { name: '내 번호',   value: nums.map(n => `**${n}**`).join('  '), inline: false },
        { name: '당첨 발표', value: '매일 오후 9시', inline: true },
        { name: '구매 방식', value: input ? '직접 입력' : '자동 생성', inline: true },
      )
      .setFooter({ text: '1일 1회 무료 구매 · 5개 일치 시 5,000원 지급' })],
  });
}

export function scheduleDailyLottery(client) {
  cron.schedule('0 21 * * *', async () => {
    try { await drawLotteryAndAnnounce(client); }
    catch (err) { console.error('💥 복권 자동 발표 에러:', err); }
  }, { timezone: 'Asia/Seoul' });
  console.log('🕘 복권 자동 발표 스케줄러 등록 완료 (매일 21:00 KST)');
}
