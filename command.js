// ===== command.js =====
import { SlashCommandBuilder, REST, Routes, PermissionFlagsBits } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

// ===== 환경 변수 =====
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_IDS = process.env.GUILD_ID?.split(',').map(id => id.trim()) || [];

// ===== 기본 명령어 정의 =====
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
        .setDescription('베팅 금액')
        .setRequired(false)
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
    )
    .addIntegerOption(opt =>
      opt.setName('말번호')
        .setDescription('1~7 중 하나 선택')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('블랙잭')
    .setDescription('블랙잭을 플레이합니다.')
    .addIntegerOption(opt =>
      opt.setName('베팅')
        .setDescription('베팅 금액')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('바카라')
    .setDescription('바카라를 플레이합니다.')
    .addIntegerOption(opt =>
      opt.setName('베팅')
        .setDescription('베팅 금액')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('선택')
        .setDescription('플레이어 / 뱅커 / 타이')
        .setRequired(true)
    ),

  // ✅ 관리자 전용 커맨드 — Discord 레벨에서 관리자에게만 표시/실행 가능
  new SlashCommandBuilder()
    .setName('관리자지급')
    .setDescription('관리자가 유저에게 포인트를 지급합니다.')
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
    // ✅ 0n = 아무 권한도 없는 유저에게 비활성화 → 서버 관리자만 볼 수 있음
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
];

// ===== 명령어 등록 함수 =====
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
