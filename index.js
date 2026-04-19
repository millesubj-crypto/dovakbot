// ===== 안정화 코드: 가장 상단 =====
import dotenv from 'dotenv';
import express from 'express';
import fetch from 'node-fetch';
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { initDB, getUser, updateBalance, canClaimDaily, updateClaim } from './db.js';
import { registerCommands } from './command.js';
import { scheduleDailyLottery, buyLottery } from './lottery.js'; // ✅ buyLottery 추가
import { runBlackjackManual, runBaccaratManual } from './casinoGames_manual.js';
import { runRace } from './commandsHandler.js'; // ✅ startRace → runRace (올바른 함수명)

dotenv.config();

// 전역 예외 처리
process.on('uncaughtException', (err) => console.error('💥 Uncaught Exception:', err));
process.on('unhandledRejection', (reason) => console.error('💥 Unhandled Rejection:', reason));

// 환경 변수
const TOKEN = process.env.DISCORD_TOKEN;
const ADMIN_IDS = process.env.ADMIN_USER_IDS?.split(',').map(id => id.trim()) || [];
const PORT = process.env.PORT || 10000;
const KEEPALIVE_URL = process.env.KEEPALIVE_URL;

// ===== Express 서버 (Keep-alive) =====
const app = express();
app.get('/', (_, res) => res.send('봇 실행 중'));
app.listen(PORT, () => console.log(`✅ 서버 실행: ${PORT}`));

if (KEEPALIVE_URL) {
  setInterval(async () => {
    try {
      await fetch(KEEPALIVE_URL);
      console.log('🔁 Keep-alive ping');
    } catch (err) {
      console.warn('⚠️ Keep-alive 실패:', err.message);
    }
  }, 1000 * 60 * 4);
}

// ===== Discord 클라이언트 =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
});

// ===== Discord 준비 이벤트 =====
// ✅ 'clientReady' → 'ready' (discord.js v14 올바른 이벤트명)
client.once('ready', async () => {
  console.log(`🤖 로그인 완료: ${client.user?.tag || 'Unknown User'}`);
  scheduleDailyLottery(client);
});

