"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"

// ============================================================================
// GET APPLICATIONS
// ============================================================================

export async function getApplications() {
    const { userId } = await auth()
    if (!userId) throw new Error("Unauthorized")

    const user = await prisma.user.findUnique({
        where: { clerkId: userId },
    })

    if (!user) throw new Error("User not found")

    const applications = await prisma.application.findMany({
        where: { userId: user.id },
        orderBy: { appliedDate: "desc" },
    })

    return applications.map((app) => ({
        id: app.id,
        company: app.company,
        position: app.position,
        status: app.status,
        appliedDate: formatDate(app.appliedDate),
        nextStep: app.nextStep,
    }))
}

// ============================================================================
// CREATE APPLICATION
// ============================================================================

export async function createApplication(data: {
    company: string
    position: string
    status?: string
    nextStep?: string
}) {
    const { userId } = await auth()
    if (!userId) throw new Error("Unauthorized")

    const user = await prisma.user.findUnique({
        where: { clerkId: userId },
    })

    if (!user) throw new Error("User not found")

    const application = await prisma.application.create({
        data: {
            company: data.company,
            position: data.position,
            status: data.status || "Applied",
            nextStep: data.nextStep || "Application submitted",
            userId: user.id,
        },
    })

    revalidatePath("/dashboard")
    return application
}

// ============================================================================
// UPDATE APPLICATION
// ============================================================================

export async function updateApplication(
    id: string,
    data: Partial<{
        status: string
        nextStep: string
    }>
) {
    const { userId } = await auth()
    if (!userId) throw new Error("Unauthorized")

    const application = await prisma.application.update({
        where: { id },
        data,
    })

    revalidatePath("/dashboard")
    return application
}

// ============================================================================
// DELETE APPLICATION
// ============================================================================

export async function deleteApplication(id: string) {
    const { userId } = await auth()
    if (!userId) throw new Error("Unauthorized")

    await prisma.application.delete({
        where: { id },
    })

    revalidatePath("/dashboard")
}

// Helper function
function formatDate(date: Date): string {
    return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    })
}
