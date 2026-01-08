"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@clerk/nextjs/server"

// ============================================================================
// GET CURRENT USER
// ============================================================================

export async function getCurrentUser() {
    const { userId } = await auth()
    if (!userId) return null

    const user = await prisma.user.findUnique({
        where: { clerkId: userId },
        include: {
            achievements: true,
            extracurriculars: true,
            analyticsData: true,
        },
    })

    if (!user) return null

    return {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        headline: user.headline,
        bio: user.bio,
        location: user.location,
        university: user.university,
        graduationYear: user.graduationYear,
        skills: user.skills,
        interests: user.interests,
        connections: user.connections,
        profileViews: user.profileViews,
        searchAppearances: user.searchAppearances,
        completedProjects: user.completedProjects,
        achievements: user.achievements.map((a) => ({
            id: a.id,
            title: a.title,
            date: a.date,
            icon: a.icon,
        })),
        extracurriculars: user.extracurriculars.map((e) => ({
            id: e.id,
            title: e.title,
            organization: e.organization,
            type: e.type,
            startDate: e.startDate,
            endDate: e.endDate,
            description: e.description,
            logo: e.logo,
        })),
    }
}

// ============================================================================
// GET USER ANALYTICS
// ============================================================================

export async function getUserAnalytics() {
    const { userId } = await auth()
    if (!userId) return null

    const user = await prisma.user.findUnique({
        where: { clerkId: userId },
        include: {
            analyticsData: true,
        },
    })

    if (!user || !user.analyticsData) {
        return {
            profileViews: [],
            networkGrowth: [],
            skillEndorsements: [],
        }
    }

    return {
        profileViews: user.analyticsData.profileViews as { date: string; views: number }[],
        networkGrowth: user.analyticsData.networkGrowth as { month: string; connections: number }[],
        skillEndorsements: user.analyticsData.skillEndorsements as { skill: string; count: number }[],
    }
}

// ============================================================================
// UPDATE USER PROFILE
// ============================================================================

export async function updateUserProfile(data: {
    name?: string
    headline?: string
    bio?: string
    location?: string
    university?: string
    graduationYear?: string
    skills?: string[]
    interests?: string[]
}) {
    const { userId } = await auth()
    if (!userId) throw new Error("Unauthorized")

    const user = await prisma.user.update({
        where: { clerkId: userId },
        data,
    })

    return user
}

// ============================================================================
// GET EVENTS
// ============================================================================

export async function getEvents() {
    const events = await prisma.event.findMany({
        orderBy: { createdAt: "desc" },
    })

    return events.map((event) => ({
        id: event.id,
        title: event.title,
        date: event.date,
        location: event.location,
        type: event.type,
        attendees: event.attendees,
        image: event.image,
    }))
}

// ============================================================================
// SYNC USER FROM CLERK
// ============================================================================

export async function syncUserFromClerk(clerkUser: {
    id: string
    emailAddresses: { emailAddress: string }[]
    firstName: string | null
    lastName: string | null
    imageUrl: string | null
}) {
    const email = clerkUser.emailAddresses[0]?.emailAddress
    const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || "User"

    const user = await prisma.user.upsert({
        where: { clerkId: clerkUser.id },
        update: {
            email,
            name,
            avatar: clerkUser.imageUrl,
        },
        create: {
            clerkId: clerkUser.id,
            email,
            name,
            avatar: clerkUser.imageUrl,
        },
    })

    return user
}
