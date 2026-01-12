"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@clerk/nextjs/server"
import { z } from "zod"
import { revalidatePath } from "next/cache"
import { checkRateLimit, createRateLimitKey, RATE_LIMITS } from "@/lib/rate-limit"

const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  headline: z.string().max(200).optional(),
  bio: z.string().max(5000).optional(),
  location: z.string().max(100).optional(),
  university: z.string().max(100).optional(),
  graduationYear: z.number().int().min(1900).max(2100).optional(),
  skills: z.array(z.string().max(50)).max(50).optional(),
  interests: z.array(z.string().max(50)).max(50).optional(),
  linkedinUrl: z.string().url().optional().or(z.literal("")),
  githubUrl: z.string().url().optional().or(z.literal("")),
  portfolioUrl: z.string().url().optional().or(z.literal("")),
  visibility: z.enum(["public", "private", "connections"]).optional(),
})

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>

export async function updateProfile(data: UpdateProfileInput) {
  const { userId } = await auth()
  if (!userId) throw new Error("Unauthorized")

  // Rate limit profile updates
  const rateLimitKey = createRateLimitKey("PROFILE_UPDATE", userId)
  const rateLimit = await checkRateLimit(
    rateLimitKey,
    RATE_LIMITS.PROFILE_UPDATE.limit,
    RATE_LIMITS.PROFILE_UPDATE.windowSeconds
  )

  if (!rateLimit.success) {
    throw new Error(
      `Rate limit exceeded. You can update your profile ${RATE_LIMITS.PROFILE_UPDATE.limit} times per hour. Try again later.`
    )
  }

  const validatedData = updateProfileSchema.parse(data)

  // Clean up empty strings to null for URL fields
  const cleanedData = {
    ...validatedData,
    linkedinUrl: validatedData.linkedinUrl || null,
    githubUrl: validatedData.githubUrl || null,
    portfolioUrl: validatedData.portfolioUrl || null,
    profileUpdatedAt: new Date(),
  }

  const user = await prisma.user.update({
    where: { clerkId: userId },
    data: cleanedData as any,
  })

  revalidatePath("/profile")
  revalidatePath("/settings")
  return user
}

export async function getProfileByUserId(userId: string, viewerIp?: string) {
  const { userId: currentUserId } = await auth()
  if (!currentUserId) throw new Error("Unauthorized")

  const currentUser = await prisma.user.findUnique({
    where: { clerkId: currentUserId },
    select: { id: true },
  })

  if (!currentUser) throw new Error("User not found")

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
  })

  if (!targetUser) return null

  const visibility = (targetUser as any).visibility || "public"

  if (visibility === "private" && targetUser.id !== currentUser.id) {
    return null
  }

  if (visibility === "connections" && targetUser.id !== currentUser.id) {
    const connection = await prisma.connection.findFirst({
      where: {
        OR: [
          { requesterId: currentUser.id, receiverId: targetUser.id, status: "accepted" },
          { requesterId: targetUser.id, receiverId: currentUser.id, status: "accepted" },
        ],
      },
    })
    if (!connection) return null
  }

  // Rate limit and track profile views for non-owners
  if (targetUser.id !== currentUser.id && visibility === "public") {
    // Rate limit profile views to prevent abuse
    const identifier = viewerIp || currentUser.id
    const rateLimitKey = createRateLimitKey("PROFILE_VIEW", identifier, userId)
    const rateLimit = await checkRateLimit(
      rateLimitKey,
      RATE_LIMITS.PROFILE_VIEW.limit,
      RATE_LIMITS.PROFILE_VIEW.windowSeconds
    )

    // Only increment view count if within rate limit
    if (rateLimit.success) {
      await prisma.user.update({
        where: { id: userId },
        data: { 
          profileViews: { increment: 1 },
          lastViewedAt: new Date(),
        },
      })
    }
  }

  // Get related data
  const achievements = await prisma.achievement.findMany({
    where: { userId: targetUser.id },
    select: { id: true, title: true, date: true, icon: true },
  })

  const extracurriculars = await prisma.extracurricular.findMany({
    where: { userId: targetUser.id },
    select: {
      id: true,
      title: true,
      organization: true,
      type: true,
      startDate: true,
      endDate: true,
      description: true,
      logo: true,
    },
  })

  const recommendations = await prisma.recommendation.findMany({
    where: { receiverId: targetUser.id },
    select: {
      id: true,
      content: true,
      authorName: true,
      authorRole: true,
      authorAvatar: true,
      date: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  })

  return {
    id: targetUser.id,
    name: targetUser.name,
    avatar: targetUser.avatar,
    headline: targetUser.headline,
    bio: targetUser.bio,
    location: targetUser.location,
    university: targetUser.university,
    graduationYear: targetUser.graduationYear?.toString() || null,
    skills: targetUser.skills,
    interests: targetUser.interests,
    connections: targetUser.connections,
    profileViews: targetUser.profileViews,
    searchAppearances: targetUser.searchAppearances,
    completedProjects: targetUser.completedProjects,
    visibility,
    linkedinUrl: (targetUser as any).linkedinUrl || null,
    githubUrl: (targetUser as any).githubUrl || null,
    portfolioUrl: (targetUser as any).portfolioUrl || null,
    createdAt: targetUser.createdAt,
    achievements,
    extracurriculars,
    recommendationsReceived: recommendations,
  }
}

export async function calculateProfileStrength(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      achievements: true,
    },
  })

  if (!user) return 0

  let score = 0
  const checks = [
    { field: user.name, weight: 5 },
    { field: user.headline, weight: 10 },
    { field: user.bio, weight: 10 },
    { field: user.avatar, weight: 5 },
    { field: user.location, weight: 5 },
    { field: user.university, weight: 5 },
    { field: user.graduationYear, weight: 5 },
    { field: user.skills.length > 0, weight: 15 },
    { field: user.skills.length >= 5, weight: 5 },
    { field: user.interests.length > 0, weight: 10 },
    { field: user.achievements.length > 0, weight: 5 },
    { field: (user as any).linkedinUrl, weight: 5 },
    { field: (user as any).githubUrl, weight: 5 },
    { field: (user as any).portfolioUrl, weight: 5 },
  ]

  checks.forEach(({ field, weight }) => {
    if (field) score += weight
  })

  return Math.min(score, 100)
}

export async function updateProfileCompleteness() {
  const { userId } = await auth()
  if (!userId) throw new Error("Unauthorized")

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { id: true },
  })

  if (!user) throw new Error("User not found")

  const strength = await calculateProfileStrength(user.id)

  await prisma.user.update({
    where: { id: user.id },
    data: { isProfileComplete: strength >= 80 } as any,
  })

  return strength
}