// ===== Interaction 처리 =====
client.on('interactionCreate', async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, user, options } = interaction;
    let userData;
    try {
      userData = await getUser(user.id);
    } catch {
      userData = { balance: 0, last_claim: 0 };
    }

    if (!userData || typeof userData.balance !== 'number') {
      console.error(`⚠️ 유저 데이터 오류: ${user.id}`);
      await interaction.reply({
        content: '⚠️ 유저 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.',
        ephemeral: true,
      });
      return;
    }

    // ===== 돈줘 명령어 =====
    if (commandName === '돈줘') {
      if (!(await canClaimDaily(user.id))) {
        await interaction.reply({ content: '⏰ 이미 오늘의 기본금을 받았습니다. 내일 다시 시도해주세요.', ephemeral: true });
        return;
      }
      const reward = 1000;
      const newBalance = await updateBalance(user.id, reward, '일일 기본금');
      await updateClaim(user.id);
      await interaction.reply({
        content: `💸 오늘의 기본금 ${reward.toLocaleString()}원을 받았습니다!\n현재 잔고: ${newBalance.toLocaleString()}원`,
        ephemeral: true,
      });
      return;
    }

    // ===== 잔고 확인 =====
    if (commandName === '잔고') {
      await interaction.reply({
        content: `💰 ${user.globalName || user.username}님의 잔고: ${userData.balance.toLocaleString()}원`,
        ephemeral: true,
      });
      return;
    }

    // ===== 슬롯 =====
    if (commandName === '슬롯') {
      const bet = options.getInteger('베팅') ?? 100;
      if (bet <= 0 || bet > userData.balance) {
        await interaction.reply({ content: '❌ 베팅 금액 오류', ephemeral: true });
        return;
      }
      await updateBalance(user.id, -bet, '슬롯 베팅');

      const slotSymbols = ['🍒','🍋','🍊','🍉','7️⃣','⭐'];
      const spinSlot = () => Array.from({ length: 3 }, () => slotSymbols[Math.floor(Math.random() * slotSymbols.length)]);
      const result = spinSlot();

      let reward = 0, patternText = '', sevenText = '', penaltyText = '';
      const cherryCount = result.filter(s => s === '🍒').length;
      if (cherryCount === 2) { reward -= 500; penaltyText = '💥 체리 2개! 500코인 차감!'; }
      else if (cherryCount === 3) { reward -= 2000; penaltyText = '💀 체리 3개! 2000코인 차감!'; }

      if (!penaltyText) {
        const unique = new Set(result);
        if (unique.size === 1) { reward = bet * 10; patternText = '🎉 세 개 동일 심볼! x10 당첨!'; }
        else if (unique.size === 2) { reward = bet * 2; patternText = '✨ 두 개 동일 심볼! x2 당첨!'; }
        else patternText = '꽝...';
        const sevenCount = result.filter(s => s === '7️⃣').length;
        if (sevenCount === 2) { reward += bet * 5; sevenText = '🔥 7️⃣ 2개! x5배 추가!'; }
        else if (sevenCount === 3) { reward += bet * 20; sevenText = '💥 7️⃣ 3개! x20배 추가!'; }
      }

      if (reward !== 0) await updateBalance(user.id, reward, '슬롯 결과');
      const balance = (await getUser(user.id)).balance;

      await interaction.reply({
        content:
          `🎰 슬롯 결과: ${result.join(' | ')}\n` +
          `${patternText}\n${sevenText ? sevenText+'\n':''}${penaltyText ? penaltyText+'\n':''}` +
          `💰 최종 잔고: ${balance}원\n` +
          `${reward > 0 ? `🎉 보상: +${reward}` : reward < 0 ? `💸 손실: ${reward}` : ''}`
      });
      return;
    }

    // ===== 복권 구매 =====
    // ✅ drawLotteryAndAnnounce(client, interaction) → buyLottery(interaction) 로 수정
    if (commandName === '복권구매') {
      await interaction.deferReply({ ephemeral: true });
      await buyLottery(interaction);
      return;
    }

    // ===== 블랙잭 =====
    if (commandName === '블랙잭') {
      const bet = options.getInteger('베팅');
      await runBlackjackManual(interaction, userData, bet);
      return;
    }

    // ===== 바카라 =====
    if (commandName === '바카라') {
      const bet = options.getInteger('베팅');
      const choice = options.getString('선택');
      await runBaccaratManual(interaction, userData, bet, choice);
      return;
    }

    // ===== 경마 =====
    // ✅ startRace → runRace (commandsHandler.js 에서 export 되는 올바른 함수명)
    if (commandName === '경마') {
      const bet = options.getInteger('베팅');
      const horseNum = options.getInteger('말번호');
      if (!interaction.channel) {
        await interaction.reply({ content: '❌ 채널 정보를 불러올 수 없습니다.', ephemeral: true });
        return;
      }
      await interaction.reply({ content: '🏁 경마를 시작합니다!' });
      const bettors = new Map([[user.id, { horseIndex: horseNum - 1, bet }]]);
      await runRace(interaction.channel, bettors);
      return;
    }

    // ===== 관리자 지급 =====
    if (commandName === '관리자지급') {
      if (!ADMIN_IDS.includes(user.id)) {
        await interaction.reply({ content: '❌ 권한이 없습니다.', ephemeral: true });
        return;
      }
      const target = options.getUser('대상');
      const amount = options.getInteger('금액');
      await updateBalance(target.id, amount, '관리자 지급');
      await interaction.reply({ content: `✅ ${target.username}님에게 ${amount.toLocaleString()}포인트를 지급했습니다.`, ephemeral: true });
      return;
    }

    // ===== 알 수 없는 명령어 =====
    await interaction.reply({ content: '❓ 알 수 없는 명령어입니다.', ephemeral: true });

  } catch (err) {
    console.error('💥 Interaction 처리 에러:', err);
    if (interaction && !interaction.replied && !interaction.deferred) {
      try { await interaction.reply({ content: '⚠️ 오류 발생', ephemeral: true }); } catch {}
    } else if (interaction && interaction.deferred && !interaction.replied) {
      try { await interaction.editReply({ content: '⚠️ 오류 발생' }); } catch {}
    }
  }
});

// ===== DB 초기화 및 봇 로그인 =====
(async () => {
  try {
    await initDB();
    await registerCommands();

    if (!TOKEN) {
      console.error('💥 DISCORD_TOKEN이 설정되지 않았습니다.');
      process.exit(1);
    }

    await client.login(TOKEN);
    console.log('✅ DB 초기화 & 봇 로그인 완료');
  } catch (err) {
    console.error('💥 초기화 실패:', err);
    process.exit(1);
  }
})();
