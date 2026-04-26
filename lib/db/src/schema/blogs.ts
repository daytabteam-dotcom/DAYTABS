import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const blogsTable = pgTable("blogs", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  content: text("content").notNull().default(""),
  coverImage: text("cover_image"),
  viewCount: integer("view_count").notNull().default(0),
  likeCount: integer("like_count").notNull().default(0),
  commentCount: integer("comment_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const blogViewsTable = pgTable("blog_views", {
  id: serial("id").primaryKey(),
  blogId: integer("blog_id").notNull().references(() => blogsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  visitorId: text("visitor_id"),
  ipHash: text("ip_hash"),
  userAgentHash: text("user_agent_hash"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const blogLikesTable = pgTable("blog_likes", {
  id: serial("id").primaryKey(),
  blogId: integer("blog_id").notNull().references(() => blogsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  visitorId: text("visitor_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const blogCommentsTable = pgTable("blog_comments", {
  id: serial("id").primaryKey(),
  blogId: integer("blog_id").notNull().references(() => blogsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  parentCommentId: integer("parent_comment_id"),
  content: text("content").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Blog = typeof blogsTable.$inferSelect;
export type BlogView = typeof blogViewsTable.$inferSelect;
export type BlogLike = typeof blogLikesTable.$inferSelect;
export type BlogComment = typeof blogCommentsTable.$inferSelect;

