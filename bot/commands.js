function handleGodCommand(authorizeUser, allowedUserIds) {
  return async ctx => {
    if (!allowedUserIds.includes(ctx.from.id)) return ctx.reply('Access is restricted by the bot owner.');
    try {
      await authorizeUser(ctx.from.id);
      await ctx.reply('You are now authorized to fetch songs.');
    } catch {
      console.error('Could not save user authorization.');
      await ctx.reply('Could not authorize you. Please try again.');
    }
  };
}

module.exports = { handleGodCommand };
