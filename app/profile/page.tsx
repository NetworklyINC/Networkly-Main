import { ProfileHeader } from "@/components/profile/profile-header"
import { AboutSection } from "@/components/profile/about-section"
import { ExtracurricularsSection } from "@/components/profile/extracurriculars-section"
import { SkillsSection } from "@/components/profile/skills-section"
import { AchievementsSection } from "@/components/profile/achievements-section"
import { RecommendationsSection } from "@/components/profile/recommendations-section"
import { ProfileSidebar } from "@/components/profile/profile-sidebar"
import { getCurrentUser, getUserAnalytics } from "@/app/actions/user"
import { calculateProfileStrength } from "@/app/actions/profile"
import { getRecommendations } from "@/app/actions/recommendations"

export default async function ProfilePage() {
  const [user, analytics, recommendations] = await Promise.all([
    getCurrentUser(),
    getUserAnalytics(),
    getRecommendations(),
  ])

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">User not found</h2>
          <p className="text-muted-foreground">Please try refreshing the page</p>
        </div>
      </div>
    )
  }

  const profileStrength = await calculateProfileStrength(user.id)
  const skillEndorsements = analytics?.skillEndorsements || []

  return (
    <div className="space-y-6">
      <ProfileHeader user={user} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <AboutSection bio={user.bio} />
          <ExtracurricularsSection extracurriculars={user.extracurriculars} />
          <SkillsSection skills={user.skills} interests={user.interests} skillEndorsements={skillEndorsements} />
          <AchievementsSection achievements={user.achievements} />
          <RecommendationsSection recommendations={recommendations} />
        </div>
        <div>
          <ProfileSidebar 
            profileStrength={profileStrength}
            linkedinUrl={user.linkedinUrl}
            githubUrl={user.githubUrl}
            portfolioUrl={user.portfolioUrl}
          />
        </div>
      </div>
    </div>
  )
}
