import { query } from "./_generated/server";

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const artists = await ctx.db.query("artists").collect();
    return artists.sort((a, b) => a.startMs - b.startMs);
  },
});
