import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from 'discord.js';
import { COLOR } from './colors.js';
import { getUser, updateBalance } from './db.js';

const EPH = { flags: MessageFlags.Ephemeral };

function createDeck() {
  const suits = ['♠','♥','♦','♣'];
  const ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const deck = [];
  for (const s of suits) for (const r of ranks) deck.push({ rank: r, suit: s });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function cardValue(c) {
  if (['J','Q','K'].includes(c.rank)) return 10;
  if (c.rank === 'A') return 11;
  return parseInt(c.rank, 10);
}

function calcHandValue(h) {
  let v = h.reduce((s, c) => s + cardValue(c), 0);
  let ac = h.filter(c => c.rank === 'A').length;
  while (v > 21 && ac > 0) { v -= 10; ac--; }
  return v;
}

function handStr(h) {
  return h.map(c => `\`${c.rank}${c.suit}\``).join(' ');
}

function resultEmbed({ title, bodyFields, outcome, bet, balance, footer }) {
  const cfg = {
    win:  { color: COLOR.green,  label: '🏆 승리!' },
    lose: { color: COLOR.red,    label: '💀 패배'  },
    draw: { color: COLOR.yellow, label: '⚖️ 무승부' },
  }[outcome];
  const net = outcome === 'win' ? bet : outcome === 'draw' ? 0 : -bet;
  const pnl = net > 0 ? `+${net.toLocaleString()}원` : net < 0 ? `${net.toLocaleString()}원` : '±0원';
  return new EmbedBuilder()
    .setColor(cfg.color)
    .setTitle(`${title}　　${cfg.label}`)
    .addFields(...bodyFields,
      { name: '수익', value: pnl, inline: true },
      { name: '잔고', value: `${balance.toLocaleString()}원`, inline: true },
    )
    .setFooter({ text: footer ?? `베팅: ${bet.toLocaleString()}원` });
}

export async function runBlackjackManual(interaction) {
  const user = interaction.user;
  const userData = await getUser(user.id);
  const bet = interaction.options.getInteger('베팅');
  const memberName = interaction.member?.displayName ?? user.username;

  if (!bet || bet <= 0 || bet > userData.balance)
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLOR.red).setDescription('❌ 베팅 금액 오류')], ...EPH });

  await updateBalance(user.id, -bet, '블랙잭 베팅');

  const deck = createDeck();
  const pH = [deck.pop(), deck.pop()];
  const dH = [deck.pop(), deck.pop()];
  let finished = false;

  const mkButtons = () => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('bj_ph').setLabel('플레이어 Hit').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('bj_ps').setLabel('플레이어 Stand').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('bj_dh').setLabel('딜러 Hit').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('bj_ds').setLabel('딜러 Stand').setStyle(ButtonStyle.Success),
  );

  const progressEmbed = () => new EmbedBuilder()
    .setColor(COLOR.blue)
    .setTitle('🃏 블랙잭 진행 중')
    .addFields(
      { name: `👤 ${memberName}`, value: `${handStr(pH)}\n합계: **${calcHandValue(pH)}**`, inline: true },
      { name: '🤖 딜러',          value: `${handStr(dH)}\n합계: **${calcHandValue(dH)}**`, inline: true },
    )
    .setFooter({ text: `베팅: ${bet.toLocaleString()}원　│　버튼으로 진행하세요` });

  const msg = await interaction.reply({ embeds: [progressEmbed()], components: [mkButtons()], fetchReply: true });
  const col = msg.createMessageComponentCollector({ filter: i => i.user.id === user.id, time: 120000 });

  async function finalize(i, outcome) {
    finished = true;
    let reward = 0;
    if (outcome === 'win')  reward = bet * 2;
    if (outcome === 'draw') reward = bet;
    if (reward > 0) await updateBalance(user.id, reward, `블랙잭 ${outcome}`);
    const balance = (await getUser(user.id)).balance;
    await i.update({
      embeds: [resultEmbed({
        title: '🃏 블랙잭',
        bodyFields: [
          { name: `👤 ${memberName}`, value: `${handStr(pH)}\n합계: **${calcHandValue(pH)}**`, inline: true },
          { name: '🤖 딜러',          value: `${handStr(dH)}\n합계: **${calcHandValue(dH)}**`, inline: true },
        ],
        outcome, bet, balance,
      })],
      components: [],
    });
    col.stop();
  }

  col.on('collect', async i => {
    if (i.customId === 'bj_ph') {
      pH.push(deck.pop());
      if (calcHandValue(pH) > 21) { await finalize(i, 'lose'); return; }
      await i.update({ embeds: [progressEmbed()] });
    }
    if (i.customId === 'bj_ps') {
      await i.update({ embeds: [progressEmbed().setFooter({ text: `베팅: ${bet.toLocaleString()}원　│　플레이어 Stand — 딜러를 진행하세요` })] });
    }
    if (i.customId === 'bj_dh') {
      dH.push(deck.pop());
      if (calcHandValue(dH) > 21) { await finalize(i, 'win'); return; }
      await i.update({ embeds: [progressEmbed()] });
    }
    if (i.customId === 'bj_ds') {
      const pv = calcHandValue(pH), dv = calcHandValue(dH);
      await finalize(i, pv > dv ? 'win' : pv === dv ? 'draw' : 'lose');
    }
  });

  col.on('end', async () => {
    if (!finished) {
      const balance = (await getUser(user.id)).balance;
      try {
        await interaction.editReply({
          embeds: [resultEmbed({
            title: '🃏 블랙잭',
            bodyFields: [
              { name: `👤 ${memberName}`, value: `${handStr(pH)}\n합계: **${calcHandValue(pH)}**`, inline: true },
              { name: '🤖 딜러',          value: `${handStr(dH)}\n합계: **${calcHandValue(dH)}**`, inline: true },
            ],
            outcome: 'lose', bet, balance,
            footer: '⏰ 시간 초과로 패배 처리되었습니다.',
          })],
          components: [],
        });
      } catch {}
    }
  });
}

