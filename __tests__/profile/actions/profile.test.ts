import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock Prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    achievement: {
      findMany: vi.fn(),
    },
    extracurricular: {
      findMany: vi.fn(),
    },
    recommendation: {
      findMany: vi.fn(),
    },
    connection: {
      findFirst: vi.fn(),
    },
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

import { prisma } from "@/lib/prisma"
import { auth } from "@clerk/nextjs/server"
import { checkRateLimit } from "@/lib/rate-limit"

describe("Profile Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("updateProfile", () => {
    it("should throw error if user is not authenticated", async () => {
      vi.mocked(auth).mockResolvedValueOnce({ userId: null } as any)

      const { updateProfile } = await import("@/app/actions/profile")

      await expect(updateProfile({ name: "Test" })).rejects.toThrow("Unauthorized")
    })

    it("should update user profile with valid data", async () => {
      vi.mocked(auth).mockResolvedValueOnce({ userId: "clerk-123" } as any)
      vi.mocked(prisma.user.update).mockResolvedValueOnce({
        id: "user-1",
        clerkId: "clerk-123",
        name: "Updated Name",
        email: "test@example.com",
      } as any)

      const { updateProfile } = await import("@/app/actions/profile")

      const result = await updateProfile({ name: "Updated Name" })

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { clerkId: "clerk-123" },
        data: expect.objectContaining({
          name: "Updated Name",
        }),
      })
      expect(result.name).toBe("Updated Name")
    })

    it("should throw error when rate limit exceeded", async () => {
      vi.mocked(auth).mockResolvedValueOnce({ userId: "clerk-123" } as any)
      vi.mocked(checkRateLimit).mockResolvedValueOnce({
        success: false,
        remaining: 0,
        reset: Date.now(),
        limit: 30,
      })

      const { updateProfile } = await import("@/app/actions/profile")

      await expect(updateProfile({ name: "Test" })).rejects.toThrow("Rate limit exceeded")
    })

    it("should validate URL fields and clean empty strings to null", async () => {
      vi.mocked(auth).mockResolvedValueOnce({ userId: "clerk-123" } as any)
      vi.mocked(prisma.user.update).mockResolvedValueOnce({
        id: "user-1",
        linkedinUrl: null,
        githubUrl: null,
        portfolioUrl: null,
      } as any)

      const { updateProfile } = await import("@/app/actions/profile")

      await updateProfile({
        linkedinUrl: "",
        githubUrl: "",
        portfolioUrl: "",
      })

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { clerkId: "clerk-123" },
        data: expect.objectContaining({
          linkedinUrl: null,
          githubUrl: null,
          portfolioUrl: null,
        }),
      })
    })
  })

  describe("getProfileByUserId", () => {
    it("should throw error if user is not authenticated", async () => {
      vi.mocked(auth).mockResolvedValueOnce({ userId: null } as any)

      const { getProfileByUserId } = await import("@/app/actions/profile")

      await expect(getProfileByUserId("user-1")).rejects.toThrow("Unauthorized")
    })

    it("should return null if target user does not exist", async () => {
      vi.mocked(auth).mockResolvedValueOnce({ userId: "clerk-123" } as any)
      vi.mocked(prisma.user.findUnique)
        .mockResolvedValueOnce({ id: "current-user" } as any) // current user
        .mockResolvedValueOnce(null) // target user not found

      const { getProfileByUserId } = await import("@/app/actions/profile")

      const result = await getProfileByUserId("nonexistent-user")

      expect(result).toBeNull()
    })

    it("should return null for private profiles when not owner", async () => {
      vi.mocked(auth).mockResolvedValueOnce({ userId: "clerk-123" } as any)
      vi.mocked(prisma.user.findUnique)
        .mockResolvedValueOnce({ id: "current-user" } as any)
        .mockResolvedValueOnce({
          id: "other-user",
          visibility: "private",
        } as any)

      const { getProfileByUserId } = await import("@/app/actions/profile")

      const result = await getProfileByUserId("other-user")

      expect(result).toBeNull()
    })

    it("should return profile data for public profiles", async () => {
      vi.mocked(auth).mockResolvedValueOnce({ userId: "clerk-123" } as any)
      vi.mocked(prisma.user.findUnique)
        .mockResolvedValueOnce({ id: "current-user" } as any)
        .mockResolvedValueOnce({
          id: "target-user",
          name: "Target User",
          visibility: "public",
          skills: ["React", "TypeScript"],
          interests: ["AI", "Web Dev"],
        } as any)
      vi.mocked(prisma.user.update).mockResolvedValueOnce({} as any)
      vi.mocked(prisma.achievement.findMany).mockResolvedValueOnce([])
      vi.mocked(prisma.extracurricular.findMany).mockResolvedValueOnce([])
      vi.mocked(prisma.recommendation.findMany).mockResolvedValueOnce([])

      const { getProfileByUserId } = await import("@/app/actions/profile")

      const result = await getProfileByUserId("target-user")

      expect(result).not.toBeNull()
      expect(result?.name).toBe("Target User")
      expect(result?.visibility).toBe("public")
    })
  })

  describe("calculateProfileStrength", () => {
    it("should return 0 if user does not exist", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null)

      const { calculateProfileStrength } = await import("@/app/actions/profile")

      const result = await calculateProfileStrength("nonexistent")

      expect(result).toBe(0)
    })

    it("should calculate score based on filled fields", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: "user-1",
        name: "Test User",
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
        portfolioUrl: null,
      } as any)

      const { calculateProfileStrength } = await import("@/app/actions/profile")

      const result = await calculateProfileStrength("user-1")

      // name(5) + headline(10) + bio(10) + avatar(5) + location(5) + university(5) 
      // + graduationYear(5) + skills>0(15) + skills>=5(5) + interests>0(10) 
      // + achievements>0(5) + linkedin(5) + github(5) = 90
      expect(result).toBe(90)
    })

    it("should cap score at 100", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: "user-1",
        name: "Test User",
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
      } as any)

      const { calculateProfileStrength } = await import("@/app/actions/profile")

      const result = await calculateProfileStrength("user-1")

      expect(result).toBeLessThanOrEqual(100)
    })
  })
})
