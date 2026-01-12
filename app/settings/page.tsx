"use client"

import { useEffect, useState, useTransition } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Textarea } from "@/components/ui/textarea"
import { User, Bell, Eye, Sparkles, Trash2, Loader2, Link2, Check } from "lucide-react"
import { useUser } from "@clerk/nextjs"
import { getCurrentUser } from "@/app/actions/user"
import { updateProfile } from "@/app/actions/profile"
import { toast } from "sonner"

interface UserData {
  id: string
  name: string
  email: string
  avatar: string | null
  headline: string | null
  bio: string | null
  location: string | null
  university: string | null
  graduationYear: string | null
  skills: string[]
  interests: string[]
  linkedinUrl: string | null
  githubUrl: string | null
  portfolioUrl: string | null
}

export default function SettingsPage() {
  const { user: clerkUser } = useUser()
  const [isPending, startTransition] = useTransition()
  const [dbUser, setDbUser] = useState<UserData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    headline: "",
    bio: "",
    location: "",
    university: "",
    graduationYear: "",
    linkedinUrl: "",
    githubUrl: "",
    portfolioUrl: "",
    skills: "",
    interests: "",
  })

  useEffect(() => {
    async function loadUser() {
      try {
        const user = await getCurrentUser()
        if (user) {
          setDbUser(user)
          setFormData({
            name: user.name || "",
            headline: user.headline || "",
            bio: user.bio || "",
            location: user.location || "",
            university: user.university || "",
            graduationYear: user.graduationYear || "",
            linkedinUrl: user.linkedinUrl || "",
            githubUrl: user.githubUrl || "",
            portfolioUrl: user.portfolioUrl || "",
            skills: user.skills?.join(", ") || "",
            interests: user.interests?.join(", ") || "",
          })
        }
      } catch (error) {
        console.error("[Settings] Failed to load user", error)
      } finally {
        setLoading(false)
      }
    }
    loadUser()
  }, [])

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  const handleSave = () => {
    startTransition(async () => {
      try {
        const skills = formData.skills
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
        const interests = formData.interests
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)

        await updateProfile({
          name: formData.name || undefined,
          headline: formData.headline || undefined,
          bio: formData.bio || undefined,
          location: formData.location || undefined,
          university: formData.university || undefined,
          graduationYear: formData.graduationYear
            ? parseInt(formData.graduationYear, 10)
            : undefined,
          skills,
          interests,
          linkedinUrl: formData.linkedinUrl || undefined,
          githubUrl: formData.githubUrl || undefined,
          portfolioUrl: formData.portfolioUrl || undefined,
        })

        setSaved(true)
        toast.success("Profile updated successfully")
      } catch (error) {
        console.error("[Settings] Failed to update profile", error)
        toast.error("Failed to update profile")
      }
    })
  }

  const userName = dbUser?.name || clerkUser?.fullName || clerkUser?.firstName || "User"
  const userEmail = dbUser?.email || clerkUser?.primaryEmailAddress?.emailAddress || ""
  const userAvatar = dbUser?.avatar || clerkUser?.imageUrl || "/placeholder.svg"
  const userInitials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground">Manage your account and preferences</p>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Profile Information
          </CardTitle>
          <CardDescription>Update your personal details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20">
              <AvatarImage src={userAvatar} alt={userName} />
              <AvatarFallback>{userInitials}</AvatarFallback>
            </Avatar>
            <div className="space-y-2">
              <Button variant="outline" size="sm" className="bg-transparent">
                Change Photo
              </Button>
              <p className="text-xs text-muted-foreground">JPG, PNG or GIF. Max size 2MB</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleChange("name", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={userEmail} disabled className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="headline">Headline</Label>
              <Input
                id="headline"
                value={formData.headline}
                onChange={(e) => handleChange("headline", e.target.value)}
                placeholder="Your professional headline"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => handleChange("location", e.target.value)}
                placeholder="City, Country"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="university">University</Label>
              <Input
                id="university"
                value={formData.university}
                onChange={(e) => handleChange("university", e.target.value)}
                placeholder="Your university"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="graduationYear">Graduation Year</Label>
              <Input
                id="graduationYear"
                value={formData.graduationYear}
                onChange={(e) => handleChange("graduationYear", e.target.value)}
                placeholder="2025"
                type="number"
                min="1900"
                max="2100"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              value={formData.bio}
              onChange={(e) => handleChange("bio", e.target.value)}
              placeholder="Tell us about yourself..."
              rows={4}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="skills">Skills (comma separated)</Label>
              <Input
                id="skills"
                value={formData.skills}
                onChange={(e) => handleChange("skills", e.target.value)}
                placeholder="React, TypeScript, Node.js"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="interests">Interests (comma separated)</Label>
              <Input
                id="interests"
                value={formData.interests}
                onChange={(e) => handleChange("interests", e.target.value)}
                placeholder="AI, Startups, Open Source"
              />
            </div>
          </div>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : saved ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                Saved
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Social Links
          </CardTitle>
          <CardDescription>Add your social and portfolio links</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="linkedinUrl">LinkedIn URL</Label>
            <Input
              id="linkedinUrl"
              value={formData.linkedinUrl}
              onChange={(e) => handleChange("linkedinUrl", e.target.value)}
              placeholder="https://linkedin.com/in/yourprofile"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="githubUrl">GitHub URL</Label>
            <Input
              id="githubUrl"
              value={formData.githubUrl}
              onChange={(e) => handleChange("githubUrl", e.target.value)}
              placeholder="https://github.com/yourusername"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="portfolioUrl">Portfolio URL</Label>
            <Input
              id="portfolioUrl"
              value={formData.portfolioUrl}
              onChange={(e) => handleChange("portfolioUrl", e.target.value)}
              placeholder="https://yourportfolio.com"
            />
          </div>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Links"
            )}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
          </CardTitle>
          <CardDescription>Choose what you want to be notified about</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">New Opportunities</p>
              <p className="text-sm text-muted-foreground">
                Get notified when matching opportunities are found
              </p>
            </div>
            <Switch defaultChecked />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Connection Requests</p>
              <p className="text-sm text-muted-foreground">
                Get notified of new connection requests
              </p>
            </div>
            <Switch defaultChecked />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Messages</p>
              <p className="text-sm text-muted-foreground">Get notified of new messages</p>
            </div>
            <Switch defaultChecked />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Weekly Digest</p>
              <p className="text-sm text-muted-foreground">
                Receive a weekly summary of your activity
              </p>
            </div>
            <Switch />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Privacy
          </CardTitle>
          <CardDescription>Control your profile visibility</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Public Profile</p>
              <p className="text-sm text-muted-foreground">
                Allow others to find and view your profile
              </p>
            </div>
            <Switch defaultChecked />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Show Activity Status</p>
              <p className="text-sm text-muted-foreground">Let others see when you are online</p>
            </div>
            <Switch />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Show Profile Views</p>
              <p className="text-sm text-muted-foreground">Display who viewed your profile</p>
            </div>
            <Switch defaultChecked />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Preferences
          </CardTitle>
          <CardDescription>Customize your AI assistant behavior</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">AI Suggestions</p>
              <p className="text-sm text-muted-foreground">Receive AI-powered recommendations</p>
            </div>
            <Switch defaultChecked />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Auto-generate Icebreakers</p>
              <p className="text-sm text-muted-foreground">Let AI create conversation starters</p>
            </div>
            <Switch defaultChecked />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Career Nudges</p>
              <p className="text-sm text-muted-foreground">Get reminders to achieve your goals</p>
            </div>
            <Switch defaultChecked />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            Danger Zone
          </CardTitle>
          <CardDescription>Irreversible actions</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive">Delete Account</Button>
        </CardContent>
      </Card>
    </div>
  )
}
