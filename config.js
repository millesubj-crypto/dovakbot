// config.js
// ⚠️ 환경변수는 반드시 .env 파일에 아래 형식으로 설정하세요:
//
//   DISCORD_TOKEN=your_bot_token_here
//   CLIENT_ID=your_client_id_here          (예: 1427633997340741717)
//   GUILD_ID=your_guild_id_here            (예: 1469692759823876098)
//   ADMIN_USER_IDS=your_user_id_here       (예: 429792107620728833)
//   KEEPALIVE_URL=https://your-app.onrender.com (선택)
//
// ❌ 숫자로 시작하는 변수명은 JavaScript에서 사용 불가 → 문자열 키로 변경

import dotenv from 'dotenv';
dotenv.config();

export const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
export const CLIENT_ID = process.env.CLIENT_ID;
export const GUILD_ID = process.env.GUILD_ID;
export const ADMIN_USER_IDS = process.env.ADMIN_USER_IDS?.split(',').map(id => id.trim()) || [];
export const PORT = process.env.PORT || 10000;
export const KEEPALIVE_URL = process.env.KEEPALIVE_URL;

if (!DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN이 누락되었습니다. .env 파일을 확인하세요.');
  process.exit(1);
}
