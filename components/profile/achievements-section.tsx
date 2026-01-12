"use client"

import { useState, useTransition } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Trophy, Award, Star, Plus, ChevronDown, Trash2 } from "lucide-react"
import { AddAchievementDialog } from "./dialogs"
import { deleteAchievement } from "@/app/actions/profile-items"
import { toast } from "sonner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MoreHorizontal, Pencil } from "lucide-react"
import type React from "react"

interface Achievement {
  id: string
  title: string
  date: string
  icon: string
}

interface AchievementsSectionProps {
  achievements?: Achievement[]
}

const iconMap: Record<string, React.ElementType> = {
  trophy: Trophy,
  award: Award,
  star: Star,
}

const iconColors: Record<string, string> = {
  trophy: "text-amber-500 bg-amber-500/10",
  award: "text-primary bg-primary/10",
  star: "text-secondary bg-secondary/10",
}

const INITIAL_DISPLAY_COUNT = 6

export function AchievementsSection({ achievements = [] }: AchievementsSectionProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingAchievement, setEditingAchievement] = useState<Achievement | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [isPending, startTransition] = useTransition()

  const displayedAchievements = showAll ? achievements : achievements.slice(0, INITIAL_DISPLAY_COUNT)
  const hasMore = achievements.length > INITIAL_DISPLAY_COUNT
  const remainingCount = achievements.length - INITIAL_DISPLAY_COUNT

  const handleEdit = (achievement: Achievement) => {
    setEditingAchievement(achievement)
    setDialogOpen(true)
  }

  const handleDelete = (id: string) => {
    startTransition(async () => {
      try {
        await deleteAchievement(id)
        toast.success("Achievement deleted")
      } catch (error) {
        toast.error("Failed to delete achievement")
      }
    })
  }

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open)
    if (!open) setEditingAchievement(null)
  }

  return (
    <>
      <Card className="border-border">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg font-semibold">Achievements</CardTitle>
          <Button 
            size="sm" 
            variant="outline" 
            className="gap-1 bg-transparent"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </CardHeader>
        <CardContent>
          {achievements.length === 0 ? (
            <div className="text-center py-8">
              <Trophy className="h-12 w-12 mx-auto text-muted-foreground/20 mb-3" />
              <p className="text-muted-foreground">No achievements yet</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Add your accomplishments to showcase your success
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {displayedAchievements.map((achievement) => {
                  const Icon = iconMap[achievement.icon] || Trophy
                  const colors = iconColors[achievement.icon] || iconColors.trophy
                  return (
                    <div
                      key={achievement.id}
                      className="group flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors relative"
                    >
                      <div className={`rounded-full p-2 ${colors}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-medium text-foreground truncate">{achievement.title}</h4>
                        <p className="text-xs text-muted-foreground">{achievement.date}</p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(achievement)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-destructive"
                            onClick={() => handleDelete(achievement.id)}
                            disabled={isPending}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )
                })}
              </div>
              
              {hasMore && (
                <div className="pt-4">
                  <Button
                    variant="ghost"
                    className="w-full text-muted-foreground hover:text-foreground"
                    onClick={() => setShowAll(!showAll)}
                  >
                    <ChevronDown className={`h-4 w-4 mr-2 transition-transform ${showAll ? "rotate-180" : ""}`} />
                    {showAll ? "Show less" : `Show ${remainingCount} more achievement${remainingCount > 1 ? "s" : ""}`}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <AddAchievementDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        achievement={editingAchievement}
      />
    </>
  )
}
