import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { Navbar } from "@/components/Navbar";
import { ProfilePage } from "@/components/ProfilePage";
import { MobileNav } from "@/components/MobileNav";

export default async function UserProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/login");

  const { username } = await params;
  const user = await currentUser();
  const supabase = await createClient();

  // Get current user profile
  let { data: myProfile } = await supabase
    .from("profiles")
    .select("*")
    .eq("clerk_user_id", userId)
    .single();

  if (!myProfile) {
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
    myProfile = newProfile;
  }

  // Get the target profile by username
  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username)
    .single();

  if (!targetProfile) {
    redirect("/");
  }

  return (
    <>
      <Navbar profile={myProfile} />
      <ProfilePage profile={targetProfile} currentUserId={userId} />
      <MobileNav profile={myProfile} />
    </>
  );
}
