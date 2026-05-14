// ===== index.js =====
import dotenv from 'dotenv';
import express from 'express';
import fetch from 'node-fetch';
import { Client, GatewayIntentBits, Partials, EmbedBuilder } from 'discord.js';
import { initDB, getUser, updateBalance, canClaimDaily, updateClaim,
         isBotAdmin, addBotAdmin, removeBotAdmin, listBotAdmins } from './db.js';
import { registerCommands } from './command.js';
import { scheduleDailyLottery, buyLottery, drawLotteryAndAnnounce } from './lottery.js';
import { runBlackjackManual, runBaccaratManual } from './casinoGames_manual.js';
import { runRace } from './commandsHandler.js';

dotenv.config();

process.on('uncaughtException', (err) => console.error('💥 Uncaught Exception:', err));
process.on('unhandledRejection', (reason) => console.error('💥 Unhandled Rejection:', reason));

const TOKEN = process.env.DISCORD_TOKEN;
const PORT = process.env.PORT || 10000;
const KEEPALIVE_URL = process.env.KEEPALIVE_URL;

// ===== Express =====
const app = express();
app.get('/', (_, res) => res.send('봇 실행 중'));
app.listen(PORT, () => console.log(`✅ 서버 실행: ${PORT}`));
if (KEEPALIVE_URL) {
  setInterval(async () => {
    try { await fetch(KEEPALIVE_URL); }
    catch (err) { console.warn('⚠️ Keep-alive 실패:', err.message); }
  }, 1000 * 60 * 4);
}

// ===== Discord 클라이언트 =====
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
});

client.once('ready', async () => {
  console.log(`🤖 로그인 완료: ${client.user?.tag}`);
  scheduleDailyLottery(client);
});

// ===== 공통 색상 =====
const COLOR = {
  gold:  0xF1C40F,
  green: 0x57F287,
  red:   0xED4245,
  blue:  0x5865F2,
  gray:  0x2B2D31,
  teal:  0x1ABC9C,
};

