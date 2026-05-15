import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { Navbar } from "@/components/Navbar";
import { Feed } from "@/components/Feed";
import { ProfileSidebar } from "@/components/ProfileSidebar";
import { FriendsSidebar } from "@/components/FriendsSidebar";

export default async function HomePage() {
  const { userId } = await auth();
  if (!userId) redirect("/login");

  const user = await currentUser();
  const supabase = await createClient();

  // Fetch or create profile
  let { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("clerk_user_id", userId)
    .single();

  if (!profile) {
    const { data: newProfile } = await supabase
      .from("profiles")
      .insert({
        clerk_user_id: userId,
        username: user?.username || user?.emailAddresses?.[0]?.emailAddress?.split("@")[0] || "usuario",
        full_name: `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || "Usuario",
        avatar_url: user?.imageUrl || "",
      })
      .select()
      .single();
    profile = newProfile;
  }

  return (
    <>
      <Navbar profile={profile} />
      <main className="app-layout">
        <aside className="sidebar-left">
          <ProfileSidebar profile={profile} currentUserId={userId} />
        </aside>
        <section>
          <Feed currentUserId={userId} profile={profile} />
        </section>
        <aside className="sidebar-right">
          <FriendsSidebar currentUserId={userId} />
        </aside>
      </main>
    </>
  );
}
