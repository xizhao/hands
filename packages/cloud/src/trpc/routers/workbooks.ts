import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../index";
import {
  workbooks,
  workbookCollaborators,
  workbookRepos,
  ROLES,
  type RoleType,
} from "../../schema/workbooks";
import { users } from "../../schema/users";
import { eq, and, or, sql } from "drizzle-orm";

export const workbooksRouter = router({
  // List user's workbooks (owned or collaborated)
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;

      // Get workbooks where user is owner
      const owned = await ctx.db
        .select()
        .from(workbooks)
        .where(eq(workbooks.ownerId, ctx.user.id))
        .limit(limit)
        .offset(offset);

      // Get workbooks where user is collaborator (excluding ones they own)
      const ownedIds = owned.map((w) => w.id);
      const collaborated = ownedIds.length > 0
        ? await ctx.db
            .select({
              workbook: workbooks,
              role: workbookCollaborators.role,
            })
            .from(workbookCollaborators)
            .innerJoin(workbooks, eq(workbookCollaborators.workbookId, workbooks.id))
            .where(
              and(
                eq(workbookCollaborators.userId, ctx.user.id),
                // Exclude workbooks user owns (to avoid duplicates)
                sql`${workbooks.id} NOT IN (${sql.join(ownedIds.map(id => sql`${id}`), sql`, `)})`
              )
            )
            .limit(limit)
        : await ctx.db
            .select({
              workbook: workbooks,
              role: workbookCollaborators.role,
            })
            .from(workbookCollaborators)
            .innerJoin(workbooks, eq(workbookCollaborators.workbookId, workbooks.id))
            .where(eq(workbookCollaborators.userId, ctx.user.id))
            .limit(limit);

      // Combine and dedupe
      const allWorkbooks = [
        ...owned.map((w) => ({ ...w, role: "owner" as RoleType })),
        ...collaborated.map((c) => ({ ...c.workbook, role: c.role as RoleType })),
      ];

      return {
        workbooks: allWorkbooks.slice(0, limit),
        hasMore: allWorkbooks.length > limit,
      };
    }),

  // Get workbook by ID or slug
  get: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid().optional(),
        slug: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      if (!input.id && !input.slug) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Must provide id or slug",
        });
      }

      const workbook = await ctx.db
        .select()
        .from(workbooks)
        .where(input.id ? eq(workbooks.id, input.id) : eq(workbooks.slug, input.slug!))
        .limit(1)
        .then((rows) => rows[0]);

      if (!workbook) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Check access
      const hasAccess =
        workbook.ownerId === ctx.user.id ||
        workbook.isPublic ||
        (await ctx.db
          .select()
          .from(workbookCollaborators)
          .where(
            and(
              eq(workbookCollaborators.workbookId, workbook.id),
              eq(workbookCollaborators.userId, ctx.user.id)
            )
          )
          .limit(1)
          .then((rows) => rows.length > 0));

      if (!hasAccess) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Get collaborators
      const collaborators = await ctx.db
        .select({
          id: workbookCollaborators.id,
          userId: workbookCollaborators.userId,
          role: workbookCollaborators.role,
          invitedAt: workbookCollaborators.invitedAt,
          user: {
            email: users.email,
            name: users.name,
            avatarUrl: users.avatarUrl,
          },
        })
        .from(workbookCollaborators)
        .innerJoin(users, eq(workbookCollaborators.userId, users.id))
        .where(eq(workbookCollaborators.workbookId, workbook.id));

      // Get repo info
      const repo = await ctx.db
        .select()
        .from(workbookRepos)
        .where(eq(workbookRepos.workbookId, workbook.id))
        .limit(1)
        .then((rows) => rows[0]);

      return { ...workbook, collaborators, repo };
    }),

  // Create new workbook
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        slug: z.string().min(3).max(50).regex(/^[a-z0-9-]+$/),
        isPublic: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check slug availability
      const existing = await ctx.db
        .select()
        .from(workbooks)
        .where(eq(workbooks.slug, input.slug))
        .limit(1)
        .then((rows) => rows[0]);

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Slug already taken",
        });
      }

      const workbook = await ctx.db
        .insert(workbooks)
        .values({
          ownerId: ctx.user.id,
          name: input.name,
          slug: input.slug,
          isPublic: input.isPublic,
        })
        .returning()
        .then((rows) => rows[0]);

      // Add owner as collaborator with owner role
      await ctx.db.insert(workbookCollaborators).values({
        workbookId: workbook.id,
        userId: ctx.user.id,
        role: "owner",
      });

      return workbook;
    }),

  // Update workbook
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(100).optional(),
        isPublic: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const workbook = await ctx.db
        .select()
        .from(workbooks)
        .where(eq(workbooks.id, input.id))
        .limit(1)
        .then((rows) => rows[0]);

      if (!workbook) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Only owner can update
      if (workbook.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      await ctx.db
        .update(workbooks)
        .set({
          name: input.name ?? workbook.name,
          isPublic: input.isPublic ?? workbook.isPublic,
          updatedAt: new Date(),
        })
        .where(eq(workbooks.id, input.id));

      return { success: true };
    }),

  // Delete workbook
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const workbook = await ctx.db
        .select()
        .from(workbooks)
        .where(eq(workbooks.id, input.id))
        .limit(1)
        .then((rows) => rows[0]);

      if (!workbook) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (workbook.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Delete workbook (cascades to collaborators and repos)
      await ctx.db.delete(workbooks).where(eq(workbooks.id, input.id));

      return { success: true };
    }),

  // Collaborator management
  collaborators: router({
    // Invite collaborator
    invite: protectedProcedure
      .input(
        z.object({
          workbookId: z.string().uuid(),
          email: z.string().email(),
          role: z.enum(["viewer", "editor", "developer"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Check workbook exists and user has permission
        const workbook = await ctx.db
          .select()
          .from(workbooks)
          .where(eq(workbooks.id, input.workbookId))
          .limit(1)
          .then((rows) => rows[0]);

        if (!workbook) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        // Only owner can invite
        if (workbook.ownerId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        // Find user by email
        const invitee = await ctx.db
          .select()
          .from(users)
          .where(eq(users.email, input.email))
          .limit(1)
          .then((rows) => rows[0]);

        if (!invitee) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User not found. They need to sign up first.",
          });
        }

        // Check if already a collaborator
        const existing = await ctx.db
          .select()
          .from(workbookCollaborators)
          .where(
            and(
              eq(workbookCollaborators.workbookId, input.workbookId),
              eq(workbookCollaborators.userId, invitee.id)
            )
          )
          .limit(1)
          .then((rows) => rows[0]);

        if (existing) {
          // Update role
          await ctx.db
            .update(workbookCollaborators)
            .set({ role: input.role })
            .where(eq(workbookCollaborators.id, existing.id));
        } else {
          // Add collaborator
          await ctx.db.insert(workbookCollaborators).values({
            workbookId: input.workbookId,
            userId: invitee.id,
            role: input.role,
            invitedBy: ctx.user.id,
          });
        }

        return { success: true };
      }),

    // Remove collaborator
    remove: protectedProcedure
      .input(
        z.object({
          workbookId: z.string().uuid(),
          userId: z.string().uuid(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const workbook = await ctx.db
          .select()
          .from(workbooks)
          .where(eq(workbooks.id, input.workbookId))
          .limit(1)
          .then((rows) => rows[0]);

        if (!workbook) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        // Only owner can remove
        if (workbook.ownerId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        // Can't remove owner
        if (input.userId === workbook.ownerId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot remove owner",
          });
        }

        await ctx.db
          .delete(workbookCollaborators)
          .where(
            and(
              eq(workbookCollaborators.workbookId, input.workbookId),
              eq(workbookCollaborators.userId, input.userId)
            )
          );

        return { success: true };
      }),
  }),

  // Get available roles
  roles: protectedProcedure.query(async () => {
    return Object.entries(ROLES).map(([key, role]) => ({
      id: key,
      ...role,
    }));
  }),
});
