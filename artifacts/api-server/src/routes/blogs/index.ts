import { Router, type Request } from "express";
import crypto from "crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db, blogsTable, blogCommentsTable, blogLikesTable, blogViewsTable } from "@workspace/db";
import { optionalAuth, requireAuth } from "../../middlewares/auth";

const router = Router();

function asString(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function normalizeSlug(input: string) {
  const slug = input.trim().toLowerCase();
  if (!slug || slug.includes("..") || slug.includes("/") || slug.length > 200) {
    throw new Error("Invalid blog slug");
  }
  return slug;
}

function slugParam(req: Request) {
  const raw = req.params.slug;
  return normalizeSlug(Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? ""));
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function requestIp(req: Request) {
  return asString(req.headers["x-forwarded-for"] || req.ip).split(",")[0].trim();
}

async function getOrCreateBlog(slug: string, input?: { title?: string; description?: string; content?: string; coverImage?: string | null }) {
  const [existing] = await db.select().from(blogsTable).where(eq(blogsTable.slug, slug)).limit(1);
  const title = asString(input?.title).trim();
  if (existing && !title) return existing;
  if (!existing && !title) throw new Error("Blog title is required");

  const description = asString(input?.description).trim();
  const content = asString(input?.content);
  const coverImage = input?.coverImage == null ? null : asString(input.coverImage).trim() || null;
  const now = new Date();

  const [row] = await db
    .insert(blogsTable)
    .values({
      slug,
      title,
      description,
      content,
      coverImage,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: blogsTable.slug,
      set: {
        title,
        description,
        content,
        coverImage,
        updatedAt: now,
      },
    })
    .returning();

  if (!row) throw new Error("Failed to save blog");
  return row;
}

async function likedByIdentity(blogId: number, userId: number | null, visitorId: string | null) {
  if (userId) {
    const [existing] = await db
      .select({ id: blogLikesTable.id })
      .from(blogLikesTable)
      .where(and(eq(blogLikesTable.blogId, blogId), eq(blogLikesTable.userId, userId)))
      .limit(1);
    return Boolean(existing);
  }
  if (visitorId) {
    const [existing] = await db
      .select({ id: blogLikesTable.id })
      .from(blogLikesTable)
      .where(and(eq(blogLikesTable.blogId, blogId), eq(blogLikesTable.visitorId, visitorId), isNull(blogLikesTable.userId)))
      .limit(1);
    return Boolean(existing);
  }
  return false;
}

router.post("/slug/:slug/view", optionalAuth, async (req, res) => {
  try {
    const slug = slugParam(req);
    const visitorId = asString(req.body?.visitorId || req.cookies?.daytabs_visitor_id).trim() || null;
    const userId = req.auth?.user_id ?? null;
    if (!userId && !visitorId) {
      res.status(400).json({ error: "visitorId is required" });
      return;
    }

    const blog = await getOrCreateBlog(slug, {
      title: req.body?.blog?.title,
      description: req.body?.blog?.description,
      content: req.body?.blog?.content,
      coverImage: typeof req.body?.blog?.coverImage === "string" ? req.body.blog.coverImage : null,
    });

    const now = Date.now();
    const windowStart = new Date(now - 24 * 60 * 60 * 1000);
    const ipHash = sha256(requestIp(req));
    const uaHash = sha256(asString(req.headers["user-agent"]));

    const viewWhere = userId
      ? and(
          eq(blogViewsTable.blogId, blog.id),
          eq(blogViewsTable.userId, userId),
          gt(blogViewsTable.createdAt, windowStart),
        )
      : and(
          eq(blogViewsTable.blogId, blog.id),
          eq(blogViewsTable.visitorId, visitorId!),
          isNull(blogViewsTable.userId),
          gt(blogViewsTable.createdAt, windowStart),
        );

    const [recent] = await db.select({ id: blogViewsTable.id }).from(blogViewsTable).where(viewWhere).limit(1);
    if (!recent) {
      await db.insert(blogViewsTable).values({
        blogId: blog.id,
        userId,
        visitorId,
        ipHash,
        userAgentHash: uaHash,
      });
      await db.update(blogsTable).set({
        viewCount: sql`${blogsTable.viewCount} + 1`,
        updatedAt: new Date(),
      }).where(eq(blogsTable.id, blog.id));
    }

    const [fresh] = await db.select().from(blogsTable).where(eq(blogsTable.id, blog.id)).limit(1);
    const liked = await likedByIdentity(blog.id, userId, visitorId);

    res.json({
      blog: fresh ?? blog,
      stats: {
        viewCount: (fresh ?? blog).viewCount,
        likeCount: (fresh ?? blog).likeCount,
        commentCount: (fresh ?? blog).commentCount,
        likedByMe: liked,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to record view" });
  }
});

router.post("/slug/:slug/like", optionalAuth, async (req, res) => {
  try {
    const slug = slugParam(req);
    const visitorId = asString(req.body?.visitorId || req.cookies?.daytabs_visitor_id).trim() || null;
    const userId = req.auth?.user_id ?? null;
    if (!userId && !visitorId) {
      res.status(400).json({ error: "visitorId is required" });
      return;
    }

    const blog = await getOrCreateBlog(slug, {
      title: req.body?.blog?.title,
      description: req.body?.blog?.description,
      content: req.body?.blog?.content,
      coverImage: typeof req.body?.blog?.coverImage === "string" ? req.body.blog.coverImage : null,
    });

    const likeWhere = userId
      ? and(eq(blogLikesTable.blogId, blog.id), eq(blogLikesTable.userId, userId))
      : and(eq(blogLikesTable.blogId, blog.id), eq(blogLikesTable.visitorId, visitorId!), isNull(blogLikesTable.userId));

    const [existing] = await db
      .select({ id: blogLikesTable.id })
      .from(blogLikesTable)
      .where(likeWhere)
      .limit(1);

    if (existing) {
      await db.delete(blogLikesTable).where(eq(blogLikesTable.id, existing.id));
      await db.update(blogsTable).set({
        likeCount: sql`GREATEST(${blogsTable.likeCount} - 1, 0)`,
        updatedAt: new Date(),
      }).where(eq(blogsTable.id, blog.id));
    } else {
      await db.insert(blogLikesTable).values({
        blogId: blog.id,
        userId,
        visitorId,
      });
      await db.update(blogsTable).set({
        likeCount: sql`${blogsTable.likeCount} + 1`,
        updatedAt: new Date(),
      }).where(eq(blogsTable.id, blog.id));
    }

    const [fresh] = await db.select().from(blogsTable).where(eq(blogsTable.id, blog.id)).limit(1);
    const liked = await likedByIdentity(blog.id, userId, visitorId);

    res.json({
      blog: fresh ?? blog,
      stats: {
        viewCount: (fresh ?? blog).viewCount,
        likeCount: (fresh ?? blog).likeCount,
        commentCount: (fresh ?? blog).commentCount,
        likedByMe: liked,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to toggle like" });
  }
});

router.get("/slug/:slug/comments", async (req, res) => {
  try {
    const slug = slugParam(req);
    const [blog] = await db.select({ id: blogsTable.id }).from(blogsTable).where(eq(blogsTable.slug, slug)).limit(1);
    if (!blog) {
      res.json({ comments: [] });
      return;
    }
    const comments = await db
      .select({
        id: blogCommentsTable.id,
        blogId: blogCommentsTable.blogId,
        userId: blogCommentsTable.userId,
        parentCommentId: blogCommentsTable.parentCommentId,
        content: blogCommentsTable.content,
        createdAt: blogCommentsTable.createdAt,
      })
      .from(blogCommentsTable)
      .where(and(eq(blogCommentsTable.blogId, blog.id), eq(blogCommentsTable.status, "approved")))
      .orderBy(desc(blogCommentsTable.createdAt))
      .limit(200);
    res.json({ comments });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load comments" });
  }
});

router.post("/slug/:slug/comments", requireAuth, async (req, res) => {
  try {
    const slug = slugParam(req);
    const visitorId = asString(req.body?.visitorId || req.cookies?.daytabs_visitor_id).trim() || null;
    const blog = await getOrCreateBlog(slug, {
      title: req.body?.blog?.title,
      description: req.body?.blog?.description,
      content: req.body?.blog?.content,
      coverImage: typeof req.body?.blog?.coverImage === "string" ? req.body.blog.coverImage : null,
    });

    const commentContent = asString(req.body?.content).trim();
    if (commentContent.length < 1) {
      res.status(400).json({ error: "Comment content is required" });
      return;
    }
    if (commentContent.length > 4000) {
      res.status(400).json({ error: "Comment is too long" });
      return;
    }

    const parentCommentIdRaw = req.body?.parentCommentId;
    const parentCommentId = parentCommentIdRaw == null ? null : Number(parentCommentIdRaw);
    if (parentCommentId != null && (!Number.isInteger(parentCommentId) || parentCommentId <= 0)) {
      res.status(400).json({ error: "Invalid parentCommentId" });
      return;
    }

    const now = new Date();
    const [comment] = await db
      .insert(blogCommentsTable)
      .values({
        blogId: blog.id,
        userId: req.auth!.user_id,
        parentCommentId,
        content: commentContent,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    res.json({ comment, status: "pending", visitorId });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to add comment" });
  }
});

export default router;
