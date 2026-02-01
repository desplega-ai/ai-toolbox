import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Submit a new vote
export const submitVote = mutation({
  args: { value: v.number() },
  handler: async (ctx, { value }) => {
    if (value < 0 || value > 10) {
      throw new Error("Vote must be between 0 and 10");
    }
    return await ctx.db.insert("votes", {
      value: Math.round(value), // Ensure integer
      timestamp: Date.now(),
    });
  },
});

// Get current stats (average and count)
export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const votes = await ctx.db.query("votes").collect();
    if (votes.length === 0) {
      return { average: null, count: 0 };
    }
    const sum = votes.reduce((acc, vote) => acc + vote.value, 0);
    return {
      average: sum / votes.length,
      count: votes.length,
    };
  },
});

// Get daily averages for chart (last N days)
export const getDailyAverages = query({
  args: { daysBack: v.number() },
  handler: async (ctx, { daysBack }) => {
    const now = Date.now();
    const msPerDay = 24 * 60 * 60 * 1000;
    const startTime = now - daysBack * msPerDay;

    const votes = await ctx.db
      .query("votes")
      .withIndex("by_timestamp", (q) => q.gte("timestamp", startTime))
      .collect();

    // Group by day (UTC)
    const dailyBuckets: Map<string, number[]> = new Map();

    for (const vote of votes) {
      const date = new Date(vote.timestamp);
      const dayKey = date.toISOString().split("T")[0]; // YYYY-MM-DD
      if (!dailyBuckets.has(dayKey)) {
        dailyBuckets.set(dayKey, []);
      }
      dailyBuckets.get(dayKey)!.push(vote.value);
    }

    // Calculate averages and format for chart
    return Array.from(dailyBuckets.entries())
      .map(([date, values]) => ({
        date,
        average: values.reduce((a, b) => a + b, 0) / values.length,
        count: values.length,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  },
});

// Get all-time daily averages for full history modal
export const getAllDailyAverages = query({
  args: {},
  handler: async (ctx) => {
    const votes = await ctx.db.query("votes").collect();

    if (votes.length === 0) {
      return [];
    }

    // Group by day (UTC)
    const dailyBuckets: Map<string, number[]> = new Map();

    for (const vote of votes) {
      const date = new Date(vote.timestamp);
      const dayKey = date.toISOString().split("T")[0];
      if (!dailyBuckets.has(dayKey)) {
        dailyBuckets.set(dayKey, []);
      }
      dailyBuckets.get(dayKey)!.push(vote.value);
    }

    return Array.from(dailyBuckets.entries())
      .map(([date, values]) => ({
        date,
        average: values.reduce((a, b) => a + b, 0) / values.length,
        count: values.length,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  },
});

// Seed historical data for testing
export const seedHistoricalData = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const msPerDay = 24 * 60 * 60 * 1000;

    // Create 30 days of historical data with varying sentiment
    const historicalPattern = [
      // Week 1: Starting optimistic (NO/Low-key)
      { day: 30, votes: [2, 3, 2, 4, 3, 2, 3, 2, 4, 3] },
      { day: 29, votes: [3, 2, 4, 3, 2, 3, 4, 2, 3, 2] },
      { day: 28, votes: [2, 4, 3, 3, 4, 2, 3, 4, 3, 2] },
      { day: 27, votes: [3, 4, 3, 4, 5, 3, 4, 3, 4, 3] },
      { day: 26, votes: [4, 3, 5, 4, 4, 5, 3, 4, 5, 4] },
      { day: 25, votes: [4, 5, 4, 5, 4, 5, 4, 5, 4, 5] },
      { day: 24, votes: [5, 4, 5, 6, 5, 4, 5, 6, 5, 4] },
      // Week 2: Rising concern (Low-key to High-key)
      { day: 23, votes: [5, 5, 6, 5, 6, 5, 5, 6, 5, 6] },
      { day: 22, votes: [5, 6, 5, 6, 6, 5, 6, 5, 6, 6] },
      { day: 21, votes: [6, 5, 6, 6, 7, 6, 5, 6, 6, 7] },
      { day: 20, votes: [6, 6, 7, 6, 6, 7, 6, 6, 7, 6] },
      { day: 19, votes: [6, 7, 6, 7, 6, 7, 7, 6, 7, 6] },
      { day: 18, votes: [7, 6, 7, 7, 6, 7, 7, 8, 7, 6] },
      { day: 17, votes: [7, 7, 8, 7, 7, 8, 7, 7, 8, 7] },
      // Week 3: Peak doom (High-key to YES)
      { day: 16, votes: [7, 8, 7, 8, 8, 7, 8, 8, 7, 8] },
      { day: 15, votes: [8, 7, 8, 8, 9, 8, 7, 8, 8, 9] },
      { day: 14, votes: [8, 8, 9, 8, 8, 9, 8, 9, 8, 8] },
      { day: 13, votes: [8, 9, 8, 9, 9, 8, 9, 8, 9, 9] },
      { day: 12, votes: [9, 8, 9, 9, 8, 9, 9, 10, 9, 8] },
      { day: 11, votes: [9, 9, 10, 9, 9, 8, 9, 9, 10, 9] },
      { day: 10, votes: [9, 10, 9, 9, 10, 9, 9, 10, 9, 9] },
      // Week 4: Recovery (YES back to High-key)
      { day: 9, votes: [9, 9, 8, 9, 9, 8, 9, 8, 9, 9] },
      { day: 8, votes: [8, 9, 8, 8, 9, 8, 8, 9, 8, 8] },
      { day: 7, votes: [8, 8, 7, 8, 8, 7, 8, 8, 7, 8] },
      { day: 6, votes: [7, 8, 7, 7, 8, 7, 7, 8, 7, 7] },
      { day: 5, votes: [7, 7, 6, 7, 7, 6, 7, 7, 6, 7] },
      { day: 4, votes: [6, 7, 6, 7, 6, 7, 6, 7, 6, 7] },
      { day: 3, votes: [6, 6, 7, 6, 6, 5, 6, 6, 7, 6] },
      { day: 2, votes: [5, 6, 6, 5, 6, 6, 5, 6, 5, 6] },
      { day: 1, votes: [5, 6, 5, 6, 5, 6, 5, 6, 5, 5] },
    ];

    let insertedCount = 0;

    for (const dayData of historicalPattern) {
      const dayTimestamp = now - dayData.day * msPerDay;

      for (let i = 0; i < dayData.votes.length; i++) {
        // Spread votes throughout the day
        const voteTimestamp = dayTimestamp + (i * msPerDay) / dayData.votes.length;

        await ctx.db.insert("votes", {
          value: dayData.votes[i],
          timestamp: voteTimestamp,
        });
        insertedCount++;
      }
    }

    return { inserted: insertedCount };
  },
});