// ===== Interaction 처리 =====
client.on('interactionCreate', async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, user, options } = interaction;

    let userData;
    try { userData = await getUser(user.id); }
    catch { userData = { balance: 0, last_claim: 0 }; }

    if (!userData || typeof userData.balance !== 'number') {
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(COLOR.red).setDescription('⚠️ 유저 데이터를 불러오지 못했습니다.')],
        ephemeral: true,
      });
      return;
    }

    // ===== 돈줘 =====
    if (commandName === '돈줘') {
      if (!(await canClaimDaily(user.id))) {
        await interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(COLOR.gray)
            .setDescription('⏰ 이미 오늘의 기본금을 받았습니다.\n내일 다시 시도해주세요.')],
          ephemeral: true,
        });
        return;
      }
      const reward = 1000;
      const newBalance = await updateBalance(user.id, reward, '일일 기본금');
      await updateClaim(user.id);
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(COLOR.gold)
          .setTitle('💸 일일 기본금 수령')
          .setThumbnail(user.displayAvatarURL())
          .addFields(
            { name: '받은 금액', value: `+${reward.toLocaleString()}원`, inline: true },
            { name: '현재 잔고', value: `${newBalance.toLocaleString()}원`, inline: true },
          )
          .setFooter({ text: '내일 다시 받을 수 있습니다.' })],
        ephemeral: true,
      });
      return;
    }

    // ===== 잔고 =====
    if (commandName === '잔고') {
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(COLOR.teal)
          .setTitle('💰 잔고 조회')
          .setThumbnail(user.displayAvatarURL())
          .setDescription(`**${user.globalName || user.username}**님의 현재 잔고`)
          .addFields({ name: '잔고', value: `**${userData.balance.toLocaleString()}원**`, inline: false })],
        ephemeral: true,
      });
      return;
    }

    // ===== 슬롯 =====
    if (commandName === '슬롯') {
      const bet = options.getInteger('베팅') ?? 100;
      if (bet <= 0 || bet > userData.balance) {
        await interaction.reply({
          embeds: [new EmbedBuilder().setColor(COLOR.red).setDescription('❌ 베팅 금액 오류 (잔고 부족 또는 0 이하)')],
          ephemeral: true,
        });
        return;
      }
      await updateBalance(user.id, -bet, '슬롯 베팅');

      const slotSymbols = ['🍒','🍋','🍊','🍉','7️⃣','⭐'];
      const result = Array.from({ length: 3 }, () => slotSymbols[Math.floor(Math.random() * slotSymbols.length)]);

      let pnl = 0;
      let resultLabel = '';
      let embedColor = COLOR.gray;
      const bonusLines = [];

      const cherryCount = result.filter(s => s === '🍒').length;
      if (cherryCount === 2)      { pnl = -500;  resultLabel = '💥 체리 2개 — 500원 차감';  embedColor = COLOR.red; }
      else if (cherryCount === 3) { pnl = -2000; resultLabel = '💀 체리 3개 — 2,000원 차감'; embedColor = COLOR.red; }
      else {
        const unique = new Set(result);
        if (unique.size === 1)      { pnl = bet * 10; resultLabel = '🎉 세 개 동일 — ×10 당첨!'; embedColor = COLOR.gold; }
        else if (unique.size === 2) { pnl = bet * 2;  resultLabel = '✨ 두 개 동일 — ×2 당첨!';  embedColor = COLOR.green; }
        else                        { resultLabel = '꽝';                                          embedColor = COLOR.gray; }

        const sevenCount = result.filter(s => s === '7️⃣').length;
        if (sevenCount === 2)      { pnl += bet * 5;  bonusLines.push('🔥 7️⃣ 보너스 ×5'); }
        else if (sevenCount === 3) { pnl += bet * 20; bonusLines.push('💥 7️⃣ 보너스 ×20'); }
      }

      if (pnl !== 0) await updateBalance(user.id, pnl, '슬롯 결과');
      const balance = (await getUser(user.id)).balance;
      const pnlText = pnl > 0 ? `+${pnl.toLocaleString()}원` : pnl < 0 ? `${pnl.toLocaleString()}원` : '±0원';

      const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setTitle('🎰 슬롯머신')
        .setDescription(`## ${result.join('　')}`)
        .addFields(
          { name: '결과', value: [resultLabel, ...bonusLines].join('\n') || '꽝', inline: true },
          { name: '수익', value: pnlText, inline: true },
          { name: '잔고', value: `${balance.toLocaleString()}원`, inline: true },
        )
        .setFooter({ text: `베팅: ${bet.toLocaleString()}원` });

      await interaction.reply({ embeds: [embed] });
      return;
    }

    // ===== 복권구매 =====
    if (commandName === '복권구매') {
      await interaction.deferReply({ ephemeral: true });
      await buyLottery(interaction);
      return;
    }

    // ===== 복권결과 (봇 관리자 전용) =====
    if (commandName === '복권결과') {
      if (!(await isBotAdmin(user.id))) {
        await interaction.reply({
          embeds: [new EmbedBuilder().setColor(COLOR.red).setDescription('❌ 봇 관리자 권한이 없습니다.')],
          ephemeral: true,
        });
        return;
      }
      await interaction.deferReply();
      await drawLotteryAndAnnounce(client, true, interaction);
      return;
    }

    // ===== 블랙잭 =====
    if (commandName === '블랙잭') {
      const bet = options.getInteger('베팅');
      if (!bet || bet <= 0 || bet > userData.balance) {
        await interaction.reply({
          embeds: [new EmbedBuilder().setColor(COLOR.red).setDescription('❌ 베팅 금액 오류 (잔고 부족 또는 0 이하)')],
          ephemeral: true,
        });
        return;
      }
      await runBlackjackManual(interaction);
      return;
    }

    // ===== 바카라 =====
    if (commandName === '바카라') {
      const bet = options.getInteger('베팅');
      if (!bet || bet <= 0 || bet > userData.balance) {
        await interaction.reply({
          embeds: [new EmbedBuilder().setColor(COLOR.red).setDescription('❌ 베팅 금액 오류 (잔고 부족 또는 0 이하)')],
          ephemeral: true,
        });
        return;
      }
      await runBaccaratManual(interaction);
      return;
    }

    // ===== 경마 =====
    if (commandName === '경마') {
      const bet = options.getInteger('베팅');
      const horseNum = options.getInteger('말번호');
      if (!bet || bet <= 0 || bet > userData.balance) {
        await interaction.reply({
          embeds: [new EmbedBuilder().setColor(COLOR.red).setDescription('❌ 베팅 금액 오류 (잔고 부족 또는 0 이하)')],
          ephemeral: true,
        });
        return;
      }
      if (!horseNum || horseNum < 1 || horseNum > 7) {
        await interaction.reply({
          embeds: [new EmbedBuilder().setColor(COLOR.red).setDescription('❌ 말 번호는 1~7 사이로 입력하세요.')],
          ephemeral: true,
        });
        return;
      }
      if (!interaction.channel) {
        await interaction.reply({
          embeds: [new EmbedBuilder().setColor(COLOR.red).setDescription('❌ 채널 정보를 불러올 수 없습니다.')],
          ephemeral: true,
        });
        return;
      }
      await updateBalance(user.id, -bet, '경마 베팅');
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(COLOR.blue)
          .setTitle('🏇 경마 시작!')
          .addFields(
            { name: '베팅 말', value: `${horseNum}번`, inline: true },
            { name: '베팅 금액', value: `${bet.toLocaleString()}원`, inline: true },
          )
          .setDescription('잠시 후 경주가 시작됩니다...')],
      });
      const bettors = new Map([[user.id, { horseIndex: horseNum - 1, bet }]]);
      await runRace(interaction.channel, bettors);
      return;
    }

    // ===== 골라 =====
    if (commandName === '골라') {
      const input = options.getString('목록');
      const items = input.split(',').map(s => s.trim()).filter(s => s.length > 0);
      if (items.length < 2) {
        await interaction.reply({
          embeds: [new EmbedBuilder().setColor(COLOR.red).setDescription('⚠️ 항목을 2개 이상 쉼표로 구분해서 입력해주세요.\n예: `짜장면, 짬뽕, 볶음밥`')],
          ephemeral: true,
        });
        return;
      }
      const chosen = items[Math.floor(Math.random() * items.length)];
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(COLOR.gold)
          .setTitle('🎯 랜덤 선택 결과')
          .setDescription(`## ${chosen}`)
          .addFields({ name: '전체 후보', value: items.map(i => i === chosen ? `**▶ ${i}**` : i).join('　/　') })],
      });
      return;
    }

    // ===== 봇관리자추가 =====
    if (commandName === '봇관리자추가') {
      const target = options.getUser('대상');
      if (target.id === user.id) {
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLOR.red).setDescription('⚠️ 자기 자신은 지정할 수 없습니다.')], ephemeral: true });
        return;
      }
      if (await isBotAdmin(target.id)) {
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLOR.gray).setDescription(`⚠️ **${target.username}**님은 이미 봇 관리자입니다.`)], ephemeral: true });
        return;
      }
      await addBotAdmin(target.id, user.id);
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLOR.green).setDescription(`✅ **${target.username}**님에게 봇 관리자 권한을 부여했습니다.`)], ephemeral: true });
      return;
    }

    // ===== 봇관리자제거 =====
    if (commandName === '봇관리자제거') {
      const target = options.getUser('대상');
      if (!(await isBotAdmin(target.id))) {
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLOR.red).setDescription(`⚠️ **${target.username}**님은 봇 관리자가 아닙니다.`)], ephemeral: true });
        return;
      }
      await removeBotAdmin(target.id);
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLOR.green).setDescription(`✅ **${target.username}**님의 봇 관리자 권한을 해제했습니다.`)], ephemeral: true });
      return;
    }

    // ===== 봇관리자목록 =====
    if (commandName === '봇관리자목록') {
      const admins = await listBotAdmins();
      const envAdmins = process.env.ADMIN_USER_IDS?.split(',').map(id => id.trim()).filter(Boolean) || [];
      const embed = new EmbedBuilder().setColor(COLOR.blue).setTitle('🛡️ 봇 관리자 목록');
      if (envAdmins.length > 0)
        embed.addFields({ name: '고정 관리자', value: envAdmins.map(id => `<@${id}>`).join('\n') });
      if (admins.length > 0)
        embed.addFields({ name: '부여된 관리자', value: admins.map(a => `<@${a.user_id}> (부여: <@${a.granted_by}>)`).join('\n') });
      if (envAdmins.length === 0 && admins.length === 0)
        embed.setDescription('현재 봇 관리자가 없습니다.');
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    // ===== 관리자지급 =====
    if (commandName === '관리자지급') {
      if (!(await isBotAdmin(user.id))) {
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLOR.red).setDescription('❌ 봇 관리자 권한이 없습니다.')], ephemeral: true });
        return;
      }
      const target = options.getUser('대상');
      const amount = options.getInteger('금액');
      const newBal = await updateBalance(target.id, amount, '관리자 지급');
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(COLOR.green)
          .setTitle('✅ 포인트 지급 완료')
          .addFields(
            { name: '대상', value: `<@${target.id}>`, inline: true },
            { name: '지급 금액', value: `${amount.toLocaleString()}원`, inline: true },
            { name: '변경 후 잔고', value: `${newBal.toLocaleString()}원`, inline: true },
          )],
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(COLOR.gray).setDescription('❓ 알 수 없는 명령어입니다.')],
      ephemeral: true,
    });

  } catch (err) {
    console.error('💥 Interaction 처리 에러:', err);
    try {
      const errEmbed = new EmbedBuilder().setColor(COLOR.red).setDescription('⚠️ 오류가 발생했습니다.');
      if (!interaction.replied && !interaction.deferred)
        await interaction.reply({ embeds: [errEmbed], ephemeral: true });
      else if (interaction.deferred && !interaction.replied)
        await interaction.editReply({ embeds: [errEmbed] });
    } catch {}
  }
});

// ===== DB 초기화 및 봇 로그인 =====
(async () => {
  try {
    await initDB();
    await registerCommands();
    if (!TOKEN) { console.error('💥 DISCORD_TOKEN 미설정'); process.exit(1); }
    await client.login(TOKEN);
    console.log('✅ 봇 로그인 완료');
  } catch (err) {
    console.error('💥 초기화 실패:', err);
    process.exit(1);
  }
})();
