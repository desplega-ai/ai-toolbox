import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  votes: defineTable({
    value: v.number(),      // 0-10 scale
    timestamp: v.number(),  // Date.now() in ms
  }).index("by_timestamp", ["timestamp"]),
});
