// ===== command.js =====
import { SlashCommandBuilder, REST, Routes, PermissionFlagsBits } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_IDS = process.env.GUILD_ID?.split(',').map(id => id.trim()) || [];
const COMMAND_SCOPE = (process.env.COMMAND_SCOPE || 'global').trim().toLowerCase();

export const baseCommands = [
  new SlashCommandBuilder()
    .setName('돈줘')
    .setDescription('하루에 한 번 기본금을 받습니다.'),

  new SlashCommandBuilder()
    .setName('잔고')
    .setDescription('현재 잔고를 확인합니다.'),

  new SlashCommandBuilder()
    .setName('슬롯')
    .setDescription('슬롯머신을 돌립니다.')
    .addIntegerOption(opt =>
      opt.setName('베팅')
        .setDescription('베팅 금액 (기본: 100)')
        .setRequired(false)
        .setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName('복권구매')
    .setDescription('복권을 무료로 구매합니다. (1일 1회)')
    .addStringOption(opt =>
      opt.setName('번호')
        .setDescription('6개 번호 쉼표 구분 입력 (예: 3,7,12,22,34,45) — 미입력시 자동 생성')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('경마')
    .setDescription('랜덤 경마를 진행합니다.')
    .addIntegerOption(opt =>
      opt.setName('베팅')
        .setDescription('베팅 금액')
        .setRequired(true)
        .setMinValue(1)
    )
    .addIntegerOption(opt =>
      opt.setName('말번호')
        .setDescription('1~7 중 하나 선택')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(7)
    ),

  new SlashCommandBuilder()
    .setName('블랙잭')
    .setDescription('블랙잭을 플레이합니다.')
    .addIntegerOption(opt =>
      opt.setName('베팅')
        .setDescription('베팅 금액')
        .setRequired(true)
        .setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName('바카라')
    .setDescription('바카라를 플레이합니다.')
    .addIntegerOption(opt =>
      opt.setName('베팅')
        .setDescription('베팅 금액')
        .setRequired(true)
        .setMinValue(1)
    )
    .addStringOption(opt =>
      opt.setName('선택')
        .setDescription('플레이어 / 뱅커 / 타이 중 선택')
        .setRequired(true)
        .addChoices(
          { name: '플레이어', value: '플레이어' },
          { name: '뱅커', value: '뱅커' },
          { name: '타이', value: '타이' }
        )
    ),

  new SlashCommandBuilder()
    .setName('복권결과')
    .setDescription('오늘의 복권 당첨 결과를 즉시 발표합니다. (봇 관리자 전용)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // ✅ /골라 목록 → 옵션명을 "목록"으로 통일 (입력창에 "목록" 표시)
  new SlashCommandBuilder()
    .setName('골라')
    .setDescription('항목들 중 하나를 랜덤으로 골라줍니다.')
    .addStringOption(opt =>
      opt.setName('목록')
        .setDescription('쉼표로 구분 (예: 짜장면, 짬뽕, 볶음밥)')
        .setRequired(true)
    ),

  // ===== 봇 관리자 권한 관리 (디스코드 서버 관리자 전용) =====
  new SlashCommandBuilder()
    .setName('봇관리자추가')
    .setDescription('선택한 유저에게 봇 관리자 권한을 부여합니다.')
    .addUserOption(opt =>
      opt.setName('대상')
        .setDescription('봇 관리자로 지정할 유저')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('봇관리자제거')
    .setDescription('선택한 유저의 봇 관리자 권한을 해제합니다.')
    .addUserOption(opt =>
      opt.setName('대상')
        .setDescription('봇 관리자 권한을 해제할 유저')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('봇관리자목록')
    .setDescription('현재 봇 관리자 목록을 확인합니다.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('관리자지급')
    .setDescription('봇 관리자가 유저에게 포인트를 지급합니다.')
    .addUserOption(opt =>
      opt.setName('대상')
        .setDescription('유저 선택')
        .setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName('금액')
        .setDescription('지급할 금액')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
];

export async function registerCommands() {
  if (!DISCORD_TOKEN || !CLIENT_ID || GUILD_IDS.length === 0) {
    console.error('💥 DISCORD_TOKEN, CLIENT_ID, GUILD_ID 중 하나가 설정되지 않았습니다.');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  const body = baseCommands.map(cmd => cmd.toJSON());

  for (const guildId of GUILD_IDS) {
    try {
      console.log(`🔹 슬래시 명령어 등록 중... (서버: ${guildId})`);
      await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, guildId),
        { body }
      );
      console.log(`✅ 슬래시 명령어 등록 완료 (서버: ${guildId})`);
    } catch (err) {
      console.error(`💥 명령어 등록 에러 (서버: ${guildId}):`, err);
    }
  }
}
