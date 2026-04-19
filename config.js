import dotenv from 'dotenv';
dotenv.config();

export const DISCORD_TOKEN = process.env.MTQyNzYzMzk5NzM0MDc0MTcxNw.GfNdsS.340hAr-UaEJA7wak0uFw4OTabH6kiqVqJMbP_o;
export const CLIENT_ID = process.env.1427633997340741717;
export const GUILD_ID = process.env.1469692759823876098;
export const ADMIN_USER_IDS = process.env.429792107620728833?.split(',') || [];
export const PORT = process.env.PORT || 10000;
export const KEEPALIVE_URL = process.env.KEEPALIVE_URL;

if (!DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN이 누락되었습니다.');
  process.exit(1);
}
