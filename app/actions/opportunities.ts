"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"

// ============================================================================
// GET OPPORTUNITIES
// ============================================================================

export async function getOpportunities() {
    const opportunities = await prisma.opportunity.findMany({
        orderBy: { deadline: "asc" },
    })

    return opportunities.map((opp) => ({
        id: opp.id,
        title: opp.title,
        company: opp.company,
        location: opp.location,
        type: opp.type,
        matchScore: opp.matchScore,
        deadline: formatDate(opp.deadline),
        postedDate: getRelativeTime(opp.postedDate),
        logo: opp.logo,
        skills: opp.skills,
        description: opp.description,
        salary: opp.salary,
        duration: opp.duration,
        remote: opp.remote,
        applicants: opp.applicants,
        saved: false, // Will be populated separately
    }))
}

export async function getOpportunitiesWithSaved() {
    const { userId } = await auth()

    const opportunities = await prisma.opportunity.findMany({
        orderBy: { deadline: "asc" },
        include: {
            savedBy: userId
                ? {
                    where: {
                        user: { clerkId: userId },
                    },
                }
                : false,
        },
    })

    return opportunities.map((opp) => ({
        id: opp.id,
        title: opp.title,
        company: opp.company,
        location: opp.location,
        type: opp.type,
        matchScore: opp.matchScore,
        deadline: formatDate(opp.deadline),
        postedDate: getRelativeTime(opp.postedDate),
        logo: opp.logo,
        skills: opp.skills,
        description: opp.description,
        salary: opp.salary,
        duration: opp.duration,
        remote: opp.remote,
        applicants: opp.applicants,
        saved: Array.isArray(opp.savedBy) && opp.savedBy.length > 0,
    }))
}

// ============================================================================
// SAVE / UNSAVE OPPORTUNITY
// ============================================================================

export async function toggleSaveOpportunity(opportunityId: string) {
    const { userId } = await auth()
    if (!userId) throw new Error("Unauthorized")

    const user = await prisma.user.findUnique({
        where: { clerkId: userId },
    })

    if (!user) throw new Error("User not found")

    // Check if already saved
    const existing = await prisma.savedOpportunity.findUnique({
        where: {
            userId_opportunityId: {
                userId: user.id,
                opportunityId,
            },
        },
    })

    if (existing) {
        // Unsave
        await prisma.savedOpportunity.delete({
            where: { id: existing.id },
        })
    } else {
        // Save
        await prisma.savedOpportunity.create({
            data: {
                userId: user.id,
                opportunityId,
            },
        })
    }

    revalidatePath("/opportunities")
    return !existing
}

export async function getSavedOpportunities() {
    const { userId } = await auth()
    if (!userId) throw new Error("Unauthorized")

    const user = await prisma.user.findUnique({
        where: { clerkId: userId },
    })

    if (!user) throw new Error("User not found")

    const savedOpportunities = await prisma.savedOpportunity.findMany({
        where: { userId: user.id },
        include: { opportunity: true },
        orderBy: { createdAt: "desc" },
    })

    return savedOpportunities.map((saved) => ({
        id: saved.opportunity.id,
        title: saved.opportunity.title,
        company: saved.opportunity.company,
        location: saved.opportunity.location,
        type: saved.opportunity.type,
        matchScore: saved.opportunity.matchScore,
        deadline: formatDate(saved.opportunity.deadline),
        logo: saved.opportunity.logo,
        skills: saved.opportunity.skills,
        description: saved.opportunity.description,
        salary: saved.opportunity.salary,
        duration: saved.opportunity.duration,
        remote: saved.opportunity.remote,
        applicants: saved.opportunity.applicants,
        saved: true,
    }))
}

// Helper functions
function formatDate(date: Date): string {
    return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    })
}

function getRelativeTime(date: Date): string {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffDays === 0) return "Today"
    if (diffDays === 1) return "1 day ago"
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
    return `${Math.floor(diffDays / 30)} months ago`
}
