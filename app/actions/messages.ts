"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"

// ============================================================================
// GET MESSAGES
// ============================================================================

export async function getMessages() {
    const { userId } = await auth()
    if (!userId) throw new Error("Unauthorized")

    const user = await prisma.user.findUnique({
        where: { clerkId: userId },
    })

    if (!user) throw new Error("User not found")

    const messages = await prisma.message.findMany({
        where: {
            OR: [{ senderId: user.id }, { receiverId: user.id }],
        },
        include: {
            sender: true,
            receiver: true,
        },
        orderBy: { createdAt: "desc" },
    })

    return messages.map((msg) => ({
        id: msg.id,
        senderId: msg.senderId,
        senderName: msg.sender.name,
        senderAvatar: msg.sender.avatar,
        preview: msg.preview || msg.content.substring(0, 80) + "...",
        timestamp: getRelativeTime(msg.createdAt),
        unread: msg.unread && msg.receiverId === user.id,
    }))
}

export async function getConversation(otherUserId: string) {
    const { userId } = await auth()
    if (!userId) throw new Error("Unauthorized")

    const user = await prisma.user.findUnique({
        where: { clerkId: userId },
    })

    if (!user) throw new Error("User not found")

    const messages = await prisma.message.findMany({
        where: {
            OR: [
                { senderId: user.id, receiverId: otherUserId },
                { senderId: otherUserId, receiverId: user.id },
            ],
        },
        include: {
            sender: true,
        },
        orderBy: { createdAt: "asc" },
    })

    // Mark messages as read
    await prisma.message.updateMany({
        where: {
            senderId: otherUserId,
            receiverId: user.id,
            unread: true,
        },
        data: { unread: false },
    })

    return messages.map((msg) => ({
        id: msg.id,
        content: msg.content,
        senderId: msg.senderId,
        senderName: msg.sender.name,
        senderAvatar: msg.sender.avatar,
        isOwn: msg.senderId === user.id,
        timestamp: formatMessageTime(msg.createdAt),
    }))
}

// ============================================================================
// SEND MESSAGE
// ============================================================================

export async function sendMessage(receiverId: string, content: string) {
    const { userId } = await auth()
    if (!userId) throw new Error("Unauthorized")

    const user = await prisma.user.findUnique({
        where: { clerkId: userId },
    })

    if (!user) throw new Error("User not found")

    const message = await prisma.message.create({
        data: {
            content,
            senderId: user.id,
            receiverId,
            preview: content.substring(0, 80),
            unread: true,
        },
    })

    revalidatePath("/network")
    return message
}

// ============================================================================
// MARK AS READ
// ============================================================================

export async function markMessagesAsRead(senderId: string) {
    const { userId } = await auth()
    if (!userId) throw new Error("Unauthorized")

    const user = await prisma.user.findUnique({
        where: { clerkId: userId },
    })

    if (!user) throw new Error("User not found")

    await prisma.message.updateMany({
        where: {
            senderId,
            receiverId: user.id,
            unread: true,
        },
        data: { unread: false },
    })

    revalidatePath("/network")
}

// Helper functions
function getRelativeTime(date: Date): string {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 60) return `${diffMins} minutes ago`
    if (diffHours < 24) return `${diffHours} hours ago`
    if (diffDays < 7) return `${diffDays} days ago`
    return `${Math.floor(diffDays / 7)} weeks ago`
}

function formatMessageTime(date: Date): string {
    return date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    })
}
