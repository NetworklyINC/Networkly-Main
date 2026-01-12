"use client"

import { useState, useTransition } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2 } from "lucide-react"
import { addAchievement, updateAchievement } from "@/app/actions/profile-items"
import { toast } from "sonner"

interface Achievement {
  id: string
  title: string
  date: string
  icon: string
}

interface AddAchievementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  achievement?: Achievement | null
}

export function AddAchievementDialog({ 
  open, 
  onOpenChange, 
  achievement 
}: AddAchievementDialogProps) {
  const isEditing = !!achievement
  const [title, setTitle] = useState(achievement?.title || "")
  const [date, setDate] = useState(achievement?.date || "")
  const [icon, setIcon] = useState(achievement?.icon || "trophy")
  const [isPending, startTransition] = useTransition()

  const handleSave = () => {
    if (!title.trim() || !date.trim()) {
      toast.error("Please fill in all fields")
      return
    }

    startTransition(async () => {
      try {
        if (isEditing && achievement) {
          await updateAchievement(achievement.id, { 
            title: title.trim(), 
            date: date.trim(), 
            icon: icon as "trophy" | "award" | "star"
          })
          toast.success("Achievement updated")
        } else {
          await addAchievement({ 
            title: title.trim(), 
            date: date.trim(), 
            icon: icon as "trophy" | "award" | "star"
          })
          toast.success("Achievement added")
        }
        onOpenChange(false)
        // Reset form
        setTitle("")
        setDate("")
        setIcon("trophy")
      } catch (error) {
        toast.error(isEditing ? "Failed to update achievement" : "Failed to add achievement")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Achievement" : "Add Achievement"}</DialogTitle>
          <DialogDescription>
            {isEditing 
              ? "Update your achievement details."
              : "Add a new achievement to showcase your accomplishments."
            }
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Dean's List, 1st Place Hackathon"
              maxLength={100}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              placeholder="e.g., Fall 2023, Oct 2023"
              maxLength={50}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="icon">Icon</Label>
            <Select value={icon} onValueChange={setIcon}>
              <SelectTrigger>
                <SelectValue placeholder="Select an icon" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="trophy">🏆 Trophy</SelectItem>
                <SelectItem value="award">🏅 Award</SelectItem>
                <SelectItem value="star">⭐ Star</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {isEditing ? "Updating..." : "Adding..."}
              </>
            ) : (
              isEditing ? "Update" : "Add Achievement"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
