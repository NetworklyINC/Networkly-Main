import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Integration tests for profile update flow
 * Tests the complete flow from user action to database update
 */

// Mock Prisma
const mockPrismaUser = {
  findUnique: vi.fn(),
  update: vi.fn(),
}

const mockPrismaAchievement = {
  create: vi.fn(),
  findMany: vi.fn(),
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: mockPrismaUser,
    achievement: mockPrismaAchievement,
    extracurricular: { findMany: vi.fn() },
    recommendation: { findMany: vi.fn() },
    connection: { findFirst: vi.fn() },
  },
}))

// Mock rate limiting
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ success: true, remaining: 99, reset: Date.now(), limit: 100 })
  ),
  createRateLimitKey: vi.fn((...args) => args.join(":")),
  RATE_LIMITS: {
    PROFILE_VIEW: { limit: 100, windowSeconds: 3600 },
    PROFILE_UPDATE: { limit: 30, windowSeconds: 3600 },
    API_CALL: { limit: 1000, windowSeconds: 3600 },
  },
}))

import { auth } from "@clerk/nextjs/server"

describe("Profile Update Flow Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("Complete Profile Update Flow", () => {
    it("should successfully update profile with all fields", async () => {
      // Setup mocks
      vi.mocked(auth).mockResolvedValueOnce({ userId: "clerk-123" } as any)

      const updatedUser = {
        id: "user-1",
        clerkId: "clerk-123",
        name: "John Doe",
        headline: "Senior Software Engineer",
        bio: "Passionate developer",
        location: "San Francisco, CA",
        university: "Stanford University",
        graduationYear: 2024,
        skills: ["React", "TypeScript"],
        interests: ["AI", "Web Dev"],
        linkedinUrl: "https://linkedin.com/in/johndoe",
        githubUrl: "https://github.com/johndoe",
        portfolioUrl: "https://johndoe.dev",
        visibility: "public",
      }

      mockPrismaUser.update.mockResolvedValueOnce(updatedUser)

      const { updateProfile } = await import("@/app/actions/profile")

      const result = await updateProfile({
        name: "John Doe",
        headline: "Senior Software Engineer",
        bio: "Passionate developer",
        location: "San Francisco, CA",
        university: "Stanford University",
        graduationYear: 2024,
        skills: ["React", "TypeScript"],
        interests: ["AI", "Web Dev"],
        linkedinUrl: "https://linkedin.com/in/johndoe",
        githubUrl: "https://github.com/johndoe",
        portfolioUrl: "https://johndoe.dev",
        visibility: "public",
      })

      expect(result).toEqual(updatedUser)
      expect(mockPrismaUser.update).toHaveBeenCalledTimes(1)
    })

    it("should handle partial updates", async () => {
      vi.mocked(auth).mockResolvedValueOnce({ userId: "clerk-123" } as any)

      mockPrismaUser.update.mockResolvedValueOnce({
        id: "user-1",
        name: "Updated Name",
      })

      const { updateProfile } = await import("@/app/actions/profile")

      const result = await updateProfile({ name: "Updated Name" })

      expect(result.name).toBe("Updated Name")
    })
  })

  describe("Profile Viewing Flow", () => {
    it("should track profile view for public profiles", async () => {
      vi.mocked(auth).mockResolvedValueOnce({ userId: "clerk-viewer" } as any)

      mockPrismaUser.findUnique
        .mockResolvedValueOnce({ id: "viewer-id" }) // current user lookup
        .mockResolvedValueOnce({
          // target user lookup
          id: "target-id",
          name: "Target User",
          visibility: "public",
          skills: [],
          interests: [],
        })

      mockPrismaUser.update.mockResolvedValueOnce({}) // profile view increment

      const mockAchievements: any[] = []
      const mockExtracurriculars: any[] = []
      const mockRecommendations: any[] = []

      const { prisma } = await import("@/lib/prisma")
      vi.mocked(prisma.achievement.findMany).mockResolvedValueOnce(mockAchievements)
      vi.mocked(prisma.extracurricular.findMany).mockResolvedValueOnce(mockExtracurriculars)
      vi.mocked(prisma.recommendation.findMany).mockResolvedValueOnce(mockRecommendations)

      const { getProfileByUserId } = await import("@/app/actions/profile")

      const result = await getProfileByUserId("target-id")

      expect(result).not.toBeNull()
      expect(result?.name).toBe("Target User")
      // View should have been incremented
      expect(mockPrismaUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "target-id" },
          data: expect.objectContaining({
            profileViews: { increment: 1 },
          }),
        })
      )
    })

    it("should not track view for own profile", async () => {
      vi.mocked(auth).mockResolvedValueOnce({ userId: "clerk-123" } as any)

      mockPrismaUser.findUnique
        .mockResolvedValueOnce({ id: "same-user" })
        .mockResolvedValueOnce({
          id: "same-user",
          name: "Self User",
          visibility: "public",
          skills: [],
          interests: [],
        })

      const { prisma } = await import("@/lib/prisma")
      vi.mocked(prisma.achievement.findMany).mockResolvedValueOnce([])
      vi.mocked(prisma.extracurricular.findMany).mockResolvedValueOnce([])
      vi.mocked(prisma.recommendation.findMany).mockResolvedValueOnce([])

      const { getProfileByUserId } = await import("@/app/actions/profile")

      await getProfileByUserId("same-user")

      // Update should NOT be called for own profile
      expect(mockPrismaUser.update).not.toHaveBeenCalled()
    })
  })

  describe("Profile Strength Calculation Flow", () => {
    it("should calculate strength based on filled fields", async () => {
      const completeProfile = {
        id: "user-1",
        name: "Complete User",
        headline: "Developer",
        bio: "About me",
        avatar: "https://example.com/avatar.jpg",
        location: "NYC",
        university: "MIT",
        graduationYear: 2024,
        skills: ["React", "TypeScript", "Node.js", "Python", "SQL"],
        interests: ["AI"],
        achievements: [{ id: "1" }],
        linkedinUrl: "https://linkedin.com/in/test",
        githubUrl: "https://github.com/test",
        portfolioUrl: "https://example.com",
      }

      mockPrismaUser.findUnique.mockResolvedValueOnce(completeProfile)

      const { calculateProfileStrength } = await import("@/app/actions/profile")

      const strength = await calculateProfileStrength("user-1")

      // All fields filled should give high score (capped at 100)
      expect(strength).toBeGreaterThanOrEqual(90)
      expect(strength).toBeLessThanOrEqual(100)
    })

    it("should return low score for incomplete profile", async () => {
      const incompleteProfile = {
        id: "user-1",
        name: "Incomplete User",
        skills: [],
        interests: [],
        achievements: [],
      }

      mockPrismaUser.findUnique.mockResolvedValueOnce(incompleteProfile)

      const { calculateProfileStrength } = await import("@/app/actions/profile")

      const strength = await calculateProfileStrength("user-1")

      // Only name filled = 5 points
      expect(strength).toBe(5)
    })
  })

  describe("Error Handling", () => {
    it("should handle database errors gracefully", async () => {
      vi.mocked(auth).mockResolvedValueOnce({ userId: "clerk-123" } as any)
      mockPrismaUser.update.mockRejectedValueOnce(new Error("Database error"))

      const { updateProfile } = await import("@/app/actions/profile")

      await expect(updateProfile({ name: "Test" })).rejects.toThrow("Database error")
    })

    it("should validate input data with Zod", async () => {
      vi.mocked(auth).mockResolvedValueOnce({ userId: "clerk-123" } as any)

      const { updateProfile } = await import("@/app/actions/profile")

      // Name too long (max 100)
      await expect(
        updateProfile({ name: "a".repeat(101) })
      ).rejects.toThrow()
    })
  })
})