export async function runBaccaratManual(interaction) {
  const user = interaction.user;
  const userData = await getUser(user.id);
  const bet = interaction.options.getInteger('베팅');
  const choice = (interaction.options.getString('선택') || '').trim();
  const memberName = interaction.member?.displayName ?? user.username;

  if (!['플레이어','뱅커','타이'].includes(choice))
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLOR.red).setDescription('⚠️ 플레이어 / 뱅커 / 타이 중 선택하세요.')], ...EPH });
  if (!bet || bet <= 0 || bet > userData.balance)
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLOR.red).setDescription('❌ 베팅 금액 오류')], ...EPH });

  await updateBalance(user.id, -bet, '바카라 베팅');

  const deck = createDeck();
  const pH = [deck.pop(), deck.pop()];
  const bH = [deck.pop(), deck.pop()];

  const mkButtons = () => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('bac_p').setLabel('플레이어 +카드').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('bac_b').setLabel('뱅커 +카드').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('bac_r').setLabel('결과 공개').setStyle(ButtonStyle.Success),
  );

  const progressEmbed = () => new EmbedBuilder()
    .setColor(COLOR.blue)
    .setTitle('🀄 바카라 진행 중')
    .addFields(
      { name: '👤 플레이어', value: handStr(pH), inline: true },
      { name: '🏦 뱅커',    value: handStr(bH), inline: true },
    )
    .setFooter({ text: `베팅: ${bet.toLocaleString()}원　│　${memberName}님의 선택: ${choice}` });

  const msg = await interaction.reply({ embeds: [progressEmbed()], components: [mkButtons()], fetchReply: true });
  const col = msg.createMessageComponentCollector({ filter: i => i.user.id === user.id, time: 120000 });

  col.on('collect', async i => {
    if (i.customId === 'bac_p') { pH.push(deck.pop()); await i.update({ embeds: [progressEmbed()] }); }
    if (i.customId === 'bac_b') { bH.push(deck.pop()); await i.update({ embeds: [progressEmbed()] }); }
    if (i.customId === 'bac_r') {
      const pv = pH.reduce((s, c) => s + cardValue(c), 0) % 10;
      const bv = bH.reduce((s, c) => s + cardValue(c), 0) % 10;
      const winner = pv > bv ? '플레이어' : bv > pv ? '뱅커' : '타이';

      let reward = 0, outcome;
      if (choice === winner)                         { reward = winner === '타이' ? bet * 8 : bet * 2; outcome = 'win'; }
      else if (winner === '타이' && choice !== '타이') { reward = bet; outcome = 'draw'; }
      else                                           { outcome = 'lose'; }

      if (reward > 0) await updateBalance(user.id, reward, `바카라 ${outcome}`);
      const balance = (await getUser(user.id)).balance;
      const net = outcome === 'win' ? reward - bet : outcome === 'draw' ? 0 : -bet;
      const pnl = net > 0 ? `+${net.toLocaleString()}원` : net < 0 ? `${net.toLocaleString()}원` : '±0원';
      const outcomeLabel = { win: '🏆 승리!', lose: '💀 패배', draw: '⚖️ 무승부' }[outcome];
      const colorMap = { win: COLOR.green, lose: COLOR.red, draw: COLOR.yellow };

      await i.update({
        embeds: [new EmbedBuilder()
          .setColor(colorMap[outcome])
          .setTitle(`🀄 바카라　　${outcomeLabel}`)
          .addFields(
            { name: '👤 플레이어', value: `${handStr(pH)}\n**${pv}점**`, inline: true },
            { name: '🏦 뱅커',    value: `${handStr(bH)}\n**${bv}점**`, inline: true },
            { name: '\u200b',    value: '\u200b',                        inline: true },
            { name: '승자',      value: `**${winner}**`,                 inline: true },
            { name: '내 선택',   value: choice,                          inline: true },
            { name: '\u200b',    value: '\u200b',                        inline: true },
            { name: '수익',      value: pnl,                             inline: true },
            { name: '잔고',      value: `${balance.toLocaleString()}원`, inline: true },
          )
          .setFooter({ text: `베팅: ${bet.toLocaleString()}원` })],
        components: [],
      });
      col.stop();
    }
  });

  col.on('end', async () => {
    try { await interaction.editReply({ components: [] }); } catch {}
  });
}
