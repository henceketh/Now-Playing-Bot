/**
 * Handles the /god command to authorize a user.
 * @param {Function} authorizeUser - Function to authorize a user.
 * @returns {Function} - Telegraf command handler.
 */
const handleGodCommand = (authorizeUser) => {
    return async (ctx) => {
        try {
            const userId = ctx.from.id;
            await authorizeUser(userId);
            await ctx.reply('You are now authorized to fetch songs.');
        } catch (error) {
            console.error('Error authorizing user:', error);
            await ctx.reply('An error occurred while authorizing you.');
        }
    };
};

module.exports = {
    handleGodCommand,
};